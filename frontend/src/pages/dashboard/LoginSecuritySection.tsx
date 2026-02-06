import {
  Alert,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Table,
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
} from "./dataTransforms";
import type { TopIpEntry } from "./dataTransforms";

const { Title, Text } = Typography;

interface LoginSecuritySectionProps {
  selectedCampaign?: string;
  loginSecurityError?: string;
  loading: boolean;
  loginSecurity: LoginSecurityResponse | null;
  topLoginData: TopIpEntry[];
  topRedemptionData: TopIpEntry[];
  detailColumns: ColumnsType<LoginSecurityDetailRow>;
  detailRows: LoginSecurityDetailRow[];
  atypicalColumns: ColumnsType<LoginSecurityAtypicalIp>;
  atypicalRows: LoginSecurityAtypicalIp[];
}

const LoginSecuritySection = ({
  selectedCampaign,
  loginSecurityError,
  loading,
  loginSecurity,
  topLoginData,
  topRedemptionData,
  detailColumns,
  detailRows,
  atypicalColumns,
  atypicalRows,
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
  return (
    <Spin spinning={loading}>
      {loginSecurity ? (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
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
                      IPs con más intentos de redención
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Top 15 direcciones IP con mayor cantidad de intentos de redención acumulados (incluye intentos fallidos).
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
                              return [formatNumber(safeValue), "Intentos"];
                            }}
                            labelFormatter={(label: string, payload) => {
                              const firstPayload = payload?.[0]?.payload ?? {};
                              const redemptionAttempts =
                                typeof firstPayload.redemptionAttempts === "number"
                                  ? firstPayload.redemptionAttempts
                                  : 0;
                              const uniqueAttemptRedeemers =
                                typeof firstPayload.uniqueAttemptRedeemers === "number"
                                  ? firstPayload.uniqueAttemptRedeemers
                                  : 0;
                              const validRedemptions =
                                typeof firstPayload.validRedemptions === "number"
                                  ? firstPayload.validRedemptions
                                  : 0;
                              const redeemedValue =
                                typeof firstPayload.redeemedValue === "number"
                                  ? firstPayload.redeemedValue
                                  : 0;
                              const uniqueRedeemers =
                                typeof firstPayload.uniqueRedeemers === "number"
                                  ? firstPayload.uniqueRedeemers
                                  : 0;
                              return `${label} · Intentos: ${formatNumber(
                                redemptionAttempts,
                              )} (${formatNumber(uniqueAttemptRedeemers)} usuarios) · Válidas: ${formatNumber(
                                validRedemptions,
                              )} (${formatNumber(uniqueRedeemers)} usuarios) · ${formatValue(
                                redeemedValue,
                                "currency",
                              )}`;
                            }}
                          />
                          <Bar
                            dataKey="redemptionAttempts"
                            name="Intentos"
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
                Detalle de logins y redenciones (intentos vs válidas) por combinación IP · idmask respetando los filtros aplicados.
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
                Heurísticas de riesgo basadas en concentración de intentos, rapidez y conversión login→intento.
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
