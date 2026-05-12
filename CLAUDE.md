# Mastercard Dashboard — Contexto del Proyecto

## Descripción general

Dashboard interno de análisis para campañas de Mastercard en Colombia y Ecuador, desarrollado por Dentsu. Muestra KPIs, actividad, redenciones y seguridad de login por campaña. Cada campaña tiene su propia base de datos Aurora MySQL.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript + Vite |
| UI | Ant Design + Recharts |
| Fechas | dayjs |
| Export | xlsx (lazy load) |
| Backend | Node.js + Express |
| Auth | JWT + bcryptjs |
| DB | Amazon Aurora MySQL (una DB por campaña) |
| Proxy DB | AWS Lambda (`mastercard-aurora-proxy`) |
| Hosting frontend | S3 + CloudFront |
| Hosting backend | ECS Fargate (arm64) + API Gateway |
| Registry | ECR |
| CI/CD | GitHub Actions → push a `main` despliega todo |
| Usuarios prod | S3 (`mastercard-dashboard-userstore/dashboard/users/dashboardUsers.json`) |

---

## Estructura del repositorio

```
mastercard_dashboard/
├── frontend/                          # React app
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx          # Componente principal — toda la lógica de estado y KPIs
│       │   └── dashboard/
│       │       ├── ActivitySection.tsx
│       │       ├── RedemptionsSection.tsx
│       │       ├── LoginSecuritySection.tsx
│       │       ├── UserManagementSection.tsx
│       │       └── dataTransforms.tsx # Transformaciones de datos y helpers de formato
│       ├── api/
│       │   ├── campaigns.ts           # Todas las llamadas a la API de campañas
│       │   ├── auth.ts
│       │   └── users.ts
│       ├── utils/
│       │   └── exportExcel.ts         # Exportación Excel via xlsx
│       └── types.ts                   # Tipos TypeScript globales
└── backend/
    └── src/
        ├── config/
        │   └── campaigns.js           # Definición de campañas, métricas SQL, features
        ├── routes/
        │   └── campaigns.js           # Todos los endpoints REST de campañas
        ├── services/
        │   ├── queryService.js        # runQuery() → invoca Lambda proxy → Aurora
        │   ├── userStore.js           # CRUD de usuarios con sincronización S3
        │   └── userStoreSync.js       # syncUsersFromS3 / syncUsersToS3
        ├── middleware/
        │   └── auth.js                # requireAuth, requireAdmin
        └── data/
            └── dashboardUsers.json    # Usuarios locales (en prod, S3 es autoritativo)
```

---

## Campañas configuradas

| ID | Nombre | Banco | DB Aurora |
|----|--------|-------|-----------|
| `debitazo-5` | Debitazo 5 | Davivienda | `dentsu_mastercard_debitazo_5` |
| `debitazo-6` | Debitazo 6 | Davivienda | `dentsu_mastercard_debitazo_6` |
| `bogota-uso-10` | Bogotá Uso 10 | Davivienda | `dentsu_mastercard_bogota_uso_10` |
| `davivienda-afluentes-3` | Afluentes 3 | Davivienda | `dentsu_mastercard_davivienda_afluentes_3` |
| `pongalas-a-jugar` | Pónganlas a Jugar | Davivienda | `dentsu_mastercard_pongalas_a_jugar` |
| `tuya-ola-5` | Tuya Ola 5 | Tuya | `dentsu_mastercard_tuya_ola_5` |
| `tuya-ola-6` | Tuya Ola 6 | Tuya | `dentsu_mastercard_tuya_ola_6` |
| `pacifico-sag-5` | Pacífico SAG 5 | Pacífico | `dentsu_mastercard_pacifico_sag_5` |
| `pacifico-5s-4` | Pacífico 5S 4 | Pacífico | `dentsu_mastercard_pacifico_5s_4` |
| `pacifico-5s-7` | Pacífico 5S 7 (OLA 7) | Pacífico | `dentsu_mastercard_pacifico_5s_7` |
| `avvillas-combo-playero` | AV Villas Combo Playero | AV Villas | `dentsu_mastercard_avvillas_combo_playero` |
| `avvillas-lista-para-ganar` | AV Villas Lista Para Ganar | AV Villas | `dentsu_mastercard_avvillas_lista_para_ganar` _(pendiente — `enabled: false` hasta que exista en Aurora)_ |
| `pichincha` | Pichincha | Pichincha | `dentsu_mastercard_pichincha` |
| `guayaquil-5step` | Guayaquil 5 Step | Guayaquil | `dentsu_mastercard_guayaquil_5step` |

---

## Patrones clave del backend

### Queries a Aurora
Todas las queries pasan por `runQuery(database, sql, params)` en `queryService.js`. El SQL usa `{db}` como placeholder que se reemplaza por el nombre real de la base de datos.

```js
const result = await runQuery('dentsu_mastercard_pongalas_a_jugar',
  'SELECT COUNT(*) FROM {db}.mc_logins WHERE type IN (1, 2)',
  []);
```

### Métricas ocultas (`hidden: true`)
Las métricas con `hidden: true` se calculan y envían al frontend pero NO aparecen como tarjetas KPI. Se usan para cálculos derivados (ej. `settingsMaxValue` para calcular `valorDisponible`, `inscribedDebito`/`inscribedCredito` para metas por segmento).

### Feature flags por campaña
Cada campaña tiene `features: {}` con flags opcionales:
- `cardType: true` → habilita filtro Tipo (Crédito/Débito)
- `segments: true` → habilita filtro Segmento de Usuario
- `firstLoginsTable: true` → muestra tabla Loggins Inscritos

### Sincronización de usuarios con S3
En producción, ECS descarga el archivo de usuarios de S3 al arrancar (`syncUsersFromS3`). El archivo local `dashboardUsers.json` es ignorado. Para actualizar usuarios en producción hay que: (1) modificar S3 directamente via SDK, y (2) reiniciar los contenedores ECS.

---

## Métricas especiales de pongalas-a-jugar

Esta campaña tiene configuración especial por segmento (débito/crédito):

- `enrollmentGoals`: metas de inscripción por segmento
  - Débito: 79.922 usuarios inscritos
  - Crédito: 9.135 usuarios inscritos
- `inscribedDebito` / `inscribedCredito`: métricas ocultas con conteo de inscritos por tipo
- `redeemedValueDebito` / `redeemedValueCredito`: valor redimido por segmento (subselect en mc_users)
- `settingsMaxValueDebito` / `settingsMaxValueCredito`: budget por segmento desde mc_settings (`budget_api_debito`, `budget_api_credito`)

Cuando se filtra por tipo de usuario, `Valor Disponible en Redenciones` usa el budget y el acumulado del segmento correspondiente.

---

## Convenciones importantes

### Tipos de login (`mc_logins.type`)
- `0` = login no exitoso
- `1` = login exitoso
- `2` = autologin

Para contar **usuarios inscritos** siempre usar `type IN (1, 2)`, nunca solo `type = 1`.

### Heatmap de logins (día × hora)
MySQL `DAYOFWEEK()` devuelve 1–7 (1=Dom). dayjs `.day()` espera 0–6 (0=Dom). En el frontend se ajusta con `day - 1`:
```ts
const baseDate = dayjs().day(day - 1); // dataTransforms.tsx
```

### Export Excel
El botón "Exportar Excel" genera un `.xlsx` con múltiples hojas según la pestaña activa. En Overview incluye la hoja "Usuarios Inscritos" (un `idmask` por fila con `fecha_inscripcion`, `segmento`, `tipo_usuario`) consultada en el momento del export via endpoint `GET /:id/enrolled-users`.

---

## Endpoints principales del backend

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/campaigns` | Lista campañas permitidas para el usuario |
| GET | `/api/campaigns/:id/summary` | KPIs y métricas |
| GET | `/api/campaigns/:id/activity` | Serie temporal, heatmap, breakdown de login |
| GET | `/api/campaigns/:id/first-logins-by-date` | Loggins inscritos por fecha y segmento |
| GET | `/api/campaigns/:id/enrolled-users` | Usuarios inscritos individuales (para export) |
| GET | `/api/campaigns/:id/enrollment-funnel` | Funnel de inscripción por etapas |
| GET | `/api/campaigns/:id/redemptions-insights` | Análisis de redenciones |
| GET | `/api/campaigns/:id/login-security` | IPs atípicas y seguridad |
| POST | `/api/auth/login` | Login de usuario del dashboard |
| GET/PUT/POST/DELETE | `/api/users` | Gestión de usuarios (solo admin) |

---

## Deploy

```
git push origin main
```
GitHub Actions hace:
1. Build frontend (Vite) → S3 + invalidación CloudFront
2. Build imagen Docker arm64 (con caché GHA) → ECR → ECS rolling update

El deploy tarda ~5-10 minutos con caché activo.

### URLs de producción
- **API Gateway**: `https://bokxmm1e57.execute-api.us-west-2.amazonaws.com/prod`
- **Frontend**: CloudFront (distribution `E3L4347QGLQOSW`, bucket `mastercard-dashboard-20251023-ag`)
- **ECS**: cluster `mastercard-dashboard-cluster`, servicio `mastercard-dashboard-backend-service`

---

## Estado actual del desarrollo

- La estructura del dashboard responde principalmente a Davivienda. Se planea adaptar la UI por banco (AV Villas, Davivienda, Tuya, Pacífico) con ajustes específicos que se comunicarán próximamente. El campo `bank` en cada campaña es el siguiente paso para soportar esto.
- Los cambios locales no desplegados incluyen ajustes a `valorDisponible` por segmento en pongalas-a-jugar.
