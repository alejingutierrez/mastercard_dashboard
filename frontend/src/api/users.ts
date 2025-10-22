import type { DashboardUser } from "../types";
import { apiClient } from "./client";

export interface CreateUserPayload {
  email: string;
  name?: string;
  role: "admin" | "viewer";
  password: string;
  allowedCampaignIds?: string[];
  forcePasswordReset?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  role?: "admin" | "viewer";
  password?: string;
  allowedCampaignIds?: string[];
  forcePasswordReset?: boolean;
}

export const fetchUsers = async (): Promise<DashboardUser[]> => {
  const { data } = await apiClient.get<{ users: DashboardUser[] }>("/users");
  return data.users;
};

export const createUser = async (
  payload: CreateUserPayload
): Promise<DashboardUser> => {
  const { data } = await apiClient.post<{ user: DashboardUser }>("/users", payload);
  return data.user;
};

export const updateUser = async (
  userId: string,
  payload: UpdateUserPayload
): Promise<DashboardUser> => {
  const { data } = await apiClient.put<{ user: DashboardUser }>(
    `/users/${userId}`,
    payload
  );
  return data.user;
};

export const deleteUser = async (userId: string): Promise<void> => {
  await apiClient.delete(`/users/${userId}`);
};
