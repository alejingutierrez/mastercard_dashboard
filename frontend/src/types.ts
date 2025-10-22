export interface Campaign {
  id: string;
  name: string;
  description: string;
  database?: string;
}

export interface Metric {
  key: string;
  label: string;
  value: number | null;
}

export interface ChartDataPoint {
  category: string;
  value: number;
  [key: string]: string | number | null;
}

export interface ChartSummary {
  key: string;
  title: string;
  data: ChartDataPoint[];
}

export interface SampleData {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface CampaignSummaryResponse {
  campaign: Campaign;
  metrics: Metric[];
  charts: ChartSummary[];
  sample: SampleData;
}

export interface ActivityFilterOption {
  value: string;
  label: string;
}

export interface ActivityAnnotation {
  date: string;
  label: string;
  description?: string | null;
  campaignId?: string;
  campaignName?: string;
}

export interface ActivityPoint {
  date: string;
  loginsCount: number;
  loginsAvg7: number | null;
  uniqueLoginUsers: number;
  redemptionsCount: number;
  redemptionsAvg7: number | null;
  uniqueRedeemers: number;
  redeemedValue: number;
  conversionRate: number | null;
}

export interface ActivityTotals {
  logins: number;
  redemptions: number;
  redeemedValue: number;
}

export interface LoginTypeBreakdownEntry {
  type: string;
  logins: number;
}

export interface LoginHeatmapEntry {
  hourBucket: number;
  dayOfWeek: number;
  logins: number;
  day_of_week?: number;
  hour_bucket?: number;
}

export interface ActivityResponse {
  scope: "campaign" | "consolidated";
  campaigns: Pick<Campaign, "id" | "name">[];
  filters: {
    loginTypes: ActivityFilterOption[];
    segments: ActivityFilterOption[];
    userTypes?: ActivityFilterOption[];
  };
  points: ActivityPoint[];
  totals: ActivityTotals;
  annotations: ActivityAnnotation[];
  loginTypeBreakdown: LoginTypeBreakdownEntry[];
  loginHeatmap: LoginHeatmapEntry[];
  sources: {
    logins: string;
    redemptions: string;
  };
  metadata: {
    movingAverageWindow: number;
  };
}

export interface RedemptionAmountDistributionEntry {
  amount: number;
  redemptions: number;
  uniqueUsers: number;
  totalValue: number;
}

export interface RedemptionMerchantPieSlice {
  merchant: string;
  redemptions: number;
  totalValue: number;
  isOther: boolean;
}

export interface RedemptionMerchantTotal {
  merchant: string;
  redemptions: number;
  uniqueUsers: number;
  totalValue: number;
}

export interface RedemptionHeatmapCell {
  merchant: string;
  amount: number;
  redemptions: number;
  totalValue: number;
}

export interface RedemptionHeatmap {
  merchants: string[];
  amounts: number[];
  cells: RedemptionHeatmapCell[];
  maxRedemptions: number;
  minPositiveRedemptions: number | null;
}

export interface RedemptionInsightsMetadata {
  generatedAt: string;
  totals: {
    redemptions: number;
    redeemedValue: number;
  };
  appliedFilters: {
    loginType: string | null;
    userId: string | null;
    userIp: string | null;
    dateRange: { from: string; to: string } | null;
  };
}

export interface RedemptionInsightsResponse {
  campaign: Campaign;
  amountDistribution: RedemptionAmountDistributionEntry[];
  merchantPie: RedemptionMerchantPieSlice[];
  merchantTotals: RedemptionMerchantTotal[];
  heatmap: RedemptionHeatmap;
  metadata: RedemptionInsightsMetadata;
}

export interface DashboardUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "viewer";
  status: string;
  createdAt: string;
  updatedAt: string;
  allowedCampaignIds: string[];
  mustResetPassword: boolean;
}

export interface AuthResponse {
  token: string;
  user: DashboardUser;
}

export interface LoginSecurityTopLoginIp {
  ip: string;
  totalLogins: number;
  uniqueUsers: number;
  activeDays: number;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  share: number;
}

export interface LoginSecurityTopRedemptionIp {
  ip: string;
  totalRedemptions: number;
  uniqueRedeemers: number;
  redeemedValue: number;
  firstRedemptionAt: string | null;
  lastRedemptionAt: string | null;
  share: number;
}

export interface LoginSecurityDetailRow {
  key: string;
  ip: string;
  idmask: string | null;
  loginCount: number;
  activeDays: number;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  redemptions: number;
  totalRedeemedValue: number;
  firstRedemptionAt: string | null;
  lastRedemptionAt: string | null;
  conversionRate: number | null;
  redemptionsPerActiveDay: number | null;
}

export interface LoginSecurityAtypicalIp {
  ip: string;
  totalLogins: number;
  uniqueUsers: number;
  totalRedemptions: number;
  uniqueRedeemers: number;
  conversionRate: number;
  dominantRedeemerShare: number;
  redemptionSpanDays: number | null;
  loginSpanDays: number | null;
  redemptionsPerActiveDay: number | null;
  redeemedValue: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  reasons: string[];
  severity: "high" | "medium" | "low";
}

export interface TwoFactorAdoptionEntry {
  weekStart: string;
  weekEnd: string | null;
  segment: string;
  usersWithTwoFactor: number;
  totalUsers: number;
  adoptionRate: number;
}

export interface TwoFactorAdoptionWeek {
  start: string;
  end: string | null;
}

export interface TwoFactorTotals {
  totalUsers: number;
  usersWithTwoFactor: number;
  overallRate: number | null;
}

export interface TwoFactorAdoptionSummary {
  weeks: TwoFactorAdoptionWeek[];
  segments: string[];
  entries: TwoFactorAdoptionEntry[];
  targetRate: number | null;
  totals: TwoFactorTotals;
}

export interface LoginSecurityMetadata {
  generatedAt: string;
  filters: {
    loginType: string | null;
    userId: string | null;
    userIp: string | null;
    dateRange: { from: string; to: string } | null;
  };
  sources: {
    logins: string;
    redemptions: string;
  };
  notes?: string[];
  debug?: {
    loginsByIpRows: number;
    redemptionsByIpRows: number;
    loginDetailsRows: number;
    redemptionDetailsRows: number;
  };
}

export interface LoginSecurityResponse {
  campaign: Campaign;
  topLoginIps: LoginSecurityTopLoginIp[];
  topRedemptionIps: LoginSecurityTopRedemptionIp[];
  loginIpDetails: LoginSecurityDetailRow[];
  atypicalIps: LoginSecurityAtypicalIp[];
  twoFactorAdoption: TwoFactorAdoptionSummary | null;
  metadata: LoginSecurityMetadata;
}
