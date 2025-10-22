# Dashboard Mastercard (Base)

Aplicación base para visualizar campañas Mastercard con un frontend en React y un backend Node.js que consulta la Lambda `mastercard-aurora-proxy` **en modo solo lectura** siguiendo las políticas de `README_lambda_proxy.md`.

## Arquitectura

- **Frontend** (`frontend/`): Vite + React + TypeScript con Ant Design. Presenta selector de campaña, menú lateral (Overview) y tarjetas KPI (usuarios, logins y redenciones).
- **Backend** (`backend/`): Express expone endpoints REST que invocan la Lambda (vía `@aws-sdk/client-lambda`) utilizando SQL parametrizado por campaña. Todas las consultas son de lectura y se limitan a las definidas en `backend/src/config/campaigns.js`.
- **Docker**: `docker-compose.yml` orquesta ambos servicios para desarrollo. No se persiste información; todo se obtiene on-demand desde Aurora a través de la Lambda proxy.

## Requisitos

- Node.js 20+
- Docker y Docker Compose (opcional para orquestación)
- Credenciales AWS con acceso **de solo lectura** a la Lambda `mastercard-aurora-proxy` (revisar `README_lambda_proxy.md` para políticas y buenas prácticas).

## Variables de entorno

1. Copia los archivos de ejemplo y completa tus valores (sin commitear credenciales):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. Variables clave:
   - `backend/.env`
     - `AWS_REGION`: región de la Lambda (por defecto `us-west-2`).
     - `LAMBDA_FUNCTION_NAME`: nombre de la función (por defecto `mastercard-aurora-proxy`).
     - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` (si aplica) **de solo lectura**.
     - `CORS_ORIGINS`: orígenes permitidos (ej. `http://localhost:5273`).
   - `frontend/.env`
     - `VITE_API_URL`: URL base del backend (ej. `http://localhost:4000`).

## Ejecución local (sin Docker)

```bash
# Backend
cd backend
npm install
npm run dev   # nodemon, puerto 4000 por defecto

# En otra terminal
cd frontend
npm install
npm run dev   # Vite en http://localhost:5173 (usa VITE_API_URL=http://localhost:4000)
```

El frontend consumirá `http://localhost:4000/api` en ejecución directa o `http://localhost:4100/api` cuando corra dentro de Docker. Ajusta `VITE_API_URL` según el escenario. Las tarjetas KPI se actualizan al seleccionar una campaña; todos los datos provienen de consultas de solo lectura predefinidas sobre `mc_users`, `mc_logins` y `mc_redemptions` en cada base disponible.

## Ejecución con Docker

```bash
docker compose up --build
```

- Backend disponible en `http://localhost:${BACKEND_PORT:-4100}`.
- Frontend disponible en `http://localhost:${FRONTEND_PORT:-5273}`.

Si algún puerto está ocupado, ajusta `BACKEND_PORT` o `FRONTEND_PORT` en tu entorno antes de iniciar (`export BACKEND_PORT=4001`, por ejemplo) y vuelve a ejecutar `docker compose up --build`.

Para detener y limpiar los contenedores:

```bash
docker compose down
```

## Endpoints expuestos por el backend

- `GET /health`: verificación rápida.
- `GET /api/campaigns`: listado de campañas disponibles (id, nombre, descripción).
- `GET /api/campaigns/:id/summary`: devuelve métricas agregadas, datasets para gráficas y una muestra de registros (`LIMIT 50`) utilizando solo las consultas permitidas en `backend/src/config/campaigns.js`.

> **Importante**: No añadir consultas de escritura. Cualquier nueva consulta debe respetar la política de solo lectura y, de ser necesario, documentarse en `docs/data_dictionary.md`.

## Verificaciones realizadas

- `frontend`: `npm run build` (TypeScript + build Vite).
- `backend`: `npm run start` para validar arranque (los endpoints requerirán credenciales AWS válidas para responder datos).
- `docker compose up --build`: se construyeron las imágenes; si algún puerto está ocupado, redefine `BACKEND_PORT`/`FRONTEND_PORT` (por defecto 4100/5273) antes de levantar los contenedores.

## Próximos pasos sugeridos

1. Conectar credenciales AWS válidas de solo lectura y validar que las consultas devuelven datos reales.
2. Incrementar la cobertura de visualizaciones (más métricas por campaña) manteniendo las restricciones de seguridad.
3. Añadir autenticación (por ejemplo, AWS Cognito) antes de exponer el dashboard a usuarios finales.
