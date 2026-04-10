import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";

export type CustomerOrderRow = {
  id: number;
  order_number?: string;
  customer_name?: string;
  status?: string;
  priority?: string;
  sample_count?: number;
  created_at?: string;
  estimated_completion?: string;
};

export type CreateOrderPayload = {
  priority: "standard" | "priority";
  sample_type: string;
  compound_name: string;
  quantity: number;
  unit: "g" | "kg" | "mL" | "L";
  company_name?: string;
  sample_count?: number;
  notes?: string;
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
    if (maybe.data !== undefined) {
      return maybe.data;
    }
  }
  return payload as T;
};

const toArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];

  const candidate = value as Record<string, unknown>;
  const knownListKeys = ["data", "rows", "items", "orders", "result"];
  for (const key of knownListKeys) {
    const next = candidate[key];
    if (Array.isArray(next)) return next as T[];
  }

  return [];
};

export async function createCustomerOrder(payload: CreateOrderPayload) {
  const endpoints = getApiEndpoints();
  return apiRequest<
    SuccessEnvelope<{ id?: number; order_number?: string; success?: boolean }>
  >(endpoints.customerCreateOrder, {
    method: "POST",
    body: payload,
  });
}

export async function fetchCustomerMyOrders() {
  const endpoints = getApiEndpoints();
  const response = await apiRequest<
    CustomerOrderRow[] | SuccessEnvelope<CustomerOrderRow[]>
  >(endpoints.customerMyOrders);
  return toArray<CustomerOrderRow>(unwrap(response));
}

export async function fetchCustomerOrderHistory() {
  const endpoints = getApiEndpoints();
  const response = await apiRequest<
    CustomerOrderRow[] | SuccessEnvelope<CustomerOrderRow[]>
  >(endpoints.customerOrderHistory);
  return toArray<CustomerOrderRow>(unwrap(response));
}
