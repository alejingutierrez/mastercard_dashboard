import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000";

export const apiClient = axios.create({
  baseURL: `${baseURL}/api`,
  timeout: 15000,
});

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const clearAuthToken = () => {
  authToken = null;
};

export const getAuthToken = () => authToken;

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = {
      ...(config.headers ?? {}),
      Authorization: `Bearer ${authToken}`,
    };
  }
  return config;
});
