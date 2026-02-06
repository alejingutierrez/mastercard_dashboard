import {
  Button,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FilterOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type {
  ActivityResponse,
  CampaignSummaryResponse,
  LoginSecurityAtypicalIp,
  LoginSecurityDetailRow,
  LoginSecurityResponse,
  LoginSecurityTopLoginIp,
  LoginSecurityTopRedemptionIp,
  Metric,
  RedemptionInsightsResponse,
  DashboardUser,
} from "../../types";

type LoginSecurityTopIp = LoginSecurityTopLoginIp | LoginSecurityTopRedemptionIp;

const { Text } = Typography;

export const ROLE_LABELS: Record<DashboardUser["role"], string> = {
  admin: "Administrador",
  viewer: "Analista",
};

export const SEVERITY_LABELS: Record<LoginSecurityAtypicalIp["severity"], string> = {
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

export const SEVERITY_COLORS: Record<LoginSecurityAtypicalIp["severity"], string> = {
  high: "red",
  medium: "orange",
  low: "gold",
};

export const MIN_PASSWORD_LENGTH = 8;

export type ActivityChartPoint = ActivityResponse["points"][number] & {
  day?: Date;
  dateLabel: string;
};

export type ActivityCumulativePoint = ActivityChartPoint & {
  cumulativeRedeemedValue: number;
};

export interface LoginTypeDistributionEntry {
  typeValue: string;
  typeLabel: string;
  logins: number;
}

export interface LoginHeatmapHeader {
  value: number;
  label: string;
  fullLabel: string;
}

export interface LoginHeatmapData {
  dayHeaders: LoginHeatmapHeader[];
  hourBuckets: number[];
  valueMap: Map<string, number>;
  maxValue: number;
  minValue: number;
}

export interface ActivityAxisExtents {
  logins: number;
  redemptions: number;
  cumulativeRedeemedValue: number;
}

export type TopIpEntry = LoginSecurityTopIp & {
  rank: number;
  ipLabel: string;
};

export interface MerchantPieDatum {
  merchant: string;
  redemptions: number;
  totalValue: number;
  isOther: boolean;
  color: string;
  percentage: number;
}

export interface RedemptionAmountChartDatum {
  amount: number;
  amountLabel: string;
  redemptions: number;
  totalValue: number;
  uniqueUsers: number;
}

export interface RedemptionHeatmapData {
  merchants: string[];
  amounts: number[];
  valueMap: Map<string, { redemptions: number; totalValue: number }>;
  maxValue: number;
  minPositiveValue: number;
}

export interface RedemptionTableRow {
  key: string;
  merchant: string;
  redemptions: number;
  totalValue: number;
  averageValue: number;
  uniqueUsers: number;
}

export const formatValue = (
  value: number | null | undefined,
  format: "number" | "currency" = "number",
): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }

  if (format === "currency") {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return new Intl.NumberFormat("es-ES").format(value);
};

export const formatNumber = (value: number | null | undefined): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }
  return new Intl.NumberFormat("es-ES").format(value);
};

export const formatPercentage = (
  value: number | null | undefined,
  digits = 1,
): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }
  return `${(value * 100).toFixed(digits)}%`;
};

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
};

const interpolateColor = (
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  t: number,
) => {
  const ratio = clamp01(t);
  const r = Math.round(from.r + (to.r - from.r) * ratio);
  const g = Math.round(from.g + (to.g - from.g) * ratio);
  const b = Math.round(from.b + (to.b - from.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
};

const computeHeatmapRatio = (
  value: number,
  maxValue: number,
  minValue: number,
) => {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue)) {
    return null;
  }
  const safeMin = Number.isFinite(minValue) ? minValue : 0;
  if (maxValue <= safeMin) {
    return value > 0 ? 1 : 0;
  }
  const ratio = (value - safeMin) / (maxValue - safeMin);
  return clamp01(ratio);
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return "N/D";
  }
  const explicit = dayjs(value, ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD"], true);
  if (explicit.isValid()) {
    return explicit.format(
      value.length <= 10 ? "DD/MM/YYYY" : "DD/MM/YYYY HH:mm",
    );
  }
  const fallback = dayjs(value);
  if (fallback.isValid()) {
    return fallback.format("DD/MM/YYYY HH:mm");
  }
  return value;
};

export const formatDays = (value: number | null | undefined): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }
  return `${value.toFixed(1)} días`;
};

export const buildMetricsByKey = (
  summary: CampaignSummaryResponse | null,
): Map<string, Metric> => {
  const entries = new Map<string, Metric>();
  (summary?.metrics ?? []).forEach((metric) => entries.set(metric.key, metric));
  return entries;
};

export const buildActivityDataset = (
  activity: ActivityResponse | null,
): ActivityChartPoint[] => {
  if (!activity?.points) {
    return [];
  }

  return activity.points.map((point) => {
    const parsedDate = dayjs(point.date, "YYYY-MM-DD");

    return {
      ...point,
      day: parsedDate.isValid() ? parsedDate.toDate() : undefined,
      dateLabel: parsedDate.isValid()
        ? parsedDate.format("DD/MM/YYYY")
        : String(point.date ?? ""),
    };
  });
};

export const buildActivityWithCumulative = (
  dataset: ActivityChartPoint[],
): ActivityCumulativePoint[] => {
  let cumulativeValue = 0;
  return dataset.map((point) => {
    const dailyValue =
      typeof point.redeemedValue === "number" ? point.redeemedValue : 0;
    cumulativeValue += dailyValue;
    return {
      ...point,
      cumulativeRedeemedValue: cumulativeValue,
    };
  });
};

export const calculateActivityAxisExtents = (
  dataset: ActivityChartPoint[],
): ActivityAxisExtents => {
  const padCount = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return 1;
    }
    return Math.max(Math.ceil(value * 1.1), 1);
  };

  const padCurrency = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return 1;
    }
    const padded = value * 1.1;
    const magnitude = 10 ** Math.max(Math.floor(Math.log10(padded)) - 1, 0);
    return Math.ceil(padded / magnitude) * magnitude;
  };

  let maxLogins = 0;
  let maxRedemptions = 0;
  let runningRedeemedValue = 0;
  let maxCumulativeRedeemedValue = 0;
  dataset.forEach((point) => {
    const loginsValue =
      typeof point.loginsCount === "number" ? point.loginsCount : 0;
    const redemptionsValue =
      typeof point.redemptionsCount === "number" ? point.redemptionsCount : 0;
    const redeemedValue =
      typeof point.redeemedValue === "number" ? point.redeemedValue : 0;
    if (loginsValue > maxLogins) {
      maxLogins = loginsValue;
    }
    if (redemptionsValue > maxRedemptions) {
      maxRedemptions = redemptionsValue;
    }
    runningRedeemedValue += redeemedValue;
    if (runningRedeemedValue > maxCumulativeRedeemedValue) {
      maxCumulativeRedeemedValue = runningRedeemedValue;
    }
  });

  return {
    logins: padCount(maxLogins),
    redemptions: padCount(maxRedemptions),
    cumulativeRedeemedValue: padCurrency(maxCumulativeRedeemedValue),
  };
};

export const buildLoginTypeLabelMap = (
  activity: ActivityResponse | null,
  baseOptions: { value: string; label: string }[],
): Map<string, string> => {
  const map = new Map<string, string>();
  baseOptions.forEach(({ value, label }) => {
    map.set(String(value), label);
  });
  (activity?.filters?.loginTypes ?? []).forEach(({ value, label }) => {
    if (value === undefined || value === null) {
      return;
    }
    const key = String(value);
    const cleanLabel = typeof label === "string" ? label.trim() : "";
    if (cleanLabel && cleanLabel !== key && !map.has(key)) {
      map.set(key, cleanLabel);
    }
  });
  map.set("", "Sin tipo");
  return map;
};

export const buildLoginTypeDistribution = (
  activity: ActivityResponse | null,
  labelMap: Map<string, string>,
): LoginTypeDistributionEntry[] => {
  const breakdown = activity?.loginTypeBreakdown ?? [];
  return breakdown.map((entry) => {
    const value =
      entry.type === null || entry.type === undefined
        ? ""
        : String(entry.type);
    const label =
      labelMap.get(value) ?? (value === "" ? "Sin tipo" : value);
    return {
      typeValue: value,
      typeLabel: label,
      logins: typeof entry.logins === "number" ? entry.logins : 0,
    };
  });
};

export const buildLoginHeatmapData = (
  activity: ActivityResponse | null,
): LoginHeatmapData => {
  const entries = activity?.loginHeatmap ?? [];

  if (!entries.length) {
    return {
      dayHeaders: [],
      hourBuckets: [],
      valueMap: new Map<string, number>(),
      maxValue: 0,
      minValue: 0,
    };
  }

  const valueMap = new Map<string, number>();
  let maxValue = 0;
  let minValue: number | null = null;
  const daySet = new Set<number>();

  for (const entry of entries) {
    const day = Number(entry.dayOfWeek ?? entry.day_of_week ?? 0);
    const hour = Number(entry.hourBucket ?? entry.hour_bucket ?? 0);
    const legacyEntry = entry as { count?: unknown; value?: unknown };
    const count = Number(
      entry.logins ?? legacyEntry.count ?? legacyEntry.value ?? 0,
    );
    if (Number.isFinite(day)) {
      daySet.add(day);
    }
    if (Number.isFinite(count)) {
      valueMap.set(`${day}|${hour}`, count);
      if (count > maxValue) {
        maxValue = count;
      }
      if (minValue === null || (count > 0 && count < minValue)) {
        minValue = count;
      }
    }
  }

  const dayHeaders: LoginHeatmapHeader[] = Array.from(daySet)
    .sort((a, b) => a - b)
    .map((day) => {
      const baseDate = dayjs().day(day);
      const labels = {
        label: baseDate.format("dd"),
        tooltip: baseDate.format("dddd"),
      };
      return {
        value: day,
        label: labels.label,
        fullLabel: labels.tooltip,
      };
    });

  if (dayHeaders.length === 0) {
    return {
      dayHeaders: [],
      hourBuckets: [],
      valueMap: new Map<string, number>(),
      maxValue: 0,
      minValue: 0,
    };
  }

  const hourBuckets = Array.from({ length: 12 }, (_, idx) => idx);

  return {
    dayHeaders,
    hourBuckets,
    valueMap,
    maxValue,
    minValue: minValue ?? 0,
  };
};

export const buildLoginSecurityTopIps = (
  entries: LoginSecurityTopIp[] | undefined | null,
): TopIpEntry[] => {
  if (!entries) {
    return [];
  }
  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    ipLabel: entry.ip ?? "Sin IP",
  }));
};

export const buildLoginSecurityDetailRows = (
  loginSecurity: LoginSecurityResponse | null,
): LoginSecurityDetailRow[] => loginSecurity?.loginIpDetails ?? [];

export const buildLoginSecurityAtypicalRows = (
  loginSecurity: LoginSecurityResponse | null,
): LoginSecurityAtypicalIp[] => loginSecurity?.atypicalIps ?? [];

export const buildRedemptionAmountChartData = (
  redemptionInsights: RedemptionInsightsResponse | null,
): RedemptionAmountChartDatum[] => {
  const entries = redemptionInsights?.amountDistribution ?? [];
  return entries
    .filter((entry) => entry.amount > 0 && entry.redemptions > 0)
    .map((entry) => ({
      amount: entry.amount,
      amountLabel: formatValue(entry.amount, "currency"),
      redemptions: entry.redemptions,
      totalValue: entry.totalValue,
      uniqueUsers: entry.uniqueUsers,
    }));
};

const REDEMPTION_PIE_COLORS = [
  "#eb001b",
  "#ff6f61",
  "#ffac33",
  "#4b99ff",
  "#18a999",
  "#9c27b0",
  "#f06292",
  "#ffd54f",
  "#64b5f6",
  "#6d4c41",
  "#607d8b",
];

export const buildMerchantPieData = (
  redemptionInsights: RedemptionInsightsResponse | null,
): MerchantPieDatum[] => {
  const slices = redemptionInsights?.merchantPie ?? [];
  const total = slices.reduce((acc, slice) => acc + slice.redemptions, 0);
  return slices.map((slice, index) => ({
    ...slice,
    color: REDEMPTION_PIE_COLORS[index % REDEMPTION_PIE_COLORS.length],
    percentage: total > 0 ? (slice.redemptions / total) * 100 : 0,
  }));
};

export const buildRedemptionHeatmapData = (
  redemptionInsights: RedemptionInsightsResponse | null,
): RedemptionHeatmapData => {
  const merchants = redemptionInsights?.heatmap?.merchants ?? [];
  const amounts = redemptionInsights?.heatmap?.amounts ?? [];
  const cells = redemptionInsights?.heatmap?.cells ?? [];
  const valueMap = new Map<string, { redemptions: number; totalValue: number }>();
  cells.forEach((cell) => {
    valueMap.set(`${cell.merchant}|${cell.amount}`, {
      redemptions: cell.redemptions,
      totalValue: cell.totalValue,
    });
  });

  const maxValue = redemptionInsights?.heatmap?.maxRedemptions ?? 0;
  const minPositive =
    redemptionInsights?.heatmap?.minPositiveRedemptions !== null &&
    redemptionInsights?.heatmap?.minPositiveRedemptions !== undefined
      ? redemptionInsights.heatmap.minPositiveRedemptions
      : 0;

  return {
    merchants,
    amounts,
    valueMap,
    maxValue,
    minPositiveValue:
      typeof minPositive === "number" && minPositive > 0 ? minPositive : 0,
  };
};

export const buildRedemptionTableData = (
  redemptionInsights: RedemptionInsightsResponse | null,
): RedemptionTableRow[] => {
  const rows = redemptionInsights?.merchantTotals ?? [];
  return rows.map((row) => {
    const averageValue = row.redemptions > 0 ? row.totalValue / row.redemptions : 0;
    return {
      key: row.merchant,
      merchant: row.merchant,
      redemptions: row.redemptions,
      uniqueUsers: row.uniqueUsers,
      totalValue: row.totalValue,
      averageValue,
    };
  });
};

export const buildUserTableData = (
  users: DashboardUser[],
): (DashboardUser & { key: string })[] =>
  users
    .slice()
    .sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === "admin" ? -1 : 1;
      }
      return a.email.localeCompare(b.email);
    })
    .map((user) => ({ ...user, key: user.id }));

interface LoginSecurityDetailColumnsOptions {
  onSelectIp?: (ip: string) => void;
  onSelectUserId?: (idmask: string) => void;
}

export const createLoginSecurityDetailColumns = (
  options: LoginSecurityDetailColumnsOptions = {},
): ColumnsType<LoginSecurityDetailRow> => [
  {
    title: "IP",
    dataIndex: "ip",
    key: "ip",
    render: (value: string | null) =>
      value ? (
        <Space size={6}>
          <Text code copyable={{ text: value }}>
            {value}
          </Text>
          {options.onSelectIp ? (
            <Tooltip title="Filtrar por esta IP">
              <Button
                type="text"
                size="small"
                className="table-cell-filter"
                icon={<FilterOutlined />}
                onClick={() => options.onSelectIp?.(value)}
              />
            </Tooltip>
          ) : null}
        </Space>
      ) : (
        <Text type="secondary">Sin IP</Text>
      ),
  },
  {
    title: "Idmask",
    dataIndex: "idmask",
    key: "idmask",
    render: (value: string | null) =>
      value ? (
        <Space size={6}>
          <Text copyable={{ text: value }}>{value}</Text>
          {options.onSelectUserId ? (
            <Tooltip title="Filtrar por este usuario">
              <Button
                type="text"
                size="small"
                className="table-cell-filter"
                icon={<FilterOutlined />}
                onClick={() => options.onSelectUserId?.(value)}
              />
            </Tooltip>
          ) : null}
        </Space>
      ) : (
        <Text type="secondary">Sin idmask</Text>
      ),
  },
  {
    title: "Logins",
    dataIndex: "loginCount",
    key: "loginCount",
    align: "right",
    render: (value: number) => formatNumber(value),
  },
  {
    title: "Intentos",
    dataIndex: "redemptionAttempts",
    key: "redemptionAttempts",
    align: "right",
    render: (value: number) => formatNumber(value),
  },
  {
    title: "Válidas",
    dataIndex: "validRedemptions",
    key: "validRedemptions",
    align: "right",
    render: (value: number) => formatNumber(value),
  },
  {
    title: "Intentos/Login",
    dataIndex: "conversionRate",
    key: "conversionRate",
    align: "right",
    render: (value: number | null) =>
      typeof value === "number" && Number.isFinite(value)
        ? formatPercentage(value)
        : "N/D",
  },
  {
    title: "Días activos",
    dataIndex: "activeDays",
    key: "activeDays",
    align: "right",
    render: (value: number) => formatNumber(value),
  },
  {
    title: "Valor redimido (válido)",
    dataIndex: "redeemedValue",
    key: "redeemedValue",
    align: "right",
    render: (value: number) => formatValue(value, "currency"),
  },
  {
    title: "Último login",
    dataIndex: "lastLoginAt",
    key: "lastLoginAt",
    render: (value: string | null) => formatDateTime(value),
  },
  {
    title: "Último intento",
    dataIndex: "lastRedemptionAt",
    key: "lastRedemptionAt",
    render: (value: string | null) => formatDateTime(value),
  },
];

interface LoginSecurityAtypicalColumnsOptions {
  onSelectIp?: (ip: string) => void;
}

export const createLoginSecurityAtypicalColumns = (
  options: LoginSecurityAtypicalColumnsOptions = {},
): ColumnsType<LoginSecurityAtypicalIp> => [
  {
    title: "Nivel",
    dataIndex: "severity",
    key: "severity",
    render: (value: LoginSecurityAtypicalIp["severity"]) => (
      <Tag color={SEVERITY_COLORS[value]}>{SEVERITY_LABELS[value]}</Tag>
    ),
  },
  {
    title: "IP",
    dataIndex: "ip",
    key: "ip",
    render: (value: string) => (
      <Space size={6}>
        <Text code copyable={{ text: value }}>
          {value}
        </Text>
        {options.onSelectIp ? (
          <Tooltip title="Filtrar por esta IP">
            <Button
              type="text"
              size="small"
              className="table-cell-filter"
              icon={<FilterOutlined />}
              onClick={() => options.onSelectIp?.(value)}
            />
          </Tooltip>
        ) : null}
      </Space>
    ),
  },
  {
    title: "Logins / usuarios",
    key: "logins",
    render: (_: unknown, record) => (
      <Space direction="vertical" size={0}>
        <Text strong>{formatNumber(record.totalLogins)}</Text>
        <Text type="secondary">
          Usuarios: {formatNumber(record.uniqueUsers)}
        </Text>
      </Space>
    ),
  },
  {
    title: "Intentos / usuarios",
    key: "redemptions",
    render: (_: unknown, record) => (
      <Space direction="vertical" size={0}>
        <Text strong>{formatNumber(record.redemptionAttempts)}</Text>
        <Text type="secondary">
          Usuarios: {formatNumber(record.uniqueAttemptRedeemers)}
        </Text>
        <Text type="secondary">
          Válidas: {formatNumber(record.validRedemptions)} · Valor:{" "}
          {formatValue(record.redeemedValue, "currency")}
        </Text>
      </Space>
    ),
  },
  {
    title: "Intentos/Login",
    dataIndex: "conversionRate",
    key: "conversionRate",
    align: "right",
    render: (value: number) => formatPercentage(value),
  },
  {
    title: "Intentos/día activo",
    dataIndex: "redemptionsPerActiveDay",
    key: "redemptionsPerActiveDay",
    align: "right",
    render: (value: number | null) =>
      typeof value === "number" && Number.isFinite(value)
        ? value.toFixed(2)
        : "N/D",
  },
  {
    title: "Ventana de actividad",
    key: "activityWindow",
    render: (_: unknown, record) => {
      const rangeLabel =
        record.firstActivityAt && record.lastActivityAt
          ? `${formatDateTime(record.firstActivityAt)} → ${formatDateTime(
              record.lastActivityAt,
            )}`
          : formatDateTime(record.firstActivityAt ?? record.lastActivityAt);

      return (
        <Space direction="vertical" size={0}>
          <Text>{rangeLabel}</Text>
          <Text type="secondary">
            Login: {formatDays(record.loginSpanDays)} · Intento: {formatDays(
              record.redemptionSpanDays,
            )}
          </Text>
        </Space>
      );
    },
  },
  {
    title: "Motivos detectados",
    dataIndex: "reasons",
    key: "reasons",
    render: (reasons: string[]) =>
      reasons.length > 0 ? (
        <Space size={[4, 4]} wrap>
          {reasons.map((reason) => (
            <Tag key={reason} color="magenta">
              {reason}
            </Tag>
          ))}
        </Space>
      ) : (
        <Text type="secondary">Sin patrones atípicos</Text>
      ),
  },
];

interface UserColumnsOptions {
  currentUserId: string;
  deletingUserId: string | null;
  totalCampaignCount: number;
  campaignNameMap: Map<string, string>;
  onEdit: (user: DashboardUser) => void;
  onDelete: (user: DashboardUser) => void;
}

export const createUserColumns = ({
  currentUserId,
  deletingUserId,
  totalCampaignCount,
  campaignNameMap,
  onEdit,
  onDelete,
}: UserColumnsOptions): ColumnsType<DashboardUser> => [
  {
    title: "Usuario",
    dataIndex: "name",
    key: "name",
    render: (_: string, record) => (
      <Space direction="vertical" size={0}>
        <Text strong>{record.name || record.email}</Text>
        <Text type="secondary">{record.email}</Text>
      </Space>
    ),
  },
  {
    title: "Rol",
    dataIndex: "role",
    key: "role",
    render: (value: DashboardUser["role"]) => ROLE_LABELS[value] || value,
  },
  {
    title: "Campañas",
    dataIndex: "allowedCampaignIds",
    key: "allowedCampaignIds",
    render: (_: unknown, record) => {
      const allowed = record.allowedCampaignIds ?? [];
      if (allowed.length === 0) {
        return <Tag color="volcano">Sin acceso</Tag>;
      }
      if (totalCampaignCount > 0 && allowed.length === totalCampaignCount) {
        return <Tag color="blue">Todas</Tag>;
      }
      return (
        <Space size={[4, 4]} wrap>
          {allowed.map((id) => (
            <Tag key={`${record.id}-${id}`}>
              {campaignNameMap.get(id) ?? id}
            </Tag>
          ))}
        </Space>
      );
    },
  },
  {
    title: "Estado",
    dataIndex: "status",
    key: "status",
    render: (value: string, record) => (
      <Space size={[4, 4]} wrap>
        {value === "active" ? (
          <Tag color="green">Activo</Tag>
        ) : (
          <Tag color="volcano">{value}</Tag>
        )}
        {record.mustResetPassword ? (
          <Tag color="gold">Cambio requerido</Tag>
        ) : null}
      </Space>
    ),
  },
  {
    title: "Creado",
    dataIndex: "createdAt",
    key: "createdAt",
    render: (value: string) => formatDateTime(value),
  },
  {
    title: "Acciones",
    key: "actions",
    render: (_: unknown, record) => (
      <Space>
        <Button
          icon={<EditOutlined />}
          size="small"
          onClick={() => onEdit(record)}
        >
          Editar
        </Button>
        {record.id === currentUserId ? (
          <Tooltip title="No puedes eliminar tu propia cuenta.">
            <Button danger icon={<DeleteOutlined />} size="small" disabled>
              Eliminar
            </Button>
          </Tooltip>
        ) : (
          <Popconfirm
            title="Eliminar usuario"
            description="Esta acción revocará el acceso al dashboard."
            okText="Sí, eliminar"
            cancelText="Cancelar"
            okButtonProps={{ loading: deletingUserId === record.id }}
            onConfirm={() => onDelete(record)}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
              loading={deletingUserId === record.id}
            >
              Eliminar
            </Button>
          </Popconfirm>
        )}
      </Space>
    ),
  },
];

export const createRedemptionTableColumns = (): ColumnsType<RedemptionTableRow> => [
  {
    title: "Comercio",
    dataIndex: "merchant",
    key: "merchant",
  },
  {
    title: "Redenciones",
    dataIndex: "redemptions",
    key: "redemptions",
    render: (value: number) => formatNumber(value),
  },
  {
    title: "Usuarios únicos",
    dataIndex: "uniqueUsers",
    key: "uniqueUsers",
    render: (value: number) => formatNumber(value),
  },
  {
    title: "Valor redimido",
    dataIndex: "totalValue",
    key: "totalValue",
    render: (value: number) => formatValue(value, "currency"),
  },
  {
    title: "Ticket promedio",
    dataIndex: "averageValue",
    key: "averageValue",
    render: (value: number) => formatValue(value, "currency"),
  },
];

export const getHeatmapColor = (
  value: number,
  maxValue: number,
  minValue: number,
): string => {
  const ratio = computeHeatmapRatio(value, maxValue, minValue);
  if (ratio === null) {
    return "#f5f5f5";
  }
  if (ratio === 0) {
    return "#ffffff";
  }
  const white = { r: 255, g: 255, b: 255 };
  const orange = { r: 247, g: 158, b: 27 };
  const red = { r: 235, g: 0, b: 27 };
  if (ratio <= 0.5) {
    return interpolateColor(white, orange, ratio / 0.5);
  }
  return interpolateColor(orange, red, (ratio - 0.5) / 0.5);
};

export const getHeatmapTextColor = (
  value: number,
  maxValue: number,
  minValue: number,
): string => {
  const ratio = computeHeatmapRatio(value, maxValue, minValue);
  if (ratio === null) {
    return "#666666";
  }
  if (ratio === 0) {
    return "#666666";
  }
  return ratio >= 0.75 ? "#ffffff" : "#111111";
};

export const formatHourLabel = (bucket: number): string => {
  if (!Number.isFinite(bucket)) {
    return "";
  }
  const startHour = Math.max(0, Math.floor(bucket) * 2);
  const endHour = Math.min(23, startHour + 1);
  const format = (value: number) => `${value.toString().padStart(2, "0")}:00`;
  const formatEnd = (value: number) => `${value.toString().padStart(2, "0")}:59`;
  return `${format(startHour)} - ${formatEnd(endHour)}`;
};
