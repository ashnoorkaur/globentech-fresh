/**
 * Enhanced Orders API with Session Recovery
 *
 * Automatically handles session re-establishment when requests fail due to auth issues,
 * provides detailed error messages, and ensures admin notifications are sent.
 */

import { apiRequest } from "./api-client";
import { fetchSessionUser } from "./auth-api";
import { getApiEndpoints } from "./backend-endpoints";
import { createFirebaseOrder, fetchFirebaseCustomerOrders } from "./firebase-rest";
import { emitLiveDataRefresh } from "./live-data";
import { getSessionUser } from "./session-store";

export type CustomerOrderRow = {
  id: number;
  firebase_key?: string;
  order_number?: string;
  customer_name?: string;
  company_name?: string;
  status?: string;
  priority?: string;
  sample_type?: string;
  compound_name?: string;
  quantity?: number;
  unit?: "g" | "kg" | "mL" | "L";
  notes?: string;
  rejection_reason?: string;
  assigned_technician_uid?: string;
  assigned_technician_name?: string;
  assigned_technician_email?: string;
  equipment_id?: number | null;
  equipment_name?: string;
  sample_count?: number;
  created_at?: string;
  estimated_completion?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  technician_status_action?: string;
  technician_status_note?: string;
  technician_status_updated_at?: string;
  technician_status_updated_by?: string;
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

/**
 * Improved error message for order creation failures
 */
function getOrderErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Timeout errors
    if (msg.includes("timed out") || msg.includes("abort")) {
      return "Order submission timed out. The backend server may be experiencing issues. Please try again.";
    }

    // Auth errors
    if (msg.includes("unauthorized") || msg.includes("401")) {
      return "Session expired. Please log out and log back in, then try submitting your order again.";
    }

    // Server errors
    if (msg.includes("500") || msg.includes("internal server error")) {
      return "Backend server error. Please contact support.";
    }

    return error.message;
  }

  return String(error);
}

/**
 * Create a customer order with improved error handling
 * Automatically re-establishes session if needed
 */
export async function createCustomerOrder(
  payload: CreateOrderPayload,
): Promise<
  SuccessEnvelope<{ id?: number; order_number?: string; success?: boolean }>
> {
  const endpoints = getApiEndpoints();

  try {
    const response = await createFirebaseOrder(payload, getSessionUser() || undefined);
    emitLiveDataRefresh();
    return response;
  } catch {
    // Continue to PHP fallback.
  }

  try {
    // Attempt initial request
    const response = await apiRequest<
      SuccessEnvelope<{ id?: number; order_number?: string; success?: boolean }>
    >(endpoints.customerCreateOrder, {
      method: "POST",
      body: payload,
      timeoutMs: 12000,
    });

    emitLiveDataRefresh();
    return response;
  } catch (error) {
    // If request timed out or auth failed, try to refresh session
    if (
      error instanceof Error &&
      (error.message.includes("timed out") ||
        error.message.includes("401") ||
        error.message.includes("unauthorized"))
    ) {
      try {
        // Try to re-establish session
        const freshUser = await fetchSessionUser();
        if (!freshUser) {
          throw new Error(
            "Session lost. Please log out and log back in to submit orders.",
          );
        }

        // Retry the order creation with fresh session
        return await apiRequest<
          SuccessEnvelope<{
            id?: number;
            order_number?: string;
            success?: boolean;
          }>
        >(endpoints.customerCreateOrder, {
          method: "POST",
          body: payload,
          timeoutMs: 12000,
        }).then((response) => {
          emitLiveDataRefresh();
          return response;
        });
      } catch (retryError) {
        throw new Error(
          `Order creation failed: ${getOrderErrorMessage(retryError)}`,
        );
      }
    }

    throw new Error(`Order creation failed: ${getOrderErrorMessage(error)}`);
  }
}

/**
 * Fetch customer's own orders
 */
export async function fetchCustomerMyOrders() {
  const endpoints = getApiEndpoints();
  try {
    return await fetchFirebaseCustomerOrders(getSessionUser() || undefined);
  } catch {
    // Continue to PHP fallback.
  }
  try {
    const response = await apiRequest<
      CustomerOrderRow[] | SuccessEnvelope<CustomerOrderRow[]>
    >(endpoints.customerMyOrders);
    return toArray<CustomerOrderRow>(unwrap(response));
  } catch (error) {
    throw new Error(
      `Unable to load customer orders from the real backend. ${getOrderErrorMessage(error)}`,
    );
  }
}

/**
 * Fetch customer order history
 */
export async function fetchCustomerOrderHistory() {
  const endpoints = getApiEndpoints();
  try {
    return (await fetchFirebaseCustomerOrders(getSessionUser() || undefined)).filter(
      (order) => order.status === "completed",
    );
  } catch {
    // Continue to PHP fallback.
  }
  try {
    const response = await apiRequest<
      CustomerOrderRow[] | SuccessEnvelope<CustomerOrderRow[]>
    >(endpoints.customerOrderHistory);
    return toArray<CustomerOrderRow>(unwrap(response));
  } catch (error) {
    throw new Error(
      `Unable to load customer order history from the real backend. ${getOrderErrorMessage(error)}`,
    );
  }
}

/**
 * Fetch admin order queue (all pending orders for admins to review)
 */
export async function fetchAdminOrderQueue() {
  const endpoints = getApiEndpoints();
  try {
    const response = await apiRequest<
      CustomerOrderRow[] | SuccessEnvelope<CustomerOrderRow[]>
    >(endpoints.adminPendingOrders || "/api/admin-order-queue.php");
    return toArray<CustomerOrderRow>(unwrap(response));
  } catch (error) {
    // Graceful fallback - queue might not be implemented yet
    console.warn(
      "Could not fetch admin order queue:",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}
