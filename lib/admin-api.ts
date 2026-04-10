import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";

export type PendingOrderDto = {
  id: number;
  order_number: string;
  customer_name: string;
  company_name?: string;
  created_at: string;
  priority: "standard" | "high";
  sample_count: number;
};

export type AdminUserDto = {
  id: number;
  full_name: string;
  email: string;
  company_name?: string;
  role: "customer" | "technician" | "administrator";
  is_active: boolean;
  last_login?: string;
};

export type ReportRequest = {
  type: "orders" | "revenue" | "equipment" | "queue";
  option: string;
};

export type ReportResponse = {
  summary?: string;
  rows?: Array<Record<string, string | number | null>>;
};

type SuccessEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

const withQuery = (
  path: string,
  params: Record<string, string | undefined>,
) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim()) {
      search.set(key, value);
    }
  });

  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
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
  const knownListKeys = ["data", "rows", "items", "orders", "users", "result"];
  for (const key of knownListKeys) {
    const next = candidate[key];
    if (Array.isArray(next)) return next as T[];
  }

  return [];
};

export async function fetchPendingOrders() {
  const endpoints = getApiEndpoints();
  const response = await apiRequest<
    PendingOrderDto[] | SuccessEnvelope<PendingOrderDto[]>
  >(endpoints.adminPendingOrders);
  return toArray<PendingOrderDto>(unwrap(response));
}

export async function approveOrder(orderId: number) {
  const endpoints = getApiEndpoints();
  return apiRequest<SuccessEnvelope<{ success: boolean }>>(
    endpoints.adminApproveOrder,
    {
      method: "POST",
      body: { order_id: orderId, approve_order: true },
    },
  );
}

export async function rejectOrder(orderId: number, reason: string) {
  const endpoints = getApiEndpoints();
  return apiRequest<SuccessEnvelope<{ success: boolean }>>(
    endpoints.adminRejectOrder,
    {
      method: "POST",
      body: { order_id: orderId, reject_order: true, rejection_reason: reason },
    },
  );
}

export async function fetchAdminUsers(filters?: {
  search?: string;
  role?: string;
  status?: string;
}) {
  const endpoints = getApiEndpoints();
  const path = withQuery(endpoints.adminUsersList, {
    user_search: filters?.search,
    user_role: filters?.role,
    user_status: filters?.status,
  });

  const response = await apiRequest<
    AdminUserDto[] | SuccessEnvelope<AdminUserDto[]>
  >(path);
  return toArray<AdminUserDto>(unwrap(response));
}

export async function changeUserRole(
  userId: number,
  role: "customer" | "technician" | "administrator",
) {
  const endpoints = getApiEndpoints();
  return apiRequest<SuccessEnvelope<{ success: boolean }>>(
    endpoints.adminChangeRole,
    {
      method: "POST",
      body: { user_id: userId, role, change_role: true },
    },
  );
}

export async function generateReport(request: ReportRequest) {
  const endpoints = getApiEndpoints();
  const response = await apiRequest<
    ReportResponse | SuccessEnvelope<ReportResponse>
  >(endpoints.reportsGenerate, {
    method: "POST",
    body: request,
  });
  return unwrap(response);
}
