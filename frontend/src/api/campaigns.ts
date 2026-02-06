import { apiClient } from "./client";
import type {
  ActivityResponse,
  Campaign,
  CampaignSummaryResponse,
  LoginSecurityResponse,
  RedemptionInsightsResponse,
} from "../types";

export const fetchCampaigns = async (): Promise<Campaign[]> => {
  const { data } = await apiClient.get<Campaign[]>("/campaigns");
  return data;
};

export interface SummaryFilters {
  from?: string;
  to?: string;
  loginType?: string;
  userId?: string;
  userIp?: string;
  mode?: "kpis" | "full";
}

export type ActivityFilters = SummaryFilters & {
  includeFilters?: "0" | "1";
};

export const fetchCampaignSummary = async (
  campaignId: string,
  filters?: SummaryFilters
): Promise<CampaignSummaryResponse> => {
  const { data } = await apiClient.get<CampaignSummaryResponse>(
    `/campaigns/${campaignId}/summary`,
    {
      params: filters,
    }
  );
  return data;
};

export const fetchCampaignActivity = async (
  campaignId: string,
  filters?: ActivityFilters
): Promise<ActivityResponse> => {
  const { data } = await apiClient.get<ActivityResponse>(
    `/campaigns/${campaignId}/activity`,
    {
      params: filters,
    }
  );
  return data;
};

export const fetchCampaignRedemptionInsights = async (
  campaignId: string,
  filters?: SummaryFilters
): Promise<RedemptionInsightsResponse> => {
  const { data } = await apiClient.get<RedemptionInsightsResponse>(
    `/campaigns/${campaignId}/redemptions-insights`,
    {
      params: filters,
    }
  );
  return data;
};

export const fetchCampaignLoginSecurity = async (
  campaignId: string,
  filters?: SummaryFilters
): Promise<LoginSecurityResponse> => {
  const { data } = await apiClient.get<LoginSecurityResponse>(
    `/campaigns/${campaignId}/login-security`,
    {
      params: filters,
    }
  );
  return data;
};
