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
  Tooltip,
  Typography,
} from "antd";
import {
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  Cell,
  Legend as RechartsLegend,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ColumnsType } from "antd/es/table";
import type { RedemptionInsightsResponse } from "../../types";
import {
  formatNumber,
  formatValue,
  getHeatmapColor,
  getHeatmapTextColor,
} from "./dataTransforms";
import type {
  RedemptionAmountChartDatum,
  RedemptionHeatmapData,
  RedemptionTableRow,
  MerchantPieDatum,
} from "./dataTransforms";

const { Title, Text } = Typography;

interface RedemptionsSectionProps {
  selectedCampaign?: string;
  redemptionError?: string;
  loading: boolean;
  redemptionInsights: RedemptionInsightsResponse | null;
  amountChartData: RedemptionAmountChartDatum[];
  merchantPieData: MerchantPieDatum[];
  heatmapData: RedemptionHeatmapData;
  tableColumns: ColumnsType<RedemptionTableRow>;
  tableData: RedemptionTableRow[];
}

const RedemptionsSection = ({
  selectedCampaign,
  redemptionError,
  loading,
  redemptionInsights,
  amountChartData,
  merchantPieData,
  heatmapData,
  tableColumns,
  tableData,
}: RedemptionsSectionProps) => {
  if (selectedCampaign === "all") {
    return (
      <Card>
        <Empty description="Selecciona una campaña puntual para analizar las redenciones." />
      </Card>
    );
  }

  if (redemptionError) {
    return <Alert type="error" message={redemptionError} showIcon />;
  }

  const hasAmountData = amountChartData.length > 0;
  const hasMerchantPieData = merchantPieData.length > 0;
  const hasHeatmapData =
    heatmapData.merchants.length > 0 && heatmapData.amounts.length > 0;
  const hasTableData = tableData.length > 0;

  return (
    <Spin spinning={loading}>
      {redemptionInsights ? (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Row gutter={[24, 32]} align="stretch">
            <Col xs={24} xl={12}>
              <Card className="activity-card">
                <div className="activity-heading">
                  <div className="activity-header">
                    <Title level={4} className="activity-title">
                      Distribución por monto de bono
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Cantidad de redenciones agrupadas por valor del bono canjeado.
                  </Text>
                </div>
                <div className="activity-body">
                  {hasAmountData ? (
                    <div className="activity-chart activity-chart--wide">
                      <ResponsiveContainer width="100%" height={360}>
                        <ReBarChart
                          data={amountChartData}
                          margin={{ top: 24, right: 32, left: 32, bottom: 48 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="amountLabel"
                            tick={{ fontSize: 12 }}
                            interval={0}
                            angle={-20}
                            textAnchor="end"
                            height={70}
                            tickMargin={12}
                            label={{
                              value: "Monto del bono",
                              position: "insideBottom",
                              offset: -12,
                              style: { textAnchor: "middle" },
                            }}
                          />
                          <YAxis
                            tickFormatter={(value: number) => formatNumber(value)}
                            tick={{ fontSize: 12 }}
                            label={{
                              value: "Redenciones",
                              angle: -90,
                              position: "insideLeft",
                              offset: -10,
                              style: { textAnchor: "middle" },
                            }}
                          />
                          <RechartsTooltip
                            formatter={(value: number | string) => {
                              const redemptions =
                                typeof value === "number" ? value : Number(value);
                              return [
                                formatNumber(
                                  Number.isFinite(redemptions) ? redemptions : 0,
                                ),
                                "Redenciones",
                              ];
                            }}
                            labelFormatter={(label: string, items) => {
                              const totalValue = items?.[0]?.payload?.totalValue ?? 0;
                              return `${label} · ${formatValue(totalValue, "currency")}`;
                            }}
                          />
                          <Bar
                            dataKey="redemptions"
                            name="Redenciones"
                            fill="#eb001b"
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={false}
                          />
                        </ReBarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="activity-empty">
                      <Empty description="No hay redenciones para agrupar por monto con los filtros actuales." />
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
                      Top comercios por redenciones
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Participación de los comercios con mayor cantidad de redenciones.
                    Los que exceden el top 10 se agrupan en “Otros”.
                  </Text>
                </div>
                <div className="activity-body">
                  {hasMerchantPieData ? (
                    <div className="activity-chart activity-chart--wide">
                      <ResponsiveContainer width="100%" height={360}>
                        <RePieChart>
                          <RechartsTooltip
                            formatter={(value: number | string, name) => {
                              const numeric =
                                typeof value === "number" ? value : Number(value);
                              const safe = Number.isFinite(numeric) ? numeric : 0;
                              return [`${formatNumber(safe)} redenciones`, name];
                            }}
                          />
                          <RechartsLegend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                          />
                          <Pie
                            data={merchantPieData}
                            dataKey="redemptions"
                            nameKey="merchant"
                            innerRadius={70}
                            outerRadius={120}
                            paddingAngle={2}
                            isAnimationActive={false}
                            label={({ merchant, percentage }) =>
                              `${merchant}: ${percentage.toFixed(1)}%`
                            }
                          >
                            {merchantPieData.map((slice) => (
                              <Cell
                                key={slice.merchant}
                                fill={slice.color}
                                stroke="none"
                              />
                            ))}
                          </Pie>
                        </RePieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="activity-empty">
                      <Empty description="No hay comercios suficientes para construir el gráfico." />
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[24, 32]} align="stretch">
            <Col xs={24} xl={12}>
              <Card className="activity-card">
                <div className="activity-heading">
                  <div className="activity-header">
                    <Title level={4} className="activity-title">
                      Heatmap comercios vs montos
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Cruce entre comercios y montos redimidos para identificar concentraciones.
                  </Text>
                </div>
                <div className="activity-body">
                  {hasHeatmapData ? (
                    <div
                      className="activity-chart activity-chart--heatmap"
                      style={{ minHeight: 0 }}
                    >
                      <div
                        className="heatmap-grid"
                        style={{
                          gridTemplateColumns: `140px repeat(${heatmapData.merchants.length}, minmax(0, 1fr))`,
                        }}
                      >
                        <div className="heatmap-grid__corner">Monto</div>
                        {heatmapData.merchants.map((merchant) => (
                          <div key={`heatmap-merchant-${merchant}`} className="heatmap-grid__header">
                            {merchant}
                          </div>
                        ))}
                        {heatmapData.amounts.map((amount) => (
                          <Fragment key={`heatmap-amount-${amount}`}>
                            <div className="heatmap-grid__row-label">
                              {formatValue(amount, "currency")}
                            </div>
                            {heatmapData.merchants.map((merchant) => {
                              const key = `${merchant}|${amount}`;
                              const metrics = heatmapData.valueMap.get(key) ?? {
                                redemptions: 0,
                                totalValue: 0,
                              };
                              const background = getHeatmapColor(
                                metrics.redemptions,
                                heatmapData.maxValue,
                                heatmapData.minPositiveValue,
                              );
                              const textColor = getHeatmapTextColor(
                                metrics.redemptions,
                                heatmapData.maxValue,
                                heatmapData.minPositiveValue,
                              );
                              return (
                                <Tooltip
                                  key={`heatmap-cell-${key}`}
                                  title={`${merchant} · ${formatValue(
                                    amount,
                                    "currency",
                                  )}: ${formatNumber(metrics.redemptions)} redenciones`}
                                >
                                  <div
                                    className="heatmap-grid__cell"
                                    style={{
                                      backgroundColor: background,
                                      color: textColor,
                                    }}
                                  >
                                    {metrics.redemptions > 0
                                      ? formatNumber(metrics.redemptions)
                                      : ""}
                                  </div>
                                </Tooltip>
                              );
                            })}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="activity-empty">
                      <Empty description="Aún no hay suficientes combinaciones de montos y comercios para el heatmap." />
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
                      Comercios y valor redimido
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Totales de redenciones y valor económico por comercio aplicando los filtros actuales.
                  </Text>
                </div>
                <div className="activity-body">
                  {hasTableData ? (
                    <Table
                      columns={tableColumns}
                      dataSource={tableData}
                      pagination={false}
                      size="small"
                      scroll={{ y: 260 }}
                      sticky
                    />
                  ) : (
                    <div className="activity-empty">
                      <Empty description="No se encontraron comercios para mostrar en la tabla." />
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>
        </Space>
      ) : (
        <Card>
          <Empty description="No hay datos de redenciones para los filtros seleccionados." />
        </Card>
      )}
    </Spin>
  );
};

export default RedemptionsSection;
