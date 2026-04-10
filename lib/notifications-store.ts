import { useSyncExternalStore } from "react";
import { fetchPendingOrders } from "./admin-api";
import { fetchTechnicianWorkQueue } from "./calendar-api";
import { fetchAdminContactNotifications } from "./contact-notifications-api";
import { normalizeOrderStatusForCompare } from "./order-status-normalize";
import { fetchCustomerMyOrders } from "./orders-api";

export type NotificationCategory = "orders" | "roles" | "system";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  targetRoute?: string;
  createdAt: string;
  read: boolean;
};

type NotificationsState = {
  items: AppNotification[];
};

let state: NotificationsState = {
  items: [],
};

let previousByRole: Record<string, Record<string, string>> = {
  administrator: {},
  customer: {},
  technician: {},
};

let previousContactNotificationIds: Record<string, boolean> = {};

let pendingAdminContactAlerts: Array<{
  senderRole: "customer" | "technician";
  senderName: string;
  subject: string;
  orderNumber?: string;
  createdAt: string;
}> = [];

const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((fn) => fn());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => state;

const pushNotification = (
  title: string,
  message: string,
  category: NotificationCategory = "orders",
  targetRoute?: string,
) => {
  const item: AppNotification = {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    category,
    targetRoute,
    createdAt: new Date().toISOString(),
    read: false,
  };
  state = { items: [item, ...state.items].slice(0, 80) };
  emit();
};

const flushAdminContactAlerts = () => {
  if (pendingAdminContactAlerts.length === 0) return;

  const alerts = [...pendingAdminContactAlerts];
  pendingAdminContactAlerts = [];

  alerts.forEach((alert) => {
    pushNotification(
      "New Contact Message",
      `${alert.senderRole.toUpperCase()}: ${alert.senderName} - ${alert.subject}${
        alert.orderNumber ? ` (Order ${alert.orderNumber})` : ""
      }`,
      "system",
      "/notifications",
    );
  });
};

const syncAdminContactNotificationsFromBackend = async () => {
  const rows = await fetchAdminContactNotifications();

  rows.forEach((row) => {
    const key = String(row.id);
    if (previousContactNotificationIds[key]) return;

    previousContactNotificationIds[key] = true;
    pushNotification(
      "New Contact Message",
      `${(row.sender_role || "customer").toUpperCase()}: ${row.sender_name || "Unknown"} - ${row.subject || "Contact message"}${
        row.order_number ? ` (Order ${row.order_number})` : ""
      }`,
      "system",
      "/notifications",
    );
  });
};

const createSnapshot = (
  rows: Array<{ id: number | string; status?: string }>,
) => {
  const next: Record<string, string> = {};
  rows.forEach((row) => {
    next[String(row.id)] = normalizeOrderStatusForCompare(row.status);
  });
  return next;
};

const syncWithSnapshot = (
  role: "administrator" | "customer" | "technician",
  rows: Array<{ id: number | string; status?: string; order_number?: string }>,
) => {
  const current = createSnapshot(rows);
  const previous = previousByRole[role] || {};

  // Ignore first sync to avoid noisy initial burst.
  if (Object.keys(previous).length === 0) {
    previousByRole[role] = current;
    return;
  }

  rows.forEach((row) => {
    const key = String(row.id);
    const prevStatus = previous[key];
    const currentStatus = normalizeOrderStatusForCompare(row.status);
    const orderRef = row.order_number || `Order #${row.id}`;

    if (!prevStatus) {
      pushNotification(
        role === "administrator" ? "New Customer Order" : "New Order Update",
        role === "administrator"
          ? `${orderRef} is waiting for approval.`
          : `${orderRef} has been added.`,
        "orders",
        role === "administrator"
          ? "/admin-approvals"
          : role === "customer"
            ? "/customer-my-orders"
            : "/technician-tasks",
      );
      return;
    }

    if (prevStatus !== currentStatus) {
      pushNotification(
        role === "customer"
          ? "Your Order Status Changed"
          : "Order Status Changed",
        `${orderRef} changed from ${prevStatus} to ${currentStatus}.`,
        "orders",
        role === "administrator"
          ? "/admin-approvals"
          : role === "customer"
            ? "/customer-my-orders"
            : "/technician-tasks",
      );
    }
  });

  previousByRole[role] = current;
};

export async function syncNotificationsForRole(role?: string) {
  if (!role) return;

  try {
    if (role === "administrator") {
      flushAdminContactAlerts();
      await syncAdminContactNotificationsFromBackend();
      const rows = await fetchPendingOrders();
      syncWithSnapshot(
        "administrator",
        rows.map((r) => ({
          id: r.id,
          status: "pending",
          order_number: r.order_number,
        })),
      );
      return;
    }

    if (role === "customer") {
      const rows = await fetchCustomerMyOrders();
      syncWithSnapshot(
        "customer",
        rows.map((r) => ({
          id: r.id,
          status: normalizeOrderStatusForCompare(r.status),
          order_number: r.order_number,
        })),
      );
      return;
    }

    if (role === "technician") {
      const calendar = await fetchTechnicianWorkQueue();
      const rows = calendar.queue ?? [];
      syncWithSnapshot(
        "technician",
        rows.map((r) => ({
          id: r.order_id,
          status: normalizeOrderStatusForCompare(r.order_status),
          order_number: r.order_number,
        })),
      );
    }
  } catch {
    // Silent fallback for notification polling.
  }
}

export function queueAdminContactAlert(input: {
  senderRole: "customer" | "technician";
  senderName: string;
  subject: string;
  orderNumber?: string;
}) {
  pendingAdminContactAlerts.push({
    senderRole: input.senderRole,
    senderName: input.senderName,
    subject: input.subject,
    orderNumber: input.orderNumber,
    createdAt: new Date().toISOString(),
  });
}

export function markAllNotificationsRead() {
  state = {
    items: state.items.map((item) => ({ ...item, read: true })),
  };
  emit();
}

export function clearNotifications() {
  state = { items: [] };
  previousByRole = {
    administrator: {},
    customer: {},
    technician: {},
  };
  previousContactNotificationIds = {};
  emit();
}

export function useNotificationsState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getUnreadNotificationsCount() {
  return state.items.filter((item) => !item.read).length;
}
