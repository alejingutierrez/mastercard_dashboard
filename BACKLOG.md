# Dashboard Visualization Backlog

## Propósito
- Entregar una guía de evolución del dashboard Mastercard orientada a negocio, destacando qué vistas necesitamos, para quién y con qué decisiones habilitadas.
- Mantener consistencia con lo ya implementado en `Dashboard.tsx` y con las reglas operativas descritas en `README_lambda_proxy.md` y `docs/data_dictionary.md` (solo lectura, filtros de fechas, exclusión de idmask de prueba).
- Priorizar gradualmente las mejoras para que el equipo de producto, data y tecnología puedan coordinar entregables y validaciones.

## Principios de diseño
- **Enfoque en decisiones**: cada visual responde a una pregunta de negocio concreta y debe derivar en acciones viables.
- **Contexto temporal consistente**: todas las vistas respetan el rango de fechas seleccionado y resaltan tendencias (día vs día, semana vs semana, mes vs mes).
- **Comparabilidad entre campañas**: permitir drill-down por campaña o segmento sin perder la narrativa general.
- **Legibilidad ejecutiva**: métricas clave visibles en los primeros cinco segundos, con lenguaje entendible para stakeholders no técnicos.
- **Alertas proactivas**: identificar umbrales críticos (adopción, fraude, inventario) y prepararlos para futuras notificaciones.

## Topología propuesta del dashboard

### PAGINA 1. Overview Ejecutivo
La vista principal sintetiza la salud de cada campaña con métricas obtenibles mediante la Lambda de lectura y respalda decisiones de negocio inmediatas.

**CHART 1 — Indicadores generales (KPIs con sparkline diario)**  
- Objetivo: entregar en un vistazo la salud del programa resaltando volumen, valor económico y cumplimiento de metas, mostrando alertas tempranas.  
- Tipo: Tarjetas con mini serie de tiempo (promedio móvil 7 días), variación vs. periodo anterior, meta esperada y semáforos configurables.  
- Datos: agregaciones diarias de `mc_tracings.amount_1`, `mc_tracings.trx_1`, `mc_logins.id`, `mc_logins.idmask`, `mc_redemptions.value`, `mc_awards_logs.id_award` sobre las bases `dentsu_mastercard_bogota_uso_10`, `dentsu_mastercard_debitazo_6`, `dentsu_mastercard_davivienda_afluentes_3`, `dentsu_mastercard_pacifico_sag_5`, `dentsu_mastercard_pichincha` y `dentsu_mastercard_guayaquil_5s_3`.  
- Segmentación: filtros combinables por campaña (selección de base), segmento (`mc_users.segment`), tipo de usuario (`mc_users.user_type`) y rango de fechas.  
- Validaciones: excluir `idmask` de prueba, normalizar `datetime` a ISO8601, calcular usuarios únicos con `COUNT(DISTINCT idmask)` y limitar la ventana analizada para mantener la Lambda por debajo de 30 s.  
- Historia de usuario: Como directora comercial, quiero visualizar los KPIs críticos con su tendencia diaria para detectar desviaciones y activar planes sin revisar múltiples reportes.

**CHART 2 — Actividad temporal combinada (logins vs. redenciones)**  
- Objetivo: evidenciar la relación entre accesos y consumo de beneficios para validar el impacto de campañas tácticas.  
- Tipo: Serie de tiempo multi-eje con líneas apiladas (conteo de logins y redenciones) más anotaciones de hitos comerciales y línea de variación porcentual.  
- Datos: `mc_logins.date`, `mc_logins.type`, `mc_redemptions.date`, `mc_redemptions.value`, agregados por día con promedio móvil a 7 días.  
- Segmentación: alternar vista consolidada vs. detalle por campaña, con selector por `mc_logins.type` (web, app, OTP) y segmento.  
- Validaciones: truncar `datetime` a día completo, documentar en tooltip la procedencia de cada métrica y sincronizar la zona horaria.  
- Historia de usuario: Como líder de CRM, quiero seguir la evolución conjunta de logins y canjes para detectar cuándo una campaña necesita refuerzo inmediato.

**CHART 3 — Comparativo multi-campaña (rendimiento mensual)**  
- Objetivo: comparar la tracción de cada campaña contra sus metas financieras y de actividad.  
- Tipo: Barras apiladas mensuales combinando logins, usuarios con redención y valor económico; incluye línea objetivo basada en `mc_users.goal_amount_1`.  
- Datos: agregaciones mensuales de `mc_logins`, `mc_redemptions`, `mc_tracings.trx_1`, `mc_tracings.amount_1`, `mc_tracings.winner_1`.  
- Segmentación: ordenar por desempeño, permitir vista acumulada vs. objetivo e incluir filtros por segmento prioritario y tipo de usuario.  
- Validaciones: alinear rangos de fechas, recalcular metas cuando cambie `mc_users.award_1` y documentar supuestos de conversión monetaria.  
- Historia de usuario: Como gerente regional, quiero comparar el rendimiento mensual de las campañas para reasignar presupuesto hacia los frentes con mayor retorno.

**CHART 4 — Conversión login → redención**  
- Objetivo: identificar fricciones en el funnel desde el acceso hasta la redención efectiva y cuantificar impacto.  
- Tipo: Barras apiladas por semana que reflejan etapas (login, solicitud registrada en `mc_awards_logs`, canje exitoso en `mc_redemptions`) y porcentaje de conversión.  
- Datos: conteos semanales de `mc_logins`, `mc_awards_logs` (agrupados por `log_type`) y `mc_redemptions`, unidos por `idmask` y `id_award`.  
- Segmentación: filtros por campaña, segmento, tipo de premio (`mc_awards.type`) y canal de login.  
- Validaciones: mapear `log_type` a estados de negocio (intento, aprobado, rechazado), depurar duplicados por `idtxt` y justificar porcentajes en tooltips.  
- Historia de usuario: Como product owner, quiero saber en qué etapa perdemos usuarios para priorizar mejoras de experiencia o ajustes de reglas.

**CHART 5 — Segmentos prioritarios**  
- Objetivo: destacar segmentos de alto impacto o riesgo para personalizar comunicaciones y presupuesto.  
- Tipo: Heatmap de intensidad que cruza segmentos (`mc_users.segment`) con métricas clave (logins, valor redimido, ticket medio) y badges de tendencia.  
- Datos: agregaciones de `mc_users.segment`, `mc_tracings.amount_1`, `mc_tracings.trx_1`, `mc_redemptions.value`, cálculo de ticket medio = valor/usuarios con redención.  
- Segmentación: drill-down controlado a nivel usuario (anonimización parcial de `idmask`), filtros por campaña y tipo de usuario.  
- Validaciones: definir fórmula única de ticket medio, sincronizar filtros globales, documentar reglas de anonimización (mostrar solo últimos 4 caracteres) y excluir segmentos con baja n.  
- Historia de usuario: Como analista de BI, quiero detectar segmentos críticos para dirigir campañas y presupuesto donde generen mayor impacto sin comprometer privacidad.

### PAGINA 2. Consumo de Bonos y Redenciones
Profundiza en la disponibilidad, demanda y eficiencia del catálogo utilizando datos verificados en las bases accesibles por la Lambda.

**CHART 6 — Funnel de canje**  
- Objetivo: mostrar el paso a paso desde usuarios logueados hasta redenciones exitosas para cuantificar la pérdida por etapa.  
- Tipo: Barras horizontales apiladas con porcentajes y tooltips explicando causas principales de drop-off.  
- Datos: `mc_logins` (usuarios activos), `mc_awards_logs` (intentos fallidos/aprobados usando `log_type`), `mc_redemptions` (canjes confirmados) con agrupación semanal.  
- Segmentación: filtros combinables por campaña, segmento, tipo de premio (`mc_awards.type`) y rango de fechas.  
- Validaciones: catalogar `log_type` en intentos vs. aprobaciones, eliminar duplicados por `idtxt`, justificar denominadores en documentación y mantener exclusión de `idmask` de prueba.  
- Historia de usuario: Como responsable de CX, quiero visualizar dónde se detiene el funnel para coordinar acciones correctivas con tecnología y aliados.

**CHART 7 — Serie temporal de redenciones por categoría**  
- Objetivo: evaluar la dinámica de consumo y anticipar quiebres o saturaciones por categoría de premio.  
- Tipo: Área apilada diaria con toggle entre unidades redimidas y valor en COP, incluyendo línea de media móvil y anotaciones de campañas.  
- Datos: `mc_redemptions.date`, `mc_redemptions.value`, `mc_awards.id`, `mc_awards.id_brand_quantum`, `mc_awards.location`, enriquecidos con catálogo `mc_categories`.  
- Segmentación: filtros por aliado (`mc_awards.name`), categoría, ubicación y campaña.  
- Validaciones: tratar nulos en `mc_redemptions.valid_date`, homologar catálogos de aliados, aplicar timezone oficial y documentar conversiones monetarias.  
- Historia de usuario: Como gerente de alianzas, quiero entender qué categorías crecen o caen para renegociar condiciones y ajustar el catálogo de beneficios.

**CHART 8 — Ranking de premios y aliados**  
- Objetivo: priorizar acuerdos comerciales destacando premios con mayor participación, ticket promedio y variación.  
- Tipo: Barras horizontales apiladas que muestran participación, ticket promedio y delta vs. periodo previo, con badges de tendencia.  
- Datos: `mc_awards` (atributos), `mc_redemptions.value`, `mc_redemptions.id_award`, `mc_awards_logs.price`, `mc_prepurchaseds.value` para flag de precompra.  
- Segmentación: filtros por categoría (`mc_categories`), aliado, estado de inventario (prepagado vs. disponible) y campaña.  
- Validaciones: normalizar nombres de aliados, consolidar premios duplicados, documentar fórmula del delta y revisar coherencia de moneda.  
- Historia de usuario: Como ejecutiva comercial, quiero un ranking claro de premios para decidir cuáles impulsar, renegociar o retirar.

**CHART 9 — Stock prepago vs. consumo**  
- Objetivo: monitorear el inventario prepago y proyectar fechas de agotamiento para evitar incidentes.  
- Tipo: Serie dual (consumo acumulado vs. stock disponible) con banda de confianza, spotlight de días restantes y alertas visuales por umbral.  
- Datos: `mc_prepurchaseds.value`, `mc_prepurchaseds.valid_date`, `mc_lealcods.value`, `mc_notifications_setups.budget`, `mc_notifications_setups.current`, enriquecidos con consumo diario de `mc_redemptions`.  
- Segmentación: selector por aliado, tipo de premio, lote y campaña; opción de agrupar por categoría.  
- Validaciones: parsear `valid_date` a formato fecha, conciliar códigos utilizados vs. disponibles, explicar metodología de proyección y registrar ajustes manuales.  
- Historia de usuario: Como coordinadora de operaciones, quiero conocer la cobertura de stock para anticipar reposiciones antes de impactar a los usuarios finales.

**CHART 10 — Heatmap horario de redenciones**  
- Objetivo: identificar patrones de consumo por día y hora para optimizar campañas, staffing y monitoreo antifraude.  
- Tipo: Heatmap 7x24 que marca franjas de alta intensidad y destaca fines de semana vs. laborables.  
- Datos: `mc_redemptions.date`, `mc_redemptions.idmask`, `mc_redemptions.ip`, derivados de franjas horarias y día de semana.  
- Segmentación: filtros por campaña, aliado y top 10 ubicaciones (segmentos o ciudades), posibilidad de comparar semanas consecutivas.  
- Validaciones: ajustar a la zona horaria del negocio, filtrar IPs internas, anonimizar `idmask`, y limitar buckets con baja muestra para evitar ruido.  
- Historia de usuario: Como líder de CRM, quiero saber cuándo se concentran los canjes para programar push notifications y dimensionar el equipo de soporte.

### PAGINA 3. Login y Seguridad
Monitorea comportamiento de acceso, adopción de controles y eventos sospechosos sin exceder permisos de lectura.

**CHART 11 — Distribución de logins por tipo**  
- Objetivo: entender la adopción de canales de autenticación y detectar cambios abruptos en el mix.  
- Tipo: Serie de tiempo con áreas apiladas por `type` y línea de logins únicos, acompañada de variación porcentual vs. periodo anterior.  
- Datos: `mc_logins.date`, `mc_logins.type`, `mc_logins.idmask`, catálogo de canal.  
- Segmentación: filtros por campaña, segmento, tipo de usuario y rango de fechas.  
- Validaciones: definir catálogo de `type`, calcular usuarios únicos con `DISTINCT idmask`, registrar cambios de definición en tooltips y manejar datos faltantes.  
- Historia de usuario: Como responsable de producto digital, quiero validar si los usuarios adoptan los nuevos canales de login para priorizar mejoras en esos flujos.

**CHART 12 — IPs atípicas y concurrencia**  
- Objetivo: detectar patrones de riesgo derivados de uso inusual de IPs o accesos simultáneos sospechosos.  
- Tipo: Barras apiladas por hora que contrastan IPs nuevas, recurrentes y clasificadas como riesgo; incluye línea de máximo histórico.  
- Datos: `mc_logins.ip`, `mc_logins.date`, enriquecimiento geográfico (lookup offline) y umbrales definidos por seguridad.  
- Segmentación: filtros por campaña, país/ciudad derivada, usuario (`idmask`) y tipo de dispositivo si aplica.  
- Validaciones: normalizar IPv4/IPv6, establecer umbrales de riesgo documentados, excluir IPs internas y guardar evidencia en logs de auditoría.  
- Historia de usuario: Como analista de riesgo, quiero identificar IPs anómalas casi en tiempo real para escalar investigaciones antifraude.

**CHART 13 — Adopción de doble factor (2FA)**  
- Objetivo: medir el avance del enrolamiento a doble factor y priorizar segmentos rezagados.  
- Tipo: Heatmap semanal cruzando segmentos vs. porcentaje de usuarios presentes en `mc_two_step_auths`, con línea objetivo.  
- Datos: `mc_two_step_auths.idmask`, `mc_two_step_auths.field`, `mc_logins.date` (cohorte), `mc_users.segment`, `mc_users.user_type`.  
- Segmentación: filtros por campaña, tipo de usuario y ventana temporal.  
- Validaciones: confirmar periodicidad de carga, anonimizar campos sensibles en `field`, calcular porcentajes con denominador consistente y documentar excepciones.  
- Historia de usuario: Como líder de seguridad, quiero ver qué segmentos ya adoptaron 2FA para coordinar campañas de enrolamiento donde falte cobertura.

**CHART 14 — Usuarios bloqueados o en observación**  
- Objetivo: seguir la evolución de usuarios con restricciones y cruzar los eventos que originan cada bloqueo.  
- Tipo: Serie de tiempo con líneas diferenciando bloqueos activos (`mc_tracings.block`) y eventos críticos (`mc_awards_logs.log_type`), con anotaciones de soporte.  
- Datos: `mc_tracings.idmask`, `mc_tracings.block`, `mc_tracings.date_update`, `mc_awards_logs.log_type`, `mc_awards_logs.date`, `mc_awards_logs.text_response`.  
- Segmentación: filtros por campaña, aliado asociado al premio, segmento y tipo de incidente.  
- Validaciones: catalogar motivos de bloqueo, convertir `date_update` a fecha, sincronizar con bitácora de soporte y documentar pasos de remediación.  
- Historia de usuario: Como coordinador de soporte, quiero priorizar usuarios bloqueados y el contexto de cada caso para resolverlos antes de que escalen.

**CHART 15 — Tiempo a primera redención**  
- Objetivo: medir la velocidad de conversión desde el primer login hasta la primera redención y detectar outliers.  
- Tipo: Boxplot semanal por cohorte de primer login, con indicadores de mediana y percentiles.  
- Datos: `mc_logins.date` (primer login por `idmask`), `mc_redemptions.date` (primera redención), cálculos de `DATEDIFF`.  
- Segmentación: filtros por segmento, tipo de login, campaña y ventana de fechas.  
- Validaciones: excluir usuarios sin redención, documentar metodología de cohortes, ajustar zona horaria y asegurar anonimización en tablas de detalle.  
- Historia de usuario: Como product manager, quiero monitorear cuánto tardan los usuarios en redimir para evaluar la efectividad de los journeys de onboarding.

### PAGINA 4. Segmentación y Engagement
Refuerza decisiones sobre metas, gamificación y valor del programa utilizando datos confirmados en el diccionario.

**CHART 16 — Progreso de metas por segmento**  
- Objetivo: comparar objetivos vs. resultados por segmento para decidir dónde acelerar o frenar incentivos.  
- Tipo: Barras apiladas objetivo vs. alcanzado para `goal_amount_1`/`amount_1` y `goal_trx_1`/`trx_1`, con indicador de porcentaje cumplido y badges de riesgo.  
- Datos: `mc_users.goal_amount_1`, `mc_users.goal_trx_1`, `mc_tracings.amount_1`, `mc_tracings.trx_1`, `mc_users.segment`, `mc_users.user_type`.  
- Segmentación: filtros por campaña, segmento, tipo de usuario y cohorte de enrolamiento.  
- Validaciones: convertir `mc_tracings.date_update` a fecha, manejar valores nulos, documentar reglas de cálculo y preservar anonimización en descargas.  
- Historia de usuario: Como líder de marketing, quiero saber qué segmentos van atrasados contra su meta para diseñar acciones de refuerzo a tiempo.

**CHART 17 — Valor transaccionado por cohorte**  
- Objetivo: evaluar la contribución de cada cohorte analizando su evolución de consumo en el tiempo.  
- Tipo: Serie de tiempo con bandas de percentiles (p50, p80) de `amount_1` y `amount_2` por cohorte mensual, acompañada de totales acumulados.  
- Datos: `mc_tracings.amount_1`, `mc_tracings.amount_2`, `mc_tracings.date_update`, `mc_users` (fecha de enrolamiento y segmento).  
- Segmentación: selector de cohorte de inscripción, campaña y segmento; filtro de tipo de usuario.  
- Validaciones: convertir `date_update` de varchar a fecha, homologar zonas horarias, documentar lógica de cohortes y excluir registros incompletos.  
- Historia de usuario: Como analista financiero, quiero entender qué cohortes sostienen el valor transaccionado para planear promociones focalizadas.

**CHART 18 — Participación en quizzes y dinámicas**  
- Objetivo: medir la interacción con dinámicas gamificadas y su efecto en el engagement general.  
- Tipo: Barras apiladas por actividad mostrando respuestas correctas, incorrectas y abandono, con línea de participación total.  
- Datos: `mc_quizzes.date`, `mc_quizzes.response_1`, `mc_quizzes.response_2`, `mc_quizzes.response_3`, `mc_quizzes.response_4`, `mc_users.segment`.  
- Segmentación: filtros por campaña, tipo de actividad, segmento y fecha de publicación.  
- Validaciones: convertir `datetime` a texto, definir taxonomía de respuestas, excluir registros de prueba y documentar tasa de participación (usuarios que ingresan vs. completan).  
- Historia de usuario: Como responsable de CX, quiero saber qué dinámicas mantienen a los usuarios activos para replicar las más exitosas y ajustar las menos efectivas.

**CHART 19 — Usuarios destacados (embajadores)**  
- Objetivo: identificar embajadores y diseñar experiencias exclusivas sin exponer datos sensibles.  
- Tipo: Tabla analítica con métricas calculadas (valor redimido acumulado, frecuencia de login, status VIP) y etiquetas de riesgo o fidelidad.  
- Datos: uniones entre `mc_tracings`, `mc_redemptions`, `mc_logins`, `mc_users`, `mc_two_step_auths`.  
- Segmentación: filtros avanzados por segmento, tipo de usuario, adopción de 2FA y valor mínimo deseado.  
- Validaciones: anonimizar parcialmente el `idmask` (enmascarar primeros caracteres), documentar criterios de VIP, limitar exportaciones a datos agregados y registrar consultante.  
- Historia de usuario: Como gerente de lealtad, quiero identificar embajadores para invitarlos a beneficios especiales y reforzar su retención.

**CHART 20 — Ticket medio por segmento**  
- Objetivo: monitorear la rentabilidad por segmento y detectar cambios sustanciales en el ticket medio.  
- Tipo: Serie de tiempo con líneas múltiples por segmento calculando `valor redimido / número de redenciones`, resaltando outliers y puntos de cambio.  
- Datos: `mc_redemptions.value`, `mc_redemptions.idmask`, `mc_users.segment`, `mc_tracings.trx_1`.  
- Segmentación: filtros por campaña, segmento y tipo de premio; opción de comparar periodos.  
- Validaciones: evitar divisiones por cero, asegurar consistencia entre fuentes, documentar ajustes de moneda y mantener sincronía con filtros globales.  
- Historia de usuario: Como directora financiera, quiero seguir el ticket medio por segmento para detectar sobreconsumo o potencial de upselling.

## Backlog priorizado
1. **PAGINA 1 – Overview Ejecutivo (Charts 1–5)**: construir KPIs, serie multi-eje y conversión semanal con consultas agregadas sobre `mc_logins`, `mc_redemptions`, `mc_tracings` y `mc_awards_logs`, incorporando definiciones de negocio y sparkline diario.  
2. **PAGINA 2 – Consumo de Bonos y Redenciones (Charts 6–10)**: habilitar funnel apilado, área por categoría, ranking comercial, control de stock prepago y heatmap horario integrando `mc_awards`, `mc_awards_logs`, `mc_redemptions`, `mc_prepurchaseds`, `mc_lealcods` y `mc_notifications_setups`.  
3. **PAGINA 3 – Login y Seguridad (Charts 11–15)**: desplegar áreas por tipo de login, detección de IPs atípicas, heatmap de 2FA, línea de bloqueos y boxplot de conversión con datos de `mc_logins`, `mc_two_step_auths`, `mc_tracings` y `mc_awards_logs`.  
4. **PAGINA 4 – Segmentación y Engagement (Charts 16–20)**: comparar metas vs. logros, analizar cohortes, medir dinámicas, listar embajadores y seguir ticket medio usando `mc_users`, `mc_tracings`, `mc_redemptions`, `mc_quizzes` y `mc_two_step_auths`.

Cada ítem debe dividirse en tareas frontend (componentes, navegación, estados vacíos) y backend (SQL agregadas, normalización de fechas, unión entre campañas). Incluir QA funcional y validar filtros globales de fecha más exclusión de `idmask` de prueba.

## Consideraciones de datos y seguridad
- Ejecutar todas las consultas a través de la Lambda `mastercard-aurora-proxy` en modo lectura; queda prohibido cualquier operación de modificación.
- Excluir los `idmask` de prueba (`A11111…A00000`) y aplicar anonimización parcial cuando se expongan listados detallados.
- Convertir cada `datetime` (`mc_logins.date`, `mc_redemptions.date`, `mc_awards_logs.date`) a texto ISO8601 y transformar `mc_tracings.date_update` de `varchar` a fecha antes de graficar.
- Documentar en el código la fuente exacta (tabla y columnas) de cada visual y el mapeo de `mc_awards_logs.log_type` a estados de negocio.
- Optimizar consultas con agregaciones diarias/semanales para mantener la ejecución debajo del timeout de 30 s y evitar cargas redundantes entre campañas.
- Consolidar resultados mediante vistas UNION por campaña, manteniendo separado el contexto de cada base para auditoría.

## Próximos pasos
1. Socializar este backlog con comercial, marketing, operaciones y seguridad para validar métricas, segmentaciones y umbrales de alerta.
2. Prototipar las consultas SQL de agregación (incluyendo uniones entre campañas) y documentar supuestos antes de desarrollar componentes.
3. Preparar historias/tickets por visual con criterios de aceptación, reglas de filtrado y catalogación de `log_type`, segmentos y aliados.
4. Diseñar wireframes de alta fidelidad para las visualizaciones complejas (series multi-eje, heatmaps, boxplots) y validarlos con usuarios clave.
5. Evaluar brechas de datos adicionales (geolocalización de IP, motivos de `block`) y planear la captura futura sin comprometer la política de solo lectura.



# Creación 
Vas a revisar el README_lambda_proxy.md para entender como se hace la validación y consultas a las bases del proyecto por medio del lambda. Nuncas vas a exceder terminos o permisos de seguridad. Y si es necesario revises el docs/data_dictionary.md que contiene las consultas necesarias. Revisa siempre lo que ya hay de front para que seamos consistentes. Vas a revisar también e l BACKLOG.md para poder entender completamente el futuro del desarrollo y lo que deberímos ir creando. Debes estudiar el front que ya esta creado para que tengamos consistencia en elementos, estilos, tamaños, etc. Todo nuevo grafico debe poder responder a los filtros que hay y al buscador que hay de id mask y de ip. Vas a crear un grafico dentro de la pagina de xxxxx que irá al final de lo que ya hoy existe. Asegurate de que se traen datos, puedes usar de referencia la campaña debitazo 5, pero debe funcionar para cualquier campaña. 

# Levantar 
Levanta el docker, asegurate de que los servicios y los containers estén absolutamente estables sin errores. Debemos asegurarnos de la estabailidad de este desarrollo por encima de nada y de que sus test todos pasan. Siempre antes de un despliegue o de reiniciar un docker se deben correr los test completos. haz un prune al docker de este repo, vuelvelo a subir, quedate escuchando varios minutos los logs para saber que todo está estable y funcionando como se debe. 

anazlia todo el repo y analiza los servicios de aws que necesitas para desplegar todo este desarrollo compelto en aws y al final me vas a entregar la url de cloudfront, asegurate de que todo quede funcionando bien con este despliegue. Si ves vas a ver que tienes suficientes acceso en aws para hacer el despliegue completo. NO tienes que crear nada nuevo, ya todo está listo. Solo necesito que te asegures de asegures de hacer un buen despliegue y que quede conectado al ci/cd
