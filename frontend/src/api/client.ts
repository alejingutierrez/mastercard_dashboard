import axios from "axios";
import type { AxiosResponseHeaders } from "axios";

const baseURL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000";

export const apiClient = axios.create({
  baseURL: `${baseURL}/api`,
  timeout: 15000,
});

let authToken: string | null = null;
export const TOKEN_STORAGE_KEY = "dashboard_token";

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const clearAuthToken = () => {
  authToken = null;
};

export const getAuthToken = () => authToken;

const persistRenewedToken = (token: string) => {
  setAuthToken(token);
  try {
    if (typeof window !== "undefined" && window?.localStorage) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch (error) {
    console.warn("[auth] No se pudo persistir el token renovado", error);
  }
};

const extractHeaderValue = (
  headers:
    | AxiosResponseHeaders
    | (Record<string, unknown> & { get?: (name: string) => string | null }),
  headerName: string
) => {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    const value = headers.get(headerName);
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  const normalized = headerName.toLowerCase();
  const directValue = headers[normalized] ?? headers[headerName];
  return typeof directValue === "string" && directValue.length > 0
    ? (directValue as string)
    : null;
};

const handleTokenRefresh = (
  headers?:
    | AxiosResponseHeaders
    | (Record<string, unknown> & { get?: (name: string) => string | null })
) => {
  const refreshedToken =
    extractHeaderValue(headers ?? {}, "x-dashboard-token") ||
    extractHeaderValue(headers ?? {}, "X-Dashboard-Token");
  if (refreshedToken) {
    persistRenewedToken(refreshedToken);
  }
};

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.set('Authorization', `Bearer ${authToken}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    handleTokenRefresh(response.headers);
    return response;
  },
  (error) => {
    if (error?.response?.headers) {
      handleTokenRefresh(error.response.headers);
    }
    return Promise.reject(error);
  }
);
