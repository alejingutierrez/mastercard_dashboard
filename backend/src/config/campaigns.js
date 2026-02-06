const EXCLUDED_IDMASKS = [
  "A11111",
  "A22222",
  "A33333",
  "A44444",
  "A55555",
  "A66666",
  "A77777",
  "A88888",
  "A99999",
  "A00000",
];

const EXCLUDED_IDMASKS_SQL = `(${EXCLUDED_IDMASKS.map((id) => `'${id}'`).join(", ")})`;

const COMMON_METRICS = [
  {
    key: "totalUsers",
    label: "Usuarios totales",
    sql: `SELECT COUNT(*) AS value
          FROM {db}.mc_users
          WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL};`,
    baseTable: "mc_users",
  },
  {
    key: "totalLogins",
    label: "Logins totales",
    sql: `SELECT COUNT(*) AS value
          FROM {db}.mc_logins
          WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL};`,
    dateColumn: "{db}.mc_logins.date",
    baseTable: "mc_logins",
  },
  {
    key: "usersWithLogin",
    label: "Usuarios con login",
    sql: `SELECT COUNT(DISTINCT idmask) AS value
          FROM {db}.mc_logins
          WHERE idmask NOT IN ${EXCLUDED_IDMASKS_SQL};`,
    dateColumn: "{db}.mc_logins.date",
    baseTable: "mc_logins",
  },
  {
    key: "totalWinners",
    label: "Ganadores totales",
    sql: `SELECT COUNT(DISTINCT idmask) AS value
          FROM {db}.mc_redemptions
          WHERE idmask IS NOT NULL
            AND TRIM(idmask) <> ''
            AND idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
            AND id_award IS NOT NULL
            AND id_award <> 0
            AND value IS NOT NULL
            AND value > 0
            AND date IS NOT NULL
            AND date <> '0000-00-00 00:00:00';`,
    dateColumn: "{db}.mc_redemptions.date",
    baseTable: "mc_redemptions",
  },
  {
    key: "redemptionAttempts",
    label: "Intentos de redención",
    sql: `SELECT COUNT(*) AS value
          FROM {db}.mc_redemptions
          WHERE (idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL})
            AND date IS NOT NULL
            AND date <> '0000-00-00 00:00:00';`,
    dateColumn: "{db}.mc_redemptions.date",
    baseTable: "mc_redemptions",
  },
  {
    key: "totalRedemptions",
    label: "Redenciones válidas",
    sql: `SELECT COUNT(*) AS value
          FROM {db}.mc_redemptions
          WHERE idmask IS NOT NULL
            AND TRIM(idmask) <> ''
            AND idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
            AND id_award IS NOT NULL
            AND id_award <> 0
            AND value IS NOT NULL
            AND value > 0
            AND date IS NOT NULL
            AND date <> '0000-00-00 00:00:00';`,
    dateColumn: "{db}.mc_redemptions.date",
    baseTable: "mc_redemptions",
  },
  {
    key: "totalRedeemedValue",
    label: "Valor acumulado en redenciones",
    sql: `SELECT COALESCE(SUM(value), 0) AS value
          FROM {db}.mc_redemptions
          WHERE idmask IS NOT NULL
            AND TRIM(idmask) <> ''
            AND idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
            AND id_award IS NOT NULL
            AND id_award <> 0
            AND value IS NOT NULL
            AND value > 0
            AND date IS NOT NULL
            AND date <> '0000-00-00 00:00:00';`,
    dateColumn: "{db}.mc_redemptions.date",
    baseTable: "mc_redemptions",
  },
];

const COMMON_CHARTS = [
  {
    key: "segmentRedemptionBreakdown",
    title: "Redenciones y valor por segmento",
    baseTable: "mc_redemptions",
    sql: `SELECT
            CASE
              WHEN TRIM(COALESCE(u.segment, '')) = '' THEN 'Sin segmento'
              ELSE TRIM(u.segment)
            END AS segment_label,
            COUNT(DISTINCT r.idmask) AS unique_redeemers,
            COUNT(*) AS total_redemptions,
            COALESCE(SUM(r.value), 0) AS redeemed_value,
            ROUND(
              COALESCE(SUM(r.value), 0) / NULLIF(COUNT(DISTINCT r.idmask), 0),
              2
            ) AS average_ticket
          FROM {db}.mc_redemptions r
          LEFT JOIN {db}.mc_users u ON u.idmask = r.idmask
          WHERE r.idmask IS NOT NULL
            AND TRIM(r.idmask) <> ''
            AND r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
            AND r.id_award IS NOT NULL
            AND r.id_award <> 0
            AND r.value IS NOT NULL
            AND r.value > 0
            AND r.date IS NOT NULL
            AND r.date <> '0000-00-00 00:00:00'
          GROUP BY segment_label
          ORDER BY redeemed_value DESC, total_redemptions DESC
          LIMIT 10;`,
  },
];

const CAMPAIGNS = [
  {
    id: "debitazo-5",
    name: "Debitazo 5",
    database: "dentsu_mastercard_debitazo_5",
    description:
      "Campaña Mastercard Debitazo 5. Indicadores de usuarios, logins y redenciones.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, user_type, goal_amount_1, goal_trx_1, award_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "bogota-uso-10",
    name: "Bogotá Uso 10",
    database: "dentsu_mastercard_bogota_uso_10",
    description:
      "Campaña de fidelización Bogotá Uso 10. Consultas basadas en las tablas mc_users, mc_logins y mc_redemptions.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, user_type, goal_amount_1, goal_trx_1, award_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "debitazo-6",
    name: "Debitazo 6",
    database: "dentsu_mastercard_debitazo_6",
    description:
      "Campaña Mastercard Debitazo 6. Indicadores de usuarios, logins y redenciones.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, nickname, goal_amount_1, goal_trx_1, award_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "davivienda-afluentes-3",
    name: "Davivienda Afluentes 3",
    database: "dentsu_mastercard_davivienda_afluentes_3",
    description:
      "Campaña Davivienda Afluentes. Indicadores agregados de usuarios, logins y redenciones.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, goal_amount_1, goal_trx_1, award_1, show_davipuntos
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "pacifico-sag-5",
    name: "Pacífico SAG 5",
    database: "dentsu_mastercard_pacifico_sag_5",
    description:
      "Campaña Pacífico SAG 5. Indicadores de adopción, logins y redenciones.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, user_type, goal_amount_1, award_1, challenge_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "pichincha",
    name: "Pichincha",
    database: "dentsu_mastercard_pichincha",
    description:
      "Campaña Banco Pichincha. Indicadores generales de usuarios, logins y redenciones.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, user_type, goal_amount_1, award_1, challenge_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "guayaquil-5step",
    name: "Guayaquil 5 Step",
    database: "dentsu_mastercard_guayaquil_5s_3",
    description:
      "Campaña Banco de Guayaquil 5 Step. Indicadores generales de usuarios, logins y redenciones.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, user_type, goal_amount_1, goal_trx_1, award_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "tuya-ola-5",
    name: "Tuya Ola 5",
    database: "dentsu_mastercard_tuya_ola_5",
    description:
      "Campaña Tuya Ola 5. Incluye indicadores generales de usuarios, logins y redenciones.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, user_type, goal_amount_1, goal_trx_1, award_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "pacifico-5s-4",
    name: "Pacífico 5S 4",
    database: "dentsu_mastercard_pacifico_5s_4",
    description:
      "Campaña Pacífico 5S 4. Sigue las mismas métricas agregadas del resto del dashboard.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, user_type, goal_amount_1, award_1, challenge_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
  {
    id: "avvillas-combo-playero",
    name: "AV Villas Combo Playero",
    database: "dentsu_mastercard_avvillas_combo_playero",
    description:
      "Campaña AV Villas Combo Playero. Panel con KPIs de usuarios, logins y redenciones.",
    metrics: [...COMMON_METRICS],
    charts: [...COMMON_CHARTS],
    sampleSql: `SELECT idmask, segment, user_type, goal_amount_1, goal_trx_1, award_1
                FROM {db}.mc_users
                WHERE idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                LIMIT 50;`,
  },
];

const getCampaignById = (id) => CAMPAIGNS.find((campaign) => campaign.id === id);

module.exports = {
  CAMPAIGNS,
  getCampaignById,
  EXCLUDED_IDMASKS,
  EXCLUDED_IDMASKS_SQL,
};
