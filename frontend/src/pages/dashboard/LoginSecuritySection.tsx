import { Fragment } from "react";
import {
  Alert,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ColumnsType } from "antd/es/table";
import type {
  LoginSecurityAtypicalIp,
  LoginSecurityDetailRow,
  LoginSecurityResponse,
} from "../../types";
import {
  formatDateTime,
  formatNumber,
  formatPercentage,
  formatValue,
  getHeatmapColor,
} from "./dataTransforms";
import type { TopIpEntry, TwoFactorHeatmapData } from "./dataTransforms";

const { Title, Text } = Typography;

interface LoginSecuritySectionProps {
  selectedCampaign?: string;
  loginSecurityError?: string;
  loading: boolean;
  loginSecurity: LoginSecurityResponse | null;
  notes: string[];
  debugInfo?: LoginSecurityResponse["metadata"]["debug"];
  topLoginData: TopIpEntry[];
  topRedemptionData: TopIpEntry[];
  detailColumns: ColumnsType<LoginSecurityDetailRow>;
  detailRows: LoginSecurityDetailRow[];
  atypicalColumns: ColumnsType<LoginSecurityAtypicalIp>;
  atypicalRows: LoginSecurityAtypicalIp[];
  twoFactorHeatmapData: TwoFactorHeatmapData;
}

const LoginSecuritySection = ({
  selectedCampaign,
  loginSecurityError,
  loading,
  loginSecurity,
  notes,
  debugInfo,
  topLoginData,
  topRedemptionData,
  detailColumns,
  detailRows,
  atypicalColumns,
  atypicalRows,
  twoFactorHeatmapData,
}: LoginSecuritySectionProps) => {
  if (selectedCampaign === "all") {
    return (
      <Card>
        <Empty description="Selecciona una campaña puntual para analizar logins y seguridad." />
      </Card>
    );
  }

  if (loginSecurityError) {
    return <Alert type="error" message={loginSecurityError} showIcon />;
  }

  const hasTopLoginIps = topLoginData.length > 0;
  const hasTopRedemptionIps = topRedemptionData.length > 0;
  const hasTwoFactorHeatmap =
    twoFactorHeatmapData.weeks.length > 0 &&
    twoFactorHeatmapData.segments.length > 0;

  return (
    <Spin spinning={loading}>
      {loginSecurity ? (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {(notes.length > 0 || debugInfo) && (
            <Alert
              type="info"
              showIcon
              message="Observaciones de la fuente"
              description={
                <Space direction="vertical" size="small">
                  {notes.map((note) => (
                    <Text key={note}>{note}</Text>
                  ))}
                  {debugInfo && (
                    <Text type="secondary">
                      Debug · loginsByIpRows: {formatNumber(debugInfo.loginsByIpRows)} ·
                      redemptionsByIpRows: {formatNumber(debugInfo.redemptionsByIpRows)} ·
                      loginDetailsRows: {formatNumber(debugInfo.loginDetailsRows)} ·
                      redemptionDetailsRows: {formatNumber(debugInfo.redemptionDetailsRows)}
                    </Text>
                  )}
                </Space>
              }
            />
          )}

          <Row gutter={[24, 32]} align="stretch">
            <Col xs={24} xl={12}>
              <Card className="activity-card">
                <div className="activity-heading">
                  <div className="activity-header">
                    <Title level={4} className="activity-title">
                      IPs con más logins
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Top 15 direcciones IP con mayor volumen de logins registrados en la campaña seleccionada.
                  </Text>
                </div>
                <div className="activity-body">
                  {hasTopLoginIps ? (
                    <div className="activity-chart activity-chart--wide">
                      <ResponsiveContainer width="100%" height={360}>
                        <ReBarChart
                          data={topLoginData}
                          layout="vertical"
                          margin={{ top: 16, right: 32, left: 32, bottom: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                          <XAxis
                            type="number"
                            tickFormatter={(value: number) => formatNumber(value)}
                          />
                          <YAxis
                            type="category"
                            dataKey="ipLabel"
                            width={180}
                            tick={{ fontSize: 12 }}
                          />
                          <RechartsTooltip
                            formatter={(rawValue: number | string) => {
                              const numeric =
                                typeof rawValue === "number" ? rawValue : Number(rawValue);
                              const safeValue = Number.isFinite(numeric) ? numeric : 0;
                              return [formatNumber(safeValue), "Logins"];
                            }}
                            labelFormatter={(label: string, payload) => {
                              const firstPayload = payload?.[0]?.payload ?? {};
                              const shareValue =
                                typeof firstPayload.share === "number"
                                  ? firstPayload.share
                                  : null;
                              const uniqueUsers =
                                typeof firstPayload.uniqueUsers === "number"
                                  ? firstPayload.uniqueUsers
                                  : 0;
                              const shareText =
                                shareValue !== null && shareValue > 0
                                  ? ` · ${formatPercentage(shareValue)}`
                                  : "";
                              return `${label}${shareText} · ${formatNumber(
                                uniqueUsers,
                              )} usuarios`;
                            }}
                          />
                          <Bar
                            dataKey="totalLogins"
                            name="Logins"
                            fill="#eb001b"
                            radius={[0, 8, 8, 0]}
                          />
                        </ReBarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="activity-empty">
                      <Empty description="No hay IPs con logins para mostrar." />
                    </div>
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card className="activity-card">
                <div className="activity-heading">
                  <div className="activity-header">
                    <Title level={4} className="activity-title">
                      IPs con más redenciones
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Top 15 direcciones IP con mayor cantidad de redenciones acumuladas.
                  </Text>
                </div>
                <div className="activity-body">
                  {hasTopRedemptionIps ? (
                    <div className="activity-chart activity-chart--wide">
                      <ResponsiveContainer width="100%" height={360}>
                        <ReBarChart
                          data={topRedemptionData}
                          layout="vertical"
                          margin={{ top: 16, right: 32, left: 32, bottom: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                          <XAxis
                            type="number"
                            tickFormatter={(value: number) => formatNumber(value)}
                          />
                          <YAxis
                            type="category"
                            dataKey="ipLabel"
                            width={180}
                            tick={{ fontSize: 12 }}
                          />
                          <RechartsTooltip
                            formatter={(rawValue: number | string) => {
                              const numeric =
                                typeof rawValue === "number" ? rawValue : Number(rawValue);
                              const safeValue = Number.isFinite(numeric) ? numeric : 0;
                              return [formatNumber(safeValue), "Redenciones"];
                            }}
                            labelFormatter={(label: string, payload) => {
                              const firstPayload = payload?.[0]?.payload ?? {};
                              const redeemedValue =
                                typeof firstPayload.redeemedValue === "number"
                                  ? firstPayload.redeemedValue
                                  : 0;
                              const uniqueRedeemers =
                                typeof firstPayload.uniqueRedeemers === "number"
                                  ? firstPayload.uniqueRedeemers
                                  : 0;
                              return `${label} · ${formatValue(
                                redeemedValue,
                                "currency",
                              )} · ${formatNumber(uniqueRedeemers)} usuarios`;
                            }}
                          />
                          <Bar
                            dataKey="totalRedemptions"
                            name="Redenciones"
                            fill="#f79e1b"
                            radius={[0, 8, 8, 0]}
                          />
                        </ReBarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="activity-empty">
                      <Empty description="No hay IPs con redenciones para mostrar." />
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          <Card className="activity-card">
            <div className="activity-heading">
              <div className="activity-header">
                <Title level={4} className="activity-title">
                  Logins por IP e idmask
                </Title>
                <div className="activity-separator" />
              </div>
              <Text type="secondary" className="activity-subtitle">
                Detalle de logins y redenciones por combinación IP · idmask respetando los filtros aplicados.
              </Text>
            </div>
            <div className="activity-body">
              <Table<LoginSecurityDetailRow>
                columns={detailColumns}
                dataSource={detailRows}
                rowKey="key"
                size="small"
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                scroll={{ x: 1200 }}
                locale={{
                  emptyText: (
                    <Empty description="No se encontraron combinaciones de IP e idmask para mostrar." />
                  ),
                }}
              />
            </div>
          </Card>

          <Card className="activity-card">
            <div className="activity-heading">
              <div className="activity-header">
                <Title level={4} className="activity-title">
                  IPs atípicas detectadas
                </Title>
                <div className="activity-separator" />
              </div>
              <Text type="secondary" className="activity-subtitle">
                Heurísticas de riesgo basadas en concentración de redenciones, rapidez de canje y conversión login→redención.
              </Text>
            </div>
            <div className="activity-body">
              <Table<LoginSecurityAtypicalIp>
                columns={atypicalColumns}
                dataSource={atypicalRows}
                rowKey="ip"
                size="small"
                pagination={{ pageSize: 8, hideOnSinglePage: true }}
                locale={{
                  emptyText: (
                    <Empty description="No se detectaron patrones atípicos con los filtros actuales." />
                  ),
                }}
              />
            </div>
          </Card>

          <Card className="activity-card">
            <div className="activity-heading">
              <div className="activity-header">
                <Title level={4} className="activity-title">
                  Adopción de doble factor
                </Title>
                <div className="activity-separator" />
              </div>
              <Text type="secondary" className="activity-subtitle">
                Evolución semanal de usuarios con autenticación de doble factor por segmento.
              </Text>
            </div>
            <div className="activity-body">
              {hasTwoFactorHeatmap ? (
                <div className="activity-chart activity-chart--heatmap">
                  <div
                    className="heatmap-grid"
                    style={{
                      gridTemplateColumns: `160px repeat(${twoFactorHeatmapData.weeks.length}, minmax(0, 1fr))`,
                    }}
                  >
                    <div className="heatmap-grid__corner">Segmento</div>
                    {twoFactorHeatmapData.weeks.map((week) => (
                      <Tooltip key={`twofactor-week-${week.value}`} title={week.tooltip}>
                        <div className="heatmap-grid__header">{week.label}</div>
                      </Tooltip>
                    ))}
                    {twoFactorHeatmapData.segments.map((segment) => (
                      <Fragment key={`twofactor-segment-${segment.value}`}>
                        <div className="heatmap-grid__row-label">{segment.label}</div>
                        {twoFactorHeatmapData.weeks.map((week) => {
                          const cellKey = `${segment.value}|${week.value}`;
                          const metrics =
                            twoFactorHeatmapData.valueMap.get(cellKey) ?? null;
                          const rate = metrics?.rate ?? 0;
                          const hasUsers =
                            metrics && metrics.totalUsers > 0 && metrics.usersWithTwoFactor > 0;
                          const background = getHeatmapColor(
                            rate,
                            twoFactorHeatmapData.maxRate,
                            twoFactorHeatmapData.minRate,
                          );
                          const percentageText = hasUsers
                            ? formatPercentage(rate)
                            : "";
                          return (
                            <Tooltip
                              key={`twofactor-cell-${cellKey}`}
                              title={`${segment.label} · ${week.tooltip}: ${percentageText} · ${formatNumber(
                                metrics?.usersWithTwoFactor ?? 0,
                              )}/${formatNumber(metrics?.totalUsers ?? 0)} usuarios con 2FA`}
                            >
                              <div
                                className="heatmap-grid__cell"
                                style={{
                                  backgroundColor: background,
                                  color: hasUsers ? (rate > 0.55 ? "#ffffff" : "#111111") : "#666666",
                                }}
                              >
                                {percentageText}
                              </div>
                            </Tooltip>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: 16,
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <Text type="secondary">
                      Usuarios analizados: {formatNumber(twoFactorHeatmapData.totals.totalUsers)} ·
                      Con 2FA: {formatNumber(twoFactorHeatmapData.totals.usersWithTwoFactor)}
                      {twoFactorHeatmapData.totals.overallRate !== null
                        ? ` · Adopción: ${formatPercentage(
                            twoFactorHeatmapData.totals.overallRate,
                          )}`
                        : ""}
                    </Text>
                    {typeof twoFactorHeatmapData.targetRate === "number" && (
                      <Tag color="blue">
                        Meta: {formatPercentage(twoFactorHeatmapData.targetRate, 0)}
                      </Tag>
                    )}
                  </div>
                </div>
              ) : (
                <div className="activity-empty">
                  <Empty description="No fue posible calcular la adopción de 2FA con los filtros actuales." />
                </div>
              )}
            </div>
          </Card>

          {loginSecurity.metadata && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Text type="secondary">
                Fuentes: {loginSecurity.metadata.sources.logins} · {loginSecurity.metadata.sources.redemptions}. Última generación: {" "}
                {formatDateTime(loginSecurity.metadata.generatedAt)}.
              </Text>
            </div>
          )}
        </Space>
      ) : (
        <Card>
          <Empty description="No hay datos de logins y seguridad para los filtros seleccionados." />
        </Card>
      )}
    </Spin>
  );
};

export default LoginSecuritySection;
