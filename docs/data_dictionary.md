# Data Dictionary (Lambda Read-Only Access)

Este documento complementa `README_lambda_proxy.md` y consolida la estructura de las bases de datos consultadas. **Todas las consultas se ejecutan únicamente en modo lectura.**

> **Nota operativa:** en cualquier consulta o reporte se deben excluir los registros de prueba con `idmask` en `('A11111','A22222','A33333','A44444','A55555','A66666','A77777','A88888','A99999','A00000')`. Los filtros de fechas del dashboard operan sobre los campos `date` de `mc_logins` y `mc_redemptions`; valida que las campañas tengan datos cargados en esas columnas para obtener resultados pertinentes.

## Bases de datos analizadas

- dentsu_mastercard_bogota_uso_10 — ✅ Acceso confirmado
- dentsu_mastercard_debitazo_6 — ✅ Acceso confirmado
- dentsu_mastercard_davivienda_afluentes_3 — ✅ Acceso confirmado
- dentsu_mastercard_pacifico_sag_5 — ✅ Acceso confirmado
- dentsu_mastercard_pichincha — ✅ Acceso confirmado
- dentsu_mastercard_avvillas_combo_playero — ❌ Sin acceso (respuesta Lambda: (1049, "Unknown database 'dentsu_mastercard_avvillas_combo_playero'"))
- dentsu_mastercard_guayaquil_5s_3 — ❌ Sin acceso (respuesta Lambda: (1049, "Unknown database 'dentsu_mastercard_guayaquil_5s_3'"))

## Observaciones transversales

### Contenido y experiencia
- `mc_allies` concentra la información mostrada en carruseles de aliados (nombre, copy, assets, CTA). El campo `status` habilita/oculta el aliado y `activate` define el texto del botón. No existe FK directa hacia `mc_categories`; el backend resuelve el agrupamiento.
- `mc_categories`, `mc_faqs` y `mc_terms` son catálogos puramente de contenido en HTML/Texto. `mc_categories` define la taxonomía visual, `mc_faqs` organiza preguntas frecuentes por tipo de usuario (`usertype`) y `mc_terms` almacena los legales que se han reusado en landing y portal.
- `mc_settings` opera como almacén clave-valor para banderas funcionales y secretos operativos. Además de `gtm_enable`/`gtm_id`, se detectaron llaves de integración (`quantum_user`, `quantum_password`, `quantum_prefix`), seguridad (`recapcha_enterprise_*`, `two_Step_auth`), control de campañas (`counter`, `campaign_status`, `awards_amounts`, `use_quiz`, `use_dollars`, `use_goal_counts`) y presupuestos (`budget_api`, `budget_prepurchased`, `blocks`). Nuevas banderas se agregan como filas adicionales.
- Algunas campañas incorporan catálogos específicos: `mc_cats` extiende la categorización con descripciones e imágenes, `mc_davipuntos` gestiona los textos/arte de beneficios Davipuntos y `mc_challenges` define retos temporales con fecha de inicio/fin.

### Catálogo de premios y códigos
- `mc_awards` es el catálogo de premios/cupones: `type` y `location` definen la modalidad, `id_brand_quantum` enlaza con el proveedor de bonos y los campos `sXX` activan el beneficio para cada segmento/umbral. `pre_purchased` indica si el premio consume stock de `mc_prepurchaseds`.
- `mc_awards_logs` registra la interacción con el motor externo de premios (`text_response` y `post_data` guardan request/response) y resulta clave para auditorías de redención.
- `mc_prepurchaseds` y `mc_lealcods` forman el inventario de códigos. Los primeros son códigos comprados con anterioridad; los segundos se generan bajo demanda. Ambos se amarran a `mc_awards.id` y se asignan a un usuario llenando `idmask`.
- `mc_codes` mapea cada `idmask` a un `code_hash` (tokenizado) y opcionalmente una `url` personalizada; `mc_codes_clone` conserva el histórico original para reprocesos. Se usan en validaciones de ingreso y comunicación de enlaces individuales.
- `mc_notifications_setups` centraliza umbrales de consumo y concurrencia: los campos `concurrence`, `current`, `budget`/`budget_api`/`budget_prepurchased` y `stage` definen límites; en campañas que lo requieren, `p0`…`p100` describen hitos porcentuales para disparar alertas al listado de `emails`.

### Seguimiento de participantes
- `mc_users` es el maestro de participantes. Define metas de monto/transacciones (`goal_amount_*`, `goal_trx_*`), premios por etapa (`*_award_option`, `award_*`) y segmentación (`segment`, `user_type`).
- `mc_tracings` almacena el avance consolidado (`amount_1`, `trx_1` y sus variantes para etapas posteriores) y marca ganadores con `winner_1/2`. `date_update` conserva la fecha del último cálculo.
- `mc_logins` registra cada inicio de sesión, con `type` como canal y `winner_1/2` replicando el estado del usuario tras el login. Es la base para métricas de uso.
- `mc_quizzes` guarda las respuestas a encuestas (pregunta cerrada en `response_1`, texto libre en `response_2-4`) y se usa para análisis de satisfacción.
- `mc_redemptions` documenta canjes efectivos: referencia el premio (`id_award`), indica el monto (`value`), guarda el comprobante (`json`/`code_bond`) y controla estados con `block` y `valid_date`.

### Seguridad y controles
- `mc_two_step_auths` guarda los secretos de segundo factor (tokens/OTP) asociados al `idmask`; su activación depende de las banderas `two_Step_auth` en `mc_settings`.
- Tablas como `mc_notifications_setups`, `mc_settings` y `mc_codes_clone` actúan en conjunto para monitorear limites, activar/desactivar campañas y permitir la recuperación de códigos originales en auditorías.

---

## dentsu_mastercard_bogota_uso_10

Total de tablas: **18**

### dentsu_mastercard_bogota_uso_10.mc_allies

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| sub_description | varchar(500) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| banner | varchar(150) | YES |  | NULL |  |
| terms | text | YES |  | NULL |  |
| rule | varchar(150) | YES |  | NULL |  |
| img_rule | varchar(150) | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| link_file | varchar(500) | YES |  | NULL |  |
| activate | varchar(150) | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de aliados y beneficios publicados en el portal; `status` controla la visibilidad (1 activo) y `activate` define el CTA mostrado al usuario.

### dentsu_mastercard_bogota_uso_10.mc_awards

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| s0 | int | YES |  | NULL |  |
| s40 | int | YES |  | NULL |  |
| s50 | int | YES |  | NULL |  |
| s70 | int | YES |  | NULL |  |
| id_brand_quantum | int | YES |  | NULL |  |
| pre_purchased | tinyint | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| image_secondary | varchar(150) | YES |  | NULL |  |
| status | tinyint | YES |  | NULL |  |
| location | tinyint | YES |  | NULL |  |
| type | int | YES |  | NULL |  |
| s500 | int | YES |  | NULL |  |
| s450 | int | YES |  | NULL |  |
| s400 | int | YES |  | NULL |  |
| s300 | int | YES |  | NULL |  |
| s200 | int | YES |  | NULL |  |
| s150 | int | YES |  | NULL |  |
| s100 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de premios/cupones; `sXX` son banderas por segmento o umbral, `pre_purchased` indica si consume stock de `mc_prepurchaseds` y `id_brand_quantum` enlaza con el proveedor externo.

````json
[
  {
    "id": 1,
    "name": "Crepes & Waffles",
    "description": null,
    "link": null,
    "s0": 1,
    "s40": 1,
    "s50": 1,
    "s70": 1,
    "id_brand_quantum": 60,
    "pre_purchased": null,
    "image": "logo-crepes.png",
    "image_secondary": "",
    "status": 1,
    "location": null,
    "type": 1,
    "s500": 1,
    "s450": 1,
    "s400": 1,
    "s300": 1,
    "s200": 1,
    "s150": 1,
    "s100": 1
  },
  {
    "id": 2,
    "name": "Frisby",
    "description": null,
    "link": null,
    "s0": 1,
    "s40": 1,
    "s50": 1,
    "s70": 1,
    "id_brand_quantum": 60,
    "pre_purchased": null,
    "image": "logo-frisby.png",
    "image_secondary": "",
    "status": 1,
    "location": null,
    "type": 1,
    "s500": 1,
    "s450": 1,
    "s400": 1,
    "s300": 1,
    "s200": 1,
    "s150": 1,
    "s100": 1
  }
]
````

### dentsu_mastercard_bogota_uso_10.mc_awards_logs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(70) | YES |  | NULL |  |
| id_award | int | YES |  | NULL |  |
| log_type | tinyint | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| text_response | text | YES |  | NULL |  |
| post_data | text | YES |  | NULL |  |
| price | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Bitácora de interacción con el motor de premios; `log_type` clasifica la operación, `text_response` almacena la respuesta del servicio y `post_data` el payload enviado.

### dentsu_mastercard_bogota_uso_10.mc_categories

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Taxonomía usada para agrupar aliados o beneficios en interfaz; la relación se resuelve en la capa de aplicación (no hay FK explícita).

### dentsu_mastercard_bogota_uso_10.mc_codes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| code_hash | varchar(64) | YES |  | NULL |  |
| url | varchar(200) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Mapa `idmask` → `code_hash` (hash de códigos QR/registro) con `url` opcional; se usa para validar acceso o comunicar links personalizados.

````json
[
  {
    "idmask": "A1000016",
    "code_hash": "431999d6e345ddd63a",
    "url": null
  },
  {
    "idmask": "A1000032",
    "code_hash": "01e273e7be5c82cacb",
    "url": null
  }
]
````

### dentsu_mastercard_bogota_uso_10.mc_codes_clone

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| code_hash | varchar(64) | YES |  | NULL |  |
| url | varchar(200) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Respaldo de `mc_codes` que conserva los hash originales para reprocesos o auditoría.

### dentsu_mastercard_bogota_uso_10.mc_faqs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| title | text | YES |  | NULL |  |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Contenido HTML de preguntas frecuentes segmentado por `usertype` (null aplica a todos).

### dentsu_mastercard_bogota_uso_10.mc_lealcods

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Inventario de códigos dinámicos entregados en redenciones en línea; `id_award` referencia el premio y `idmask` se completa al asignar el código.

### dentsu_mastercard_bogota_uso_10.mc_logins

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| type | tinyint | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| winner_2 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Registro transaccional de ingresos al portal; `type` indica el canal y `winner_1/2` reflejan el estado del usuario tras el login.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "94747597-9d26-4b45-b83c-17f64b79622d", "stackTrace": []}``

### dentsu_mastercard_bogota_uso_10.mc_notifications_setups

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| emails | text | YES |  | NULL |  |
| concurrence | int | YES |  | NULL |  |
| current | int | YES |  | NULL |  |
| budget | int | YES |  | NULL |  |
| currentMonth | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Configuración de alertas de consumo; controla concurrencia y presupuestos (`budget`, `budget_api`, `budget_prepurchased`) y, cuando aplica, umbrales porcentuales (`p0`…`p100`) y destinatarios (`emails`).

### dentsu_mastercard_bogota_uso_10.mc_prepurchaseds

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Stock de códigos precomprados por premio; al asignarse se llena `idmask` y sirve como respaldo frente a `mc_lealcods`.

### dentsu_mastercard_bogota_uso_10.mc_quizzes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| response_1 | varchar(50) | YES |  | NULL |  |
| response_2 | text | YES |  | NULL |  |
| response_3 | text | YES |  | NULL |  |
| response_4 | text | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Respuestas de encuestas o quizzes; `response_1` captura la opción cerrada y `response_2-4` texto libre para insights.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "a5d432f3-71e4-4157-9859-d90d36f6f39f", "stackTrace": []}``

### dentsu_mastercard_bogota_uso_10.mc_redemptions

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| idtxt | varchar(250) | YES |  | NULL |  |
| json | varchar(250) | YES |  | NULL |  |
| block | tinyint | YES |  | NULL |  |
| code_bond | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Log de canjes ejecutados; enlaza con `mc_awards` vía `id_award`, guarda el comprobante en `json` y usa `block`/`code_bond` para controlar entrega.

````json
[
  {
    "id": 112,
    "id_award": 1,
    "idmask": "A33333",
    "date": "0000-00-00 00:00:00",
    "value": 40000,
    "idtxt": "af48b56a9021932d66c5c68e989cb163",
    "json": "https://apitest.activarpromo.com/productos/viewpdf/af48b56a9021932d66c5c68e98...",
    "block": 1,
    "code_bond": null,
    "valid_date": null,
    "ip": "10.10.10.10"
  }
]
````

### dentsu_mastercard_bogota_uso_10.mc_settings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| key | text | YES |  | NULL |  |
| value | text | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Tipo:** Tabla clave-valor que centraliza banderas de configuración del portal; `key` identifica la bandera, `value` almacena el valor literal (números, IDs o JSON) y `status` indica si está vigente.
- **Llaves detectadas:** `gtm_enable` (`"0"`/`"1"` para desactivar/activar Google Tag Manager) y `gtm_id` (identificador `GTM-XXXX` del contenedor). Se esperan nuevas banderas agregando filas adicionales sin alterar el esquema.

````json
[
  {
    "id": 1,
    "key": "gtm_enable",
    "value": "0",
    "status": 1
  },
  {
    "id": 2,
    "key": "gtm_id",
    "value": null,
    "status": 1
  }
]
````

### dentsu_mastercard_bogota_uso_10.mc_terms

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Términos y condiciones en HTML por tipo de usuario; reutilizados en landing y portal.

````json
[
  {
    "id": 1,
    "content": "              \r\n              <style>\r\n                div, p, b, li, a {\r\n  ...",
    "usertype": null
  }
]
````

### dentsu_mastercard_bogota_uso_10.mc_tracings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| amount_1 | int | YES |  | NULL |  |
| trx_1 | int | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| extra | varchar(100) | YES |  | NULL |  |
| date_update | varchar(10) | YES |  | NULL |  |
| block | int | YES |  | NULL |  |
| amount_2 | int | YES |  | NULL |  |
| trx_2 | int | YES |  | NULL |  |
| winner_2 | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Estado acumulado por participante; `amount_1`/`trx_1` suman avance y `winner_1/2` marcan metas cumplidas, `date_update` registra el último cálculo.

````json
[
  {
    "idmask": "A11111",
    "amount_1": 0,
    "trx_1": 0,
    "winner_1": 0,
    "extra": null,
    "date_update": "09-10-2025",
    "block": null,
    "amount_2": null,
    "trx_2": null,
    "winner_2": null
  },
  {
    "idmask": "A22222",
    "amount_1": 300000,
    "trx_1": 10,
    "winner_1": 1,
    "extra": null,
    "date_update": "09-10-2025",
    "block": null,
    "amount_2": null,
    "trx_2": null,
    "winner_2": null
  }
]
````

### dentsu_mastercard_bogota_uso_10.mc_two_step_auths

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| field | varchar(300) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Almacén de valores para el segundo factor de autenticación (OTP, tokens) asociados al `idmask`.

### dentsu_mastercard_bogota_uso_10.mc_users

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| document | varchar(10) | YES |  | NULL |  |
| birthdate | varchar(10) | YES |  | NULL |  |
| segment | varchar(150) | YES |  | NULL |  |
| user_type | int | YES |  | NULL |  |
| goal_amount_1 | int | YES |  | NULL |  |
| goal_trx_1 | int | YES |  | NULL |  |
| award_1 | int | YES |  | NULL |  |
| calculating_amount_option | int | YES |  | NULL |  |
| calculating_trx_option | int | YES |  | NULL |  |
| unstoppable_amount_option | int | YES |  | NULL |  |
| unstoppable_trx_option | int | YES |  | NULL |  |
| calculating_award_option | int | YES |  | NULL |  |
| unstoppable_award_option | int | YES |  | NULL |  |
| award_name | varchar(50) | YES |  | NULL |  |
| goal_amount_2 | int | YES |  | NULL |  |
| goal_trx_2 | int | YES |  | NULL |  |
| award_2 | int | YES |  | NULL |  |
| visionary_amount_option | int | YES |  | NULL |  |
| visionary_trx_option | int | YES |  | NULL |  |
| visionary_award_option | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Perfil maestro del participante: metas (`goal_*`), valores de premio por etapa (`*_award_option`) y segmentación (`segment`, `user_type`).

````json
[
  {
    "idmask": "A11111",
    "document": "11111",
    "birthdate": "2000-01-01",
    "segment": "Masivo",
    "user_type": null,
    "goal_amount_1": 100000,
    "goal_trx_1": 5,
    "award_1": 40000,
    "calculating_amount_option": 100000,
    "calculating_trx_option": 5,
    "unstoppable_amount_option": 300000,
    "unstoppable_trx_option": 10,
    "calculating_award_option": 40000,
    "unstoppable_award_option": 150000,
    "award_name": "Jumbo",
    "goal_amount_2": null,
    "goal_trx_2": null,
    "award_2": null,
    "visionary_amount_option": 500000,
    "visionary_trx_option": 5,
    "visionary_award_option": 100000
  },
  {
    "idmask": "A22222",
    "document": "22222",
    "birthdate": "2000-01-01",
    "segment": "Afluente",
    "user_type": null,
    "goal_amount_1": 100000,
    "goal_trx_1": 10,
    "award_1": 150000,
    "calculating_amount_option": 100000,
    "calculating_trx_option": 5,
    "unstoppable_amount_option": 300000,
    "unstoppable_trx_option": 10,
    "calculating_award_option": 40000,
    "unstoppable_award_option": 150000,
    "award_name": "Jumbo",
    "goal_amount_2": null,
    "goal_trx_2": null,
    "award_2": null,
    "visionary_amount_option": 500000,
    "visionary_trx_option": 5,
    "visionary_award_option": 100000
  }
]
````

---

## dentsu_mastercard_debitazo_6

Total de tablas: **16**

### dentsu_mastercard_debitazo_6.mc_allies

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| sub_description | varchar(500) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| terms | text | YES |  | NULL |  |
| rule | varchar(150) | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| activate | varchar(150) | YES |  | NULL |  |
| status | int | YES |  | NULL |  |
| banner | varchar(150) | YES |  | NULL |  |
| link_file | varchar(500) | YES |  | NULL |  |
| img_rule | varchar(500) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de aliados y beneficios publicados en el portal; `status` controla la visibilidad (1 activo) y `activate` define el CTA mostrado al usuario.

````json
[
  {
    "id": 1,
    "name": "",
    "description": "Ahorre haciendo su mercado en web o app todos los viernes con <strong>20% dct...",
    "sub_description": "",
    "image": "comercio_beneficio_exito.png",
    "terms": "Ahorre haciendo su mercado en web o app todos los viernes con <strong>20% dct...",
    "rule": "30dto.png",
    "link": "https://ofertas.comprasdavivienda.com/producto/supermercados--desde--exito---...",
    "activate": null,
    "status": 1,
    "banner": null,
    "link_file": null,
    "img_rule": null
  },
  {
    "id": 2,
    "name": "",
    "description": "Use el cupón <strong>MASTER01</strong> y gane <strong>$25.000</strong> en com...",
    "sub_description": "",
    "image": "comercio_beneficio_farmatodo.png",
    "terms": "de <strong>lunes a domingo</strong> con el cupón <strong>MASTER0</strong> por...",
    "rule": "20000dto.png",
    "link": "https://ofertas.comprasdavivienda.com/producto/salud-y-bienestar--otro--farma...",
    "activate": null,
    "status": 1,
    "banner": null,
    "link_file": null,
    "img_rule": null
  }
]
````

### dentsu_mastercard_debitazo_6.mc_awards

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| s50 | int | YES |  | NULL |  |
| s100 | int | YES |  | NULL |  |
| s150 | int | YES |  | NULL |  |
| s200 | int | YES |  | NULL |  |
| s250 | int | YES |  | NULL |  |
| s300 | int | YES |  | NULL |  |
| s350 | int | YES |  | NULL |  |
| s400 | int | YES |  | NULL |  |
| id_brand_quantum | int | YES |  | NULL |  |
| pre_purchased | tinyint | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| image_secondary | varchar(150) | YES |  | NULL |  |
| status | tinyint | YES |  | NULL |  |
| location | tinyint | YES |  | NULL |  |
| type | int | YES |  | NULL |  |
| s30 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de premios/cupones; `sXX` son banderas por segmento o umbral, `pre_purchased` indica si consume stock de `mc_prepurchaseds` y `id_brand_quantum` enlaza con el proveedor externo.

````json
[
  {
    "id": 1,
    "name": "Jumbo",
    "description": null,
    "link": null,
    "s50": 1,
    "s100": 1,
    "s150": 1,
    "s200": 1,
    "s250": 1,
    "s300": 1,
    "s350": 1,
    "s400": 1,
    "id_brand_quantum": 60,
    "pre_purchased": null,
    "image": "logo-jumbo.png",
    "image_secondary": null,
    "status": 1,
    "location": null,
    "type": 1,
    "s30": 0
  },
  {
    "id": 2,
    "name": "Pepe Ganga",
    "description": null,
    "link": null,
    "s50": 1,
    "s100": 1,
    "s150": 1,
    "s200": 1,
    "s250": 0,
    "s300": 0,
    "s350": 0,
    "s400": 0,
    "id_brand_quantum": 60,
    "pre_purchased": null,
    "image": "logo-pepeganga.png",
    "image_secondary": null,
    "status": 1,
    "location": null,
    "type": 1,
    "s30": 0
  }
]
````

### dentsu_mastercard_debitazo_6.mc_awards_logs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| id_award | int | YES |  | NULL |  |
| id_product_quantum | int | YES |  | NULL |  |
| type_error | tinyint | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| text_response | text | YES |  | NULL |  |
| post_data | text | YES |  | NULL |  |
| price | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Bitácora de interacción con el motor de premios; `log_type` clasifica la operación, `text_response` almacena la respuesta del servicio y `post_data` el payload enviado.

### dentsu_mastercard_debitazo_6.mc_categories

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Taxonomía usada para agrupar aliados o beneficios en interfaz; la relación se resuelve en la capa de aplicación (no hay FK explícita).

### dentsu_mastercard_debitazo_6.mc_codes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| code_hash | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Mapa `idmask` → `code_hash` (hash de códigos QR/registro) con `url` opcional; se usa para validar acceso o comunicar links personalizados.

````json
[
  {
    "idmask": "01-1-1001JWD",
    "code_hash": "967be5c12886309ee0"
  },
  {
    "idmask": "01-1-100LN3X",
    "code_hash": "fe4e11a332b80da49b"
  }
]
````

### dentsu_mastercard_debitazo_6.mc_faqs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| title | text | YES |  | NULL |  |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Contenido HTML de preguntas frecuentes segmentado por `usertype` (null aplica a todos).

### dentsu_mastercard_debitazo_6.mc_lealcods

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Inventario de códigos dinámicos entregados en redenciones en línea; `id_award` referencia el premio y `idmask` se completa al asignar el código.

### dentsu_mastercard_debitazo_6.mc_logins

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| type | tinyint | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| winner_2 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Registro transaccional de ingresos al portal; `type` indica el canal y `winner_1/2` reflejan el estado del usuario tras el login.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "e58ccba5-770b-4128-801f-12cc7e5b6e7a", "stackTrace": []}``

### dentsu_mastercard_debitazo_6.mc_notifications_setups

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| emails | text | YES |  | NULL |  |
| concurrence | int | YES |  | NULL |  |
| current | int | YES |  | NULL |  |
| budget | int | YES |  | NULL |  |
| currentMonth | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Configuración de alertas de consumo; controla concurrencia y presupuestos (`budget`, `budget_api`, `budget_prepurchased`) y, cuando aplica, umbrales porcentuales (`p0`…`p100`) y destinatarios (`emails`).

### dentsu_mastercard_debitazo_6.mc_prepurchaseds

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Stock de códigos precomprados por premio; al asignarse se llena `idmask` y sirve como respaldo frente a `mc_lealcods`.

````json
[
  {
    "id": 1,
    "id_award": 19,
    "value": 5000000,
    "code": "1-Jumbo5.000.000.pdf",
    "valid_date": null,
    "idmask": null
  },
  {
    "id": 2,
    "id_award": 3,
    "value": 20000,
    "code": "award.pdf",
    "valid_date": "qwerqwe",
    "idmask": null
  }
]
````

### dentsu_mastercard_debitazo_6.mc_quizzes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| response_1 | varchar(50) | YES |  | NULL |  |
| response_2 | text | YES |  | NULL |  |
| response_3 | text | YES |  | NULL |  |
| response_4 | text | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Respuestas de encuestas o quizzes; `response_1` captura la opción cerrada y `response_2-4` texto libre para insights.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "6317db44-91c7-4180-b026-e0b2588ffc69", "stackTrace": []}``

### dentsu_mastercard_debitazo_6.mc_redemptions

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| idtxt | varchar(250) | YES |  | NULL |  |
| json | varchar(250) | YES |  | NULL |  |
| block | tinyint | YES |  | NULL |  |
| code_bond | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Log de canjes ejecutados; enlaza con `mc_awards` vía `id_award`, guarda el comprobante en `json` y usa `block`/`code_bond` para controlar entrega.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "f002f83f-4fa4-4be8-8d93-ec9477f0f668", "stackTrace": []}``

### dentsu_mastercard_debitazo_6.mc_settings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| key | text | YES |  | NULL |  |
| value | text | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Tipo:** Tabla clave-valor compartida con el resto de esquemas; `key` define la bandera y `value` su configuración literal, mientras que `status` marca filas activas.
- **Llaves detectadas:** `gtm_enable` (`"0"`/`"1"` para habilitar el script de Google Tag Manager) y `gtm_id` (identificador `GTM-XXXX`). Se pueden añadir futuras banderas insertando nuevas filas.

````json
[
  {
    "id": 1,
    "key": "gtm_enable",
    "value": "0",
    "status": 1
  },
  {
    "id": 2,
    "key": "gtm_id",
    "value": null,
    "status": 1
  }
]
````

### dentsu_mastercard_debitazo_6.mc_terms

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Términos y condiciones en HTML por tipo de usuario; reutilizados en landing y portal.

````json
[
  {
    "id": 1,
    "content": "<style>\r\n\r\n  p {\r\n    margin: 0.6rem 0\r\n  }\r\n\r\n  ol,\r\n  ul {\r\n    margin: 0.6...",
    "usertype": null
  }
]
````

### dentsu_mastercard_debitazo_6.mc_tracings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| amount_1 | int | YES |  | NULL |  |
| amount_2 | int | YES |  | NULL |  |
| trx_1 | int | YES |  | NULL |  |
| trx_2 | int | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| winner_2 | int | YES |  | NULL |  |
| extra | varchar(100) | YES |  | NULL |  |
| date_update | varchar(10) | YES |  | NULL |  |
| block | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Estado acumulado por participante; `amount_1`/`trx_1` suman avance y `winner_1/2` marcan metas cumplidas, `date_update` registra el último cálculo.

````json
[
  {
    "idmask": "A11111_",
    "amount_1": 0,
    "amount_2": 0,
    "trx_1": 0,
    "trx_2": 0,
    "winner_1": 0,
    "winner_2": 0,
    "extra": "",
    "date_update": "01-10-2025",
    "block": null
  },
  {
    "idmask": "A22222",
    "amount_1": 200000,
    "amount_2": 0,
    "trx_1": 10,
    "trx_2": 0,
    "winner_1": 1,
    "winner_2": 0,
    "extra": "",
    "date_update": "01-10-2025",
    "block": null
  }
]
````

### dentsu_mastercard_debitazo_6.mc_users

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| document | varchar(10) | YES |  | NULL |  |
| birthdate | varchar(10) | YES |  | NULL |  |
| segment | varchar(150) | YES |  | NULL |  |
| user_type | int | YES |  | NULL |  |
| nickname | varchar(150) | YES |  | NULL |  |
| goal_amount_1 | int | YES |  | NULL |  |
| goal_amount_2 | int | YES |  | NULL |  |
| goal_trx_1 | int | YES |  | NULL |  |
| goal_trx_2 | int | YES |  | NULL |  |
| award_1 | int | YES |  | NULL |  |
| award_2 | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Perfil maestro del participante: metas (`goal_*`), valores de premio por etapa (`*_award_option`) y segmentación (`segment`, `user_type`).

````json
[
  {
    "idmask": "01-1-1001JWD",
    "document": "48725",
    "birthdate": "1988-11-23",
    "segment": null,
    "user_type": 0,
    "nickname": null,
    "goal_amount_1": 600000,
    "goal_amount_2": 200000,
    "goal_trx_1": 7,
    "goal_trx_2": null,
    "award_1": 50000,
    "award_2": 30000
  },
  {
    "idmask": "01-1-100LN3X",
    "document": "73574",
    "birthdate": "1994-08-05",
    "segment": null,
    "user_type": 1,
    "nickname": null,
    "goal_amount_1": 1300000,
    "goal_amount_2": 200000,
    "goal_trx_1": 16,
    "goal_trx_2": null,
    "award_1": 150000,
    "award_2": 30000
  }
]
````

---

## dentsu_mastercard_davivienda_afluentes_3

Total de tablas: **19**

### dentsu_mastercard_davivienda_afluentes_3.mc_allies

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| sub_description | varchar(500) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| terms | text | YES |  | NULL |  |
| rule | varchar(150) | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| activate | varchar(150) | YES |  | NULL |  |
| status | int | YES |  | NULL |  |
| banner | varchar(150) | YES |  | NULL |  |
| link_file | varchar(500) | YES |  | NULL |  |
| img_rule | varchar(500) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de aliados y beneficios publicados en el portal; `status` controla la visibilidad (1 activo) y `activate` define el CTA mostrado al usuario.

### dentsu_mastercard_davivienda_afluentes_3.mc_awards

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| s30 | int | YES |  | NULL |  |
| s50 | int | YES |  | NULL |  |
| s100 | int | YES |  | NULL |  |
| s200 | int | YES |  | NULL |  |
| s300 | int | YES |  | NULL |  |
| s350 | int | YES |  | NULL |  |
| s400 | int | YES |  | NULL |  |
| id_brand_quantum | int | YES |  | NULL |  |
| pre_purchased | tinyint | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| image_secondary | varchar(150) | YES |  | NULL |  |
| status | tinyint | YES |  | NULL |  |
| location | tinyint | YES |  | NULL |  |
| type | int | YES |  | NULL |  |
| s500 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de premios/cupones; `sXX` son banderas por segmento o umbral, `pre_purchased` indica si consume stock de `mc_prepurchaseds` y `id_brand_quantum` enlaza con el proveedor externo.

````json
[
  {
    "id": 1,
    "name": "Crepes & Waffles",
    "description": null,
    "link": null,
    "s30": 1,
    "s50": 1,
    "s100": 1,
    "s200": 1,
    "s300": 1,
    "s350": 1,
    "s400": 1,
    "id_brand_quantum": 60,
    "pre_purchased": null,
    "image": "logo-crepes.png",
    "image_secondary": null,
    "status": 1,
    "location": null,
    "type": 1,
    "s500": 0
  },
  {
    "id": 2,
    "name": "Jumbo",
    "description": null,
    "link": null,
    "s30": 1,
    "s50": 1,
    "s100": 1,
    "s200": 1,
    "s300": 1,
    "s350": 1,
    "s400": 1,
    "id_brand_quantum": 60,
    "pre_purchased": null,
    "image": "logo-jumbo.png",
    "image_secondary": null,
    "status": 1,
    "location": null,
    "type": 1,
    "s500": 0
  }
]
````

### dentsu_mastercard_davivienda_afluentes_3.mc_awards_logs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(70) | YES |  | NULL |  |
| id_award | int | YES |  | NULL |  |
| log_type | tinyint | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| text_response | text | YES |  | NULL |  |
| post_data | text | YES |  | NULL |  |
| price | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Bitácora de interacción con el motor de premios; `log_type` clasifica la operación, `text_response` almacena la respuesta del servicio y `post_data` el payload enviado.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "3d2e2d3d-92fb-47b2-995d-94eaae8e97e0", "stackTrace": []}``

### dentsu_mastercard_davivienda_afluentes_3.mc_categories

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Taxonomía usada para agrupar aliados o beneficios en interfaz; la relación se resuelve en la capa de aplicación (no hay FK explícita).

### dentsu_mastercard_davivienda_afluentes_3.mc_cats

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(200) | YES |  | NULL |  |
| desc | varchar(200) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo complementario de categorías específicas de campaña; expone nombre, descripción, assets y `status` para habilitar módulos personalizados.

### dentsu_mastercard_davivienda_afluentes_3.mc_codes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| code_hash | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Mapa `idmask` → `code_hash` (hash de códigos QR/registro) con `url` opcional; se usa para validar acceso o comunicar links personalizados.

````json
[
  {
    "idmask": "1-103AJPX",
    "code_hash": "610c79a60e0c25512e"
  },
  {
    "idmask": "1-104KSXU",
    "code_hash": "d9fc89ae23cf3a11b8"
  }
]
````

### dentsu_mastercard_davivienda_afluentes_3.mc_davipuntos

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(45) | YES |  | NULL |  |
| description | varchar(100) | YES |  | NULL |  |
| subdescription | varchar(100) | YES |  | NULL |  |
| double_points | varchar(100) | YES |  | NULL |  |
| normal_points | varchar(100) | YES |  | NULL |  |
| logo | varchar(100) | YES |  | NULL |  |
| banner | varchar(100) | YES |  | NULL |  |
| color | varchar(100) | YES |  | NULL |  |
| status | int | YES |  | 1 |  |

- **Claves primarias:** ``id``
- **Notas:** Configuración de beneficios Davipuntos (copys de puntos dobles/normales, assets, color) mostrados en la campaña afluentes.

### dentsu_mastercard_davivienda_afluentes_3.mc_faqs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| title | text | YES |  | NULL |  |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Contenido HTML de preguntas frecuentes segmentado por `usertype` (null aplica a todos).

````json
[
  {
    "id": 119,
    "title": "¿De qué se trata la campaña? ",
    "content": "Es una campaña creada por el Banco Davivienda que promueve el uso de sus Tarj...",
    "usertype": null
  },
  {
    "id": 120,
    "title": "¿Quiénes pueden participar en la Campaña? ",
    "content": "Pueden participar en la campaña los titulares de una Tarjeta de Crédito Maste...",
    "usertype": null
  }
]
````

### dentsu_mastercard_davivienda_afluentes_3.mc_lealcods

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Inventario de códigos dinámicos entregados en redenciones en línea; `id_award` referencia el premio y `idmask` se completa al asignar el código.

### dentsu_mastercard_davivienda_afluentes_3.mc_logins

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| type | tinyint | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| winner_2 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Registro transaccional de ingresos al portal; `type` indica el canal y `winner_1/2` reflejan el estado del usuario tras el login.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "ce0c3397-305b-45ec-b583-8b3003de92d6", "stackTrace": []}``

### dentsu_mastercard_davivienda_afluentes_3.mc_notifications_setups

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| emails | text | YES |  | NULL |  |
| emails_dev | text | YES |  | NULL |  |
| emails_pm | text | YES |  | NULL |  |
| emails_gn | text | YES |  | NULL |  |
| emails_advisor | text | YES |  | NULL |  |
| concurrence | int | YES |  | NULL |  |
| current | int | YES |  | NULL |  |
| budget_api | int | YES |  | NULL |  |
| budget_prepurchased | int | YES |  | NULL |  |
| stage | int | YES |  | NULL |  |
| p0 | int | YES |  | NULL |  |
| p10 | int | YES |  | NULL |  |
| p20 | int | YES |  | NULL |  |
| p30 | int | YES |  | NULL |  |
| p40 | int | YES |  | NULL |  |
| p50 | int | YES |  | NULL |  |
| p60 | int | YES |  | NULL |  |
| p70 | int | YES |  | NULL |  |
| p80 | int | YES |  | NULL |  |
| p90 | int | YES |  | NULL |  |
| p100 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Configuración de alertas de consumo; controla concurrencia y presupuestos (`budget`, `budget_api`, `budget_prepurchased`) y, cuando aplica, umbrales porcentuales (`p0`…`p100`) y destinatarios (`emails`).

### dentsu_mastercard_davivienda_afluentes_3.mc_prepurchaseds

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Stock de códigos precomprados por premio; al asignarse se llena `idmask` y sirve como respaldo frente a `mc_lealcods`.

### dentsu_mastercard_davivienda_afluentes_3.mc_quizzes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| response_1 | varchar(50) | YES |  | NULL |  |
| response_2 | text | YES |  | NULL |  |
| response_3 | text | YES |  | NULL |  |
| response_4 | text | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Respuestas de encuestas o quizzes; `response_1` captura la opción cerrada y `response_2-4` texto libre para insights.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "29fcc8d4-14c7-473f-b424-549ecbb5c099", "stackTrace": []}``

### dentsu_mastercard_davivienda_afluentes_3.mc_redemptions

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| idtxt | varchar(250) | YES |  | NULL |  |
| json | varchar(250) | YES |  | NULL |  |
| block | tinyint | YES |  | NULL |  |
| code_bond | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Log de canjes ejecutados; enlaza con `mc_awards` vía `id_award`, guarda el comprobante en `json` y usa `block`/`code_bond` para controlar entrega.

````json
[
  {
    "id": 1,
    "id_award": 1,
    "idmask": "A33333",
    "date": "0000-00-00 00:00:00",
    "value": 50000,
    "idtxt": "af48b56a9021932d66c5c68e989cb163",
    "json": "https://apitest.activarpromo.com/productos/viewpdf/af48b56a9021932d66c5c68e98...",
    "block": 1,
    "code_bond": "1",
    "valid_date": "20-12-2025",
    "ip": "181.59.3.12"
  },
  {
    "id": 140,
    "id_award": 1,
    "idmask": "A44444",
    "date": "0000-00-00 00:00:00",
    "value": 50000,
    "idtxt": "af48b56a9021932d66c5c68e989cb163",
    "json": "https://apitest.activarpromo.com/productos/viewpdf/af48b56a9021932d66c5c68e98...",
    "block": 1,
    "code_bond": "1",
    "valid_date": "20-12-2025",
    "ip": "181.59.3.12"
  }
]
````

### dentsu_mastercard_davivienda_afluentes_3.mc_settings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| key | text | YES |  | NULL |  |
| value | text | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Tipo:** Tabla de configuración clave-valor; `key` nombra la bandera, `value` guarda el valor configurado y `status` controla su vigencia.
- **Llaves detectadas:** `gtm_enable` (flag `"0"`/`"1"` para la carga de Google Tag Manager) y `gtm_id` (ID `GTM-XXXX`). Comparte la misma semántica que en el resto de bases.

````json
[
  {
    "id": 1,
    "key": "gtm_enable",
    "value": "0",
    "status": 1
  },
  {
    "id": 2,
    "key": "gtm_id",
    "value": null,
    "status": 1
  }
]
````

### dentsu_mastercard_davivienda_afluentes_3.mc_terms

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Términos y condiciones en HTML por tipo de usuario; reutilizados en landing y portal.

### dentsu_mastercard_davivienda_afluentes_3.mc_tracings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| amount_1 | int | YES |  | NULL |  |
| amount_2 | int | YES |  | NULL |  |
| trx_1 | int | YES |  | NULL |  |
| trx_2 | int | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| winner_2 | int | YES |  | NULL |  |
| extra | varchar(100) | YES |  | NULL |  |
| date_update | varchar(10) | YES |  | NULL |  |
| points | int | YES |  | NULL |  |
| points_accumulated | int | YES |  | NULL |  |
| points_date_update | varchar(100) | YES |  | NULL |  |
| block | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Estado acumulado por participante; `amount_1`/`trx_1` suman avance y `winner_1/2` marcan metas cumplidas, `date_update` registra el último cálculo.

````json
[
  {
    "idmask": "A11111",
    "amount_1": 90000,
    "amount_2": 0,
    "trx_1": 8,
    "trx_2": 0,
    "winner_1": 0,
    "winner_2": 0,
    "extra": null,
    "date_update": "01-10-2025",
    "points": null,
    "points_accumulated": null,
    "points_date_update": null,
    "block": null
  },
  {
    "idmask": "A22222",
    "amount_1": 200000,
    "amount_2": 0,
    "trx_1": 8,
    "trx_2": 0,
    "winner_1": 1,
    "winner_2": 0,
    "extra": null,
    "date_update": "01-10-2025",
    "points": null,
    "points_accumulated": null,
    "points_date_update": null,
    "block": null
  }
]
````

### dentsu_mastercard_davivienda_afluentes_3.mc_two_step_auths

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| field | varchar(300) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Almacén de valores para el segundo factor de autenticación (OTP, tokens) asociados al `idmask`.

### dentsu_mastercard_davivienda_afluentes_3.mc_users

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| document | varchar(10) | YES |  | NULL |  |
| birthdate | varchar(10) | YES |  | NULL |  |
| segment | varchar(150) | YES |  | NULL |  |
| award_extra | varchar(100) | YES |  | NULL |  |
| goal_amount_1 | int | YES |  | NULL |  |
| goal_amount_2 | int | YES |  | NULL |  |
| goal_trx_1 | int | YES |  | NULL |  |
| goal_trx_2 | int | YES |  | NULL |  |
| award_1 | int | YES |  | NULL |  |
| award_2 | int | YES |  | NULL |  |
| nickname | varchar(150) | YES |  | NULL |  |
| show_davipuntos | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Perfil maestro del participante: metas (`goal_*`), valores de premio por etapa (`*_award_option`) y segmentación (`segment`, `user_type`).

````json
[
  {
    "idmask": "",
    "document": "",
    "birthdate": "",
    "segment": "",
    "award_extra": "",
    "goal_amount_1": null,
    "goal_amount_2": null,
    "goal_trx_1": null,
    "goal_trx_2": null,
    "award_1": null,
    "award_2": null,
    "nickname": "",
    "show_davipuntos": null
  },
  {
    "idmask": "1-103AJPX",
    "document": "08038",
    "birthdate": "1991-02-13",
    "segment": "Bajo Valor",
    "award_extra": "",
    "goal_amount_1": 6434960,
    "goal_amount_2": null,
    "goal_trx_1": 8,
    "goal_trx_2": 8,
    "award_1": 100000,
    "award_2": 100000,
    "nickname": "",
    "show_davipuntos": null
  }
]
````

---

## dentsu_mastercard_pacifico_sag_5

Total de tablas: **19**

### dentsu_mastercard_pacifico_sag_5.mc_allies

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | varchar(500) | YES |  | NULL |  |
| sub_description | varchar(500) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| banner | varchar(150) | YES |  | NULL |  |
| terms | varchar(500) | YES |  | NULL |  |
| rule | varchar(150) | YES |  | NULL |  |
| img_rule | varchar(150) | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| link_file | varchar(500) | YES |  | NULL |  |
| activate | varchar(150) | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de aliados y beneficios publicados en el portal; `status` controla la visibilidad (1 activo) y `activate` define el CTA mostrado al usuario.

### dentsu_mastercard_pacifico_sag_5.mc_awards

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| s10 | int | YES |  | NULL |  |
| s15 | int | YES |  | NULL |  |
| s20 | int | YES |  | NULL |  |
| s25 | int | YES |  | NULL |  |
| s30 | int | YES |  | NULL |  |
| s40 | int | YES |  | NULL |  |
| s50 | int | YES |  | NULL |  |
| s80 | int | YES |  | NULL |  |
| s100 | int | YES |  | NULL |  |
| s120 | int | YES |  | NULL |  |
| s200 | int | YES |  | NULL |  |
| id_brand_quantum | int | YES |  | NULL |  |
| pre_purchased | tinyint | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| image_secondary | varchar(150) | YES |  | NULL |  |
| status | tinyint | YES |  | NULL |  |
| location | tinyint | YES |  | NULL |  |
| type | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de premios/cupones; `sXX` son banderas por segmento o umbral, `pre_purchased` indica si consume stock de `mc_prepurchaseds` y `id_brand_quantum` enlaza con el proveedor externo.

````json
[
  {
    "id": 1,
    "name": "Amazon",
    "description": "<p>Códigos alfanuméricos emitidos en dólares.</p>\r\n<p>Registrar el código alf...",
    "link": "",
    "s10": 0,
    "s15": 0,
    "s20": 0,
    "s25": 0,
    "s30": 1,
    "s40": 0,
    "s50": 0,
    "s80": 0,
    "s100": 0,
    "s120": 0,
    "s200": 0,
    "id_brand_quantum": null,
    "pre_purchased": 1,
    "image": "amazon.png",
    "image_secondary": "",
    "status": 1,
    "location": null,
    "type": 1
  },
  {
    "id": 2,
    "name": "Pedidos Ya",
    "description": "<ol>\r\n    <li>Elegimos la cantidad de vouchers necesarios. Manejamos un mínim...",
    "link": "",
    "s10": 0,
    "s15": 0,
    "s20": 0,
    "s25": 0,
    "s30": 1,
    "s40": 0,
    "s50": 0,
    "s80": 0,
    "s100": 0,
    "s120": 0,
    "s200": 0,
    "id_brand_quantum": null,
    "pre_purchased": 1,
    "image": "pedidos-ya.png",
    "image_secondary": "",
    "status": 1,
    "location": null,
    "type": 1
  }
]
````

### dentsu_mastercard_pacifico_sag_5.mc_awards_logs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(70) | YES |  | NULL |  |
| id_award | int | YES |  | NULL |  |
| log_type | tinyint | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| text_response | text | YES |  | NULL |  |
| post_data | text | YES |  | NULL |  |
| price | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Bitácora de interacción con el motor de premios; `log_type` clasifica la operación, `text_response` almacena la respuesta del servicio y `post_data` el payload enviado.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "ff571538-a611-4b36-834e-33fe0199df83", "stackTrace": []}``

### dentsu_mastercard_pacifico_sag_5.mc_categories

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Taxonomía usada para agrupar aliados o beneficios en interfaz; la relación se resuelve en la capa de aplicación (no hay FK explícita).

### dentsu_mastercard_pacifico_sag_5.mc_cats

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(200) | YES |  | NULL |  |
| status | int | YES |  | NULL |  |
| desc | varchar(200) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo complementario de categorías específicas de campaña; expone nombre, descripción, assets y `status` para habilitar módulos personalizados.

### dentsu_mastercard_pacifico_sag_5.mc_challenges

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(200) | YES |  | NULL |  |
| start_date | varchar(45) | YES |  | NULL |  |
| end_date | varchar(45) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``end_date, start_date``.
- **Notas:** Definición de retos temporales; `start_date`/`end_date` controlan vigencia y permiten activar dinámicas adicionales en el front.

### dentsu_mastercard_pacifico_sag_5.mc_codes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| code_hash | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Mapa `idmask` → `code_hash` (hash de códigos QR/registro) con `url` opcional; se usa para validar acceso o comunicar links personalizados.

````json
[
  {
    "idmask": "A11111",
    "code_hash": "12345"
  }
]
````

### dentsu_mastercard_pacifico_sag_5.mc_faqs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| title | text | YES |  | NULL |  |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Contenido HTML de preguntas frecuentes segmentado por `usertype` (null aplica a todos).

### dentsu_mastercard_pacifico_sag_5.mc_lealcods

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Inventario de códigos dinámicos entregados en redenciones en línea; `id_award` referencia el premio y `idmask` se completa al asignar el código.

### dentsu_mastercard_pacifico_sag_5.mc_logins

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| type | tinyint | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| winner_2 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Registro transaccional de ingresos al portal; `type` indica el canal y `winner_1/2` reflejan el estado del usuario tras el login.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "e9118092-5372-49f7-9b2a-817542f33958", "stackTrace": []}``

### dentsu_mastercard_pacifico_sag_5.mc_notifications_setups

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| emails | text | YES |  | NULL |  |
| concurrence | int | YES |  | NULL |  |
| current | int | YES |  | NULL |  |
| budget | int | YES |  | NULL |  |
| currentMonth | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Configuración de alertas de consumo; controla concurrencia y presupuestos (`budget`, `budget_api`, `budget_prepurchased`) y, cuando aplica, umbrales porcentuales (`p0`…`p100`) y destinatarios (`emails`).

### dentsu_mastercard_pacifico_sag_5.mc_prepurchaseds

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Stock de códigos precomprados por premio; al asignarse se llena `idmask` y sirve como respaldo frente a `mc_lealcods`.

````json
[
  {
    "id": 1,
    "id_award": 1,
    "value": 30,
    "code": "award.pdf",
    "valid_date": null,
    "idmask": "A11111",
    "date": null
  },
  {
    "id": 2,
    "id_award": 1,
    "value": 30,
    "code": "award.pdf",
    "valid_date": null,
    "idmask": null,
    "date": null
  }
]
````

### dentsu_mastercard_pacifico_sag_5.mc_quizzes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| response_1 | varchar(50) | YES |  | NULL |  |
| response_2 | text | YES |  | NULL |  |
| response_3 | text | YES |  | NULL |  |
| response_4 | text | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Respuestas de encuestas o quizzes; `response_1` captura la opción cerrada y `response_2-4` texto libre para insights.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "32c2b56b-7a6f-4774-9227-fe755cc2013f", "stackTrace": []}``

### dentsu_mastercard_pacifico_sag_5.mc_redemptions

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| idtxt | varchar(250) | YES |  | NULL |  |
| json | varchar(250) | YES |  | NULL |  |
| block | tinyint | YES |  | NULL |  |
| code_bond | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Log de canjes ejecutados; enlaza con `mc_awards` vía `id_award`, guarda el comprobante en `json` y usa `block`/`code_bond` para controlar entrega.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "1673bdf2-d147-48bc-a2ea-25487f117604", "stackTrace": []}``

### dentsu_mastercard_pacifico_sag_5.mc_settings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| key | text | YES |  | NULL |  |
| value | text | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Tipo:** Tabla clave-valor de parámetros frontales; `key` identifica la bandera, `value` guarda su configuración textual y `status` señala si está activa.
- **Llaves detectadas:** `gtm_enable` (bandera `"0"`/`"1"`) y `gtm_id` (código `GTM-XXXX`). Mantiene la misma lógica observada en las demás bases.

````json
[
  {
    "id": 1,
    "key": "gtm_enable",
    "value": "0",
    "status": 1
  },
  {
    "id": 2,
    "key": "gtm_id",
    "value": "",
    "status": 1
  }
]
````

### dentsu_mastercard_pacifico_sag_5.mc_terms

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Términos y condiciones en HTML por tipo de usuario; reutilizados en landing y portal.

### dentsu_mastercard_pacifico_sag_5.mc_tracings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| amount_1 | int | YES |  | NULL |  |
| amount_2 | int | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| winner_2 | int | YES |  | NULL |  |
| progress_challenge_1 | int | YES |  | NULL |  |
| progress_challenge_2 | int | YES |  | NULL |  |
| extra | varchar(100) | YES |  | NULL |  |
| date_update | varchar(50) | YES |  | NULL |  |
| mc_tracingscol | varchar(45) | YES |  | NULL |  |
| block | int | YES |  | NULL |  |
| progress_challenge_3 | int | YES |  | NULL |  |
| progress_challenge_4 | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Estado acumulado por participante; `amount_1`/`trx_1` suman avance y `winner_1/2` marcan metas cumplidas, `date_update` registra el último cálculo.

````json
[
  {
    "idmask": "A11111",
    "amount_1": 500,
    "amount_2": 600,
    "winner_1": 1,
    "winner_2": 0,
    "progress_challenge_1": 10,
    "progress_challenge_2": 10,
    "extra": "",
    "date_update": "07/10/2025",
    "mc_tracingscol": "",
    "block": null,
    "progress_challenge_3": 10,
    "progress_challenge_4": 10
  },
  {
    "idmask": "A22222",
    "amount_1": 900,
    "amount_2": 900,
    "winner_1": 1,
    "winner_2": 0,
    "progress_challenge_1": 1,
    "progress_challenge_2": 1,
    "extra": "",
    "date_update": "07/10/2025",
    "mc_tracingscol": "",
    "block": null,
    "progress_challenge_3": 0,
    "progress_challenge_4": 0
  }
]
````

### dentsu_mastercard_pacifico_sag_5.mc_two_step_auths

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| field | varchar(300) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Almacén de valores para el segundo factor de autenticación (OTP, tokens) asociados al `idmask`.

### dentsu_mastercard_pacifico_sag_5.mc_users

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| code | varchar(10) | YES |  | NULL |  |
| segment | varchar(150) | YES |  | NULL |  |
| user_type | varchar(150) | YES |  | NULL |  |
| goal_amount_1 | int | YES |  | NULL |  |
| goal_amount_2 | int | YES |  | NULL |  |
| award_1 | int | YES |  | NULL |  |
| award_2 | int | YES |  | NULL |  |
| challenge_1 | int | YES |  | NULL |  |
| challenge_2 | int | YES |  | NULL |  |
| challenge_3 | int | YES |  | NULL |  |
| challenge_4 | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Perfil maestro del participante: metas (`goal_*`), valores de premio por etapa (`*_award_option`) y segmentación (`segment`, `user_type`).

````json
[
  {
    "idmask": "10",
    "code": "BVN1LAbc",
    "segment": "Uso primario Grupo 2",
    "user_type": null,
    "goal_amount_1": 565,
    "goal_amount_2": null,
    "award_1": 25,
    "award_2": null,
    "challenge_1": 3,
    "challenge_2": 3,
    "challenge_3": 1,
    "challenge_4": null
  },
  {
    "idmask": "100002",
    "code": "7eb5DW0v",
    "segment": "Uso primario Grupo 5",
    "user_type": null,
    "goal_amount_1": 2595,
    "goal_amount_2": null,
    "award_1": 80,
    "award_2": null,
    "challenge_1": 3,
    "challenge_2": 6,
    "challenge_3": 2,
    "challenge_4": null
  }
]
````

---

## dentsu_mastercard_pichincha

Total de tablas: **15**

### dentsu_mastercard_pichincha.mc_allies

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| sub_description | varchar(500) | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| banner | varchar(150) | YES |  | NULL |  |
| terms | text | YES |  | NULL |  |
| rule | varchar(150) | YES |  | NULL |  |
| img_rule | varchar(150) | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| link_file | varchar(500) | YES |  | NULL |  |
| activate | varchar(150) | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de aliados y beneficios publicados en el portal; `status` controla la visibilidad (1 activo) y `activate` define el CTA mostrado al usuario.

### dentsu_mastercard_pichincha.mc_awards

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| name | varchar(50) | YES |  | NULL |  |
| description | text | YES |  | NULL |  |
| link | varchar(500) | YES |  | NULL |  |
| s8 | int | YES |  | NULL |  |
| s10 | int | YES |  | NULL |  |
| s12 | int | YES |  | NULL |  |
| s20 | int | YES |  | NULL |  |
| id_brand_quantum | int | YES |  | NULL |  |
| pre_purchased | tinyint | YES |  | NULL |  |
| image | varchar(150) | YES |  | NULL |  |
| image_secondary | varchar(150) | YES |  | NULL |  |
| status | tinyint | YES |  | NULL |  |
| location | tinyint | YES |  | NULL |  |
| type | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Catálogo de premios/cupones; `sXX` son banderas por segmento o umbral, `pre_purchased` indica si consume stock de `mc_prepurchaseds` y `id_brand_quantum` enlaza con el proveedor externo.

````json
[
  {
    "id": 1,
    "name": "Amazon",
    "description": "<p>Códigos alfanuméricos emitidos en dólares.</p>\r\n<p>Registrar el código alf...",
    "link": "",
    "s8": 1,
    "s10": 1,
    "s12": 1,
    "s20": 1,
    "id_brand_quantum": null,
    "pre_purchased": 1,
    "image": "amazon.png",
    "image_secondary": "",
    "status": 1,
    "location": null,
    "type": 1
  }
]
````

### dentsu_mastercard_pichincha.mc_awards_logs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(70) | YES |  | NULL |  |
| id_award | int | YES |  | NULL |  |
| log_type | tinyint | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| text_response | text | YES |  | NULL |  |
| post_data | text | YES |  | NULL |  |
| price | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Bitácora de interacción con el motor de premios; `log_type` clasifica la operación, `text_response` almacena la respuesta del servicio y `post_data` el payload enviado.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "3ce4dd5c-f05e-4336-ba6a-7a9655787f7e", "stackTrace": []}``

### dentsu_mastercard_pichincha.mc_codes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| code_hash | varchar(64) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Mapa `idmask` → `code_hash` (hash de códigos QR/registro) con `url` opcional; se usa para validar acceso o comunicar links personalizados.

````json
[
  {
    "idmask": "A10000034",
    "code_hash": "e8e1909b1131415d67"
  },
  {
    "idmask": "A10000713",
    "code_hash": "3a4e37bdb6fce7f33d"
  }
]
````

### dentsu_mastercard_pichincha.mc_faqs

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| title | text | YES |  | NULL |  |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Contenido HTML de preguntas frecuentes segmentado por `usertype` (null aplica a todos).

### dentsu_mastercard_pichincha.mc_logins

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| type | tinyint | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Registro transaccional de ingresos al portal; `type` indica el canal y `winner_1/2` reflejan el estado del usuario tras el login.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "93e438cf-3e6a-4629-b19b-6d02300160d7", "stackTrace": []}``

### dentsu_mastercard_pichincha.mc_notifications_setups

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| emails | text | YES |  | NULL |  |
| concurrence | int | YES |  | NULL |  |
| current | int | YES |  | NULL |  |
| budget | int | YES |  | NULL |  |
| currentMonth | int | YES |  | NULL |  |
| budget_api | int | YES |  | NULL |  |
| budget_prepurchased | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Configuración de alertas de consumo; controla concurrencia y presupuestos (`budget`, `budget_api`, `budget_prepurchased`) y, cuando aplica, umbrales porcentuales (`p0`…`p100`) y destinatarios (`emails`).

### dentsu_mastercard_pichincha.mc_prepurchaseds

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| code | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Stock de códigos precomprados por premio; al asignarse se llena `idmask` y sirve como respaldo frente a `mc_lealcods`.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "46d23344-4d69-4da4-a541-fcf977c681e5", "stackTrace": []}``

### dentsu_mastercard_pichincha.mc_quizzes

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| response_1 | varchar(50) | YES |  | NULL |  |
| response_2 | text | YES |  | NULL |  |
| response_3 | text | YES |  | NULL |  |
| response_4 | text | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Respuestas de encuestas o quizzes; `response_1` captura la opción cerrada y `response_2-4` texto libre para insights.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "459e3859-dc13-4692-8e98-2991ea6e5e7f", "stackTrace": []}``

### dentsu_mastercard_pichincha.mc_redemptions

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| id_award | int | YES |  | NULL |  |
| idmask | varchar(64) | YES |  | NULL |  |
| date | datetime | YES |  | NULL |  |
| value | int | YES |  | NULL |  |
| idtxt | varchar(250) | YES |  | NULL |  |
| json | varchar(250) | YES |  | NULL |  |
| block | tinyint | YES |  | NULL |  |
| code_bond | varchar(64) | YES |  | NULL |  |
| valid_date | varchar(10) | YES |  | NULL |  |
| ip | varchar(20) | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Campos temporales detectados:** ``valid_date``.
- **Notas:** Log de canjes ejecutados; enlaza con `mc_awards` vía `id_award`, guarda el comprobante en `json` y usa `block`/`code_bond` para controlar entrega.

No se pudo obtener muestra. Respuesta Lambda: ``{"errorMessage": "Unable to marshal response: Object of type datetime is not JSON serializable", "errorType": "Runtime.MarshalError", "requestId": "ed3a69b2-fe6e-4cd8-94cd-876a11c4247e", "stackTrace": []}``

### dentsu_mastercard_pichincha.mc_settings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | int | NO | PRI | NULL | auto_increment |
| key | text | YES |  | NULL |  |
| value | text | YES |  | NULL |  |
| status | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Tipo:** Tabla clave-valor de configuración reutilizada en todos los esquemas; `key` describe la bandera, `value` contiene el valor literal y `status` define vigencia.
- **Llaves detectadas:** `gtm_enable` (`"0"`/`"1"`) y `gtm_id` (identificador `GTM-XXXX`). Agregar nuevas configuraciones implica insertar filas adicionales.

````json
[
  {
    "id": 1,
    "key": "gtm_enable",
    "value": "0",
    "status": 1
  },
  {
    "id": 2,
    "key": "gtm_id",
    "value": null,
    "status": 1
  }
]
````

### dentsu_mastercard_pichincha.mc_terms

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| id | bigint unsigned | NO | PRI | NULL | auto_increment |
| content | mediumtext | YES |  | NULL |  |
| usertype | int | YES |  | NULL |  |

- **Claves primarias:** ``id``
- **Notas:** Términos y condiciones en HTML por tipo de usuario; reutilizados en landing y portal.

````json
[
  {
    "id": 1,
    "content": "<div>\r     <h2>“HAY HISTORIAS QUE COMIENZAN CON UNA COMPRA Y ACELERAN HACIA L...",
    "usertype": 1
  },
  {
    "id": 2,
    "content": "<div>\r\n    <h2>“HAY HISTORIAS QUE COMIENZAN CON UNA COMPRA Y SE GRITAN COMO U...",
    "usertype": 2
  }
]
````

### dentsu_mastercard_pichincha.mc_tracings

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| amount_1 | int | YES |  | NULL |  |
| winner_1 | int | YES |  | NULL |  |
| goal_count | int | YES |  | NULL |  |
| extra | varchar(100) | YES |  | NULL |  |
| date_update | varchar(10) | YES |  | NULL |  |
| block | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Estado acumulado por participante; `amount_1`/`trx_1` suman avance y `winner_1/2` marcan metas cumplidas, `date_update` registra el último cálculo.

````json
[
  {
    "idmask": "A10178779",
    "amount_1": 0,
    "winner_1": 0,
    "goal_count": 0,
    "extra": null,
    "date_update": "14/10/2025",
    "block": null
  },
  {
    "idmask": "A10285508",
    "amount_1": 0,
    "winner_1": 0,
    "goal_count": 0,
    "extra": null,
    "date_update": "14/10/2025",
    "block": null
  }
]
````

### dentsu_mastercard_pichincha.mc_two_step_auths

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| field | varchar(300) | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Almacén de valores para el segundo factor de autenticación (OTP, tokens) asociados al `idmask`.

### dentsu_mastercard_pichincha.mc_users

| Columna | Tipo | Null | Key | Default | Extra |
|---------|------|------|-----|---------|-------|
| idmask | varchar(50) | NO | PRI | NULL |  |
| document | varchar(10) | YES |  | NULL |  |
| birthdate | varchar(10) | YES |  | NULL |  |
| segment | varchar(150) | YES |  | NULL |  |
| user_type | int | YES |  | NULL |  |
| goal_amount_1 | int | YES |  | NULL |  |
| award_1 | int | YES |  | NULL |  |
| challenge_1 | int | YES |  | NULL |  |

- **Claves primarias:** ``idmask``
- **Notas:** Perfil maestro del participante: metas (`goal_*`), valores de premio por etapa (`*_award_option`) y segmentación (`segment`, `user_type`).

````json
[
  {
    "idmask": "A10000034",
    "document": "80640",
    "birthdate": "1977-03-13",
    "segment": "Conmebol",
    "user_type": null,
    "goal_amount_1": 120,
    "award_1": 8,
    "challenge_1": 25
  },
  {
    "idmask": "A10000713",
    "document": "43630",
    "birthdate": "1966-07-12",
    "segment": "Conmebol",
    "user_type": null,
    "goal_amount_1": 100,
    "award_1": 8,
    "challenge_1": 20
  }
]
````

---

## dentsu_mastercard_avvillas_combo_playero

No se obtuvo información de esta base. Respuesta Lambda: ``{"status": "error", "errorType": "OperationalError", "errorMessage": "(1049, \"Unknown database 'dentsu_mastercard_avvillas_combo_playero'\")"}``.

## dentsu_mastercard_guayaquil_5s_3

No se obtuvo información de esta base. Respuesta Lambda: ``{"status": "error", "errorType": "OperationalError", "errorMessage": "(1049, \"Unknown database 'dentsu_mastercard_guayaquil_5s_3'\")"}``.
