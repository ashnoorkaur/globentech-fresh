import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalItem = {
  id: string;
  customerName: string;
  customerEmail: string;
  requestedAt: string;
  sampleType: string;
  priority: "low" | "normal" | "high";
  status: ApprovalStatus;
  note?: string;
};

type PendingOrderRow = {
  id: number;
  order_number?: string;
  customer_name?: string;
  customer_email?: string;
  created_at?: string;
  priority?: string;
  sample_count?: number;
  status?: string;
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
  const knownListKeys = ["data", "rows", "items", "orders", "result", "queue"];
  for (const key of knownListKeys) {
    const next = candidate[key];
    if (Array.isArray(next)) return next as T[];
  }

  return [];
};

const toApprovalItem = (row: PendingOrderRow): ApprovalItem => ({
  id: String(row.id),
  customerName: row.customer_name || "Unknown customer",
  customerEmail: row.customer_email || "",
  requestedAt: row.created_at || "",
  sampleType: row.order_number || `Order #${row.id}`,
  priority:
    row.priority === "high"
      ? "high"
      : row.priority === "low"
        ? "low"
        : "normal",
  status:
    row.status === "approved" || row.status === "rejected"
      ? row.status
      : "pending",
  note:
    row.sample_count !== undefined ? `Samples: ${row.sample_count}` : undefined,
});

export async function fetchApprovalQueue() {
  const endpoints = getApiEndpoints();
  const response = await apiRequest<
    PendingOrderRow[] | SuccessEnvelope<PendingOrderRow[]>
  >(endpoints.adminPendingOrders);
  const rows = toArray<PendingOrderRow>(unwrap(response));
  return rows.map(toApprovalItem);
}

export async function updateApprovalStatus(
  id: string,
  status: Exclude<ApprovalStatus, "pending">,
) {
  const endpoints = getApiEndpoints();
  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    throw new Error("Invalid order ID.");
  }

  if (status === "approved") {
    return apiRequest<{ success?: boolean; message?: string }>(
      endpoints.adminApproveOrder,
      {
        method: "POST",
        body: { order_id: numericId, approve_order: true },
      },
    );
  }

  return apiRequest<{ success?: boolean; message?: string }>(
    endpoints.adminRejectOrder,
    {
      method: "POST",
      body: {
        order_id: numericId,
        reject_order: true,
        rejection_reason: "Order rejected by mobile administrator",
      },
    },
  );
}
