import { Fragment } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CartesianGrid,
  Legend as RechartsLegend,
  Line,
  LineChart as ReLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart as ReBarChart,
} from "recharts";
import type { ActivityAnnotation } from "../../types";
import {
  formatHourLabel,
  formatNumber,
  formatValue,
  getHeatmapColor,
  getHeatmapTextColor,
} from "./dataTransforms";
import type {
  ActivityAxisExtents,
  ActivityChartPoint,
  ActivityCumulativePoint,
  LoginHeatmapData,
  LoginTypeDistributionEntry,
} from "./dataTransforms";

const { Title, Text } = Typography;

interface ActivitySectionProps {
  loadingActivity: boolean;
  error?: string;
  activityDataset: ActivityChartPoint[];
  activityCumulativeDataset: ActivityCumulativePoint[];
  axisExtents: ActivityAxisExtents;
  loginTypeDistribution: LoginTypeDistributionEntry[];
  loginHeatmapData: LoginHeatmapData;
  annotations?: ActivityAnnotation[];
}

const ActivitySection = ({
  loadingActivity,
  error,
  activityDataset,
  activityCumulativeDataset,
  axisExtents,
  loginTypeDistribution,
  loginHeatmapData,
  annotations,
}: ActivitySectionProps) => {
  const hasActivityData = activityDataset.length > 0;
  const hasLoginTypeDistribution = loginTypeDistribution.length > 0;
  const hasHeatmapData =
    loginHeatmapData.dayHeaders.length > 0 &&
    loginHeatmapData.hourBuckets.length > 0;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Row gutter={[24, 32]} align="stretch">
        <Col xs={24} xl={12} className="activity-col">
          <Card className="activity-card">
            <div className="activity-heading">
              <div className="activity-header">
                <Title level={4} className="activity-title">
                  Logins vs redenciones diarias
                </Title>
                <div className="activity-separator" />
              </div>
              <Text type="secondary" className="activity-subtitle">
                Evolución diaria de logins y redenciones con los filtros
                actuales.
              </Text>
            </div>

            {error && <Alert type="error" message={error} showIcon />} 

            <div className="activity-body">
              <Spin spinning={loadingActivity}>
                {hasActivityData ? (
                  <div className="activity-chart activity-chart--wide">
                    <ResponsiveContainer width="100%" height={380}>
                      <ReLineChart
                        data={activityDataset}
                        margin={{ top: 24, right: 48, left: 48, bottom: 24 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="dateLabel"
                          tick={{ fontSize: 12 }}
                          height={50}
                          tickMargin={12}
                          label={{
                            value: "Fecha",
                            position: "insideBottom",
                            offset: -12,
                            style: { textAnchor: "middle" },
                          }}
                        />
                        <YAxis
                          yAxisId="logins"
                          domain={[0, axisExtents.logins]}
                          tickFormatter={(value: number) => formatNumber(value)}
                          tick={{ fontSize: 12 }}
                          label={{
                            value: "Logins diarios",
                            angle: -90,
                            position: "insideLeft",
                            offset: -12,
                            style: { textAnchor: "middle" },
                          }}
                        />
                        <YAxis
                          yAxisId="redemptions"
                          orientation="right"
                          domain={[0, axisExtents.redemptions]}
                          tickFormatter={(value: number) => formatNumber(value)}
                          tick={{ fontSize: 12 }}
                          label={{
                            value: "Redenciones diarias",
                            angle: -90,
                            position: "insideRight",
                            offset: -4,
                            style: { textAnchor: "middle" },
                          }}
                        />
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [
                            formatNumber(value),
                            name,
                          ]}
                          labelFormatter={(label: string) => label}
                        />
                        <RechartsLegend
                          verticalAlign="top"
                          align="center"
                          wrapperStyle={{ paddingBottom: 16 }}
                          formatter={(value: string) => value}
                        />
                        <Line
                          yAxisId="logins"
                          type="monotone"
                          dataKey="loginsCount"
                          name="Logins diarios"
                          stroke="#eb001b"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          yAxisId="redemptions"
                          type="monotone"
                          dataKey="redemptionsCount"
                          name="Redenciones diarias"
                          stroke="#f79e1b"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        {(annotations ?? []).map((annotation) => (
                          <ReferenceLine
                            key={`${annotation.date}-${annotation.label}`}
                            x={dayjs(annotation.date, "YYYY-MM-DD").format(
                              "DD/MM/YYYY",
                            )}
                            stroke="#8b8b8b"
                            strokeDasharray="4 4"
                            label={{
                              value: annotation.label,
                              position: "top",
                              fill: "#444444",
                              fontSize: 11,
                            }}
                          />
                        ))}
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  !loadingActivity && (
                    <div className="activity-empty">
                      <Empty description="No hay actividad disponible para el periodo seleccionado." />
                    </div>
                  )
                )}
              </Spin>

              {(annotations?.length ?? 0) > 0 && (
                <Space size={[8, 8]} wrap>
                  {(annotations ?? []).map((annotation) => {
                    const displayDate = dayjs(
                      annotation.date,
                      "YYYY-MM-DD",
                    ).format("DD/MM/YYYY");
                    const tagContent = `${displayDate} · ${annotation.label}`;
                    return (
                      <Tooltip
                        key={`${annotation.date}-${annotation.label}-tag`}
                        title={
                          annotation.description ??
                          (annotation.campaignName
                            ? `Hito reportado en ${annotation.campaignName}`
                            : undefined)
                        }
                      >
                        <Tag color="magenta">{tagContent}</Tag>
                      </Tooltip>
                    );
                  })}
                </Space>
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12} className="activity-col">
          <Card className="activity-card">
            <div className="activity-heading">
              <div className="activity-header">
                <Title level={4} className="activity-title">
                  Valor acumulado vs redenciones diarias
                </Title>
                <div className="activity-separator" />
              </div>
              <Text type="secondary" className="activity-subtitle">
                Suma acumulada en COP frente a redenciones diarias para los
                filtros actuales.
              </Text>
            </div>

            <div className="activity-body">
              <Spin spinning={loadingActivity}>
                {hasActivityData ? (
                  <div className="activity-chart activity-chart--wide">
                    <ResponsiveContainer width="100%" height={380}>
                      <ReLineChart
                        data={activityCumulativeDataset}
                        margin={{ top: 24, right: 48, left: 48, bottom: 24 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="dateLabel"
                          tick={{ fontSize: 12 }}
                          height={50}
                          tickMargin={12}
                          label={{
                            value: "Fecha",
                            position: "insideBottom",
                            offset: -12,
                            style: { textAnchor: "middle" },
                          }}
                        />
                        <YAxis
                          yAxisId="dailyRedemptions"
                          domain={[0, axisExtents.redemptions]}
                          tickFormatter={(value: number) => formatNumber(value)}
                          tick={{ fontSize: 12 }}
                          label={{
                            value: "Redenciones diarias",
                            angle: -90,
                            position: "insideLeft",
                            offset: -12,
                            style: { textAnchor: "middle" },
                          }}
                        />
                        <YAxis
                          yAxisId="redeemedValue"
                          orientation="right"
                          domain={[0, axisExtents.cumulativeRedeemedValue]}
                          tickFormatter={(value: number) =>
                            formatValue(value, "currency")
                          }
                          tick={{ fontSize: 12 }}
                          label={{
                            value: "Valor acumulado (COP)",
                            angle: -90,
                            position: "insideRight",
                            offset: -8,
                            style: { textAnchor: "middle" },
                          }}
                        />
                        <RechartsTooltip
                          formatter={(valueParam: number | string, name: string) => {
                            const numericValue =
                              typeof valueParam === "number"
                                ? valueParam
                                : Number(valueParam);
                            const displayValue = Number.isFinite(numericValue)
                              ? name === "Valor acumulado en redenciones"
                                ? formatValue(numericValue, "currency")
                                : formatNumber(numericValue)
                              : "N/D";
                            return [displayValue, name];
                          }}
                          labelFormatter={(label: string) => label}
                        />
                        <RechartsLegend
                          verticalAlign="top"
                          align="center"
                          wrapperStyle={{ paddingBottom: 16 }}
                          formatter={(value: string) => value}
                        />
                        <Line
                          yAxisId="dailyRedemptions"
                          type="monotone"
                          dataKey="redemptionsCount"
                          name="Redenciones diarias"
                          stroke="#f79e1b"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          yAxisId="redeemedValue"
                          type="monotone"
                          dataKey="cumulativeRedeemedValue"
                          name="Valor acumulado en redenciones"
                          stroke="#003087"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        {(annotations ?? []).map((annotation) => (
                          <ReferenceLine
                            key={`cumulative-${annotation.date}-${annotation.label}`}
                            x={dayjs(annotation.date, "YYYY-MM-DD").format(
                              "DD/MM/YYYY",
                            )}
                            stroke="#8b8b8b"
                            strokeDasharray="4 4"
                            label={{
                              value: annotation.label,
                              position: "top",
                              fill: "#444444",
                              fontSize: 11,
                            }}
                          />
                        ))}
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  !loadingActivity && (
                    <div className="activity-empty">
                      <Empty description="No hay actividad disponible para el periodo seleccionado." />
                    </div>
                  )
                )}
              </Spin>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 32]} align="stretch">
        <Col xs={24} xl={12} className="activity-col">
          <Card className="activity-card">
            <div className="activity-heading">
              <div className="activity-header">
                <Title level={4} className="activity-title">
                  Logins por tipo
                </Title>
                <div className="activity-separator" />
              </div>
              <Text type="secondary" className="activity-subtitle">
                Total de logins agrupados por tipo aplicando los filtros
                actuales.
              </Text>
            </div>

            <div className="activity-body">
              <Spin spinning={loadingActivity}>
                {hasLoginTypeDistribution ? (
                  <div className="activity-chart activity-chart--wide">
                    <ResponsiveContainer width="100%" height={460}>
                      <ReBarChart
                        data={loginTypeDistribution}
                        margin={{ top: 24, right: 32, left: 32, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="typeLabel"
                          interval={0}
                          tick={{ fontSize: 12 }}
                          angle={-20}
                          textAnchor="end"
                          height={80}
                          tickMargin={12}
                          label={{
                            value: "Tipo de login",
                            position: "insideBottom",
                            offset: -12,
                            style: { textAnchor: "middle" },
                          }}
                        />
                        <YAxis
                          tickFormatter={(value: number) => formatNumber(value)}
                          tick={{ fontSize: 12 }}
                          label={{
                            value: "Logins",
                            angle: -90,
                            position: "insideLeft",
                            offset: -12,
                            style: { textAnchor: "middle" },
                          }}
                        />
                        <RechartsTooltip
                          formatter={(value: number | string) => {
                            const numericValue =
                              typeof value === "number" ? value : Number(value);
                            const safeValue = Number.isFinite(numericValue)
                              ? numericValue
                              : 0;
                            return [formatNumber(safeValue), "Logins"];
                          }}
                          labelFormatter={(label: string) => label}
                        />
                        <Bar
                          dataKey="logins"
                          name="Logins"
                          fill="#eb001b"
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                        />
                      </ReBarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  !loadingActivity && (
                    <div className="activity-empty">
                      <Empty description="No hay logins registrados para los filtros seleccionados." />
                    </div>
                  )
                )}
              </Spin>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12} className="activity-col">
          <Card className="activity-card">
            <div className="activity-heading">
              <div className="activity-header">
                <Title level={4} className="activity-title">
                  Heatmap día-hora de logins
                </Title>
                <div className="activity-separator" />
              </div>
              <Text type="secondary" className="activity-subtitle">
                Intensidad de logins según día de la semana y bloques de dos
                horas.
              </Text>
            </div>

            <div className="activity-body">
              <Spin spinning={loadingActivity}>
                {hasHeatmapData ? (
                  <div
                    className="activity-chart activity-chart--heatmap"
                    style={{ minHeight: 0 }}
                  >
                    <div
                      className="heatmap-grid"
                      style={{
                        gridTemplateColumns: `100px repeat(${loginHeatmapData.dayHeaders.length}, minmax(0, 1fr))`,
                      }}
                    >
                      <div className="heatmap-grid__corner">Bloque</div>
                      {loginHeatmapData.dayHeaders.map((header) => (
                        <Tooltip
                          key={`heatmap-header-${header.value}`}
                          title={header.fullLabel}
                        >
                          <div className="heatmap-grid__header">{header.label}</div>
                        </Tooltip>
                      ))}
                      {loginHeatmapData.hourBuckets.map((bucket) => (
                        <Fragment key={`heatmap-row-${bucket}`}>
                          <div className="heatmap-grid__row-label">
                            {formatHourLabel(bucket)}
                          </div>
                          {loginHeatmapData.dayHeaders.map((header) => {
                            const key = `${header.value}|${bucket}`;
                            const logins =
                              loginHeatmapData.valueMap.get(key) ?? 0;
                            const background = getHeatmapColor(
                              logins,
                              loginHeatmapData.maxValue,
                              loginHeatmapData.minValue,
                            );
                            const textColor = getHeatmapTextColor(
                              logins,
                              loginHeatmapData.maxValue,
                              loginHeatmapData.minValue,
                            );
                            const tooltipLabel = `${header.fullLabel} · ${formatHourLabel(
                              bucket,
                            )}`;
                            return (
                              <Tooltip
                                key={`heatmap-cell-${key}`}
                                title={`${tooltipLabel}: ${formatNumber(logins)} logins`}
                              >
                                <div
                                  className="heatmap-grid__cell"
                                  style={{
                                    backgroundColor: background,
                                    color: textColor,
                                  }}
                                >
                                  {logins > 0 ? formatNumber(logins) : ""}
                                </div>
                              </Tooltip>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                ) : (
                  !loadingActivity && (
                    <div className="activity-empty">
                      <Empty description="No hay registros de logins para construir el heatmap." />
                    </div>
                  )
                )}
              </Spin>
            </div>
          </Card>
        </Col>
      </Row>

    </Space>
  );
};

export default ActivitySection;
