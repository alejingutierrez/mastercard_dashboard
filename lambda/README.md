# Aurora Proxy Lambda

Este Lambda actúa como un proxy ligero para ejecutar sentencias SQL contra el clúster Aurora MySQL `mastercard-pro`. Se despliega dentro del mismo VPC y expone la ejecución vía `aws lambda invoke` o (opcionalmente) API Gateway.

## Estructura

- `aurora_proxy/lambda_function.py`: handler principal (PyMySQL).
- `aurora_proxy/requirements.txt`: dependencias para empaquetar.

## Variables de entorno requeridas

| Variable          | Descripción                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `DB_HOST`         | Endpoint del clúster Aurora (writer o reader).                            |
| `DB_PORT`         | Puerto de MySQL (3306 por defecto).                                       |
| `DB_SECRET_ARN`   | ARN del secreto en Secrets Manager que contenga `username` y `password`.  |
| `DB_NAME`         | (Opcional) Base de datos por defecto.                                     |
| `SSL_CERT_PATH`   | (Opcional) Ruta al certificado RDS CA dentro del paquete (`.pem`).        |

## Empaquetado local

```bash
# Ubícate en la raíz del repo
python3 -m venv .venv && source .venv/bin/activate  # opcional
pip install --upgrade pip
pip install -r lambda/aurora_proxy/requirements.txt

mkdir -p build/lambda_aurora_proxy
pip install --target build/lambda_aurora_proxy -r lambda/aurora_proxy/requirements.txt
cp lambda/aurora_proxy/lambda_function.py build/lambda_aurora_proxy/

# Incluye el certificado de Amazon RDS si vas a forzar SSL
curl -o build/lambda_aurora_proxy/rds-ca-rsa2048-g1.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

(cd build/lambda_aurora_proxy && zip -r ../../dist/lambda_aurora_proxy.zip .)
```

## Despliegue (CLI)

```bash
aws lambda create-function \
  --function-name mastercard-aurora-proxy \
  --zip-file fileb://dist/lambda_aurora_proxy.zip \
  --handler lambda_function.handler \
  --runtime python3.11 \
  --timeout 30 \
  --memory-size 512 \
  --role arn:aws:iam::071930880555:role/lambda-aurora-proxy \
  --environment Variables="{DB_HOST=mastercard-pro.cluster-cyiv0cgh9m8s.us-west-2.rds.amazonaws.com,DB_SECRET_ARN=arn:aws:secretsmanager:us-west-2:071930880555:secret:rds!cluster-63217091-3511-41dd-a6bf-5e022f920411-Ht91K8,DB_PORT=3306,SSL_CERT_PATH=/var/task/rds-ca-rsa2048-g1.pem}" \
  --vpc-config SubnetIds=subnet-0f8e1f7264c953536,subnet-0a754a1d2c5604ad5 SecurityGroupIds=sg-lambda-aurora
```

> Nota: crea previamente el security group `sg-lambda-aurora` permitiendo salida a `3306` y agrégalo como **origen** en los SG `sg-0c10590fb6b0bf9bc` y `sg-0ee505cad868959c2`.

Actualizaciones posteriores:

```bash
aws lambda update-function-code \
  --function-name mastercard-aurora-proxy \
  --zip-file fileb://dist/lambda_aurora_proxy.zip

aws lambda update-function-configuration \
  --function-name mastercard-aurora-proxy \
  --timeout 30 \
  --memory-size 512
```

## Ejecución de pruebas

```bash
aws lambda invoke \
  --function-name mastercard-aurora-proxy \
  --payload '{"sql":"SELECT NOW() AS current_time"}' \
  out.json

cat out.json
```

Para insertar parámetros:

```bash
aws lambda invoke \
  --function-name mastercard-aurora-proxy \
  --payload '{"sql":"SELECT %s + %s AS total","parameters":[2,3]}' \
  out.json
```

## Limpieza

```bash
aws lambda delete-function --function-name mastercard-aurora-proxy
```

Asegúrate de eliminar también security groups, roles o artefactos que ya no utilices.
