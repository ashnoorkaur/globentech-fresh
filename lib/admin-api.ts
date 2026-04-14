import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import {
    fetchFirebaseAdminOrderHistory,
    fetchFirebaseAdminUsers,
    fetchFirebasePendingOrders,
    fetchFirebaseReport,
    updateFirebaseOrderStatus,
} from "./firebase-rest";
import { emitLiveDataRefresh } from "./live-data";

export type PendingOrderDto = {
  id: number;
  firebase_key?: string;
  order_number: string;
  customer_name: string;
  customer_email?: string;
  company_name?: string;
  created_at: string;
  priority: "standard" | "high";
  sample_count: number;
  sample_type?: string;
  compound_name?: string;
  quantity?: number;
  unit?: "g" | "kg" | "mL" | "L";
  notes?: string;
  estimated_completion?: string;
  equipment_id?: number | null;
  equipment_name?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  assigned_at?: string;
  assigned_technician_uid?: string;
  assigned_technician_name?: string;
  assigned_technician_email?: string;
  technician_status_action?: string;
  technician_status_note?: string;
  technician_status_updated_at?: string;
  technician_status_updated_by?: string;
};

export type AdminOrderHistoryDto = PendingOrderDto & {
  status: string;
  rejection_reason?: string;
};

export type AdminUserDto = {
  id: number;
  firebase_uid?: string;
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
  try {
    return await fetchFirebasePendingOrders();
  } catch {
    // Continue to PHP fallback.
  }
  try {
    const response = await apiRequest<
      PendingOrderDto[] | SuccessEnvelope<PendingOrderDto[]>
    >(endpoints.adminPendingOrders, {
      noCache: true,
      timeoutMs: 12000,
    });
    return toArray<PendingOrderDto>(unwrap(response));
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unable to load pending orders from the real backend.",
    );
  }
}

export async function approveOrder(order: number | PendingOrderDto) {
  const endpoints = getApiEndpoints();
  const orderId = typeof order === "number" ? order : order.id;
  const orderNumber = typeof order === "number" ? undefined : order.order_number;
  const firebaseKey = typeof order === "number" ? undefined : order.firebase_key;
  try {
    const response = await updateFirebaseOrderStatus(
      { firebase_key: firebaseKey, orderNumber, id: orderId },
      "Approved",
      { rejectionReason: null },
    );
    emitLiveDataRefresh();
    return response;
  } catch {
    // Continue to PHP fallback.
  }
  try {
    const response = await apiRequest<SuccessEnvelope<{ success: boolean }>>(
      endpoints.adminApproveOrder,
      {
        method: "POST",
        body: { order_id: orderId, approve_order: true },
      },
    );
    emitLiveDataRefresh();
    return response;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unable to approve order in the real backend.",
    );
  }
}

export async function rejectOrder(order: number | PendingOrderDto, reason: string) {
  const endpoints = getApiEndpoints();
  const orderId = typeof order === "number" ? order : order.id;
  const orderNumber = typeof order === "number" ? undefined : order.order_number;
  const firebaseKey = typeof order === "number" ? undefined : order.firebase_key;
  try {
    const response = await updateFirebaseOrderStatus(
      { firebase_key: firebaseKey, orderNumber, id: orderId },
      "Rejected",
      { rejectionReason: reason },
    );
    emitLiveDataRefresh();
    return response;
  } catch {
    // Continue to PHP fallback.
  }
  try {
    const response = await apiRequest<SuccessEnvelope<{ success: boolean }>>(
      endpoints.adminRejectOrder,
      {
        method: "POST",
        body: { order_id: orderId, reject_order: true, rejection_reason: reason },
      },
    );
    emitLiveDataRefresh();
    return response;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unable to reject order in the real backend.",
    );
  }
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

  try {
    return await fetchFirebaseAdminUsers(filters);
  } catch {
    // Continue to PHP fallback.
  }

  try {
    const response = await apiRequest<
      AdminUserDto[] | SuccessEnvelope<AdminUserDto[]>
    >(path, {
      noCache: true,
      timeoutMs: 12000,
    });
    return toArray<AdminUserDto>(unwrap(response));
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unable to load admin users from the real backend.",
    );
  }
}

export async function changeUserRole(
  userId: number,
  role: "customer" | "technician" | "administrator",
) {
  const endpoints = getApiEndpoints();
  const response = await apiRequest<SuccessEnvelope<{ success: boolean }>>(
    endpoints.adminChangeRole,
    {
      method: "POST",
      body: { user_id: userId, role, change_role: true },
    },
  );
  emitLiveDataRefresh();
  return response;
}

export async function generateReport(request: ReportRequest) {
  const endpoints = getApiEndpoints();
  try {
    return await fetchFirebaseReport(request);
  } catch {
    // Continue to PHP fallback.
  }
  try {
    const response = await apiRequest<
      ReportResponse | SuccessEnvelope<ReportResponse>
    >(endpoints.reportsGenerate, {
      method: "POST",
      body: request,
    });
    return unwrap(response);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unable to generate report from the real backend.",
    );
  }
}

export async function fetchAdminOrderHistory() {
  try {
    return await fetchFirebaseAdminOrderHistory();
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unable to load admin order history from the real backend.",
    );
  }
}

  export async function assignOrderTechnician(
    order: Pick<
      PendingOrderDto,
      | "id"
      | "firebase_key"
      | "order_number"
      | "assigned_technician_uid"
      | "assigned_technician_name"
      | "assigned_technician_email"
    > & { status?: string },
    technician:
      | Pick<AdminUserDto, "firebase_uid" | "full_name" | "email">
      | null,
  ) {
    try {
      const response = await updateFirebaseOrderStatus(
        {
          firebase_key: order.firebase_key,
          orderNumber: order.order_number,
          id: order.id,
        },
        order.status || "Approved",
        {
          assignedTechnicianUid: technician?.firebase_uid || null,
          assignedTechnicianName: technician?.full_name || null,
          assignedTechnicianEmail: technician?.email || null,
          assignedAt: technician ? new Date().toISOString() : null,
        },
      );
      emitLiveDataRefresh();
      return response;
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Unable to assign technician to this order.",
      );
    }
  }
