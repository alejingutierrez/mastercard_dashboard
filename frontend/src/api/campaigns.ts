import { apiClient } from "./client";
import type {
  ActivityResponse,
  Campaign,
  CampaignSummaryResponse,
  LoginSecurityResponse,
  RedemptionInsightsResponse,
} from "../types";

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

// Small in-memory cache to speed up tab switches and reduce duplicate requests.
// It is intentionally short-lived: the dashboard data can change and we don't want stale
// results hanging around for long.
const requestCache = new Map<string, CacheEntry<unknown>>();

export const clearCampaignRequestCache = () => {
  requestCache.clear();
};

const stableParamsKey = (params?: Record<string, unknown>) => {
  if (!params) {
    return "";
  }
  const sortedKeys = Object.keys(params)
    .filter((key) => params[key] !== undefined)
    .sort((a, b) => a.localeCompare(b));
  const stable: Record<string, unknown> = {};
  sortedKeys.forEach((key) => {
    stable[key] = params[key];
  });
  return JSON.stringify(stable);
};

const cachedGet = async <T>(
  url: string,
  params?: Record<string, unknown>,
  ttlMs = 30_000
): Promise<T> => {
  const key = `${url}?${stableParamsKey(params)}`;
  const now = Date.now();
  const existing = requestCache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }

  const promise = apiClient
    .get<T>(url, { params })
    .then(({ data }) => data);

  requestCache.set(key, { expiresAt: now + ttlMs, promise });

  try {
    return await promise;
  } catch (error) {
    requestCache.delete(key);
    throw error;
  }
};

export const fetchCampaigns = async (): Promise<Campaign[]> => {
  return cachedGet<Campaign[]>("/campaigns", undefined, 5 * 60_000);
};

export interface SummaryFilters {
  from?: string;
  to?: string;
  loginType?: string;
  userId?: string;
  userIp?: string;
  segment?: string;
  userType?: string;
  mode?: "kpis" | "full";
}

export type ActivityFilters = SummaryFilters & {
  includeFilters?: "0" | "1";
};

export const fetchCampaignSummary = async (
  campaignId: string,
  filters?: SummaryFilters
): Promise<CampaignSummaryResponse> => {
  return cachedGet<CampaignSummaryResponse>(
    `/campaigns/${campaignId}/summary`,
    filters as Record<string, unknown> | undefined,
    30_000
  );
};

export const fetchCampaignActivity = async (
  campaignId: string,
  filters?: ActivityFilters
): Promise<ActivityResponse> => {
  return cachedGet<ActivityResponse>(
    `/campaigns/${campaignId}/activity`,
    filters as Record<string, unknown> | undefined,
    30_000
  );
};

export const fetchCampaignRedemptionInsights = async (
  campaignId: string,
  filters?: SummaryFilters
): Promise<RedemptionInsightsResponse> => {
  return cachedGet<RedemptionInsightsResponse>(
    `/campaigns/${campaignId}/redemptions-insights`,
    filters as Record<string, unknown> | undefined,
    45_000
  );
};

export const fetchCampaignLoginSecurity = async (
  campaignId: string,
  filters?: SummaryFilters
): Promise<LoginSecurityResponse> => {
  return cachedGet<LoginSecurityResponse>(
    `/campaigns/${campaignId}/login-security`,
    filters as Record<string, unknown> | undefined,
    45_000
  );
};

export interface FirstLoginsByDateRow {
  fecha: string;
  loggins_inscritos: number;
  [key: string]: string | number;
}

export interface FirstLoginsSegmentMeta {
  label: string;
  key: string;
}

export interface FirstLoginsByDateResponse {
  rows: FirstLoginsByDateRow[];
  segments: FirstLoginsSegmentMeta[];
}

export const fetchFirstLoginsByDate = async (
  campaignId: string,
  filters?: Pick<SummaryFilters, "from" | "to" | "segment" | "userType">
): Promise<FirstLoginsByDateResponse> => {
  return cachedGet<FirstLoginsByDateResponse>(
    `/campaigns/${campaignId}/first-logins-by-date`,
    filters as Record<string, unknown> | undefined,
    30_000
  );
};

export const fetchCampaignSegments = async (
  campaignId: string
): Promise<{ segments: string[] }> => {
  return cachedGet<{ segments: string[] }>(
    `/campaigns/${campaignId}/segments`,
    undefined,
    60_000
  );
};

export const fetchCampaignUserTypes = async (
  campaignId: string
): Promise<{ userTypes: string[] }> => {
  return cachedGet<{ userTypes: string[] }>(
    `/campaigns/${campaignId}/user-types`,
    undefined,
    60_000
  );
};

export interface EnrollmentFunnelLayer {
  layer: string;
  inscritos: number;
  no_inscritos: number;
}

export const fetchEnrollmentFunnel = async (
  campaignId: string,
  filters?: Pick<SummaryFilters, "from" | "to">
): Promise<{ layers: EnrollmentFunnelLayer[] }> => {
  return cachedGet<{ layers: EnrollmentFunnelLayer[] }>(
    `/campaigns/${campaignId}/enrollment-funnel`,
    filters as Record<string, unknown> | undefined,
    45_000
  );
};
