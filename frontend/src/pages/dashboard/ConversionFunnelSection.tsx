import {
  Alert,
  Card,
  Empty,
  Spin,
  Typography,
} from "antd";
import {
  Bar,
  CartesianGrid,
  ComposedChart as ReComposedChart,
  Legend as RechartsLegend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatPercentage } from "./dataTransforms";
import type { ConversionFunnelChartDatum } from "./dataTransforms";

const { Title, Text } = Typography;

interface ConversionFunnelSectionProps {
  loading: boolean;
  error?: string;
  dataset: ConversionFunnelChartDatum[];
  axisMax: number;
}

const ConversionFunnelSection = ({
  loading,
  error,
  dataset,
  axisMax,
}: ConversionFunnelSectionProps) => {
  const hasData = dataset.length > 0;

  return (
    <Card className="activity-card">
      <div className="activity-heading">
        <div className="activity-header">
          <Title level={4} className="activity-title">
            Conversión login → redención
          </Title>
          <div className="activity-separator" />
        </div>
        <Text type="secondary" className="activity-subtitle">
          Evolución semanal de usuarios que pasan del login a la solicitud de
          premio y a la redención con los filtros aplicados.
        </Text>
      </div>
      {error && <Alert type="error" message={error} showIcon />}
      <div className="activity-body">
        <Spin spinning={loading}>
          {hasData ? (
            <div className="activity-chart activity-chart--wide">
              <ResponsiveContainer width="100%" height={420}>
                <ReComposedChart
                  data={dataset}
                  margin={{ top: 24, right: 48, left: 48, bottom: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="weekLabel"
                    tick={{ fontSize: 12 }}
                    height={50}
                    tickMargin={12}
                    label={{
                      value: "Semana",
                      position: "insideBottom",
                      offset: -12,
                      style: { textAnchor: "middle" },
                    }}
                  />
                  <YAxis
                    yAxisId="users"
                    domain={[0, axisMax]}
                    tickFormatter={(value: number) => formatNumber(value)}
                    tick={{ fontSize: 12 }}
                    label={{
                      value: "Usuarios",
                      angle: -90,
                      position: "insideLeft",
                      offset: -12,
                      style: { textAnchor: "middle" },
                    }}
                  />
                  <YAxis
                    yAxisId="rate"
                    orientation="right"
                    domain={[0, 1]}
                    tickFormatter={(value: number) => formatPercentage(value, 0)}
                    tick={{ fontSize: 12 }}
                    label={{
                      value: "Conversión",
                      angle: -90,
                      position: "insideRight",
                      offset: -4,
                      style: { textAnchor: "middle" },
                    }}
                  />
                  <RechartsTooltip
                    formatter={(
                      rawValue: number | string,
                      name: string,
                      payloadItem: { payload?: ConversionFunnelChartDatum },
                    ) => {
                      const data = payloadItem?.payload;
                      if (name === "Conversión total") {
                        const numeric =
                          typeof rawValue === "number"
                            ? rawValue
                            : Number(rawValue);
                        return [
                          formatPercentage(
                            Number.isFinite(numeric) ? numeric : 0,
                          ),
                          name,
                        ];
                      }
                      if (!data) {
                        const numeric =
                          typeof rawValue === "number"
                            ? rawValue
                            : Number(rawValue);
                        return [
                          formatNumber(Number.isFinite(numeric) ? numeric : 0),
                          name,
                        ];
                      }
                      if (name === "Usuarios con login") {
                        return [formatNumber(data.loginUsers), name];
                      }
                      if (name === "Solicitudes de premio") {
                        return [formatNumber(data.awardRequests), name];
                      }
                      if (name === "Usuarios con redención") {
                        return [formatNumber(data.redemptionUsers), name];
                      }
                      const numeric =
                        typeof rawValue === "number" ? rawValue : Number(rawValue);
                      return [
                        formatNumber(Number.isFinite(numeric) ? numeric : 0),
                        name,
                      ];
                    }}
                    labelFormatter={(_label, payload) => {
                      const data =
                        payload && payload.length > 0
                          ? (payload[0].payload as
                              | ConversionFunnelChartDatum
                              | undefined)
                          : undefined;
                      if (!data) {
                        return null;
                      }
                      const requestRateLabel =
                        data.requestRate !== null
                          ? formatPercentage(data.requestRate)
                          : "N/D";
                      const approvalRateLabel =
                        data.approvalRate !== null
                          ? formatPercentage(data.approvalRate)
                          : "N/D";
                      return (
                        <>
                          <span>{data.weekRangeVerbose}</span>
                          <br />
                          <span style={{ fontSize: 12, color: "#666" }}>
                            Tasa solicitud: {requestRateLabel} · Aprobación: {" "}
                            {approvalRateLabel}
                          </span>
                        </>
                      );
                    }}
                  />
                  <RechartsLegend
                    verticalAlign="top"
                    align="center"
                    wrapperStyle={{ paddingBottom: 16 }}
                  />
                  <Bar
                    yAxisId="users"
                    dataKey="loginOnlyUsers"
                    name="Usuarios con login"
                    stackId="funnel"
                    fill="#ffd7b5"
                    isAnimationActive={false}
                  />
                  <Bar
                    yAxisId="users"
                    dataKey="awardOnlyUsers"
                    name="Solicitudes de premio"
                    stackId="funnel"
                    fill="#f79e1b"
                    isAnimationActive={false}
                  />
                  <Bar
                    yAxisId="users"
                    dataKey="redemptionUsersSegment"
                    name="Usuarios con redención"
                    stackId="funnel"
                    fill="#eb001b"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="rate"
                    type="monotone"
                    dataKey="conversionRate"
                    name="Conversión total"
                    stroke="#003087"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </ReComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            !loading && (
              <div className="activity-empty">
                <Empty description="No se encontraron datos de conversión para los filtros actuales." />
              </div>
            )
          )}
        </Spin>
      </div>
    </Card>
  );
};

export default ConversionFunnelSection;
