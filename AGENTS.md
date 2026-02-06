


# Notas de despliegue y monitoreo (AWS)

Estas notas están pensadas para que un agente (o tú) pueda **desplegar y verificar** el dashboard sin perder tiempo buscando IDs/recursos.

## Recursos (producción)

- Región: `us-west-2`
- Frontend (CloudFront): `https://dlqm2r9fw5ko1.cloudfront.net`
- Backend (API Gateway HTTP API): `https://bokxmm1e57.execute-api.us-west-2.amazonaws.com/prod`
- S3 bucket frontend: `mastercard-dashboard-20251023-ag`
- CloudFront Distribution ID: `E3L4347QGLQOSW`
- ECR repo backend: `mastercard-dashboard-backend`
- ECS Cluster: `mastercard-dashboard-cluster`
- ECS Service: `mastercard-dashboard-backend-service`
- ECS Task family: `mastercard-dashboard-backend-task`
- User store (S3): bucket `mastercard-dashboard-userstore`, key `dashboard/users/dashboardUsers.json`

## Deploy “oficial” (GitHub Actions)

Workflow: `.github/workflows/deploy.yml` (corre en cada push a `main`).

### Requisitos en GitHub

Configurar secrets del repo:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- (si aplica) `AWS_SESSION_TOKEN`

Si estos secrets no están, el job falla en `Configure AWS credentials`.

### Qué hace el workflow

- Frontend: `npm ci` + `npm run build` → `aws s3 sync frontend/dist` → invalidación CloudFront.
- Backend: build docker multi-arch (`linux/arm64`) → push a ECR → registra nueva task definition → actualiza ECS service y espera `services-stable`.

### Monitoreo rápido del deploy

- Revisar el run en GitHub Actions: debe quedar **verde**.
- Validar frontend:
  - `curl -I https://dlqm2r9fw5ko1.cloudfront.net | head`
- Validar API:
  - `curl -s https://bokxmm1e57.execute-api.us-west-2.amazonaws.com/prod/health`

## Deploy manual (fallback)

Úsalo cuando el workflow falle (por ejemplo, secrets faltantes) o cuando se necesite un hotfix urgente.

### 0) Cargar credenciales AWS localmente

Las credenciales locales se toman típicamente de `backend/.env` (NO commitear).

```bash
set -a
source backend/.env
set +a

aws sts get-caller-identity --region "${AWS_REGION:-us-west-2}"
```

### 1) Frontend → S3 + CloudFront

```bash
cd frontend
npm ci
VITE_API_URL=https://bokxmm1e57.execute-api.us-west-2.amazonaws.com/prod npm run build

aws s3 sync dist "s3://mastercard-dashboard-20251023-ag" --delete
aws cloudfront create-invalidation --distribution-id E3L4347QGLQOSW --paths "/*"
```

Monitorear invalidación:

```bash
aws cloudfront list-invalidations --distribution-id E3L4347QGLQOSW --max-items 5
```

### 2) Backend → ECR + ECS

Build/push imagen:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "${AWS_REGION:-us-west-2}")
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

TAG="backend-$(git rev-parse --short HEAD)"
IMAGE_URI="$ECR_REGISTRY/mastercard-dashboard-backend:$TAG"

docker buildx build --platform linux/arm64 --tag "$IMAGE_URI" --push backend
```

Registrar task definition y desplegar:

```bash
aws ecs describe-task-definition \
  --task-definition mastercard-dashboard-backend-task \
  --query 'taskDefinition' > /tmp/taskdef.json

jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)' \
  /tmp/taskdef.json \
  | jq --arg IMAGE "$IMAGE_URI" '.containerDefinitions[0].image = $IMAGE' \
  > /tmp/taskdef-updated.json

NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/taskdef-updated.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)

aws ecs update-service \
  --cluster mastercard-dashboard-cluster \
  --service mastercard-dashboard-backend-service \
  --task-definition "$NEW_TASK_DEF_ARN" \
  --force-new-deployment

aws ecs wait services-stable \
  --cluster mastercard-dashboard-cluster \
  --services mastercard-dashboard-backend-service
```

Ver la imagen actualmente desplegada:

```bash
TD=$(aws ecs describe-services --cluster mastercard-dashboard-cluster \
  --services mastercard-dashboard-backend-service --query 'services[0].taskDefinition' --output text)

aws ecs describe-task-definition --task-definition "$TD" \
  --query 'taskDefinition.containerDefinitions[0].image' --output text
```

### 3) Checks post-deploy (CORS + health)

```bash
curl -I https://dlqm2r9fw5ko1.cloudfront.net | head
curl -s https://bokxmm1e57.execute-api.us-west-2.amazonaws.com/prod/health

# validar CORS (debe incluir access-control-allow-origin y expose-headers)
curl -s -I \
  -H "Origin: https://dlqm2r9fw5ko1.cloudfront.net" \
  https://bokxmm1e57.execute-api.us-west-2.amazonaws.com/prod/health \
  | rg -i "access-control|vary"
```

Nota: Para que el frontend pueda leer el refresh token, el API Gateway debe exponer `x-dashboard-token`.

Ver configuración actual:

```bash
aws apigatewayv2 get-api --api-id bokxmm1e57 --region us-west-2 \
  --query 'CorsConfiguration.ExposeHeaders'
```

Actualizar (si falta):

```bash
aws apigatewayv2 update-api --api-id bokxmm1e57 --region us-west-2 \
  --cors-configuration '{"AllowOrigins":["https://dlqm2r9fw5ko1.cloudfront.net","https://dentsu-matt.com"],"AllowMethods":["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"],"AllowHeaders":["*"],"ExposeHeaders":["X-Dashboard-Token"]}'
```

## Logs y monitoreo

- ECS (estado/errores):

```bash
aws ecs describe-services --cluster mastercard-dashboard-cluster \
  --services mastercard-dashboard-backend-service \
  --query 'services[0].events[0:10]'
```

- CloudWatch Logs: el task usa `awslogs` (grupo típico: `/ecs/mastercard-dashboard-backend`).
  - Si estás en AWS CLI v2, puedes usar `aws logs tail`.
  - En AWS CLI v1, usa `aws logs describe-log-streams` + `aws logs get-log-events`.

## Seguridad / higiene

- No commitear `.env`, `backend/.env`.
- No commitear artefactos tipo `taskdef*.json` o `cf-config*.json` (pueden incluir secretos). Generarlos siempre en `/tmp`.
