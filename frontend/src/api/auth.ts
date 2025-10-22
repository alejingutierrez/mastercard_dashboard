import type { AuthResponse, DashboardUser } from "../types";
import { apiClient } from "./client";

export interface LoginPayload {
  email: string;
  password: string;
}

export const login = async (payload: LoginPayload): Promise<AuthResponse> => {
  const { data } = await apiClient.post<AuthResponse>("/auth/login", payload);
  return data;
};

export const fetchCurrentUser = async (): Promise<DashboardUser> => {
  const { data } = await apiClient.get<{ user: DashboardUser }>("/auth/me");
  return data.user;
};

export interface UpdateProfilePayload {
  name?: string;
  currentPassword?: string;
  newPassword?: string;
}

export const updateCurrentUserProfile = async (
  payload: UpdateProfilePayload
): Promise<DashboardUser> => {
  const { data } = await apiClient.put<{ user: DashboardUser }>("/auth/me", payload);
  return data.user;
};
