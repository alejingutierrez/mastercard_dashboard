const express = require("express");
const {
  CAMPAIGNS,
  getCampaignById,
  EXCLUDED_IDMASKS_SQL,
} = require("../config/campaigns");
const { runQuery } = require("../services/queryService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const PERFORMANCE_WEIGHTS = Object.freeze({
  login: 0.35,
  redeemers: 0.25,
  value: 0.4,
});

const MONTH_START_FORMAT = "%Y-%m-01";
const WEEK_DATE_FORMAT = "%Y-%m-%d";
const TOP_MERCHANT_PIE_LIMIT = 10;
const HEATMAP_TOP_MERCHANTS = 6;
const HEATMAP_TOP_AMOUNTS = 6;
const MERCHANT_NAME_EXPRESSION =
  "COALESCE(NULLIF(TRIM(a.name), ''), CONCAT('Premio ', COALESCE(CAST(r.id_award AS CHAR), 'sin_id')))";
const MAX_TWO_FACTOR_WEEKS = 12;
const DEFAULT_TWO_FACTOR_TARGET = 0.7;

router.use(requireAuth);

router.use((req, res, next) => {
  // Los admin siempre ven todas las campañas, sin importar su allowedCampaignIds
  // en S3 — así no hay que tocar S3 cada vez que se agregue una nueva campaña.
  const isAdmin = req.user?.role === "admin";

  const rawAllowed = isAdmin
    ? CAMPAIGNS.map(({ id }) => id)
    : Array.isArray(req.user?.allowedCampaignIds) &&
      req.user.allowedCampaignIds.length > 0
      ? req.user.allowedCampaignIds
      : CAMPAIGNS.map(({ id }) => id);

  const allowedSet = new Set(rawAllowed);
  const allowedCampaigns = CAMPAIGNS.filter(({ id }) => allowedSet.has(id));

  if (allowedCampaigns.length === 0) {
    return res
      .status(403)
      .json({ error: "No tienes campañas habilitadas para consultar." });
  }

  req.allowedCampaigns = allowedCampaigns;
  req.allowedCampaignIdsSet = new Set(allowedCampaigns.map(({ id }) => id));
  next();
});

router.get("/", (req, res) => {
  const liteCampaigns = req.allowedCampaigns.map(({ id, name, description, bank, userTypeColumn, firstLoginsPivotColumn, features, baselineUsers, enrollmentGoals, pendingDb }) => ({
    id,
    name,
    description,
    bank: bank ?? null,
    userTypeColumn: userTypeColumn ?? null,
    firstLoginsPivotColumn: firstLoginsPivotColumn ?? null,
    features: features ?? {},
    baselineUsers: baselineUsers ?? null,
    enrollmentGoals: enrollmentGoals ?? null,
    pendingDb: Boolean(pendingDb),
  }));

  res.json(liteCampaigns);
});

// Diagnóstico: muestra todas las filas de mc_settings por campaña (key + value)
router.get("/admin/settings-check", async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Solo administradores pueden usar este endpoint." });
  }

  const results = await Promise.all(
    CAMPAIGNS.map(async ({ id, name, database }) => {
      try {
        const result = await runQuery(
          database,
          `SELECT \`key\`, value FROM {db}.mc_settings ORDER BY \`key\` ASC LIMIT 50;`,
          []
        );
        const rows = result.rows || [];
        return {
          id,
          name,
          database,
          hasSettings: rows.length > 0,
          rows: rows.map((r) => ({ key: r.key, value: r.value })),
        };
      } catch (err) {
        const msg = err?.message || "";
        const tableNotFound =
          /Table.*doesn't exist/i.test(msg) ||
          /1146/.test(msg);
        return {
          id,
          name,
          database,
          hasSettings: false,
          rows: [],
          error: tableNotFound ? "Tabla mc_settings no existe" : msg,
        };
      }
    })
  );

  const withSettings = results.filter((r) => r.hasSettings);
  const withoutSettings = results.filter((r) => !r.hasSettings);

  res.json({
    summary: {
      total: results.length,
      withSettings: withSettings.length,
      withoutSettings: withoutSettings.length,
    },
    campaigns: results,
  });
});

const normalizeSelectorValue = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") {
    return null;
  }

  return trimmed;
};

// Detecta el error característico de MySQL cuando la DB de la campaña no existe.
// Útil para campañas pre-aprovisionadas en el repo cuya DB aún no fue creada
// (ver `pendingDb: true` en campaigns.js — p.ej. AV Villas Lista Para Ganar).
const isDbNotReadyError = (error) => {
  if (!error || typeof error.message !== "string") return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("unknown database") ||
    msg.includes("no database selected") ||
    msg.includes("database does not exist") ||
    msg.includes("er_bad_db_error")
  );
};

// Helper para route handlers: si el error es "DB no existe", responde 200
// con `pending: true` + un esqueleto compatible con el frontend.
// Si es cualquier otro error, responde 500 normal.
const respondPendingOr500 = (res, error, emptyShape, errorMessage) => {
  if (isDbNotReadyError(error)) {
    return res.status(200).json({ ...emptyShape, pending: true });
  }
  return res.status(500).json({ error: errorMessage, detail: error.message });
};

// Acepta string, array de strings o query repetida (?segment=A&segment=B).
// Devuelve array de valores limpios o null si está vacío.
const normalizeMultiSelectorValue = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  const arr = Array.isArray(value) ? value : [value];
  const cleaned = arr
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v && v.toLowerCase() !== "all");
  return cleaned.length > 0 ? cleaned : null;
};

// Construye fragmento SQL `AND <col> IN ('a','b',...)` con escape básico.
// `segment` puede ser string o string[]; si null/empty devuelve "".
const buildSegmentInClause = (segment, columnExpr) => {
  if (!segment) return "";
  const list = Array.isArray(segment) ? segment : [segment];
  if (list.length === 0) return "";
  const escape = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const values = list.map((s) => `'${escape(s)}'`).join(", ");
  return `AND ${columnExpr} IN (${values})`;
};

const parseCampaignSelection = (rawValue, allowedCampaigns) => {
  const pool = allowedCampaigns && allowedCampaigns.length > 0 ? allowedCampaigns : CAMPAIGNS;
  if (
    rawValue === undefined ||
    rawValue === null ||
    rawValue === "" ||
    rawValue === "all"
  ) {
    return pool;
  }

  const values = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue)
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

  if (values.length === 0) {
    return pool;
  }

  const selection = new Set(values);
  return pool.filter(({ id }) => selection.has(id));
};

const appendDateFilter = (sql, dateColumn, from, to) => {
  if (!dateColumn || !from || !to) {
    return { sql, params: [] };
  }

  const trimmedSql = sql.trim().replace(/;$/, "");
  const placeholderClause = `${dateColumn} BETWEEN %s AND %s`;
  const hasWhereClause = /\bwhere\b/i.test(trimmedSql);
  const conjunction = hasWhereClause ? "AND" : "WHERE";

  return {
    sql: `${trimmedSql} ${conjunction} ${placeholderClause}`,
    params: [from, to],
  };
};

const inferBaseTable = (sql) => {
  const match = sql.match(/\{db\}\.(\w+)/i);
  return match ? match[1] : null;
};

const detectTableAlias = (sql, tableName) => {
  if (!tableName) {
    return null;
  }
  const pattern = new RegExp(`\\{db\\}\\.${tableName}\\s+(?:AS\\s+)?([a-zA-Z_]\\w*)`, "i");
  const match = pattern.exec(sql);
  if (!match) {
    return null;
  }
  const candidate = match[1];
  const reserved = new Set([
    "WHERE",
    "JOIN",
    "ON",
    "GROUP",
    "ORDER",
    "LEFT",
    "RIGHT",
    "INNER",
    "OUTER",
    "FULL",
    "LIMIT",
    "UNION",
    "AND",
    "OR",
    "HAVING",
  ]);
  if (reserved.has(candidate.toUpperCase())) {
    return null;
  }
  return candidate;
};

const extractQueryTail = (sql) => {
  let core = sql;
  const tailParts = [];

  const limitMatch = core.match(/\bLIMIT\b[\s\S]*$/i);
  if (limitMatch) {
    tailParts.unshift(limitMatch[0]);
    core = core.slice(0, limitMatch.index).trim();
  }

  const orderByMatch = core.match(/\bORDER\s+BY\b[\s\S]*$/i);
  if (orderByMatch) {
    tailParts.unshift(orderByMatch[0]);
    core = core.slice(0, orderByMatch.index).trim();
  }

  return {
    core: core.trim(),
    tail: tailParts.join(" "),
  };
};

const CLAUSE_BOUNDARY_PATTERN =
  /\b(GROUP\s+BY|HAVING|WINDOW|QUALIFY|ORDER\s+BY|LIMIT|OFFSET|FETCH|FOR\s+UPDATE|LOCK|UNION|EXCEPT|INTERSECT)\b/i;

const findClauseBoundaryIndex = (statement, startIndex = 0) => {
  const segment = statement.slice(startIndex);
  const match = CLAUSE_BOUNDARY_PATTERN.exec(segment);
  if (!match) {
    return -1;
  }
  return startIndex + match.index;
};

const appendWithSpacing = (left, right) => {
  if (!right) {
    return left;
  }
  if (!left) {
    return right;
  }
  if (/\s$/.test(left) || /^\s/.test(right)) {
    return `${left}${right}`;
  }
  return `${left} ${right}`;
};

const buildLoginFilterSubquery = ({ filters, range, includeLoginType, includeUserIp }) => {
  const conditions = [];
  const params = [];

  if (includeLoginType && filters.loginType) {
    conditions.push("type = %s");
    params.push(filters.loginType);
  }

  if (includeUserIp && filters.userIp) {
    conditions.push("ip = %s");
    params.push(filters.userIp);
  }

  if (conditions.length === 0) {
    return null;
  }

  if (range) {
    conditions.push("date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return {
    sql: `SELECT DISTINCT idmask FROM {db}.mc_logins ${whereClause}`,
    params,
  };
};

const applyFiltersToSql = ({
  sql,
  params = [],
  database,
  baseTable,
  filters = {},
  range,
}) => {
  const { loginType, userId, userIp, segment, userType, userTypeColumn } = filters;
  const utCol = (typeof userTypeColumn === "string" && userTypeColumn.length > 0 && userTypeColumn !== "undefined" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn))
    ? userTypeColumn
    : "user_type";
  if (!loginType && !userId && !userIp && !segment && !userType) {
    return { sql, params };
  }

  const trimmedSql = sql.trim();
  const baseTableName = baseTable || inferBaseTable(trimmedSql);
  const capabilities = {
    mc_logins: { hasIdmask: true, hasIp: true, hasType: true },
    mc_redemptions: { hasIdmask: true, hasIp: true, hasType: false },
    mc_users: { hasIdmask: true, hasIp: false, hasType: false },
    mc_awards_logs: { hasIdmask: true, hasIp: false, hasType: false },
  };
  const tableCapabilities = baseTableName ? capabilities[baseTableName] || {} : {};

  const alias = detectTableAlias(trimmedSql, baseTableName);
  const columnRef = (column) => {
    if (!baseTableName) {
      return column;
    }
    return alias ? `${alias}.${column}` : column;
  };

  const additionalConditions = [];
  const nextParams = [...params];

  if (userId && tableCapabilities.hasIdmask) {
    additionalConditions.push(`${columnRef("idmask")} = %s`);
    nextParams.push(userId);
  }

  if (userIp && tableCapabilities.hasIp) {
    additionalConditions.push(`${columnRef("ip")} = %s`);
    nextParams.push(userIp);
  }

  if (loginType && tableCapabilities.hasType) {
    additionalConditions.push(`${columnRef("type")} = %s`);
    nextParams.push(loginType);
  }

  // segment filter: scalar o array (multi-select). Subquery a mc_users si el baseTable no es mc_users.
  if (segment && tableCapabilities.hasIdmask) {
    const segments = Array.isArray(segment) ? segment : [segment];
    if (segments.length > 0) {
      const placeholders = segments.map(() => "%s").join(", ");
      if (baseTableName === "mc_users") {
        additionalConditions.push(`TRIM(${columnRef("segment")}) IN (${placeholders})`);
      } else {
        additionalConditions.push(
          `${columnRef("idmask")} IN (SELECT idmask FROM {db}.mc_users WHERE TRIM(segment) IN (${placeholders}))`
        );
      }
      nextParams.push(...segments);
    }
  }

  // userType filter: subquery into mc_users (column name comes from campaign.userTypeColumn)
  if (userType && tableCapabilities.hasIdmask) {
    if (baseTableName === "mc_users") {
      additionalConditions.push(`${columnRef(utCol)} = %s`);
      nextParams.push(userType);
    } else {
      additionalConditions.push(
        `${columnRef("idmask")} IN (SELECT idmask FROM {db}.mc_users WHERE ${utCol} = %s)`
      );
      nextParams.push(userType);
    }
  }

  const needsLoginTypeSubquery =
    loginType && (!tableCapabilities.hasType || baseTableName !== "mc_logins");
  const needsUserIpSubquery = userIp && !tableCapabilities.hasIp;

  if (tableCapabilities.hasIdmask && (needsLoginTypeSubquery || needsUserIpSubquery)) {
    const loginFilterSubquery = buildLoginFilterSubquery({
      filters,
      range,
      includeLoginType: needsLoginTypeSubquery,
      includeUserIp: needsUserIpSubquery,
    });

    if (loginFilterSubquery) {
      additionalConditions.push(
        `${columnRef("idmask")} IN (${loginFilterSubquery.sql})`
      );
      nextParams.push(...loginFilterSubquery.params);
    }
  }

  if (additionalConditions.length === 0) {
    return { sql, params };
  }

  const sanitizedSql = trimmedSql.endsWith(";")
    ? trimmedSql.slice(0, -1)
    : trimmedSql;

  const { core, tail } = extractQueryTail(sanitizedSql);
  const conditionsClause = additionalConditions.join(" AND ");
  const whereMatch = /\bWHERE\b/i.exec(core);
  let nextSql;

  if (whereMatch) {
    const whereStart = whereMatch.index;
    const whereBodyStart = whereStart + whereMatch[0].length;
    const clauseBoundaryIndex = findClauseBoundaryIndex(core, whereBodyStart);
    const beforeWhere = core.slice(0, whereBodyStart);
    const rawWhereBody = core.slice(
      whereBodyStart,
      clauseBoundaryIndex === -1 ? core.length : clauseBoundaryIndex
    );
    const afterWhere = clauseBoundaryIndex === -1 ? "" : core.slice(clauseBoundaryIndex);
    const trimmedWhereBody = rawWhereBody.trim();
    const augmentedWhere = trimmedWhereBody
      ? ` (${trimmedWhereBody}) AND ${conditionsClause}`
      : ` ${conditionsClause}`;
    const prefix = `${beforeWhere}${augmentedWhere}`;
    nextSql = appendWithSpacing(prefix, afterWhere);
  } else {
    const boundaryIndex = findClauseBoundaryIndex(core, 0);
    if (boundaryIndex === -1) {
      nextSql = `${core}\nWHERE ${conditionsClause}`;
    } else {
      const beforeBoundary = core.slice(0, boundaryIndex);
      const afterBoundary = core.slice(boundaryIndex);
      const withWhere = `${beforeBoundary}\nWHERE ${conditionsClause}`;
      nextSql = appendWithSpacing(withWhere, afterBoundary);
    }
  }

  const finalSql = `${nextSql}${tail ? ` ${tail}` : ""};`;

  return {
    sql: finalSql,
    params: nextParams,
  };
};

const buildMonthlyLoginSummaryQuery = ({
  range,
  loginType,
  userId,
  userIp,
  segment,
  userType,
  userTypeColumn = "user_type",
}) => {
  const params = [MONTH_START_FORMAT];
  const conditions = [
    `(l.idmask IS NULL OR l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
    "l.date IS NOT NULL",
  ];

  if (range) {
    conditions.push("l.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  if (loginType) {
    conditions.push("l.type = %s");
    params.push(loginType);
  }

  if (userId) {
    conditions.push("l.idmask = %s");
    params.push(userId);
  }

  if (userIp) {
    conditions.push("l.ip = %s");
    params.push(userIp);
  }

  if (segment) {
    conditions.push("u.segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`u.${utCol} = %s`);
    params.push(userType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      DATE_FORMAT(l.date, %s) AS month,
      COUNT(*) AS total_logins,
      COUNT(DISTINCT l.idmask) AS unique_login_users
    FROM {db}.mc_logins l
    LEFT JOIN {db}.mc_users u ON u.idmask = l.idmask
    ${whereClause}
    GROUP BY month
    ORDER BY month;
  `;

  return { sql, params };
};

const buildMonthlyRedemptionSummaryQuery = ({
  range,
  loginType,
  userId,
  userIp,
  segment,
  userType,
  userTypeColumn = "user_type",
}) => {
  const params = [MONTH_START_FORMAT];
  const conditions = [
    "r.idmask IS NOT NULL",
    "TRIM(r.idmask) <> ''",
    `r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "r.block IN (1, 2)",
    "r.id_award IS NOT NULL",
    "r.id_award <> 0",
    "r.value IS NOT NULL",
    "r.value > 0",
    "r.date IS NOT NULL",
    "r.date <> '0000-00-00 00:00:00'",
  ];

  if (range) {
    conditions.push("r.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  if (userId) {
    conditions.push("r.idmask = %s");
    params.push(userId);
  }

  if (userIp) {
    conditions.push("r.ip = %s");
    params.push(userIp);
  }

  if (segment) {
    conditions.push("u.segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`u.${utCol} = %s`);
    params.push(userType);
  }

  if (loginType) {
    const loginFilter = buildLoginFilterSubquery({
      filters: { loginType },
      range,
      includeLoginType: true,
      includeUserIp: false,
    });
    if (loginFilter) {
      conditions.push(`r.idmask IN (${loginFilter.sql})`);
      params.push(...loginFilter.params);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      DATE_FORMAT(r.date, %s) AS month,
      COUNT(*) AS total_redemptions,
      COUNT(DISTINCT r.idmask) AS total_redeemers,
      COALESCE(SUM(r.value), 0) AS total_value
    FROM {db}.mc_redemptions r
    LEFT JOIN {db}.mc_users u ON u.idmask = r.idmask
    ${whereClause}
    GROUP BY month
    ORDER BY month;
  `;

  return { sql, params };
};

const buildMonthlyTracingSummaryQuery = ({
  range,
  loginType,
  userId,
  userIp,
  segment,
  userType,
  userTypeColumn = "user_type",
}) => {
  const params = [MONTH_START_FORMAT];
  const dateExpression = "STR_TO_DATE(t.date_update, '%d-%m-%Y')";
  const conditions = [
    `(t.idmask IS NULL OR t.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
    "t.date_update IS NOT NULL",
    "t.date_update <> ''",
    `${dateExpression} IS NOT NULL`,
  ];

  if (range) {
    conditions.push(`${dateExpression} BETWEEN %s AND %s`);
    params.push(range.from, range.to);
  }

  if (userId) {
    conditions.push("t.idmask = %s");
    params.push(userId);
  }

  if (segment) {
    conditions.push("u.segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`u.${utCol} = %s`);
    params.push(userType);
  }

  const loginFilter = buildLoginFilterSubquery({
    filters: { loginType, userIp },
    range,
    includeLoginType: Boolean(loginType),
    includeUserIp: Boolean(userIp),
  });
  if (loginFilter) {
    conditions.push(`t.idmask IN (${loginFilter.sql})`);
    params.push(...loginFilter.params);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      DATE_FORMAT(${dateExpression}, %s) AS month,
      COALESCE(SUM(t.amount_1), 0) AS total_amount,
      COALESCE(SUM(t.trx_1), 0) AS total_trx,
      COALESCE(SUM(t.winner_1), 0) AS total_winners
    FROM {db}.mc_tracings t
    LEFT JOIN {db}.mc_users u ON u.idmask = t.idmask
    ${whereClause}
    GROUP BY month
    ORDER BY month;
  `;

  return { sql, params };
};

const buildGoalSummaryQuery = ({
  range,
  loginType,
  userId,
  userIp,
  segment,
  userType,
  userTypeColumn = "user_type",
}) => {
  const conditions = [
    `(idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
  ];
  const params = [];

  if (segment) {
    conditions.push("segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`${utCol} = %s`);
    params.push(userType);
  }

  if (userId) {
    conditions.push("idmask = %s");
    params.push(userId);
  }

  const loginFilter = buildLoginFilterSubquery({
    filters: { loginType, userIp },
    range,
    includeLoginType: Boolean(loginType),
    includeUserIp: Boolean(userIp),
  });
  if (loginFilter) {
    conditions.push(`idmask IN (${loginFilter.sql})`);
    params.push(...loginFilter.params);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      COUNT(DISTINCT idmask) AS total_users,
      COALESCE(SUM(goal_amount_1), 0) AS total_goal_amount,
      COALESCE(SUM(goal_trx_1), 0) AS total_goal_trx
    FROM {db}.mc_users
    ${whereClause};
  `;

  return { sql, params };
};

const buildGoalBreakdownQuery = ({
  range,
  loginType,
  userId,
  userIp,
  segment,
  userType,
  userTypeColumn = "user_type",
}) => {
  const conditions = [
    `(idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
  ];
  const params = [];

  if (segment) {
    conditions.push("segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`${utCol} = %s`);
    params.push(userType);
  }

  if (userId) {
    conditions.push("idmask = %s");
    params.push(userId);
  }

  const loginFilter = buildLoginFilterSubquery({
    filters: { loginType, userIp },
    range,
    includeLoginType: Boolean(loginType),
    includeUserIp: Boolean(userIp),
  });
  if (loginFilter) {
    conditions.push(`idmask IN (${loginFilter.sql})`);
    params.push(...loginFilter.params);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      COALESCE(CAST(award_1 AS CHAR), 'sin_award') AS award_key,
      COALESCE(SUM(goal_amount_1), 0) AS total_goal_amount
    FROM {db}.mc_users
    ${whereClause}
    GROUP BY award_key
    ORDER BY award_key;
  `;

  return { sql, params };
};

const buildRedemptionAmountDistributionQuery = ({ range }) => {
  const conditions = [
    "r.idmask IS NOT NULL",
    "TRIM(r.idmask) <> ''",
    `r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "r.id_award IS NOT NULL",
    "r.id_award <> 0",
    "r.value IS NOT NULL",
    "r.value > 0",
    "r.date IS NOT NULL",
    "r.date <> '0000-00-00 00:00:00'",
  ];
  const params = [];

  if (range) {
    conditions.push("r.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      r.value AS amount,
      COUNT(*) AS total_redemptions,
      COUNT(DISTINCT r.idmask) AS unique_users,
      COALESCE(SUM(r.value), 0) AS total_value
    FROM {db}.mc_redemptions r
    ${whereClause}
    GROUP BY amount
    ORDER BY amount ASC;
  `;

  return { sql, params };
};

const buildMerchantTotalsQuery = ({ range }) => {
  const conditions = [
    "r.idmask IS NOT NULL",
    "TRIM(r.idmask) <> ''",
    `r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "r.id_award IS NOT NULL",
    "r.id_award <> 0",
    "r.value IS NOT NULL",
    "r.value > 0",
    "r.date IS NOT NULL",
    "r.date <> '0000-00-00 00:00:00'",
  ];
  const params = [];

  if (range) {
    conditions.push("r.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      ${MERCHANT_NAME_EXPRESSION} AS merchant_name,
      COUNT(*) AS total_redemptions,
      COUNT(DISTINCT r.idmask) AS unique_users,
      COALESCE(SUM(r.value), 0) AS total_value
    FROM {db}.mc_redemptions r
    LEFT JOIN {db}.mc_awards a ON a.id = r.id_award
    ${whereClause}
    GROUP BY merchant_name
    ORDER BY total_redemptions DESC;
  `;

  return { sql, params };
};

const buildMerchantAmountMatrixQuery = ({ range }) => {
  const conditions = [
    "r.idmask IS NOT NULL",
    "TRIM(r.idmask) <> ''",
    `r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "r.id_award IS NOT NULL",
    "r.id_award <> 0",
    "r.value IS NOT NULL",
    "r.value > 0",
    "r.date IS NOT NULL",
    "r.date <> '0000-00-00 00:00:00'",
  ];
  const params = [];

  if (range) {
    conditions.push("r.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      ${MERCHANT_NAME_EXPRESSION} AS merchant_name,
      r.value AS amount,
      COUNT(*) AS total_redemptions,
      COALESCE(SUM(r.value), 0) AS total_value
    FROM {db}.mc_redemptions r
    LEFT JOIN {db}.mc_awards a ON a.id = r.id_award
    ${whereClause}
    GROUP BY merchant_name, amount
    ORDER BY merchant_name ASC, amount ASC;
  `;

  return { sql, params };
};

const parseDateRange = (query) => {
  const { from, to } = query;
  if (!from || !to) {
    return null;
  }

  const isValid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isValid(from) || !isValid(to)) {
    return null;
  }

  return {
    from: `${from} 00:00:00`,
    to: `${to} 23:59:59`,
  };
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const clampRatio = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  return value > 1 ? 1 : value;
};

const parseDateTime = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const diffInDays = (start, end) => {
  if (!start || !end) {
    return null;
  }
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(end.getTime() - start.getTime()) / millisecondsPerDay;
};

const sanitizeIdentifier = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error("Invalid identifier");
  }
  return value;
};

const columnSupportCache = new Map();

const hasColumn = async (database, tableName, columnName) => {
  const cacheKey = `${database}.${tableName}.${columnName}`;
  if (columnSupportCache.has(cacheKey)) {
    return columnSupportCache.get(cacheKey);
  }

  try {
    const safeTable = sanitizeIdentifier(tableName);
    const safeColumn = sanitizeIdentifier(columnName);
    const sql = `SHOW COLUMNS FROM {db}.${safeTable} LIKE '${safeColumn}';`;
    const result = await runQuery(database, sql, []);
    const exists = (result.rowCount ?? 0) > 0;
    columnSupportCache.set(cacheKey, exists);
    return exists;
  } catch (error) {
    console.error("[column-check] Error", { database, tableName, columnName, error });
    columnSupportCache.set(cacheKey, false);
    return false;
  }
};

const buildLoginsByIpQuery = ({ range }) => {
  const conditions = [
    `(l.idmask IS NULL OR l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
  ];
  const params = [];

  if (range) {
    conditions.push("l.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(l.ip), ''), 'Sin IP') AS ip_label,
      COUNT(*) AS total_logins,
      COUNT(DISTINCT l.idmask) AS unique_users,
      COUNT(
        DISTINCT CASE
          WHEN l.date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            THEN SUBSTRING(l.date, 1, 10)
          ELSE NULL
        END
      ) AS active_days,
      MIN(NULLIF(l.date, '0000-00-00 00:00:00')) AS first_login_at,
      MAX(NULLIF(l.date, '0000-00-00 00:00:00')) AS last_login_at
    FROM {db}.mc_logins l
    ${whereClause}
    GROUP BY ip_label
    ORDER BY total_logins DESC
    LIMIT 100;
  `;

  return { sql, params };
};

// The "top logins by IP" query is intentionally limited for performance. For the security view
// we still need correct login counts for IPs that appear in the top redemption-attempts list,
// even if they are not in the top-N login IPs. This helper fetches login aggregates for a
// specific list of IPs.
const buildLoginsBySelectedIpsQuery = ({ range, ips }) => {
  const safeIps = Array.isArray(ips)
    ? ips
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0 && value !== "Sin IP")
    : [];

  if (safeIps.length === 0) {
    return null;
  }

  const conditions = [
    `(l.idmask IS NULL OR l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
    `TRIM(l.ip) IN (${safeIps.map(() => "%s").join(", ")})`,
  ];
  const params = [...safeIps];

  if (range) {
    conditions.push("l.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(l.ip), ''), 'Sin IP') AS ip_label,
      COUNT(*) AS total_logins,
      COUNT(DISTINCT l.idmask) AS unique_users,
      COUNT(
        DISTINCT CASE
          WHEN l.date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            THEN SUBSTRING(l.date, 1, 10)
          ELSE NULL
        END
      ) AS active_days,
      MIN(NULLIF(l.date, '0000-00-00 00:00:00')) AS first_login_at,
      MAX(NULLIF(l.date, '0000-00-00 00:00:00')) AS last_login_at
    FROM {db}.mc_logins l
    ${whereClause}
    GROUP BY ip_label;
  `;

  return { sql, params };
};

const buildRedemptionsByIpQuery = ({ range }) => {
  const conditions = [
    `(r.idmask IS NULL OR r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
    "r.date IS NOT NULL",
    "r.date <> '0000-00-00 00:00:00'",
  ];
  const params = [];

  const validRedemptionCondition = [
    "r.idmask IS NOT NULL",
    "TRIM(r.idmask) <> ''",
    `r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "r.id_award IS NOT NULL",
    "r.id_award <> 0",
    "r.value IS NOT NULL",
    "r.value > 0",
  ].join(" AND ");

  if (range) {
    conditions.push("r.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(r.ip), ''), 'Sin IP') AS ip_label,
      COUNT(*) AS total_redemptions,
      COUNT(DISTINCT NULLIF(TRIM(r.idmask), '')) AS unique_redeemers,
      SUM(CASE WHEN ${validRedemptionCondition} THEN 1 ELSE 0 END) AS valid_redemptions,
      COUNT(DISTINCT CASE WHEN ${validRedemptionCondition} THEN r.idmask ELSE NULL END) AS valid_unique_redeemers,
      SUM(CASE WHEN r.idmask IS NULL OR TRIM(r.idmask) = '' THEN 1 ELSE 0 END) AS missing_idmask,
      MIN(NULLIF(r.date, '0000-00-00 00:00:00')) AS first_redemption_at,
      MAX(NULLIF(r.date, '0000-00-00 00:00:00')) AS last_redemption_at,
      COALESCE(SUM(CASE WHEN ${validRedemptionCondition} THEN r.value ELSE 0 END), 0) AS redeemed_value
    FROM {db}.mc_redemptions r
    ${whereClause}
    GROUP BY ip_label
    ORDER BY total_redemptions DESC
    LIMIT 100;
  `;

  return { sql, params };
};

const buildLoginsByIpAndIdmaskQuery = ({ range }) => {
  const conditions = [
    "l.idmask IS NOT NULL",
    `l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
  ];
  const params = [];

  if (range) {
    conditions.push("l.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const sql = `
    SELECT
      l.ip AS ip,
      l.idmask AS idmask,
      COUNT(*) AS login_count,
      COUNT(
        DISTINCT CASE
          WHEN l.date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            THEN SUBSTRING(l.date, 1, 10)
          ELSE NULL
        END
      ) AS active_days,
      MIN(NULLIF(l.date, '0000-00-00 00:00:00')) AS first_login_at,
      MAX(NULLIF(l.date, '0000-00-00 00:00:00')) AS last_login_at
    FROM {db}.mc_logins l
    ${whereClause}
    GROUP BY l.ip, l.idmask
    ORDER BY login_count DESC
    LIMIT 400;
  `;

  return { sql, params };
};

const buildRedemptionsByIpAndIdmaskQuery = ({ range }) => {
  const conditions = [
    "r.idmask IS NOT NULL",
    "TRIM(r.idmask) <> ''",
    `r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "r.date IS NOT NULL",
    "r.date <> '0000-00-00 00:00:00'",
  ];
  const params = [];

  const validRedemptionCondition = [
    "r.id_award IS NOT NULL",
    "r.id_award <> 0",
    "r.value IS NOT NULL",
    "r.value > 0",
  ].join(" AND ");

  if (range) {
    conditions.push("r.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const sql = `
    SELECT
      r.ip AS ip,
      r.idmask AS idmask,
      COUNT(*) AS redemption_attempts,
      SUM(CASE WHEN ${validRedemptionCondition} THEN 1 ELSE 0 END) AS valid_redemptions,
      MIN(NULLIF(r.date, '0000-00-00 00:00:00')) AS first_redemption_at,
      MAX(NULLIF(r.date, '0000-00-00 00:00:00')) AS last_redemption_at,
      COALESCE(SUM(CASE WHEN ${validRedemptionCondition} THEN r.value ELSE 0 END), 0) AS redeemed_value
    FROM {db}.mc_redemptions r
    ${whereClause}
    GROUP BY r.ip, r.idmask
    ORDER BY redemption_attempts DESC
    LIMIT 400;
  `;

  return { sql, params };
};

const buildTwoFactorAdoptionBaseQuery = () => {
  const sql = `
    SELECT
      l.idmask AS idmask,
      CASE
        WHEN l.date IS NULL OR l.date = '0000-00-00 00:00:00' THEN NULL
        WHEN LENGTH(l.date) = 10 THEN STR_TO_DATE(l.date, '%Y-%m-%d')
        ELSE STR_TO_DATE(l.date, '%Y-%m-%d %H:%i:%s')
      END AS login_date,
      CASE
        WHEN TRIM(COALESCE(u.segment, '')) = '' THEN 'Sin segmento'
        ELSE TRIM(u.segment)
      END AS segment_label,
      CASE WHEN t.idmask IS NULL THEN 0 ELSE 1 END AS has_two_factor
    FROM {db}.mc_logins l
    LEFT JOIN {db}.mc_users u ON u.idmask = l.idmask
    LEFT JOIN {db}.mc_two_step_auths t ON t.idmask = l.idmask
    WHERE
      (l.idmask IS NULL OR l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})
      AND l.date IS NOT NULL
      AND l.date <> '0000-00-00 00:00:00'
  `;

  return { sql, params: [] };
};

router.get("/comparison/monthly", async (req, res) => {
  const allowedCampaigns = req.allowedCampaigns;
  const totalAllowedCount = allowedCampaigns.length;
  const selectedCampaigns = parseCampaignSelection(
    req.query.campaignId,
    allowedCampaigns
  );
  if (!selectedCampaigns || selectedCampaigns.length === 0) {
    return res.status(403).json({
      error: "No tienes permisos para consultar las campañas seleccionadas.",
    });
  }

  const range = parseDateRange(req.query);

  const loginType = normalizeSelectorValue(req.query.loginType);
  const userId = normalizeSelectorValue(req.query.userId);
  const userIp = normalizeSelectorValue(req.query.userIp);
  const segment = normalizeMultiSelectorValue(req.query.segment);
  const userType = normalizeSelectorValue(req.query.userType);

  try {
    const monthSet = new Set();
    const segmentSet = new Set();
    const userTypeSet = new Set();
    const comparison = [];
    const campaignNotes = [];

    for (const campaign of selectedCampaigns) {
      const campaignUserTypeColumn = campaign.userTypeColumn || "user_type";
      const loginQuery = buildMonthlyLoginSummaryQuery({
        range,
        loginType,
        userId,
        userIp,
        segment,
        userType,
        userTypeColumn: campaignUserTypeColumn,
      });
      const redemptionQuery = buildMonthlyRedemptionSummaryQuery({
        range,
        loginType,
        userId,
        userIp,
        segment,
        userType,
        userTypeColumn: campaignUserTypeColumn,
      });
      const tracingQuery = buildMonthlyTracingSummaryQuery({
        range,
        loginType,
        userId,
        userIp,
        segment,
        userType,
        userTypeColumn: campaignUserTypeColumn,
      });
      const goalQuery = buildGoalSummaryQuery({
        range,
        loginType,
        userId,
        userIp,
        segment,
        userType,
        userTypeColumn: campaignUserTypeColumn,
      });
      const goalBreakdownQuery = buildGoalBreakdownQuery({
        range,
        loginType,
        userId,
        userIp,
        segment,
        userType,
        userTypeColumn: campaignUserTypeColumn,
      });

      let loginResult;
      let redemptionResult;
      let tracingResult;
      let goalResult;
      let goalBreakdownResult;
      let campaignSegments;
      let campaignUserTypes;

      try {
        [
          loginResult,
          redemptionResult,
          tracingResult,
          goalResult,
          goalBreakdownResult,
          campaignSegments,
          campaignUserTypes,
        ] = await Promise.all([
          runQuery(campaign.database, loginQuery.sql, loginQuery.params),
          runQuery(campaign.database, redemptionQuery.sql, redemptionQuery.params),
          runQuery(campaign.database, tracingQuery.sql, tracingQuery.params),
          runQuery(campaign.database, goalQuery.sql, goalQuery.params),
          runQuery(
            campaign.database,
            goalBreakdownQuery.sql,
            goalBreakdownQuery.params
          ),
          collectSegments(campaign.database),
          collectUserTypes(campaign.database, campaignUserTypeColumn),
        ]);
      } catch (error) {
        console.error(
          `[comparison] Error consultando campaña ${campaign.id} (${campaign.database})`,
          error
        );
        const rawReason = error?.message || "Error desconocido en la consulta";
        const reason = rawReason.startsWith("Lambda responded with error:")
          ? rawReason.replace("Lambda responded with error:", "").trim()
          : rawReason;
        campaignNotes.push(`Campaña ${campaign.name} omitida: ${reason}.`);
        continue;
      }

      campaignSegments.forEach((value) => {
        if (value) {
          segmentSet.add(value);
        }
      });
      campaignUserTypes.forEach((value) => {
        if (value) {
          userTypeSet.add(value);
        }
      });

      const goalRow = goalResult.rows && goalResult.rows[0] ? goalResult.rows[0] : {};
      const totalUsers = toNumber(goalRow.total_users);
      const totalGoalAmount = toNumber(goalRow.total_goal_amount);
      const totalGoalTrx = toNumber(goalRow.total_goal_trx);

      const goalBreakdown = (goalBreakdownResult.rows || []).map((row) => {
        const awardKey = row.award_key === "sin_award" ? null : row.award_key;
        return {
          awardKey,
          goalAmount: toNumber(row.total_goal_amount),
        };
      });

      const monthMap = new Map();
      const ensureEntry = (month) => {
        if (!month) {
          return null;
        }
        const existing = monthMap.get(month);
        if (existing) {
          return existing;
        }
        const entry = {
          month,
          logins: 0,
          uniqueLoginUsers: 0,
          redemptions: 0,
          redeemers: 0,
          redeemedValue: 0,
          amountProgress: 0,
          transactions: 0,
          winners: 0,
        };
        monthMap.set(month, entry);
        monthSet.add(month);
        return entry;
      };

      for (const row of loginResult.rows || []) {
        const entry = ensureEntry(row.month);
        if (!entry) {
          continue;
        }
        entry.logins = toNumber(row.total_logins);
        entry.uniqueLoginUsers = toNumber(row.unique_login_users);
      }

      for (const row of redemptionResult.rows || []) {
        const entry = ensureEntry(row.month);
        if (!entry) {
          continue;
        }
        entry.redemptions = toNumber(row.total_redemptions);
        entry.redeemers = toNumber(row.total_redeemers);
        entry.redeemedValue = toNumber(row.total_value);
      }

      for (const row of tracingResult.rows || []) {
        const entry = ensureEntry(row.month);
        if (!entry) {
          continue;
        }
        entry.amountProgress = toNumber(row.total_amount);
        entry.transactions = toNumber(row.total_trx);
        entry.winners = toNumber(row.total_winners);
      }

      const orderedEntries = Array.from(monthMap.values()).sort((a, b) =>
        a.month.localeCompare(b.month)
      );

      let cumulativeLogins = 0;
      let cumulativeUniqueLoginUsers = 0;
      let cumulativeRedemptions = 0;
      let cumulativeRedeemers = 0;
      let cumulativeRedeemedValue = 0;
      let cumulativeAmount = 0;
      let cumulativeTransactions = 0;
      let cumulativeWinners = 0;

      const monthlyEntries = orderedEntries.map((entry) => {
        cumulativeLogins += entry.logins;
        cumulativeUniqueLoginUsers += entry.uniqueLoginUsers;
        cumulativeRedemptions += entry.redemptions;
        cumulativeRedeemers += entry.redeemers;
        cumulativeRedeemedValue += entry.redeemedValue;
        cumulativeAmount += entry.amountProgress;
        cumulativeTransactions += entry.transactions;
        cumulativeWinners += entry.winners;

        const loginRatio =
          totalUsers > 0 ? clampRatio(entry.uniqueLoginUsers / totalUsers) : 0;
        const redeemerRatio =
          totalUsers > 0 ? clampRatio(entry.redeemers / totalUsers) : 0;
        const valueSource =
          entry.amountProgress > 0 ? entry.amountProgress : entry.redeemedValue;
        const valueRatio =
          totalGoalAmount > 0 ? clampRatio(valueSource / totalGoalAmount) : 0;

        const cumulativeLoginRatio =
          totalUsers > 0 ? clampRatio(cumulativeUniqueLoginUsers / totalUsers) : 0;
        const cumulativeRedeemerRatio =
          totalUsers > 0 ? clampRatio(cumulativeRedeemers / totalUsers) : 0;
        const cumulativeValueSource =
          cumulativeAmount > 0 ? cumulativeAmount : cumulativeRedeemedValue;
        const cumulativeValueRatio =
          totalGoalAmount > 0
            ? clampRatio(cumulativeValueSource / totalGoalAmount)
            : 0;

        const monthlyWeightedScore =
          loginRatio * PERFORMANCE_WEIGHTS.login +
          redeemerRatio * PERFORMANCE_WEIGHTS.redeemers +
          valueRatio * PERFORMANCE_WEIGHTS.value;
        const cumulativeWeightedScore =
          cumulativeLoginRatio * PERFORMANCE_WEIGHTS.login +
          cumulativeRedeemerRatio * PERFORMANCE_WEIGHTS.redeemers +
          cumulativeValueRatio * PERFORMANCE_WEIGHTS.value;

        return {
          month: entry.month,
          metrics: {
            logins: entry.logins,
            uniqueLoginUsers: entry.uniqueLoginUsers,
            redemptions: entry.redemptions,
            redeemers: entry.redeemers,
            redeemedValue: entry.redeemedValue,
            amountProgress: entry.amountProgress,
            transactions: entry.transactions,
            winners: entry.winners,
          },
          cumulative: {
            logins: cumulativeLogins,
            uniqueLoginUsers: cumulativeUniqueLoginUsers,
            redemptions: cumulativeRedemptions,
            redeemers: cumulativeRedeemers,
            redeemedValue: cumulativeRedeemedValue,
            amountProgress: cumulativeAmount,
            transactions: cumulativeTransactions,
            winners: cumulativeWinners,
          },
          progress: {
            monthly: {
              loginRatio,
              redeemerRatio,
              valueRatio,
              weightedScore: monthlyWeightedScore,
              bar: {
                loginPercent:
                  PERFORMANCE_WEIGHTS.login * loginRatio * 100,
                redeemerPercent:
                  PERFORMANCE_WEIGHTS.redeemers * redeemerRatio * 100,
                valuePercent:
                  PERFORMANCE_WEIGHTS.value * valueRatio * 100,
              },
            },
            cumulative: {
              loginRatio: cumulativeLoginRatio,
              redeemerRatio: cumulativeRedeemerRatio,
              valueRatio: cumulativeValueRatio,
              weightedScore: cumulativeWeightedScore,
              bar: {
                loginPercent:
                  PERFORMANCE_WEIGHTS.login * cumulativeLoginRatio * 100,
                redeemerPercent:
                  PERFORMANCE_WEIGHTS.redeemers *
                  cumulativeRedeemerRatio *
                  100,
                valuePercent:
                  PERFORMANCE_WEIGHTS.value * cumulativeValueRatio * 100,
              },
            },
          },
        };
      });

      const totals =
        monthlyEntries.length > 0
          ? monthlyEntries[monthlyEntries.length - 1].cumulative
          : {
              logins: 0,
              uniqueLoginUsers: 0,
              redemptions: 0,
              redeemers: 0,
              redeemedValue: 0,
              amountProgress: 0,
              transactions: 0,
              winners: 0,
            };

      const latestProgress =
        monthlyEntries.length > 0
          ? monthlyEntries[monthlyEntries.length - 1].progress.cumulative
          : null;
      const performanceScore = latestProgress?.weightedScore ?? 0;
      const performancePercent = Number((performanceScore * 100).toFixed(2));
      const monetaryActual =
        totals.amountProgress > 0 ? totals.amountProgress : totals.redeemedValue;
      const goalCoverageRatio =
        totalGoalAmount > 0 ? clampRatio(monetaryActual / totalGoalAmount) : 0;
      const goalCoveragePercent = Number((goalCoverageRatio * 100).toFixed(2));
      const averageValuePerTrx =
        totals.transactions > 0
          ? Number((totals.amountProgress / totals.transactions).toFixed(2))
          : null;
      const averageValuePerRedeemer =
        totals.redeemers > 0
          ? Number((totals.redeemedValue / totals.redeemers).toFixed(2))
          : null;

      comparison.push({
        campaign: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
        },
        goal: {
          amount: totalGoalAmount,
          transactions: totalGoalTrx,
          totalUsers,
          breakdownByAward: goalBreakdown,
        },
        months: monthlyEntries,
        totals,
        insights: {
          averageValuePerTransaction: averageValuePerTrx,
          averageValuePerRedeemer,
        },
        performance: {
          latestMonth:
            monthlyEntries.length > 0
              ? monthlyEntries[monthlyEntries.length - 1].month
              : null,
          score: performanceScore,
          percent: performancePercent,
          goalCoveragePercent,
        },
      });
    }

    comparison.sort((a, b) => b.performance.score - a.performance.score);

    const availableMonths = Array.from(monthSet).sort();
    const segmentOptions = Array.from(segmentSet).sort((a, b) =>
      a.localeCompare(b)
    );
    const userTypeOptions = Array.from(userTypeSet).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
    );

    const metadataNotes = [
      "Las barras apiladas ponderan login (35%), usuarios con redención (25%) y valor económico (40%) para mantener consistencia entre unidades.",
      "Las metas se recalculan en cada solicitud usando goal_amount_1 vigente por award_1. Ajusta los pesos si la campaña tiene otra conversión.",
      ...campaignNotes,
    ];

    if (comparison.length === 0) {
      return res.json({
        scope:
          selectedCampaigns.length === totalAllowedCount
            ? "consolidated"
            : "subset",
        campaigns: [],
        months: [],
        filters: {
          segments: segmentOptions.map((value) => ({ value, label: value })),
          userTypes: userTypeOptions.map((value) => ({ value, label: value })),
        },
        metadata: {
          weights: { ...PERFORMANCE_WEIGHTS },
          notes: metadataNotes,
        },
        range: range
          ? {
              from: range.from,
              to: range.to,
            }
          : null,
        generatedAt: new Date().toISOString(),
      });
    }

    res.json({
      scope:
        selectedCampaigns.length === totalAllowedCount
          ? "consolidated"
          : "subset",
      campaigns: comparison,
      months: availableMonths,
      filters: {
        segments: segmentOptions.map((value) => ({ value, label: value })),
        userTypes: userTypeOptions.map((value) => ({ value, label: value })),
      },
      metadata: {
        weights: { ...PERFORMANCE_WEIGHTS },
        notes: metadataNotes,
      },
      range: range
        ? {
            from: range.from,
            to: range.to,
          }
        : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[comparison] Error", error);
    res.status(500).json({
      error: "No se pudo construir el comparativo mensual",
      detail: error.message,
    });
  }
});

router.get("/:id/summary", async (req, res) => {
  const campaign = req.allowedCampaigns.find(
    ({ id }) => id === req.params.id
  );
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign
        ? "No tienes acceso a esta campaña."
        : "Campaña no encontrada",
    });
  }

  const range = parseDateRange(req.query);

  try {
    const mode = typeof req.query.mode === "string" ? req.query.mode.trim() : "";
    const kpisOnly = mode === "kpis";
    const loginType = normalizeSelectorValue(req.query.loginType);
    const userId = normalizeSelectorValue(req.query.userId);
    const userIp = normalizeSelectorValue(req.query.userIp);
    const segment = normalizeMultiSelectorValue(req.query.segment);
    const userType = normalizeSelectorValue(req.query.userType);
    const userTypeColumn = campaign.userTypeColumn || "user_type";
    const filters = { loginType, userId, userIp, segment, userType, userTypeColumn };

    const metricsPromise = Promise.all(
      (campaign.metrics || []).map(async (metric) => {
        const { sql: metricSql, params } = appendDateFilter(
          metric.sql,
          metric.dateColumn?.replace("{db}", campaign.database),
          range?.from,
          range?.to
        );

        const { sql: filteredSql, params: filteredParams } = applyFiltersToSql({
          sql: metricSql,
          params,
          database: campaign.database,
          baseTable: metric.baseTable,
          filters,
          range,
        });

        let value = null;
        try {
          const result = await runQuery(campaign.database, filteredSql, filteredParams);
          value = result.rows?.[0]?.value ?? null;
        } catch (err) {
          if (metric.hidden) {
            // Metric is optional (e.g. mc_settings may not exist for all campaigns)
            value = null;
          } else {
            throw err;
          }
        }

        return {
          key: metric.key,
          label: metric.label,
          value,
          hidden: metric.hidden ?? false,
        };
      })
    );

    const chartsPromise = kpisOnly
      ? Promise.resolve([])
      : Promise.all(
          (campaign.charts || []).map(async (chart) => {
            const { sql: chartSql, params: chartParams } = applyFiltersToSql({
              sql: chart.sql,
              params: [],
              database: campaign.database,
              baseTable: chart.baseTable,
              filters,
              range,
            });

            const result = await runQuery(campaign.database, chartSql, chartParams);
            return {
              key: chart.key,
              title: chart.title,
              data: result.rows || [],
            };
          })
        );

    const samplePromise = kpisOnly
      ? Promise.resolve({ rows: [], rowCount: 0 })
      : (async () => {
          if (!campaign.sampleSql) {
            return { rows: [], rowCount: 0 };
          }

          const { sql: sampleSql, params: sampleParams } = applyFiltersToSql({
            sql: campaign.sampleSql,
            params: [],
            database: campaign.database,
            filters,
            range,
          });

          try {
            const result = await runQuery(campaign.database, sampleSql, sampleParams);
            return {
              rows: result.rows,
              rowCount: result.rowCount,
            };
          } catch (sampleError) {
            const message = sampleError?.message || "";
            if (/Unknown column/i.test(message) || /1054/.test(message)) {
              console.warn("[summary] Sample query omitted", {
                campaign: campaign.id,
                sql: sampleSql,
                error: message,
              });
              return { rows: [], rowCount: 0 };
            }
            throw sampleError;
          }
        })();

    const [metrics, charts, sample] = await Promise.all([
      metricsPromise,
      chartsPromise,
      samplePromise,
    ]);

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
      },
      metrics,
      charts,
      sample,
    });
  } catch (error) {
    console.error("[summary] Error", error);
    respondPendingOr500(
      res,
      error,
      { campaignId: campaign.id, metrics: [], filters: {}, baselineUsers: null, enrollmentGoals: null },
      "No se pudo obtener la información de la campaña"
    );
  }
});

router.get("/:id/segments", async (req, res) => {
  const campaign = req.allowedCampaigns.find(({ id }) => id === req.params.id);
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign ? "No tienes acceso a esta campaña." : "Campaña no encontrada",
    });
  }
  try {
    const segments = await collectSegments(campaign.database);
    res.json({ segments });
  } catch (error) {
    console.error("[segments] Error", error);
    respondPendingOr500(res, error, { segments: [] }, "No se pudo obtener los segmentos");
  }
});

router.get("/:id/user-types", async (req, res) => {
  const campaign = req.allowedCampaigns.find(({ id }) => id === req.params.id);
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign ? "No tienes acceso a esta campaña." : "Campaña no encontrada",
    });
  }
  try {
    const userTypes = await collectUserTypes(campaign.database, campaign.userTypeColumn || "user_type");
    res.json({ userTypes });
  } catch (error) {
    console.error("[user-types] Error", error);
    respondPendingOr500(res, error, { userTypes: [] }, "No se pudo obtener los tipos de usuario");
  }
});

router.get("/:id/enrollment-funnel", async (req, res) => {
  const campaign = req.allowedCampaigns.find(({ id }) => id === req.params.id);
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign ? "No tienes acceso a esta campaña." : "Campaña no encontrada",
    });
  }

  try {
    // "Inscrito" = ha hecho al menos un login exitoso (type=1) o autologin (type=2) alguna vez.
    // Sin filtro de fecha: el estado de inscripción es permanente.
    const inscritoSubquery = `SELECT DISTINCT idmask FROM {db}.mc_logins
      WHERE type IN (1, 2)
        AND idmask IS NOT NULL AND TRIM(idmask) <> ''
        AND idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`;

    // Capa 1: base total desde mc_users
    const totalUsersQuery = `
      SELECT
        'Usuarios Totales' AS layer,
        SUM(CASE WHEN u.idmask IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS inscritos,
        SUM(CASE WHEN u.idmask NOT IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS no_inscritos
      FROM {db}.mc_users u
      WHERE u.idmask IS NOT NULL AND TRIM(u.idmask) <> ''
        AND u.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`;

    // Capa 2: ganadores Meta 1 desde mc_tracings.winner_1
    const winner1Query = `
      SELECT
        'Ganador Meta 1' AS layer,
        SUM(CASE WHEN t.idmask IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS inscritos,
        SUM(CASE WHEN t.idmask NOT IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS no_inscritos
      FROM {db}.mc_tracings t
      WHERE t.idmask IS NOT NULL AND TRIM(t.idmask) <> ''
        AND t.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
        AND t.winner_1 IS NOT NULL AND t.winner_1 <> '' AND t.winner_1 <> '0'`;

    // Detectar si mc_tracings existe y si winner_2 existe
    let hasTracings = false;
    let hasWinner2 = false;
    try {
      await runQuery(campaign.database, `SELECT winner_1 FROM {db}.mc_tracings LIMIT 1;`, []);
      hasTracings = true;
    } catch {
      hasTracings = false;
    }
    if (hasTracings) {
      try {
        await runQuery(campaign.database, `SELECT winner_2 FROM {db}.mc_tracings LIMIT 1;`, []);
        hasWinner2 = true;
      } catch {
        hasWinner2 = false;
      }
    }

    // Capa 3 (opcional): ganadores Meta 2 desde mc_tracings.winner_2
    const winner2Query = `
      SELECT
        'Ganador Meta 2' AS layer,
        SUM(CASE WHEN t.idmask IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS inscritos,
        SUM(CASE WHEN t.idmask NOT IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS no_inscritos
      FROM {db}.mc_tracings t
      WHERE t.idmask IS NOT NULL AND TRIM(t.idmask) <> ''
        AND t.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
        AND t.winner_2 IS NOT NULL AND t.winner_2 <> '' AND t.winner_2 <> '0'`;

    // Detectar si la columna block existe en mc_redemptions (campañas viejas pueden no tenerla)
    let hasBlock = false;
    try {
      await runQuery(
        campaign.database,
        `SELECT block FROM {db}.mc_redemptions LIMIT 1;`,
        []
      );
      hasBlock = true;
    } catch {
      hasBlock = false;
    }

    // Detectar si hay redenciones con block=2 (campañas de una sola meta no tendrán)
    let hasBlock2 = false;
    if (hasBlock) {
      try {
        const b2check = await runQuery(
          campaign.database,
          `SELECT 1 FROM {db}.mc_redemptions WHERE block = 2 AND value > 0 LIMIT 1;`,
          []
        );
        hasBlock2 = (b2check.rows || []).length > 0;
      } catch {
        hasBlock2 = false;
      }
    }

    // Capa: Redimió Meta 1 — usuarios únicos con redención válida block=1
    const redeemMeta1Query = `
      SELECT
        'Redimió Meta 1' AS layer,
        SUM(CASE WHEN r.idmask IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS inscritos,
        SUM(CASE WHEN r.idmask NOT IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS no_inscritos
      FROM (
        SELECT DISTINCT idmask
        FROM {db}.mc_redemptions
        WHERE block = 1
          AND idmask IS NOT NULL AND TRIM(idmask) <> ''
          AND idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
          AND id_award IS NOT NULL AND id_award <> 0
          AND value IS NOT NULL AND value > 0
          AND date IS NOT NULL AND date <> '0000-00-00 00:00:00'
      ) r`;

    // Capa: Redimió Meta 2 — mismo patrón con block=2
    const redeemMeta2Query = `
      SELECT
        'Redimió Meta 2' AS layer,
        SUM(CASE WHEN r.idmask IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS inscritos,
        SUM(CASE WHEN r.idmask NOT IN (${inscritoSubquery}) THEN 1 ELSE 0 END) AS no_inscritos
      FROM (
        SELECT DISTINCT idmask
        FROM {db}.mc_redemptions
        WHERE block = 2
          AND idmask IS NOT NULL AND TRIM(idmask) <> ''
          AND idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
          AND id_award IS NOT NULL AND id_award <> 0
          AND value IS NOT NULL AND value > 0
          AND date IS NOT NULL AND date <> '0000-00-00 00:00:00'
      ) r`;

    // Orden: Totales → Ganador Meta 1 → Redimió Meta 1 → Ganador Meta 2 → Redimió Meta 2
    const queries = [{ label: "Usuarios Totales", sql: totalUsersQuery }];
    if (hasTracings) queries.push({ label: "Ganador Meta 1", sql: winner1Query });
    if (hasBlock) queries.push({ label: "Redimió Meta 1", sql: redeemMeta1Query });
    if (hasTracings && hasWinner2) queries.push({ label: "Ganador Meta 2", sql: winner2Query });
    if (hasBlock && hasBlock2) queries.push({ label: "Redimió Meta 2", sql: redeemMeta2Query });

    const results = await Promise.all(
      queries.map(({ sql }) => runQuery(campaign.database, sql, []))
    );

    const layers = results.map((r, i) => {
      const row = (r.rows || [])[0] || {};
      return {
        layer: queries[i].label,
        inscritos: Number(row.inscritos) || 0,
        no_inscritos: Number(row.no_inscritos) || 0,
      };
    });

    res.json({ layers });
  } catch (error) {
    console.error("[enrollment-funnel] Error", error);
    res.status(500).json({ error: "No se pudo obtener el embudo de inscripción", detail: error.message });
  }
});

router.get("/:id/first-logins-by-date", async (req, res) => {
  const campaign = req.allowedCampaigns.find(({ id }) => id === req.params.id);
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign ? "No tienes acceso a esta campaña." : "Campaña no encontrada",
    });
  }

  const range = parseDateRange(req.query);
  const segment = normalizeMultiSelectorValue(req.query.segment);
  const userType = normalizeSelectorValue(req.query.userType);

  try {
    const toAlias = (val) => "seg_" + val.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const escapeStr = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const safeCol = (val, fallback) =>
      (typeof val === "string" && val.length > 0 && val !== "undefined" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(val))
        ? val : fallback;
    const utCol = safeCol(campaign.userTypeColumn, "user_type");

    // Determinar columna de pivot: user_status para Tuya, segment para el resto
    const pivotCol = safeCol(campaign.firstLoginsPivotColumn, "segment");

    // Cargar valores distintos de la columna de pivot para construir columnas dinámicas
    const pivotValues = pivotCol === "segment"
      ? await collectSegments(campaign.database)
      : await collectUserTypes(campaign.database, pivotCol);

    const pivotCases = pivotValues.map(
      (val) =>
        `SUM(CASE WHEN TRIM(COALESCE(u.${pivotCol},'')) = '${escapeStr(val)}' THEN 1 ELSE 0 END) AS ${toAlias(val)}`
    );

    const dateFilter = range
      ? `AND t.first_login BETWEEN '${range.from}' AND '${range.to}'`
      : "";
    const segmentFilter = buildSegmentInClause(segment, "u.segment");
    const userTypeFilter = userType
      ? `AND u.${utCol} = '${escapeStr(userType)}'`
      : "";

    const selectCases = pivotCases.length > 0 ? ",\n                   " + pivotCases.join(",\n                   ") : "";

    const sql = `SELECT
                   DATE_FORMAT(t.first_login, '%Y-%m-%d') AS fecha,
                   COUNT(*) AS loggins_inscritos${selectCases}
                 FROM (
                   SELECT idmask, MIN(date) AS first_login
                   FROM {db}.mc_logins
                   WHERE idmask IS NOT NULL
                     AND TRIM(idmask) <> ''
                     AND idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
                     AND type IN (1, 2)
                   GROUP BY idmask
                 ) t
                 LEFT JOIN {db}.mc_users u ON u.idmask = t.idmask
                 WHERE 1=1 ${dateFilter} ${segmentFilter} ${userTypeFilter}
                 GROUP BY fecha
                 ORDER BY fecha ASC;`;

    const result = await runQuery(campaign.database, sql, []);
    const segmentMeta = pivotValues.map((val) => ({
      label: val,
      key: toAlias(val),
    }));
    res.json({ rows: result.rows || [], segments: segmentMeta });
  } catch (error) {
    console.error("[first-logins-by-date] Error", error);
    respondPendingOr500(res, error, { rows: [], segments: [] }, "No se pudo obtener los loggins inscritos");
  }
});

// Chunking: cada invocación Lambda devuelve <= CHUNK_SIZE filas para evitar
// "Lambda error: Unhandled" (timeout / OOM / 6 MB payload sync limit).
const EXPORT_CHUNK_SIZE = 20000;
const EXPORT_MAX_CHUNKS = 30; // 600k filas máx — defensivo contra loops infinitos

router.get("/:id/enrolled-users", async (req, res) => {
  const campaign = req.allowedCampaigns.find(({ id }) => id === req.params.id);
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign ? "No tienes acceso a esta campaña." : "Campaña no encontrada",
    });
  }

  const range = parseDateRange(req.query);
  const segment = normalizeMultiSelectorValue(req.query.segment);
  const userType = normalizeSelectorValue(req.query.userType);

  // Paginación opcional: si el cliente pasa ?limit y ?offset, se devuelve UNA sola página
  // (para que el export Excel no genere un JSON > 10 MB que el API Gateway rechace con 413).
  // Si no pasa esos params, se mantiene el comportamiento histórico (acumular todo internamente).
  const reqLimit = Number.parseInt(req.query.limit, 10);
  const reqOffset = Number.parseInt(req.query.offset, 10);
  const paginated =
    Number.isFinite(reqLimit) && reqLimit > 0 &&
    Number.isFinite(reqOffset) && reqOffset >= 0;
  const pageLimit = paginated ? Math.min(reqLimit, EXPORT_CHUNK_SIZE) : null;
  const pageOffset = paginated ? reqOffset : null;

  try {
    const utCol = (typeof campaign.userTypeColumn === "string" && campaign.userTypeColumn.length > 0 && campaign.userTypeColumn !== "undefined" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(campaign.userTypeColumn)) ? campaign.userTypeColumn : "user_type";
    const hasUserType = campaign.hasUserType !== false;
    const escapeStr = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const dateFilter = range
      ? `AND t.first_login BETWEEN '${range.from}' AND '${range.to} 23:59:59'`
      : "";
    const segmentFilter = buildSegmentInClause(segment, "u.segment");
    const userTypeFilter = hasUserType && userType ? `AND u.${utCol} = '${escapeStr(userType)}'` : "";
    const tipoUsuarioSelect = hasUserType ? `COALESCE(u.${utCol}, '')` : `''`;

    const buildSql = (limit, offset) => `
      SELECT
        t.idmask,
        DATE_FORMAT(t.first_login, '%Y-%m-%d') AS fecha_inscripcion,
        COALESCE(u.segment, '') AS segmento,
        ${tipoUsuarioSelect} AS tipo_usuario
      FROM (
        SELECT idmask, MIN(date) AS first_login
        FROM {db}.mc_logins
        WHERE idmask IS NOT NULL
          AND TRIM(idmask) <> ''
          AND idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
          AND type IN (1, 2)
        GROUP BY idmask
      ) t
      LEFT JOIN {db}.mc_users u ON u.idmask = t.idmask
      WHERE 1=1 ${dateFilter} ${segmentFilter} ${userTypeFilter}
      ORDER BY t.first_login ASC, t.idmask ASC
      LIMIT ${limit} OFFSET ${offset};
    `;

    if (paginated) {
      const sql = buildSql(pageLimit, pageOffset);
      const result = await runQuery(campaign.database, sql, []);
      return res.json({ rows: result.rows || [] });
    }

    const allRows = [];
    for (let chunk = 0; chunk < EXPORT_MAX_CHUNKS; chunk += 1) {
      const offset = chunk * EXPORT_CHUNK_SIZE;
      const sql = buildSql(EXPORT_CHUNK_SIZE, offset);
      const result = await runQuery(campaign.database, sql, []);
      const rows = result.rows || [];
      allRows.push(...rows);
      if (rows.length < EXPORT_CHUNK_SIZE) break;
    }

    res.json({ rows: allRows });
  } catch (error) {
    console.error("[enrolled-users] Error", error);
    respondPendingOr500(res, error, { rows: [] }, "No se pudo obtener los usuarios inscritos.");
  }
});

router.get("/:id/redeemed-users", async (req, res) => {
  const campaign = req.allowedCampaigns.find(({ id }) => id === req.params.id);
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign ? "No tienes acceso a esta campaña." : "Campaña no encontrada",
    });
  }

  const range = parseDateRange(req.query);
  const segment = normalizeMultiSelectorValue(req.query.segment);
  const userType = normalizeSelectorValue(req.query.userType);

  // Paginación opcional (mismo patrón que /enrolled-users): si el cliente pasa
  // ?limit y ?offset, se devuelve UNA sola página para evitar 413 en API Gateway.
  const reqLimit = Number.parseInt(req.query.limit, 10);
  const reqOffset = Number.parseInt(req.query.offset, 10);
  const paginated =
    Number.isFinite(reqLimit) && reqLimit > 0 &&
    Number.isFinite(reqOffset) && reqOffset >= 0;
  const pageLimit = paginated ? Math.min(reqLimit, EXPORT_CHUNK_SIZE) : null;
  const pageOffset = paginated ? reqOffset : null;

  try {
    const utCol = (typeof campaign.userTypeColumn === "string" && campaign.userTypeColumn.length > 0 && campaign.userTypeColumn !== "undefined" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(campaign.userTypeColumn)) ? campaign.userTypeColumn : "user_type";
    const hasUserType = campaign.hasUserType !== false;
    const escapeStr = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const dateFilter = range
      ? `AND r.date BETWEEN '${range.from}' AND '${range.to} 23:59:59'`
      : "";
    const segmentFilter = buildSegmentInClause(segment, "u.segment");
    const userTypeFilter = hasUserType && userType ? `AND u.${utCol} = '${escapeStr(userType)}'` : "";
    const tipoUsuarioSelect = hasUserType ? `COALESCE(u.${utCol}, '')` : `''`;

    const buildSql = (limit, offset) => `
      SELECT
        r.idmask,
        DATE_FORMAT(r.date, '%Y-%m-%d') AS fecha_redencion,
        r.value AS valor,
        CASE r.block WHEN 1 THEN 'Win 1' WHEN 2 THEN 'Win 2' ELSE CONCAT('Win ', r.block) END AS win,
        COALESCE(u.segment, '') AS segmento,
        ${tipoUsuarioSelect} AS tipo_usuario
      FROM {db}.mc_redemptions r
      LEFT JOIN {db}.mc_users u ON u.idmask = r.idmask
      WHERE r.idmask IS NOT NULL
        AND TRIM(r.idmask) <> ''
        AND r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}
        AND r.block IN (1, 2)
        AND r.id_award IS NOT NULL
        AND r.id_award <> 0
        AND r.value IS NOT NULL
        AND r.value > 0
        AND r.date IS NOT NULL
        AND r.date <> '0000-00-00 00:00:00'
        ${dateFilter} ${segmentFilter} ${userTypeFilter}
      ORDER BY r.date ASC, r.idmask ASC
      LIMIT ${limit} OFFSET ${offset};
    `;

    if (paginated) {
      const sql = buildSql(pageLimit, pageOffset);
      const result = await runQuery(campaign.database, sql, []);
      return res.json({ rows: result.rows || [] });
    }

    const allRows = [];
    for (let chunk = 0; chunk < EXPORT_MAX_CHUNKS; chunk += 1) {
      const offset = chunk * EXPORT_CHUNK_SIZE;
      const sql = buildSql(EXPORT_CHUNK_SIZE, offset);
      const result = await runQuery(campaign.database, sql, []);
      const rows = result.rows || [];
      allRows.push(...rows);
      if (rows.length < EXPORT_CHUNK_SIZE) break;
    }

    res.json({ rows: allRows });
  } catch (error) {
    console.error("[redeemed-users] Error", error);
    respondPendingOr500(res, error, { rows: [] }, "No se pudo obtener los usuarios redimidos.");
  }
});

router.get("/:id/redemptions-insights", async (req, res) => {
  const campaign = req.allowedCampaigns.find(
    ({ id }) => id === req.params.id
  );
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign
        ? "No tienes acceso a esta campaña."
        : "Campaña no encontrada",
    });
  }

  const range = parseDateRange(req.query);
  const loginType = normalizeSelectorValue(req.query.loginType);
  const userId = normalizeSelectorValue(req.query.userId);
  const userIp = normalizeSelectorValue(req.query.userIp);
  const segment = normalizeMultiSelectorValue(req.query.segment);
  const userType = normalizeSelectorValue(req.query.userType);
  const userTypeColumn = campaign.userTypeColumn || "user_type";

  const filters = { loginType, userId, userIp, segment, userType, userTypeColumn };

  try {
    const amountQuery = buildRedemptionAmountDistributionQuery({ range });
    const { sql: amountSql, params: amountParams } = applyFiltersToSql({
      sql: amountQuery.sql,
      params: amountQuery.params,
      database: campaign.database,
      baseTable: "mc_redemptions",
      filters,
      range,
    });

    const merchantTotalsQuery = buildMerchantTotalsQuery({ range });
    const { sql: merchantTotalsSql, params: merchantTotalsParams } = applyFiltersToSql({
      sql: merchantTotalsQuery.sql,
      params: merchantTotalsQuery.params,
      database: campaign.database,
      baseTable: "mc_redemptions",
      filters,
      range,
    });

    const merchantMatrixQuery = buildMerchantAmountMatrixQuery({ range });
    const { sql: merchantMatrixSql, params: merchantMatrixParams } = applyFiltersToSql({
      sql: merchantMatrixQuery.sql,
      params: merchantMatrixQuery.params,
      database: campaign.database,
      baseTable: "mc_redemptions",
      filters,
      range,
    });

    const [amountResult, merchantTotalsResult, merchantMatrixResult] = await Promise.all([
      runQuery(campaign.database, amountSql, amountParams),
      runQuery(campaign.database, merchantTotalsSql, merchantTotalsParams),
      runQuery(campaign.database, merchantMatrixSql, merchantMatrixParams),
    ]);

    const normalizeMerchantLabel = (value) => {
      const raw = typeof value === "string" ? value.trim() : "";
      if (!raw) {
        return "Premio sin nombre";
      }
      if (/^premio\s+(null|sin_id)$/i.test(raw)) {
        return "Premio sin id";
      }
      return raw;
    };

    const amountDistribution = (amountResult.rows || [])
      .map((row) => ({
        amount: toNumber(row.amount),
        redemptions: toNumber(row.total_redemptions),
        uniqueUsers: toNumber(row.unique_users),
        totalValue: toNumber(row.total_value),
      }))
      .filter((entry) => entry.amount > 0 && entry.redemptions > 0)
      .sort((a, b) => a.amount - b.amount);

    const merchantTotals = (merchantTotalsResult.rows || [])
      .map((row) => ({
        merchant: normalizeMerchantLabel(row.merchant_name),
        redemptions: toNumber(row.total_redemptions),
        uniqueUsers: toNumber(row.unique_users),
        totalValue: toNumber(row.total_value),
      }))
      .filter((entry) => entry.redemptions > 0)
      .sort((a, b) => {
        if (b.totalValue !== a.totalValue) {
          return b.totalValue - a.totalValue;
        }
        if (b.redemptions !== a.redemptions) {
          return b.redemptions - a.redemptions;
        }
        return a.merchant.localeCompare(b.merchant);
      });

    const merchantTotalsByRedemptions = [...merchantTotals].sort((a, b) => {
      if (b.redemptions !== a.redemptions) {
        return b.redemptions - a.redemptions;
      }
      return a.merchant.localeCompare(b.merchant);
    });

    const amountByRedemptions = [...amountDistribution].sort((a, b) => {
      if (b.redemptions !== a.redemptions) {
        return b.redemptions - a.redemptions;
      }
      return a.amount - b.amount;
    });

    const merchantPie = [];
    const topPieMerchants = merchantTotalsByRedemptions.slice(0, TOP_MERCHANT_PIE_LIMIT);
    const remainingPieMerchants = merchantTotalsByRedemptions.slice(TOP_MERCHANT_PIE_LIMIT);

    topPieMerchants.forEach((entry) => {
      merchantPie.push({
        merchant: entry.merchant,
        redemptions: entry.redemptions,
        totalValue: entry.totalValue,
        isOther: false,
      });
    });

    const othersAggregate = remainingPieMerchants.reduce(
      (acc, entry) => {
        acc.redemptions += entry.redemptions;
        acc.totalValue += entry.totalValue;
        return acc;
      },
      { redemptions: 0, totalValue: 0 }
    );

    if (othersAggregate.redemptions > 0) {
      merchantPie.push({
        merchant: "Otros",
        redemptions: othersAggregate.redemptions,
        totalValue: othersAggregate.totalValue,
        isOther: true,
      });
    }

    const heatmapMerchants = merchantTotalsByRedemptions
      .slice(0, HEATMAP_TOP_MERCHANTS)
      .map((entry) => entry.merchant);

    const heatmapAmounts = amountByRedemptions
      .slice(0, HEATMAP_TOP_AMOUNTS)
      .map((entry) => entry.amount);

    const matrixRows = merchantMatrixResult.rows || [];
    const matrixMap = new Map();
    matrixRows.forEach((row) => {
      const merchant = normalizeMerchantLabel(row.merchant_name);
      const amount = toNumber(row.amount);
      if (!Number.isFinite(amount)) {
        return;
      }
      const redemptions = toNumber(row.total_redemptions);
      const totalValue = toNumber(row.total_value);
      const key = `${merchant}__${amount}`;
      matrixMap.set(key, { redemptions, totalValue });
    });

    const heatmapCells = [];
    let heatmapMaxRedemptions = 0;
    let heatmapMinPositiveRedemptions = null;

    heatmapMerchants.forEach((merchant) => {
      heatmapAmounts.forEach((amount) => {
        const key = `${merchant}__${amount}`;
        const metrics = matrixMap.get(key) || { redemptions: 0, totalValue: 0 };
        const { redemptions, totalValue } = metrics;
        if (redemptions > heatmapMaxRedemptions) {
          heatmapMaxRedemptions = redemptions;
        }
        if (redemptions > 0 && (heatmapMinPositiveRedemptions === null || redemptions < heatmapMinPositiveRedemptions)) {
          heatmapMinPositiveRedemptions = redemptions;
        }
        heatmapCells.push({
          merchant,
          amount,
          redemptions,
          totalValue,
        });
      });
    });

    const totalRedemptions = merchantTotals.reduce(
      (acc, entry) => acc + entry.redemptions,
      0
    );
    const totalRedeemedValue = merchantTotals.reduce(
      (acc, entry) => acc + entry.totalValue,
      0
    );

    const appliedFilters = {
      loginType: loginType ?? null,
      userId: userId ?? null,
      userIp: userIp ?? null,
      dateRange:
        typeof req.query.from === "string" && typeof req.query.to === "string"
          ? { from: req.query.from, to: req.query.to }
          : null,
    };

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
      },
      amountDistribution,
      merchantPie,
      merchantTotals,
      heatmap: {
        merchants: heatmapMerchants,
        amounts: heatmapAmounts,
        cells: heatmapCells,
        maxRedemptions: heatmapMaxRedemptions,
        minPositiveRedemptions: heatmapMinPositiveRedemptions,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        totals: {
          redemptions: totalRedemptions,
          redeemedValue: totalRedeemedValue,
        },
        appliedFilters,
      },
    });
  } catch (error) {
    console.error("[redemptions-insights] Error", error);
    respondPendingOr500(
      res,
      error,
      {
        amountDistribution: [],
        merchantPie: [],
        merchantTotals: [],
        merchantMatrix: { merchants: [], buckets: [], cells: [] },
        heatmap: { cells: [], daysOfWeek: [], hours: [] },
      },
      "No se pudieron obtener las métricas de redenciones"
    );
  }
});

const MOVING_AVERAGE_WINDOW = 7;

const buildLoginSeriesQuery = ({
  range,
  loginType,
  segment,
  userType,
  userId,
  userIp,
  userTypeColumn = "user_type",
}) => {
  const needsUserJoin = Boolean(segment || userType);
  const conditions = [
    `(l.idmask IS NULL OR l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
  ];
  const params = ["%Y-%m-%d"];

  if (loginType) {
    conditions.push("l.type = %s");
    params.push(loginType);
  }

  if (segment) {
    conditions.push("u.segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`u.${utCol} = %s`);
    params.push(userType);
  }

  if (userId) {
    conditions.push("l.idmask = %s");
    params.push(userId);
  }

  if (userIp) {
    conditions.push("l.ip = %s");
    params.push(userIp);
  }

  if (range) {
    conditions.push("l.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = needsUserJoin
    ? "LEFT JOIN {db}.mc_users u ON u.idmask = l.idmask"
    : "";

  const sql = `
    SELECT
      DATE_FORMAT(l.date, %s) AS activity_date,
      COUNT(*) AS total_logins,
      COUNT(DISTINCT l.idmask) AS unique_login_users
    FROM {db}.mc_logins l
    ${joinClause}
    ${whereClause}
    GROUP BY activity_date
    ORDER BY activity_date;
  `;

  return { sql, params };
};

const buildRedemptionSeriesQuery = ({
  range,
  segment,
  userType,
  loginType,
  userId,
  userIp,
  userTypeColumn = "user_type",
}) => {
  const conditions = [
    `(r.idmask IS NULL OR r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
    "r.date IS NOT NULL",
    "r.date <> '0000-00-00 00:00:00'",
  ];
  const params = ["%Y-%m-%d"];

  const validRedemptionCondition = [
    "r.idmask IS NOT NULL",
    "TRIM(r.idmask) <> ''",
    `r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "r.id_award IS NOT NULL",
    "r.id_award <> 0",
    "r.value IS NOT NULL",
    "r.value > 0",
  ].join(" AND ");

  if (loginType) {
    let loginTypeCondition = `
      r.idmask IN (
        SELECT DISTINCT idmask
        FROM {db}.mc_logins
        WHERE type = %s`;
    params.push(loginType);

    if (range) {
      loginTypeCondition += " AND date BETWEEN %s AND %s";
      params.push(range.from, range.to);
    }

    loginTypeCondition += ") ";
    conditions.push(loginTypeCondition.trim());
  }

  if (segment) {
    conditions.push("u.segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`u.${utCol} = %s`);
    params.push(userType);
  }

  if (range) {
    conditions.push("r.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  if (userId) {
    conditions.push("r.idmask = %s");
    params.push(userId);
  }

  if (userIp) {
    conditions.push("r.ip = %s");
    params.push(userIp);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const needsUserJoin = Boolean(segment || userType);
  const joinClause = needsUserJoin
    ? "LEFT JOIN {db}.mc_users u ON u.idmask = r.idmask"
    : "";

  const sql = `
    SELECT
      DATE_FORMAT(r.date, %s) AS activity_date,
      SUM(CASE WHEN ${validRedemptionCondition} THEN 1 ELSE 0 END) AS total_redemptions,
      COUNT(DISTINCT CASE WHEN ${validRedemptionCondition} THEN r.idmask ELSE NULL END) AS unique_redeemers,
      COALESCE(SUM(CASE WHEN ${validRedemptionCondition} THEN r.value ELSE 0 END), 0) AS redeemed_value,
      COUNT(*) AS total_attempts,
      COUNT(DISTINCT r.idmask) AS unique_attempt_users,
      SUM(CASE WHEN r.idmask IS NULL OR TRIM(r.idmask) = '' THEN 1 ELSE 0 END) AS missing_idmask_attempts
    FROM {db}.mc_redemptions r
    ${joinClause}
    ${whereClause}
    GROUP BY activity_date
    ORDER BY activity_date;
  `;

  return { sql, params };
};

const buildLoginTypeDistributionQuery = ({
  range,
  segment,
  userType,
  loginType,
  userId,
  userIp,
  userTypeColumn = "user_type",
}) => {
  const needsUserJoin = Boolean(segment || userType);
  const conditions = [
    `(l.idmask IS NULL OR l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
  ];
  const params = [];

  if (loginType) {
    conditions.push("l.type = %s");
    params.push(loginType);
  }

  if (segment) {
    conditions.push("u.segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`u.${utCol} = %s`);
    params.push(userType);
  }

  if (userId) {
    conditions.push("l.idmask = %s");
    params.push(userId);
  }

  if (userIp) {
    conditions.push("l.ip = %s");
    params.push(userIp);
  }

  if (range) {
    conditions.push("l.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = needsUserJoin
    ? "LEFT JOIN {db}.mc_users u ON u.idmask = l.idmask"
    : "";

  const sql = `
    SELECT
      COALESCE(CAST(l.type AS CHAR), 'Sin tipo') AS login_type,
      COUNT(*) AS total_logins
    FROM {db}.mc_logins l
    ${joinClause}
    ${whereClause}
    GROUP BY login_type
    ORDER BY total_logins DESC;
  `;

  return { sql, params };
};

const buildLoginHeatmapQuery = ({ range, segment, userType, loginType, userId, userIp, userTypeColumn = "user_type" }) => {
  const needsUserJoin = Boolean(segment || userType);
  const conditions = [
    `(l.idmask IS NULL OR l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL})`,
    "l.date IS NOT NULL",
    "l.date <> '0000-00-00 00:00:00'",
  ];
  const params = [];

  if (loginType) {
    conditions.push("l.type = %s");
    params.push(loginType);
  }

  if (segment) {
    conditions.push("u.segment = %s");
    params.push(segment);
  }

  if (userType) {
    const utCol = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(userTypeColumn) ? userTypeColumn : "user_type";
    conditions.push(`u.${utCol} = %s`);
    params.push(userType);
  }

  if (userId) {
    conditions.push("l.idmask = %s");
    params.push(userId);
  }

  if (userIp) {
    conditions.push("l.ip = %s");
    params.push(userIp);
  }

  if (range) {
    conditions.push("l.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = needsUserJoin
    ? "LEFT JOIN {db}.mc_users u ON u.idmask = l.idmask"
    : "";

  const sql = `
    SELECT
      FLOOR(HOUR(l.date) / 2) AS hour_bucket,
      DAYOFWEEK(l.date) AS day_of_week,
      COUNT(*) AS total_logins
    FROM {db}.mc_logins l
    ${joinClause}
    ${whereClause}
    GROUP BY hour_bucket, day_of_week
    ORDER BY day_of_week, hour_bucket;
  `;

  return { sql, params };
};

const collectLoginTypes = async (database) => {
  const sql = `
    SELECT DISTINCT type AS login_type
    FROM {db}.mc_logins
    WHERE type IS NOT NULL
    ORDER BY login_type
    LIMIT 20;
  `;
  const result = await runQuery(database, sql);
  return (result.rows || [])
    .map((row) => row.login_type)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value));
};

const collectSegments = async (database) => {
  const sql = `
    SELECT DISTINCT segment
    FROM {db}.mc_users
    WHERE segment IS NOT NULL
      AND segment <> ''
      AND (idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL})
    ORDER BY segment
    LIMIT 50;
  `;
  const result = await runQuery(database, sql);
  return (result.rows || [])
    .map((row) => row.segment)
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
};

const collectUserTypes = async (database, column = "user_type") => {
  const safeColumn = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column) ? column : "user_type";
  const sql = `
    SELECT DISTINCT ${safeColumn} AS user_type_value
    FROM {db}.mc_users
    WHERE ${safeColumn} IS NOT NULL
      AND ${safeColumn} <> ''
      AND (idmask IS NULL OR idmask NOT IN ${EXCLUDED_IDMASKS_SQL})
    ORDER BY ${safeColumn}
    LIMIT 50;
  `;
  try {
    const result = await runQuery(database, sql);
    return (result.rows || [])
      .map((row) => row.user_type_value)
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);
  } catch (error) {
    const message = error?.message || "";
    if (/Unknown column/i.test(message) || /1054/.test(message)) {
      console.warn(
        `[collectUserTypes] Columna ${safeColumn} no disponible en ${database}. Se omite filtro.`,
        message
      );
      return [];
    }
    throw error;
  }
};

const mergeSeriesRows = (aggregateMap, rows, keyMap) => {
  for (const row of rows || []) {
    const date = row.activity_date;
    if (!date) {
      continue;
    }

    const entry = aggregateMap.get(date) || {
      loginsCount: 0,
      uniqueLoginUsers: 0,
      redemptionsCount: 0,
      uniqueRedeemers: 0,
      redeemedValue: 0,
    };

    if (keyMap.loginsCount) {
      entry.loginsCount += Number(row[keyMap.loginsCount] ?? 0);
    }
    if (keyMap.uniqueLoginUsers) {
      entry.uniqueLoginUsers += Number(row[keyMap.uniqueLoginUsers] ?? 0);
    }
    if (keyMap.redemptionsCount) {
      entry.redemptionsCount += Number(row[keyMap.redemptionsCount] ?? 0);
    }
    if (keyMap.uniqueRedeemers) {
      entry.uniqueRedeemers += Number(row[keyMap.uniqueRedeemers] ?? 0);
    }
    if (keyMap.redeemedValue) {
      entry.redeemedValue += Number(row[keyMap.redeemedValue] ?? 0);
    }

    aggregateMap.set(date, entry);
  }
};

const computeMovingAverage = (points, sourceKey, targetKey, windowSize = MOVING_AVERAGE_WINDOW) => {
  const windowValues = [];
  let sum = 0;

  points.forEach((point) => {
    const value = Number(point[sourceKey] ?? 0);
    windowValues.push(value);
    sum += value;

    if (windowValues.length > windowSize) {
      sum -= windowValues.shift();
    }

    if (windowValues.length === windowSize) {
      point[targetKey] = Number((sum / windowSize).toFixed(2));
    } else {
      point[targetKey] = null;
    }
  });
};

const buildWeeklyLoginFunnelQuery = ({ range }) => {
  const conditions = [
    "l.idmask IS NOT NULL",
    `l.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "l.date IS NOT NULL",
  ];
  const params = [WEEK_DATE_FORMAT, WEEK_DATE_FORMAT];

  if (range) {
    conditions.push("l.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      DATE_FORMAT(DATE_SUB(l.date, INTERVAL WEEKDAY(l.date) DAY), %s) AS week_start,
      DATE_FORMAT(
        DATE_ADD(DATE_SUB(l.date, INTERVAL WEEKDAY(l.date) DAY), INTERVAL 6 DAY),
        %s
      ) AS week_end,
      COUNT(DISTINCT l.idmask) AS unique_users,
      COUNT(*) AS total_events
    FROM {db}.mc_logins l
    ${whereClause}
    GROUP BY week_start, week_end
    ORDER BY week_start ASC;
  `;

  return { sql, params };
};

const buildWeeklyAwardFunnelQuery = ({ range }) => {
  const conditions = [
    "al.idmask IS NOT NULL",
    `al.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "al.date IS NOT NULL",
  ];
  const params = [WEEK_DATE_FORMAT, WEEK_DATE_FORMAT];

  if (range) {
    conditions.push("al.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      DATE_FORMAT(DATE_SUB(al.date, INTERVAL WEEKDAY(al.date) DAY), %s) AS week_start,
      DATE_FORMAT(
        DATE_ADD(DATE_SUB(al.date, INTERVAL WEEKDAY(al.date) DAY), INTERVAL 6 DAY),
        %s
      ) AS week_end,
      COUNT(DISTINCT al.idmask) AS unique_users,
      COUNT(*) AS total_events
    FROM {db}.mc_awards_logs al
    ${whereClause}
    GROUP BY week_start, week_end
    ORDER BY week_start ASC;
  `;

  return { sql, params };
};

const buildWeeklyRedemptionFunnelQuery = ({ range }) => {
  const conditions = [
    "r.idmask IS NOT NULL",
    "TRIM(r.idmask) <> ''",
    `r.idmask NOT IN ${EXCLUDED_IDMASKS_SQL}`,
    "r.id_award IS NOT NULL",
    "r.id_award <> 0",
    "r.value IS NOT NULL",
    "r.value > 0",
    "r.date IS NOT NULL",
    "r.date <> '0000-00-00 00:00:00'",
  ];
  const params = [WEEK_DATE_FORMAT, WEEK_DATE_FORMAT];

  if (range) {
    conditions.push("r.date BETWEEN %s AND %s");
    params.push(range.from, range.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      DATE_FORMAT(DATE_SUB(r.date, INTERVAL WEEKDAY(r.date) DAY), %s) AS week_start,
      DATE_FORMAT(
        DATE_ADD(DATE_SUB(r.date, INTERVAL WEEKDAY(r.date) DAY), INTERVAL 6 DAY),
        %s
      ) AS week_end,
      COUNT(DISTINCT r.idmask) AS unique_users,
      COUNT(*) AS total_events
    FROM {db}.mc_redemptions r
    ${whereClause}
    GROUP BY week_start, week_end
    ORDER BY week_start ASC;
  `;

  return { sql, params };
};

const mergeFunnelStageRows = (aggregateMap, rows, stage) => {
  for (const row of rows || []) {
    const weekStart = row.week_start;
    if (!weekStart) {
      continue;
    }

    const existing = aggregateMap.get(weekStart) || {
      weekStart,
      weekEnd: row.week_end ?? null,
      loginUsers: 0,
      awardRequests: 0,
      redemptionUsers: 0,
      loginEvents: 0,
      awardEvents: 0,
      redemptionEvents: 0,
    };

    if (!existing.weekEnd && row.week_end) {
      existing.weekEnd = row.week_end;
    }

    const uniqueUsersRaw =
      row.unique_users ?? row.uniqueUsers ?? row.total_unique ?? row.users ?? 0;
    const totalEventsRaw =
      row.total_events ?? row.totalEvents ?? row.events ?? row.count ?? 0;

    const uniqueUsers = Number(uniqueUsersRaw) || 0;
    const totalEvents = Number(totalEventsRaw) || 0;

    if (stage === "login") {
      existing.loginUsers += uniqueUsers;
      existing.loginEvents += totalEvents;
    } else if (stage === "awards") {
      existing.awardRequests += uniqueUsers;
      existing.awardEvents += totalEvents;
    } else if (stage === "redemptions") {
      existing.redemptionUsers += uniqueUsers;
      existing.redemptionEvents += totalEvents;
    }

    aggregateMap.set(weekStart, existing);
  }
};

router.get("/:id/activity", async (req, res) => {
  const rawCampaignId = req.params.id;
  const range = parseDateRange(req.query);
  const loginType = normalizeSelectorValue(req.query.loginType);
  const segment = normalizeMultiSelectorValue(req.query.segment);
  const userType = normalizeSelectorValue(req.query.userType);
  const userId = normalizeSelectorValue(req.query.userId);
  const userIp = normalizeSelectorValue(req.query.userIp);
  const includeFilters = req.query.includeFilters !== "0";

  const allowedCampaigns = req.allowedCampaigns;
  const allowedIdsSet = req.allowedCampaignIdsSet;

  if (rawCampaignId !== "all" && !allowedIdsSet.has(rawCampaignId)) {
    return res
      .status(403)
      .json({ error: "No tienes acceso a esta campaña." });
  }

  const selectedCampaigns =
    rawCampaignId === "all"
      ? allowedCampaigns
      : (() => {
          const campaign = allowedCampaigns.find(
            ({ id }) => id === rawCampaignId
          );
          if (!campaign) {
            return null;
          }
          return [campaign];
        })();

  if (!selectedCampaigns) {
    return res.status(404).json({ error: "Campaña no encontrada" });
  }

  try {
    const aggregateMap = new Map();
    const loginTypeDistributionMap = new Map();
    const loginHeatmapMap = new Map();
    const totals = {
      logins: 0,
      redemptions: 0,
      redemptionAttempts: 0,
      redeemedValue: 0,
    };
    const loginTypesSet = new Set();
    const segmentsSet = new Set();
    const userTypesSet = new Set();
    const annotations = [];

    for (const campaign of selectedCampaigns) {
      const campaignUserTypeColumn = campaign.userTypeColumn || "user_type";
      const [
        loginSeriesQuery,
        redemptionSeriesQuery,
        loginTypeDistributionQuery,
        loginHeatmapQuery,
      ] = [
        buildLoginSeriesQuery({
          range,
          loginType,
          segment,
          userType,
          userId,
          userIp,
          userTypeColumn: campaignUserTypeColumn,
        }),
        buildRedemptionSeriesQuery({
          range,
          segment,
          userType,
          loginType,
          userId,
          userIp,
          userTypeColumn: campaignUserTypeColumn,
        }),
        buildLoginTypeDistributionQuery({
          range,
          segment,
          userType,
          loginType,
          userId,
          userIp,
          userTypeColumn: campaignUserTypeColumn,
        }),
        buildLoginHeatmapQuery({
          range,
          segment,
          userType,
          loginType,
          userId,
          userIp,
          userTypeColumn: campaignUserTypeColumn,
        }),
      ];

      const [
        loginSeries,
        redemptionSeries,
        loginTypeDistributionResult,
        loginHeatmapResult,
        campaignLoginTypes,
        campaignSegments,
        campaignUserTypes,
      ] = await Promise.all([
        runQuery(campaign.database, loginSeriesQuery.sql, loginSeriesQuery.params),
        runQuery(campaign.database, redemptionSeriesQuery.sql, redemptionSeriesQuery.params),
        runQuery(
          campaign.database,
          loginTypeDistributionQuery.sql,
          loginTypeDistributionQuery.params
        ),
        runQuery(campaign.database, loginHeatmapQuery.sql, loginHeatmapQuery.params),
        collectLoginTypes(campaign.database),
        includeFilters ? collectSegments(campaign.database) : Promise.resolve([]),
        includeFilters ? collectUserTypes(campaign.database, campaignUserTypeColumn) : Promise.resolve([]),
      ]);

      mergeSeriesRows(aggregateMap, loginSeries.rows, {
        loginsCount: "total_logins",
        uniqueLoginUsers: "unique_login_users",
      });

      mergeSeriesRows(aggregateMap, redemptionSeries.rows, {
        redemptionsCount: "total_redemptions",
        uniqueRedeemers: "unique_redeemers",
        redeemedValue: "redeemed_value",
        redemptionAttemptsCount: "total_attempts",
        uniqueAttemptRedeemers: "unique_attempt_users",
        missingIdmaskAttempts: "missing_idmask_attempts",
      });

      for (const row of loginTypeDistributionResult.rows || []) {
        const rawType = row.login_type;
        const typeLabel =
          rawType === null || rawType === undefined || rawType === ""
            ? "Sin tipo"
            : String(rawType);
        const count = Number(row.total_logins ?? 0);
        const current = loginTypeDistributionMap.get(typeLabel) ?? 0;
        loginTypeDistributionMap.set(typeLabel, current + count);
        loginTypesSet.add(typeLabel);
      }

      for (const row of loginHeatmapResult.rows || []) {
        const dayOfWeekRaw = row.day_of_week;
        const hourBucketRaw = row.hour_bucket;
        if (dayOfWeekRaw === null || dayOfWeekRaw === undefined) {
          continue;
        }
        if (hourBucketRaw === null || hourBucketRaw === undefined) {
          continue;
        }

        const dayOfWeek = Number(dayOfWeekRaw);
        const hourBucket = Number(hourBucketRaw);
        const count = Number(row.total_logins ?? 0);
        if (!Number.isFinite(dayOfWeek) || !Number.isFinite(hourBucket) || !Number.isFinite(count)) {
          continue;
        }

        const key = `${dayOfWeek}|${hourBucket}`;
        const existing = loginHeatmapMap.get(key);
        if (existing) {
          existing.logins += count;
        } else {
          loginHeatmapMap.set(key, {
            dayOfWeek,
            hourBucket,
            logins: count,
          });
        }
      }

      for (const type of campaignLoginTypes) {
        loginTypesSet.add(type);
      }
      for (const seg of campaignSegments) {
        segmentsSet.add(seg);
      }
      for (const userTypeValue of campaignUserTypes) {
        userTypesSet.add(userTypeValue);
      }

      if (Array.isArray(campaign.activityAnnotations)) {
        for (const annotation of campaign.activityAnnotations) {
          if (annotation && annotation.date && annotation.label) {
            annotations.push({
              campaignId: campaign.id,
              campaignName: campaign.name,
              date: annotation.date,
              label: annotation.label,
              description: annotation.description || null,
            });
          }
        }
      }
    }

    const dates = Array.from(aggregateMap.keys()).sort();
    const points = dates.map((date) => {
      const entry = aggregateMap.get(date);
      const loginsCount = entry?.loginsCount ?? 0;
      const redemptionsCount = entry?.redemptionsCount ?? 0;
      const redemptionAttemptsCount = entry?.redemptionAttemptsCount ?? 0;
      const redeemedValue = entry?.redeemedValue ?? 0;

      totals.logins += loginsCount;
      totals.redemptions += redemptionsCount;
      totals.redemptionAttempts += redemptionAttemptsCount;
      totals.redeemedValue += redeemedValue;

      const conversionRate =
        loginsCount > 0 ? Number(((redemptionsCount / loginsCount) * 100).toFixed(2)) : null;

      return {
        date,
        loginsCount,
        uniqueLoginUsers: entry?.uniqueLoginUsers ?? 0,
        redemptionsCount,
        redemptionAttemptsCount,
        uniqueRedeemers: entry?.uniqueRedeemers ?? 0,
        uniqueAttemptRedeemers: entry?.uniqueAttemptRedeemers ?? 0,
        missingIdmaskAttempts: entry?.missingIdmaskAttempts ?? 0,
        redeemedValue,
        conversionRate,
      };
    });

    computeMovingAverage(points, "loginsCount", "loginsAvg7");
    computeMovingAverage(points, "redemptionsCount", "redemptionsAvg7");

    const loginTypeBreakdown = Array.from(loginTypeDistributionMap.entries())
      .map(([type, logins]) => ({
        type,
        logins,
      }))
      .sort((a, b) => b.logins - a.logins);

    const loginHeatmap = Array.from(loginHeatmapMap.values()).sort((a, b) => {
      if (a.dayOfWeek === b.dayOfWeek) {
        return a.hourBucket - b.hourBucket;
      }
      return a.dayOfWeek - b.dayOfWeek;
    });

    const response = {
      scope: rawCampaignId === "all" ? "consolidated" : "campaign",
      campaigns: selectedCampaigns.map(({ id, name }) => ({ id, name })),
      filters: {
        loginTypes: Array.from(loginTypesSet)
          .sort()
          .map((value) => ({ value, label: value })),
        segments: Array.from(segmentsSet)
          .sort((a, b) => a.localeCompare(b))
          .map((value) => ({ value, label: value })),
        userTypes: Array.from(userTypesSet)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
          .map((value) => ({ value, label: value })),
      },
      points,
      totals: {
        logins: totals.logins,
        redemptions: totals.redemptions,
        redemptionAttempts: totals.redemptionAttempts,
        redeemedValue: totals.redeemedValue,
      },
      annotations,
      loginTypeBreakdown,
      loginHeatmap,
      sources: {
        logins: "mc_logins",
        redemptions: "mc_redemptions",
      },
      metadata: {
        movingAverageWindow: MOVING_AVERAGE_WINDOW,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("[activity] Error", error);
    respondPendingOr500(
      res,
      error,
      {
        points: [],
        totals: { totalLogins: 0, totalRedemptions: 0, totalRedeemedValue: 0 },
        loginTypeBreakdown: [],
        loginHeatmap: [],
        annotations: [],
        meta: { movingAverageWindow: MOVING_AVERAGE_WINDOW },
      },
      "No se pudo obtener la actividad temporal"
    );
  }
});

router.get("/:id/conversion-funnel", async (req, res) => {
  const rawCampaignId = req.params.id;
  const range = parseDateRange(req.query);
  const loginType = normalizeSelectorValue(req.query.loginType);
  const userId = normalizeSelectorValue(req.query.userId);
  const userIp = normalizeSelectorValue(req.query.userIp);
  const filters = { loginType, userId, userIp };

  const allowedCampaigns = req.allowedCampaigns;
  const allowedIdsSet = req.allowedCampaignIdsSet;

  if (rawCampaignId !== "all" && !allowedIdsSet.has(rawCampaignId)) {
    return res.status(403).json({ error: "No tienes acceso a esta campaña." });
  }

  const selectedCampaigns =
    rawCampaignId === "all"
      ? allowedCampaigns
      : (() => {
          const campaign = allowedCampaigns.find(({ id }) => id === rawCampaignId);
          if (!campaign) {
            return null;
          }
          return [campaign];
        })();

  if (!selectedCampaigns) {
    return res.status(404).json({ error: "Campaña no encontrada" });
  }

  try {
    const aggregateMap = new Map();
    const totals = {
      loginUsers: 0,
      awardRequests: 0,
      redemptionUsers: 0,
      loginEvents: 0,
      awardEvents: 0,
      redemptionEvents: 0,
    };

    for (const campaign of selectedCampaigns) {
      const loginQuery = buildWeeklyLoginFunnelQuery({ range });
      const awardsQuery = buildWeeklyAwardFunnelQuery({ range });
      const redemptionsQuery = buildWeeklyRedemptionFunnelQuery({ range });

      const loginDefinition = applyFiltersToSql({
        sql: loginQuery.sql,
        params: loginQuery.params,
        database: campaign.database,
        baseTable: "mc_logins",
        filters,
        range,
      });

      const awardsDefinition = applyFiltersToSql({
        sql: awardsQuery.sql,
        params: awardsQuery.params,
        database: campaign.database,
        baseTable: "mc_awards_logs",
        filters,
        range,
      });

      const redemptionsDefinition = applyFiltersToSql({
        sql: redemptionsQuery.sql,
        params: redemptionsQuery.params,
        database: campaign.database,
        baseTable: "mc_redemptions",
        filters,
        range,
      });

      const [loginResult, awardsResult, redemptionsResult] = await Promise.all([
        runQuery(campaign.database, loginDefinition.sql, loginDefinition.params),
        runQuery(campaign.database, awardsDefinition.sql, awardsDefinition.params),
        runQuery(campaign.database, redemptionsDefinition.sql, redemptionsDefinition.params),
      ]);

      mergeFunnelStageRows(aggregateMap, loginResult.rows, "login");
      mergeFunnelStageRows(aggregateMap, awardsResult.rows, "awards");
      mergeFunnelStageRows(aggregateMap, redemptionsResult.rows, "redemptions");
    }

    const weeks = Array.from(aggregateMap.keys()).sort();
    const series = weeks.map((weekStart) => {
      const entry = aggregateMap.get(weekStart);
      const loginUsers = entry?.loginUsers ?? 0;
      const awardRequests = entry?.awardRequests ?? 0;
      const redemptionUsers = entry?.redemptionUsers ?? 0;
      const loginEvents = entry?.loginEvents ?? 0;
      const awardEvents = entry?.awardEvents ?? 0;
      const redemptionEvents = entry?.redemptionEvents ?? 0;

      totals.loginUsers += loginUsers;
      totals.awardRequests += awardRequests;
      totals.redemptionUsers += redemptionUsers;
      totals.loginEvents += loginEvents;
      totals.awardEvents += awardEvents;
      totals.redemptionEvents += redemptionEvents;

      const requestRate =
        loginUsers > 0 ? Number((awardRequests / loginUsers).toFixed(4)) : null;
      const approvalRate =
        awardRequests > 0 ? Number((redemptionUsers / awardRequests).toFixed(4)) : null;
      const conversionRate =
        loginUsers > 0 ? Number((redemptionUsers / loginUsers).toFixed(4)) : null;

      return {
        weekStart,
        weekEnd: entry?.weekEnd ?? null,
        loginUsers,
        awardRequests,
        redemptionUsers,
        loginEvents,
        awardEvents,
        redemptionEvents,
        requestRate,
        approvalRate,
        conversionRate,
      };
    });

    const response = {
      scope: rawCampaignId === "all" ? "consolidated" : "campaign",
      campaigns: selectedCampaigns.map(({ id, name }) => ({ id, name })),
      series,
      totals,
      metadata: {
        appliedFilters: {
          dateRange: range
            ? { from: range.from.slice(0, 10), to: range.to.slice(0, 10) }
            : null,
          loginType: loginType ?? null,
          userId: userId ?? null,
          userIp: userIp ?? null,
        },
        sources: {
          logins: "mc_logins",
          awards: "mc_awards_logs",
          redemptions: "mc_redemptions",
        },
      },
    };

    res.json(response);
  } catch (error) {
    console.error("[conversion-funnel] Error", error);
    res.status(500).json({
      error: "No se pudo obtener el funnel de conversión",
      detail: error.message,
    });
  }
});

router.get("/:id/login-security", async (req, res) => {
  const campaign = req.allowedCampaigns.find(
    ({ id }) => id === req.params.id
  );
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign
        ? "No tienes acceso a esta campaña."
        : "Campaña no encontrada",
    });
  }

  const range = parseDateRange(req.query);
  const loginType = normalizeSelectorValue(req.query.loginType);
  const userId = normalizeSelectorValue(req.query.userId);
  const userIp = normalizeSelectorValue(req.query.userIp);
  const segment = normalizeMultiSelectorValue(req.query.segment);
  const userType = normalizeSelectorValue(req.query.userType);
  const userTypeColumn = campaign.userTypeColumn || "user_type";
  const filters = { loginType, userId, userIp, segment, userType, userTypeColumn };

  try {
    const metadataNotes = [];
    const loginsByIpQuery = buildLoginsByIpQuery({ range });
    const loginsByIpFinal = applyFiltersToSql({
      sql: loginsByIpQuery.sql,
      params: loginsByIpQuery.params,
      database: campaign.database,
      baseTable: "mc_logins",
      filters,
      range,
    });

    const redemptionsByIpQuery = buildRedemptionsByIpQuery({ range });
    const redemptionsByIpFinal = applyFiltersToSql({
      sql: redemptionsByIpQuery.sql,
      params: redemptionsByIpQuery.params,
      database: campaign.database,
      baseTable: "mc_redemptions",
      filters,
      range,
    });

    const loginsDetailQuery = buildLoginsByIpAndIdmaskQuery({ range });
    const loginsDetailFinal = applyFiltersToSql({
      sql: loginsDetailQuery.sql,
      params: loginsDetailQuery.params,
      database: campaign.database,
      baseTable: "mc_logins",
      filters,
      range,
    });

    const redemptionsDetailQuery = buildRedemptionsByIpAndIdmaskQuery({ range });
    const redemptionsDetailFinal = applyFiltersToSql({
      sql: redemptionsDetailQuery.sql,
      params: redemptionsDetailQuery.params,
      database: campaign.database,
      baseTable: "mc_redemptions",
      filters,
      range,
    });

    const executeWithDiagnostics = async (label, definition) => {
      try {
        return await runQuery(campaign.database, definition.sql, definition.params);
      } catch (error) {
        console.error("[login-security] Query failed", {
          campaign: campaign.id,
          query: label,
          sql: definition.sql,
          params: definition.params,
          error: error?.message,
        });
        const message = error?.message || "Error desconocido";
        metadataNotes.push(`Consulta ${label} omitida: ${message}.`);
        return { rows: [], rowCount: 0 };
      }
    };

    const [hasLoginIpColumn, hasRedemptionIpColumn, hasTwoFactorTable] = await Promise.all([
      hasColumn(campaign.database, "mc_logins", "ip"),
      hasColumn(campaign.database, "mc_redemptions", "ip"),
      hasColumn(campaign.database, "mc_two_step_auths", "idmask"),
    ]);

    if (!hasLoginIpColumn && !hasRedemptionIpColumn) {
      metadataNotes.push(
        "La campaña seleccionada no almacena IP en mc_logins ni mc_redemptions."
      );
      return res.json({
        campaign: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
        },
        topLoginIps: [],
        topRedemptionIps: [],
        loginIpDetails: [],
        atypicalIps: [],
        twoFactorAdoption: null,
        metadata: {
          generatedAt: new Date().toISOString(),
          filters: {
            loginType: loginType ?? null,
            userId: userId ?? null,
            userIp: userIp ?? null,
            dateRange: range
              ? {
                  from: range.from,
                  to: range.to,
                }
              : null,
          },
          sources: {
            logins: "mc_logins",
            redemptions: "mc_redemptions",
          },
          notes: [...metadataNotes],
        },
      });
    }

    const loginsByIpResult = hasLoginIpColumn
      ? await executeWithDiagnostics("loginsByIp", loginsByIpFinal)
      : { rows: [], rowCount: 0 };
    const redemptionsByIpResult = hasRedemptionIpColumn
      ? await executeWithDiagnostics("redemptionsByIp", redemptionsByIpFinal)
      : { rows: [], rowCount: 0 };
    const loginsDetailResult = hasLoginIpColumn
      ? await executeWithDiagnostics("loginsByIpAndIdmask", loginsDetailFinal)
      : { rows: [], rowCount: 0 };
    const redemptionsDetailResult = hasRedemptionIpColumn
      ? await executeWithDiagnostics("redemptionsByIpAndIdmask", redemptionsDetailFinal)
      : { rows: [], rowCount: 0 };

    let twoFactorAdoption = null;
    let twoFactorRows = 0;

    if (hasTwoFactorTable) {
      const twoFactorBaseQuery = buildTwoFactorAdoptionBaseQuery();
      const {
        sql: twoFactorWithRangeSql,
        params: twoFactorWithRangeParams,
      } = appendDateFilter(
        twoFactorBaseQuery.sql,
        "l.date",
        range?.from,
        range?.to
      );

      const {
        sql: twoFactorFilteredSql,
        params: twoFactorFilteredParams,
      } = applyFiltersToSql({
        sql: twoFactorWithRangeSql,
        params: twoFactorWithRangeParams,
        database: campaign.database,
        baseTable: "mc_logins",
        filters,
        range,
      });

      const sanitizedTwoFactorBaseSql = twoFactorFilteredSql
        .trim()
        .replace(/;\s*$/, "");

      const twoFactorFinalSql = `
        SELECT
          summary.week_start,
          MIN(summary.week_end) AS week_end,
          summary.segment_label,
          SUM(summary.has_two_factor) AS users_with_two_factor,
          COUNT(*) AS total_users
        FROM (
          SELECT
            DATE_FORMAT(
              DATE_SUB(base.login_date, INTERVAL WEEKDAY(base.login_date) DAY),
              '%Y-%m-%d'
            ) AS week_start,
            DATE_FORMAT(
              DATE_ADD(
                DATE_SUB(base.login_date, INTERVAL WEEKDAY(base.login_date) DAY),
                INTERVAL 6 DAY
              ),
              '%Y-%m-%d'
            ) AS week_end,
            base.segment_label,
            base.idmask,
            CASE WHEN MAX(base.has_two_factor) > 0 THEN 1 ELSE 0 END AS has_two_factor
          FROM (
            ${sanitizedTwoFactorBaseSql}
          ) AS base
          WHERE base.login_date IS NOT NULL
          GROUP BY week_start, week_end, base.segment_label, base.idmask
        ) AS summary
        GROUP BY summary.week_start, summary.segment_label
        ORDER BY summary.week_start DESC, summary.segment_label
        LIMIT 240;
      `;

      const twoFactorResult = await executeWithDiagnostics("twoFactorAdoption", {
        sql: twoFactorFinalSql,
        params: twoFactorFilteredParams,
      });

      twoFactorRows = twoFactorResult.rowCount ?? 0;

      const rows = twoFactorResult.rows || [];
      if (rows.length === 0) {
        metadataNotes.push(
          "No se encontraron registros suficientes para calcular la adopción de 2FA con los filtros seleccionados."
        );
      } else {
        const entries = [];
        const weekEndMap = new Map();

        rows.forEach((row) => {
          const weekStart =
            typeof row.week_start === "string" ? row.week_start : null;
          if (!weekStart) {
            return;
          }
          const weekEnd =
            typeof row.week_end === "string" ? row.week_end : null;
          const segmentRaw =
            typeof row.segment_label === "string" ? row.segment_label.trim() : "";
          const segment = segmentRaw || "Sin segmento";
          const usersWithTwoFactor = toNumber(row.users_with_two_factor);
          const totalUsers = toNumber(row.total_users);
          if (totalUsers <= 0) {
            return;
          }
          const adoptionRate = clampRatio(
            totalUsers > 0 ? usersWithTwoFactor / totalUsers : 0
          );
          entries.push({
            weekStart,
            weekEnd,
            segment,
            usersWithTwoFactor,
            totalUsers,
            adoptionRate,
          });
          if (weekEnd && !weekEndMap.has(weekStart)) {
            weekEndMap.set(weekStart, weekEnd);
          }
        });

        if (entries.length > 0) {
          const weeksDesc = [];
          const weekSet = new Set();
          entries.forEach((entry) => {
            if (!weekSet.has(entry.weekStart)) {
              weekSet.add(entry.weekStart);
              weeksDesc.push(entry.weekStart);
            }
          });
          const limitedWeeks = weeksDesc.slice(0, MAX_TWO_FACTOR_WEEKS);
          const limitedWeeksSet = new Set(limitedWeeks);
          const filteredEntries = entries.filter((entry) =>
            limitedWeeksSet.has(entry.weekStart)
          );
          const segmentSet = new Set();
          filteredEntries.forEach((entry) => {
            segmentSet.add(entry.segment);
          });

          const totals = filteredEntries.reduce(
            (acc, entry) => {
              acc.totalUsers += entry.totalUsers;
              acc.usersWithTwoFactor += entry.usersWithTwoFactor;
              return acc;
            },
            { totalUsers: 0, usersWithTwoFactor: 0 }
          );

          const overallRate =
            totals.totalUsers > 0
              ? clampRatio(totals.usersWithTwoFactor / totals.totalUsers)
              : null;

          const weeksAsc = [...limitedWeeks].reverse();
          const segments = [...segmentSet].sort((a, b) =>
            a.localeCompare(b, "es", { sensitivity: "base" })
          );

          twoFactorAdoption = {
            weeks: weeksAsc.map((start) => ({
              start,
              end: weekEndMap.get(start) || null,
            })),
            segments,
            entries: filteredEntries,
            targetRate: DEFAULT_TWO_FACTOR_TARGET,
            totals: {
              totalUsers: totals.totalUsers,
              usersWithTwoFactor: totals.usersWithTwoFactor,
              overallRate,
            },
          };
          metadataNotes.push(
            `Meta de adopción 2FA usada para el heatmap: ${(DEFAULT_TWO_FACTOR_TARGET * 100).toFixed(
              0
            )}%.`
          );
        } else {
          metadataNotes.push(
            "No se encontraron usuarios con fecha de login válida para construir el heatmap de 2FA."
          );
        }
      }
    } else {
      metadataNotes.push(
        "La campaña no cuenta con la tabla mc_two_step_auths para medir la adopción de 2FA."
      );
    }

    const debugCounters = {
      loginsByIpRows: loginsByIpResult.rowCount ?? 0,
      redemptionsByIpRows: redemptionsByIpResult.rowCount ?? 0,
      loginDetailsRows: loginsDetailResult.rowCount ?? 0,
      redemptionDetailsRows: redemptionsDetailResult.rowCount ?? 0,
      twoFactorRows,
    };

    if (!hasLoginIpColumn) {
      metadataNotes.push("mc_logins no almacena dirección IP en esta campaña.");
    }
    if (!hasRedemptionIpColumn) {
      metadataNotes.push("mc_redemptions no almacena dirección IP en esta campaña.");
    }

    const loginIpMap = new Map();
    const redemptionIpMap = new Map();
    let totalLoginEvents = 0;
    let totalRedemptionEvents = 0;

    for (const row of loginsByIpResult.rows || []) {
      const ipLabelRaw = typeof row.ip_label === "string" ? row.ip_label.trim() : "";
      const ip = ipLabelRaw || "Sin IP";
      const totalLogins = toNumber(row.total_logins);
      totalLoginEvents += totalLogins;
      loginIpMap.set(ip, {
        ip,
        totalLogins,
        uniqueUsers: toNumber(row.unique_users),
        activeDays: toNumber(row.active_days),
        firstLoginAt: row.first_login_at || null,
        lastLoginAt: row.last_login_at || null,
      });
    }

    // Ensure we have login aggregates for IPs with high redemption-attempt volume,
    // even if they are not in the top login IPs list (loginsByIpQuery is limited).
    if (hasLoginIpColumn) {
      const redemptionIps = (redemptionsByIpResult.rows || [])
        .map((row) => {
          const raw = typeof row.ip_label === "string" ? row.ip_label.trim() : "";
          return raw || "Sin IP";
        })
        .filter((value) => value !== "Sin IP");

      const uniqueRedemptionIps = Array.from(new Set(redemptionIps));
      const missingIps = uniqueRedemptionIps.filter((ip) => !loginIpMap.has(ip));

      if (missingIps.length > 0) {
        const selectedIpsQuery = buildLoginsBySelectedIpsQuery({ range, ips: missingIps });
        if (selectedIpsQuery) {
          const { sql: extraSql, params: extraParams } = applyFiltersToSql({
            sql: selectedIpsQuery.sql,
            params: selectedIpsQuery.params,
            database: campaign.database,
            baseTable: "mc_logins",
            // Avoid re-applying userIp since we already constrain by IN (...).
            filters: { loginType, userId, userIp: null },
            range,
          });

          const extraResult = await executeWithDiagnostics("loginsBySelectedIps", {
            sql: extraSql,
            params: extraParams,
          });

          debugCounters.extraLoginIpsRequested = missingIps.length;
          debugCounters.extraLoginIpsResolved = extraResult.rowCount ?? 0;

          for (const row of extraResult.rows || []) {
            const ipLabelRaw =
              typeof row.ip_label === "string" ? row.ip_label.trim() : "";
            const ip = ipLabelRaw || "Sin IP";
            if (ip === "Sin IP") {
              continue;
            }
            if (loginIpMap.has(ip)) {
              continue;
            }
            loginIpMap.set(ip, {
              ip,
              totalLogins: toNumber(row.total_logins),
              uniqueUsers: toNumber(row.unique_users),
              activeDays: toNumber(row.active_days),
              firstLoginAt: row.first_login_at || null,
              lastLoginAt: row.last_login_at || null,
            });
          }
        }
      }
    }

    for (const row of redemptionsByIpResult.rows || []) {
      const ipLabelRaw = typeof row.ip_label === "string" ? row.ip_label.trim() : "";
      const ip = ipLabelRaw || "Sin IP";
      const redemptionAttempts = toNumber(row.total_redemptions);
      totalRedemptionEvents += redemptionAttempts;
      redemptionIpMap.set(ip, {
        ip,
        redemptionAttempts,
        uniqueAttemptRedeemers: toNumber(row.unique_redeemers),
        validRedemptions: toNumber(row.valid_redemptions),
        validUniqueRedeemers: toNumber(row.valid_unique_redeemers),
        missingIdmaskAttempts: toNumber(row.missing_idmask),
        firstRedemptionAt: row.first_redemption_at || null,
        lastRedemptionAt: row.last_redemption_at || null,
        redeemedValue: toNumber(row.redeemed_value),
      });
    }

    const detailMap = new Map();
    const normalizeIpLabel = (value) => {
      if (!value) {
        return "Sin IP";
      }
      const trimmed = String(value).trim();
      return trimmed.length > 0 ? trimmed : "Sin IP";
    };

    const makeKey = (ip, idmask) => `${normalizeIpLabel(ip)}__${idmask ?? "sin_idmask"}`;

    for (const row of loginsDetailResult.rows || []) {
      const ip = normalizeIpLabel(row.ip);
      const idmask = row.idmask || null;
      const key = makeKey(ip, idmask);
      const loginCount = toNumber(row.login_count);
      detailMap.set(key, {
        key,
        ip,
        idmask,
        loginCount,
        activeDays: toNumber(row.active_days),
        firstLoginAt: row.first_login_at || null,
        lastLoginAt: row.last_login_at || null,
        redemptionAttempts: 0,
        validRedemptions: 0,
        redeemedValue: 0,
        firstRedemptionAt: null,
        lastRedemptionAt: null,
      });
    }

    for (const row of redemptionsDetailResult.rows || []) {
      const ip = normalizeIpLabel(row.ip);
      const idmask = row.idmask || null;
      const key = makeKey(ip, idmask);
      const existing = detailMap.get(key);

      if (existing) {
        existing.redemptionAttempts = toNumber(row.redemption_attempts);
        existing.validRedemptions = toNumber(row.valid_redemptions);
        existing.redeemedValue = toNumber(row.redeemed_value);
        existing.firstRedemptionAt = row.first_redemption_at || existing.firstRedemptionAt;
        existing.lastRedemptionAt = row.last_redemption_at || existing.lastRedemptionAt;
      } else {
        detailMap.set(key, {
          key,
          ip,
          idmask,
          loginCount: 0,
          activeDays: 0,
          firstLoginAt: null,
          lastLoginAt: null,
          redemptionAttempts: toNumber(row.redemption_attempts),
          validRedemptions: toNumber(row.valid_redemptions),
          redeemedValue: toNumber(row.redeemed_value),
          firstRedemptionAt: row.first_redemption_at || null,
          lastRedemptionAt: row.last_redemption_at || null,
        });
      }
    }

    const detailEntries = Array.from(detailMap.values()).map((entry) => {
      const conversionRate =
        entry.loginCount > 0
          ? entry.redemptionAttempts / entry.loginCount
          : null;
      const redemptionsPerActiveDay =
        entry.activeDays > 0
          ? entry.redemptionAttempts / entry.activeDays
          : null;
      return {
        ...entry,
        conversionRate,
        redemptionsPerActiveDay,
      };
    });

    const loginIpDetails = detailEntries
      .slice()
      .sort((a, b) => {
        if (b.loginCount !== a.loginCount) {
          return b.loginCount - a.loginCount;
        }
        return b.redemptionAttempts - a.redemptionAttempts;
      })
      .slice(0, 200);

    const detailsByIp = new Map();
    detailEntries.forEach((entry) => {
      const list = detailsByIp.get(normalizeIpLabel(entry.ip)) || [];
      list.push(entry);
      detailsByIp.set(normalizeIpLabel(entry.ip), list);
    });

    const topLoginIps = (loginsByIpResult.rows || []).slice(0, 15).map((row) => {
      const totalLogins = toNumber(row.total_logins);
      return {
        ip: normalizeIpLabel(row.ip_label),
        totalLogins,
        uniqueUsers: toNumber(row.unique_users),
        activeDays: toNumber(row.active_days),
        firstLoginAt: row.first_login_at || null,
        lastLoginAt: row.last_login_at || null,
        share: totalLoginEvents > 0 ? totalLogins / totalLoginEvents : 0,
      };
    });

    const topRedemptionIps = (redemptionsByIpResult.rows || [])
      .slice(0, 15)
      .map((row) => {
        const redemptionAttempts = toNumber(row.total_redemptions);
        return {
          ip: normalizeIpLabel(row.ip_label),
          redemptionAttempts,
          uniqueAttemptRedeemers: toNumber(row.unique_redeemers),
          validRedemptions: toNumber(row.valid_redemptions),
          uniqueRedeemers: toNumber(row.valid_unique_redeemers),
          missingIdmaskAttempts: toNumber(row.missing_idmask),
          redeemedValue: toNumber(row.redeemed_value),
          firstRedemptionAt: row.first_redemption_at || null,
          lastRedemptionAt: row.last_redemption_at || null,
          share: totalRedemptionEvents > 0 ? redemptionAttempts / totalRedemptionEvents : 0,
        };
      });

    const atypicalIps = [];
    const ipSet = new Set([
      ...loginIpMap.keys(),
      ...redemptionIpMap.keys(),
    ]);

    ipSet.forEach((ip) => {
      const loginInfo =
        loginIpMap.get(ip) ||
        {
          totalLogins: 0,
          uniqueUsers: 0,
          activeDays: 0,
          firstLoginAt: null,
          lastLoginAt: null,
        };
      const redemptionInfo =
        redemptionIpMap.get(ip) ||
        {
          redemptionAttempts: 0,
          uniqueAttemptRedeemers: 0,
          validRedemptions: 0,
          validUniqueRedeemers: 0,
          missingIdmaskAttempts: 0,
          firstRedemptionAt: null,
          lastRedemptionAt: null,
          redeemedValue: 0,
        };
      const details = detailsByIp.get(ip) || [];
      const conversionRate =
        loginInfo.totalLogins > 0
          ? redemptionInfo.redemptionAttempts / loginInfo.totalLogins
          : 0;
      const dominantRedeemer = details.reduce(
        (max, entry) =>
          entry.redemptionAttempts > max ? entry.redemptionAttempts : max,
        0
      );
      const dominantShare =
        redemptionInfo.redemptionAttempts > 0
          ? dominantRedeemer / redemptionInfo.redemptionAttempts
          : 0;
      const redemptionSpanDays = diffInDays(
        parseDateTime(redemptionInfo.firstRedemptionAt),
        parseDateTime(redemptionInfo.lastRedemptionAt)
      );
      const loginSpanDays = diffInDays(
        parseDateTime(loginInfo.firstLoginAt),
        parseDateTime(loginInfo.lastLoginAt)
      );
      const redemptionsPerActiveDay =
        loginInfo.activeDays > 0
          ? redemptionInfo.redemptionAttempts / loginInfo.activeDays
          : null;

      const reasons = [];

      if (redemptionInfo.redemptionAttempts >= 12) {
        reasons.push("Volumen elevado de intentos de redención para la IP.");
      }
      if (redemptionInfo.redemptionAttempts >= 5 && dominantShare >= 0.7) {
        reasons.push("Intentos concentrados en un único idmask.");
      }
      if (
        redemptionInfo.redemptionAttempts >= 5 &&
        redemptionSpanDays !== null &&
        redemptionSpanDays <= 2
      ) {
        reasons.push("Múltiples intentos en una ventana temporal muy corta.");
      }
      if (
        loginInfo.totalLogins >= 10 &&
        redemptionInfo.redemptionAttempts >= 5 &&
        conversionRate >= 0.6
      ) {
        reasons.push("Conversión login→intento superior al 60%.");
      }
      if (
        loginInfo.uniqueUsers >= 5 &&
        redemptionInfo.uniqueAttemptRedeemers <= 2 &&
        redemptionInfo.redemptionAttempts >= 4
      ) {
        reasons.push("Muchos usuarios inician sesión pero pocos canjean.");
      }
      if (
        redemptionInfo.redemptionAttempts >= 4 &&
        redemptionsPerActiveDay !== null &&
        redemptionsPerActiveDay >= 2
      ) {
        reasons.push("Promedio de intentos de redención por día activo mayor o igual a 2.");
      }

      if (reasons.length === 0) {
        return;
      }

      let severity = "low";
      if (reasons.length >= 3) {
        severity = "high";
      } else if (reasons.length === 2) {
        severity = "medium";
      }

      const firstActivityAt = [loginInfo.firstLoginAt, redemptionInfo.firstRedemptionAt]
        .filter(Boolean)
        .sort()[0] || null;
      const lastActivityAt = [loginInfo.lastLoginAt, redemptionInfo.lastRedemptionAt]
        .filter(Boolean)
        .sort()
        .pop() || null;

      atypicalIps.push({
        ip,
        totalLogins: loginInfo.totalLogins,
        uniqueUsers: loginInfo.uniqueUsers,
        redemptionAttempts: redemptionInfo.redemptionAttempts,
        uniqueAttemptRedeemers: redemptionInfo.uniqueAttemptRedeemers,
        validRedemptions: redemptionInfo.validRedemptions,
        uniqueRedeemers: redemptionInfo.validUniqueRedeemers,
        missingIdmaskAttempts: redemptionInfo.missingIdmaskAttempts,
        conversionRate,
        dominantRedeemerShare: dominantShare,
        redemptionSpanDays,
        loginSpanDays,
        redemptionsPerActiveDay,
        redeemedValue: redemptionInfo.redeemedValue,
        firstActivityAt,
        lastActivityAt,
        reasons,
        severity,
      });
    });

    atypicalIps.sort((a, b) => {
      if (a.severity === b.severity) {
        return b.redemptionAttempts - a.redemptionAttempts;
      }
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
      },
      topLoginIps,
      topRedemptionIps,
      loginIpDetails,
      atypicalIps,
      twoFactorAdoption,
      metadata: {
        generatedAt: new Date().toISOString(),
        filters: {
          loginType: loginType ?? null,
          userId: userId ?? null,
          userIp: userIp ?? null,
          dateRange: range
            ? {
                from: range.from,
                to: range.to,
              }
            : null,
        },
        sources: {
          logins: "mc_logins",
          redemptions: "mc_redemptions",
        },
        notes: metadataNotes,
        debug: debugCounters,
      },
    });
  } catch (error) {
    console.error("[login-security] Error", error);
    respondPendingOr500(
      res,
      error,
      {
        topLoginIps: [],
        topRedemptionIps: [],
        loginIpDetails: [],
        atypicalIps: [],
        twoFactorAdoption: { entries: [], total: 0 },
        metadata: { generatedAt: new Date().toISOString() },
      },
      "No se pudo construir la vista de logins y seguridad"
    );
  }
});

router.get("/:id", (req, res) => {
  const campaign = req.allowedCampaigns.find(
    ({ id }) => id === req.params.id
  );
  if (!campaign) {
    const isKnownCampaign = Boolean(getCampaignById(req.params.id));
    return res.status(isKnownCampaign ? 403 : 404).json({
      error: isKnownCampaign
        ? "No tienes acceso a esta campaña."
        : "Campaña no encontrada",
    });
  }

  const { id, name, description, database } = campaign;
  res.json({ id, name, description, database });
});

// Endpoint de administración: lista todas las bases de datos dentsu_mastercard_* disponibles en Aurora
router.get("/admin/list-databases", async (req, res) => {
  try {
    const result = await runQuery(
      "information_schema",
      `SELECT SCHEMA_NAME FROM {db}.SCHEMATA
       WHERE SCHEMA_NAME LIKE 'dentsu_mastercard_%'
       ORDER BY SCHEMA_NAME;`,
      []
    );
    res.json({ databases: (result.rows || []).map((r) => r.SCHEMA_NAME) });
  } catch (error) {
    console.error("[admin/list-databases] Error", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
