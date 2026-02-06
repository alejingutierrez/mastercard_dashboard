Aurora Access Lambda (Lectura Solamente)
=======================================

Este documento describe todo el proceso implementado para consultar, **únicamente en modo lectura**, el clúster Aurora MySQL `mastercard-pro` mediante la función Lambda `mastercard-aurora-proxy`. Sigue los pasos exactamente y evita ejecutar sentencias `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` o cualquier operación que modifique datos.  

> ⚠️ **Política obligatoria:** todas las consultas contra estas bases deben ser de lectura. Ejecutar sentencias que alteren información va contra la configuración acordada y puede generar incidentes en producción.

Índice
------
- [Arquitectura](#arquitectura)
- [Bases verificadas](#bases-verificadas)
- [Prerrequisitos](#prerrequisitos)
- [1. Preparación del paquete Lambda](#1-preparación-del-paquete-lambda)
- [2. Configuración de IAM](#2-configuración-de-iam)
- [3. Configuración de red (Security Groups)](#3-configuración-de-red-security-groups)
- [4. Despliegue de la Lambda](#4-despliegue-de-la-lambda)
- [5. Ejecución de consultas (solo lectura)](#5-ejecución-de-consultas-solo-lectura)
- [6. Ejemplos de uso](#6-ejemplos-de-uso)
- [7. Supervisión y operaciones](#7-supervisión-y-operaciones)
- [8. Solución de problemas](#8-solución-de-problemas)
- [9. Limpieza opcional](#9-limpieza-opcional)

Arquitectura
------------
1. **AWS Lambda `mastercard-aurora-proxy`**: ejecuta PyMySQL dentro del VPC de Aurora para lanzar consultas SQL entregadas en el payload.
2. **Secrets Manager**: almacena el usuario y contraseña (`arn:aws:secretsmanager:us-west-2:071930880555:secret:rds!cluster-63217091-3511-41dd-a6bf-5e022f920411-Ht91K8`).
3. **Security Groups**: `sg-0ba13acaefc6f37fc` (Lambda) referenciado por `sg-0c10590fb6b0bf9bc` y `sg-0ee505cad868959c2` (Aurora) para permitir tráfico 3306 dentro del VPC.
4. **Subredes privadas**: `subnet-0f8e1f7264c953536`, `subnet-0a754a1d2c5604ad5` en `vpc-0af5a28e76394e382`.

Bases verificadas
-----------------
Con la Lambda en producción, se comprobó acceso de lectura a las siguientes bases (todas responden a `SHOW TABLES`):
- `dentsu_mastercard_bogota_uso_10`
- `dentsu_mastercard_debitazo_6`
- `dentsu_mastercard_davivienda_afluentes_3`
- `dentsu_mastercard_pacifico_sag_5`
- `dentsu_mastercard_pichincha`
- `dentsu_mastercard_guayaquil_5s_3`

La base `dentsu_mastercard_avvillas_combo_playero` sigue sin existir en el clúster. Confirmamos que la variante correcta para Guayaquil es `dentsu_mastercard_guayaquil_5s_3`; úsala en todas las consultas y despliegues.

Prerrequisitos
--------------
- AWS CLI 2.x instalado y apuntando a la cuenta `071930880555`.
- Python 3.9+ con `pip`.
- Credenciales válidas (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) almacenadas en `.env` (no subir a git).
- Acceso IAM para crear roles/policies y `iam:PassRole` sobre `lambda-aurora-proxy-role`.

1. Preparación del paquete Lambda
---------------------------------
El código fuente está en `lambda/aurora_proxy`. Para construir el paquete listo para desplegar:

```bash
SSL_CERT_URL=https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  ./scripts/build_lambda_package.sh
```

Resultado: `dist/lambda_aurora_proxy.zip` con PyMySQL, el handler y el bundle de certificados `global-bundle.pem`.

2. Configuración de IAM
-----------------------
Los recursos ya creados, pero puedes recrearlos si fuese necesario:

```bash
# 2.1. Rol de ejecución
aws iam create-role \
  --role-name lambda-aurora-proxy-role \
  --assume-role-policy-document file://trust-policy.json

# 2.2. Políticas administradas
aws iam attach-role-policy \
  --role-name lambda-aurora-proxy-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy \
  --role-name lambda-aurora-proxy-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole

# 2.3. Permiso al secreto
aws iam put-role-policy \
  --role-name lambda-aurora-proxy-role \
  --policy-name lambda-aurora-secret-access \
  --policy-document file://lambda-policy.json
```

Asegúrate de que el usuario que despliega tenga:

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::071930880555:role/lambda-aurora-proxy-role"
}
```

3. Configuración de red (Security Groups)
----------------------------------------
Security group para la Lambda:

```bash
aws ec2 create-security-group \
  --region us-west-2 \
  --group-name lambda-aurora-proxy-sg \
  --description "Lambda access to Aurora" \
  --vpc-id vpc-0af5a28e76394e382
```

Agregar permisos de ingreso en los SG de Aurora:

```bash
aws ec2 authorize-security-group-ingress \
  --region us-west-2 \
  --group-id sg-0c10590fb6b0bf9bc \
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":3306,"ToPort":3306,"UserIdGroupPairs":[{"GroupId":"sg-0ba13acaefc6f37fc"}]}]'

aws ec2 authorize-security-group-ingress \
  --region us-west-2 \
  --group-id sg-0ee505cad868959c2 \
  --ip-permissions '[{"IpProtocol":"tcp","FromPort":3306,"ToPort":3306,"UserIdGroupPairs":[{"GroupId":"sg-0ba13acaefc6f37fc"}]}]'
```

4. Despliegue de la Lambda
--------------------------
Si necesitas recrearla desde cero:

```bash
aws lambda create-function \
  --region us-west-2 \
  --function-name mastercard-aurora-proxy \
  --zip-file fileb://dist/lambda_aurora_proxy.zip \
  --handler lambda_function.handler \
  --runtime python3.11 \
  --timeout 30 \
  --memory-size 512 \
  --role arn:aws:iam::071930880555:role/lambda-aurora-proxy-role
```

Configurar variables de entorno y VPC:

```bash
aws lambda update-function-configuration \
  --region us-west-2 \
  --function-name mastercard-aurora-proxy \
  --environment "Variables={DB_HOST=mastercard-pro.cluster-cyiv0cgh9m8s.us-west-2.rds.amazonaws.com,DB_SECRET_ARN=arn:aws:secretsmanager:us-west-2:071930880555:secret:rds!cluster-63217091-3511-41dd-a6bf-5e022f920411-Ht91K8,DB_PORT=3306,DB_NAME=dentsu_mastercard_guayaquil_5s_3,SSL_CERT_PATH=/var/task/global-bundle.pem}"

> Si la función se ejecuta en subredes privadas sin acceso a Secrets Manager, agrega `DB_USERNAME` y `DB_PASSWORD` (credenciales de solo lectura). El handler prioriza estas variables y usa el secreto como respaldo cuando están ausentes.

aws lambda update-function-configuration \
  --region us-west-2 \
  --function-name mastercard-aurora-proxy \
  --vpc-config "SubnetIds=subnet-0f8e1f7264c953536,subnet-0a754a1d2c5604ad5,SecurityGroupIds=sg-0ba13acaefc6f37fc"
```

Puedes re-ejecutar `./scripts/deploy_lambda.sh` para actualizar código/variables de forma automatizada (especialmente tras cambios en el handler).

5. Ejecución de consultas (solo lectura)
----------------------------------------
Antes de invocar, exporta las credenciales:

```bash
export AWS_ACCESS_KEY_ID="TU_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="TU_SECRET_ACCESS_KEY"
export AWS_REGION="us-west-2"
```

Invoca la Lambda con `aws lambda invoke --cli-binary-format raw-in-base64-out`. El payload debe contener `sql` y, opcionalmente, `parameters` (para consultas parametrizadas).  

**Ejemplo base (test de conectividad)**:

```bash
aws lambda invoke \
  --cli-binary-format raw-in-base64-out \
  --function-name mastercard-aurora-proxy \
  --region us-west-2 \
  --payload '{"sql":"SELECT 1"}' \
  select1.json
cat select1.json
```

Resultado esperado:

```json
{"status":"ok","rowcount":1,"rows":[{"1":1}]}
```

6. Ejemplos de uso
------------------
### Listar tablas de una base (lectura)
```bash
aws lambda invoke \
  --cli-binary-format raw-in-base64-out \
  --function-name mastercard-aurora-proxy \
  --region us-west-2 \
  --payload '{"sql":"SHOW TABLES FROM dentsu_mastercard_bogota_uso_10"}' \
  bogota.json
cat bogota.json
```

### Consulta parametrizada
```bash
aws lambda invoke \
  --cli-binary-format raw-in-base64-out \
  --function-name mastercard-aurora-proxy \
  --region us-west-2 \
  --payload '{"sql":"SELECT * FROM dentsu_mastercard_bogota_uso_10.mc_users WHERE id = %s","parameters":[123]}' \
  user.json
cat user.json
```

> ⚠️ Verifica que las consultas no alteren datos. Cualquier operación de escritura (`INSERT`, `UPDATE`, `DELETE`, etc.) está estrictamente prohibida.

7. Supervisión y operaciones
----------------------------
- **Logs**: revisa `/aws/lambda/mastercard-aurora-proxy` en CloudWatch.
- **Timeout**: 30 segundos. Si una consulta tarda más, optimiza la sentencia o usa paginación.
- **Memoria**: 512 MB. Aumenta sólo si hay errores de falta de memoria.
- **Secretos**: el handler consulta Secrets Manager en cada ejecución; si las credenciales cambian, no hace falta redeploy.

8. Solución de problemas
------------------------
- `Unknown database`: revisa el nombre (ej. `dentsu_mastercard_guayaquil_5s_3`).
- `Access denied` / `OperationalError`: confirma que el SG `sg-0ba13acaefc6f37fc` continúe referenciado en los SG de Aurora.
- `Timed out`: divide la consulta en partes más pequeñas o usa filtros/limit.
- `Permission denied` al crear Lambda: valida que el usuario tenga `iam:PassRole` y permisos sobre Lambda y VPC.

9. Limpieza opcional
--------------------
Si necesitas retirar la infraestructura:

```bash
aws lambda delete-function --region us-west-2 --function-name mastercard-aurora-proxy
aws ec2 delete-security-group --region us-west-2 --group-id sg-0ba13acaefc6f37fc
aws iam delete-role-policy --role-name lambda-aurora-proxy-role --policy-name lambda-aurora-secret-access
aws iam detach-role-policy --role-name lambda-aurora-proxy-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam detach-role-policy --role-name lambda-aurora-proxy-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
aws iam delete-role --role-name lambda-aurora-proxy-role
```

Elimina también los archivos temporales (`trust-policy.json`, `lambda-policy.json`, `passrole-policy.json`) si ya no se usan.

---

Cualquier ampliación (por ejemplo, exponer esta Lambda vía API Gateway) debe respetar la regla fundamental: **solo lectura** sobre las tablas del clúster Aurora. Mantén este README como referencia única para configurar, operar y auditar la funcionalidad.*** End Patch
