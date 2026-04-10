import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";

export type ContactNotificationInput = {
  sender_role: "customer" | "technician";
  sender_name: string;
  subject: string;
  order_number?: string;
};

export type ContactNotificationRow = {
  id: number | string;
  sender_role: "customer" | "technician";
  sender_name: string;
  subject: string;
  order_number?: string;
  created_at?: string;
};

type SuccessEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

const unwrap = <T>(payload: T | SuccessEnvelope<T>): T => {
  const maybe = payload as SuccessEnvelope<T>;
  if (typeof maybe === "object" && maybe !== null && "data" in maybe) {
    if (maybe.data !== undefined) return maybe.data;
  }
  return payload as T;
};

const toArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];

  const candidate = value as Record<string, unknown>;
  const listKeys = ["data", "rows", "items", "notifications", "result"];
  for (const key of listKeys) {
    const next = candidate[key];
    if (Array.isArray(next)) return next as T[];
  }

  return [];
};

export async function createContactNotification(
  payload: ContactNotificationInput,
) {
  const endpoints = getApiEndpoints();
  return apiRequest<SuccessEnvelope<{ success: boolean }>>(
    endpoints.contactNotificationCreate,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function fetchAdminContactNotifications() {
  const endpoints = getApiEndpoints();
  const response = await apiRequest<
    ContactNotificationRow[] | SuccessEnvelope<ContactNotificationRow[]>
  >(endpoints.adminContactNotifications);

  return toArray<ContactNotificationRow>(unwrap(response));
}
