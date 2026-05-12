# AV Villas Lista Para Ganar — Auto-pickup setup

**Estado:** ✅ campaña **activa** en el dashboard. La DB Aurora aún no existe pero se autocompletará cuando el equipo de AV Villas la cree. **No requiere intervención humana al momento de la activación.**

---

## Cómo funciona el auto-pickup

1. La campaña aparece en el dropdown del dashboard con `bank: "avvillas"`.
2. Al seleccionarla, el frontend muestra un banner azul:
   > **Campaña en preparación** — La base de datos de esta campaña aún está siendo creada por el equipo. Los KPIs, gráficas y exportaciones se mostrarán automáticamente cuando esté disponible.
3. KPIs, gráficas y tablas se renderizan **vacíos** (sin errores rojos).
4. **Apenas el equipo de AV Villas cree la DB** `dentsu_mastercard_avvillas_lista_para_ganar` en Aurora:
   - Las queries MySQL dejan de fallar con `Unknown database`.
   - El backend regresa datos reales.
   - El dashboard se actualiza solo en el siguiente refresh / cambio de campaña.

---

## Detalles técnicos del auto-pickup

**Backend** (`backend/src/routes/campaigns.js`):
- Helper `isDbNotReadyError(error)` detecta los strings de error MySQL: `Unknown database`, `No database selected`, `database does not exist`, `ER_BAD_DB_ERROR`.
- Helper `respondPendingOr500(res, error, emptyShape, msg)` envuelve los catch de los endpoints. Si la DB no existe: HTTP 200 + `{ ...emptyShape, pending: true }`. Si es otro error: HTTP 500 normal.
- Aplicado a los endpoints críticos: `/summary`, `/activity`, `/first-logins-by-date`, `/enrolled-users`, `/redeemed-users`, `/redemptions-insights`, `/login-security`, `/segments`, `/user-types`.

**Backend** (`backend/src/config/campaigns.js`):
- La campaña tiene `pendingDb: true` (flag informativo para el frontend).
- No tiene `enabled: false`, así que aparece en el dropdown.

**Frontend** (`frontend/src/pages/Dashboard.tsx`):
- `selectedCampaignPending` calcula si la campaña tiene `pendingDb: true` **o** si el último summary tiene `pending: true`.
- Cuando es `true`, renderiza el banner azul arriba del mainSection.

**Permisos:**
- `backend/src/data/dashboardUsers.json` ya tiene `avvillas-lista-para-ganar` agregado al admin (local).
- ⚠️ En producción S3 hay que agregar el slug manualmente al `allowedCampaignIds` del admin u otros usuarios, y reiniciar ECS:
  ```bash
  aws ecs update-service \
    --cluster mastercard-dashboard-cluster \
    --service mastercard-dashboard-backend-service \
    --force-new-deployment --region us-west-2
  ```

---

## Opcional: hacer cleanup post-activación

Cuando confirmes que la DB existe y los datos se ven bien en el dashboard, puedes (no es necesario):

1. Quitar el flag `pendingDb: true` de `campaigns.js` para que ya no muestre el banner.
2. `git push origin main`.

Si lo dejas tal cual, no pasa nada — el banner solo aparece cuando el backend marca `pending: true`, y eso ya no ocurre una vez que la DB responde con datos.

---

## Verificar el comportamiento ahora (sin la DB)

1. Login al dashboard como admin.
2. Seleccionar **AV Villas Lista Para Ganar**.
3. Debe aparecer:
   - Banner azul "Campaña en preparación".
   - KPIs en 0 / vacíos (sin error toast rojo).
   - Gráficas vacías.
   - Filtros funcionan pero sin opciones.
   - Export Excel descarga un `.xlsx` con hojas vacías (sin error).

---

## Si algo falla post-creación de la DB

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| Sigue mostrando banner después de creada la DB | Hard-cache del frontend o `pendingDb: true` aún seteado | Refresh + opcionalmente cleanup en código |
| Muestra error 500 en vez de banner | El error MySQL no matchea los patrones detectados | Agregar el patrón a `isDbNotReadyError` |
| KPIs en 0 pero la DB existe | Tablas `mc_users` / `mc_logins` / `mc_redemptions` no existen en la DB | Confirmar esquema con AV Villas |
| Filtro segmento vacío | Columna `segment` en `mc_users` no tiene valores | Confirmar con AV Villas |

---

## TL;DR para tu reemplazo durante vacaciones

> Si alguien pregunta "¿qué pasa con AV Villas Lista Para Ganar?":
> - Está pre-configurada en el repo y desplegada.
> - Muestra un banner "en preparación" hasta que la DB exista en Aurora.
> - El día que AV Villas/el equipo de infra cree `dentsu_mastercard_avvillas_lista_para_ganar` en Aurora, **el dashboard se actualiza solo**. No hay que hacer ningún code push.
> - Lo único que se podría necesitar es agregar a usuarios viewer adicionales al `allowedCampaignIds` en S3 — pero el admin ya la tiene.
