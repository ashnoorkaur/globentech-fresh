import { useSyncExternalStore } from "react";
import { fetchAdminOrderHistory } from "./admin-api";
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

type NotificationOrderRow = {
  id: number | string;
  status?: string;
  order_number?: string;
  assigned_technician_uid?: string;
  assigned_technician_name?: string;
  assigned_technician_email?: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  estimated_completion?: string | null;
  rejection_reason?: string | null;
  technician_status_action?: string | null;
  technician_status_note?: string | null;
  technician_status_updated_at?: string | null;
  equipment_name?: string | null;
};

type OrderNotificationSnapshot = {
  status: string;
  assignedTechnician: string;
  scheduledStart: string;
  scheduledEnd: string;
  estimatedCompletion: string;
  rejectionReason: string;
  technicianAction: string;
  technicianNote: string;
  technicianUpdatedAt: string;
  equipmentName: string;
};

let state: NotificationsState = {
  items: [],
};

const NOTIFICATION_SYNC_INTERVAL_MS = 25000;

let previousByRole: Record<string, Record<string, OrderNotificationSnapshot>> = {
  administrator: {},
  customer: {},
  technician: {},
};

let lastSyncAtByRole: Partial<
  Record<"administrator" | "customer" | "technician", number>
> = {};
let inFlightSyncByRole: Partial<
  Record<"administrator" | "customer" | "technician", Promise<void>>
> = {};

let previousContactNotificationIds: Record<string, boolean> = {};

let pendingAdminContactAlerts: Array<{
  senderRole: "customer" | "technician";
  senderName: string;
  subject: string;
  orderNumber?: string;
  createdAt: string;
}> = [];

const listeners = new Set<() => void>();
let emitScheduled = false;

const emit = () => {
  listeners.forEach((fn) => fn());
};

const scheduleEmit = () => {
  if (emitScheduled) return;
  emitScheduled = true;
  setTimeout(() => {
    emitScheduled = false;
    emit();
  }, 0);
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
  scheduleEmit();
};

const toRoleKey = (role?: string) => {
  if (role === "administrator") return "administrator";
  if (role === "customer") return "customer";
  if (role === "technician") return "technician";
  return undefined;
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

const toSnapshotValue = (value?: string | null) => (value || "").trim();

const toStatusText = (value: string) => value.replace(/_/g, " ");

const createSnapshot = (rows: NotificationOrderRow[]) => {
  const next: Record<string, OrderNotificationSnapshot> = {};
  rows.forEach((row) => {
    next[String(row.id)] = {
      status: normalizeOrderStatusForCompare(row.status),
      assignedTechnician:
        toSnapshotValue(row.assigned_technician_name) ||
        toSnapshotValue(row.assigned_technician_email) ||
        toSnapshotValue(row.assigned_technician_uid),
      scheduledStart: toSnapshotValue(row.scheduled_start),
      scheduledEnd: toSnapshotValue(row.scheduled_end),
      estimatedCompletion: toSnapshotValue(row.estimated_completion),
      rejectionReason: toSnapshotValue(row.rejection_reason),
      technicianAction: toSnapshotValue(row.technician_status_action),
      technicianNote: toSnapshotValue(row.technician_status_note),
      technicianUpdatedAt: toSnapshotValue(row.technician_status_updated_at),
      equipmentName: toSnapshotValue(row.equipment_name),
    };
  });
  return next;
};

const routeForRole = (
  role: "administrator" | "customer" | "technician",
  status?: string,
  orderNumber?: string,
) => {
  const encodedOrder = orderNumber ? encodeURIComponent(orderNumber) : "";

  if (role === "administrator") {
    if (status === "pending") {
      return encodedOrder
        ? `/admin-approvals?highlight=${encodedOrder}`
        : "/admin-approvals";
    }

    return encodedOrder
      ? `/admin-order-history?search=${encodedOrder}`
      : "/admin-order-history";
  }
  if (role === "customer") {
    return encodedOrder
      ? `/customer-my-orders?search=${encodedOrder}`
      : "/customer-my-orders";
  }
  return encodedOrder
    ? `/technician-calendar?search=${encodedOrder}`
    : "/technician-calendar";
};

const formatScheduleMessage = (snapshot: OrderNotificationSnapshot) => {
  const start = snapshot.scheduledStart || "schedule pending";
  const end = snapshot.scheduledEnd || snapshot.estimatedCompletion || "end time pending";
  return `Schedule updated: ${start} to ${end}.`;
};

const syncWithSnapshot = (
  role: "administrator" | "customer" | "technician",
  rows: NotificationOrderRow[],
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
    const prevSnapshot = previous[key];
    const currentSnapshot = current[key];
    const currentStatus = currentSnapshot.status;
    const orderRef = row.order_number || `Order #${row.id}`;

    if (!prevSnapshot) {
      pushNotification(
        role === "administrator" ? "New Customer Order" : "New Order Update",
        role === "administrator"
          ? `${orderRef} is waiting for approval.`
          : `${orderRef} has been added.`,
        "orders",
        routeForRole(role, currentStatus, row.order_number),
      );
      return;
    }

    if (prevSnapshot.status !== currentStatus) {
      if (role === "customer" && currentStatus === "payment_pending") {
        pushNotification(
          "Payment Required",
          `${orderRef} was approved and is now waiting for your payment before technician processing starts.`,
          "orders",
          routeForRole(role, currentStatus, row.order_number),
        );
        return;
      }

      pushNotification(
        role === "customer"
          ? "Your Order Status Changed"
          : "Order Status Changed",
        `${orderRef} changed from ${toStatusText(prevSnapshot.status)} to ${toStatusText(currentStatus)}.`,
        "orders",
        routeForRole(role, currentStatus, row.order_number),
      );
      return;
    }

    if (prevSnapshot.assignedTechnician !== currentSnapshot.assignedTechnician) {
      pushNotification(
        role === "customer" ? "Order Assignment Updated" : "Technician Assignment Updated",
        currentSnapshot.assignedTechnician
          ? `${orderRef} is now assigned to ${currentSnapshot.assignedTechnician}.`
          : `${orderRef} no longer has an assigned technician.`,
        "orders",
        routeForRole(role, currentStatus, row.order_number),
      );
      return;
    }

    if (
      prevSnapshot.scheduledStart !== currentSnapshot.scheduledStart ||
      prevSnapshot.scheduledEnd !== currentSnapshot.scheduledEnd ||
      prevSnapshot.estimatedCompletion !== currentSnapshot.estimatedCompletion
    ) {
      pushNotification(
        "Order Schedule Updated",
        `${orderRef}: ${formatScheduleMessage(currentSnapshot)}`,
        "orders",
        routeForRole(role, currentStatus, row.order_number),
      );
      return;
    }

    if (prevSnapshot.equipmentName !== currentSnapshot.equipmentName && currentSnapshot.equipmentName) {
      pushNotification(
        "Equipment Updated",
        `${orderRef} is now scheduled on ${currentSnapshot.equipmentName}.`,
        "orders",
        routeForRole(role, currentStatus, row.order_number),
      );
      return;
    }

    if (
      prevSnapshot.technicianUpdatedAt !== currentSnapshot.technicianUpdatedAt ||
      prevSnapshot.technicianAction !== currentSnapshot.technicianAction ||
      prevSnapshot.technicianNote !== currentSnapshot.technicianNote
    ) {
      pushNotification(
        "Technician Update",
        currentSnapshot.technicianNote
          ? `${orderRef}: ${currentSnapshot.technicianNote}`
          : `${orderRef} received a technician update.`,
        "orders",
        routeForRole(role, currentStatus, row.order_number),
      );
    }
  });

  previousByRole[role] = current;
};

export async function syncNotificationsForRole(role?: string) {
  const roleKey = toRoleKey(role);
  if (!roleKey) return;

  const inFlight = inFlightSyncByRole[roleKey];
  if (inFlight) {
    return inFlight;
  }

  const lastSyncAt = lastSyncAtByRole[roleKey] ?? 0;
  if (Date.now() - lastSyncAt < NOTIFICATION_SYNC_INTERVAL_MS) {
    return;
  }

  const syncTask = (async () => {
    try {
      if (roleKey === "administrator") {
        flushAdminContactAlerts();
        
        // Parallelize admin sync operations with partial success support
        const [contactResult, ordersResult] = await Promise.allSettled([
          syncAdminContactNotificationsFromBackend(),
          fetchAdminOrderHistory(),
        ]);
        
        // Process successful results
        if (ordersResult.status === "fulfilled") {
          syncWithSnapshot(
            "administrator",
            ordersResult.value.map((r) => ({
              id: r.id,
              status: r.status,
              order_number: r.order_number,
              assigned_technician_uid: r.assigned_technician_uid,
              assigned_technician_name: r.assigned_technician_name,
              assigned_technician_email: r.assigned_technician_email,
              scheduled_start: r.scheduled_start,
              scheduled_end: r.scheduled_end,
              estimated_completion: r.estimated_completion,
              rejection_reason: r.rejection_reason,
              technician_status_action: r.technician_status_action,
              technician_status_note: r.technician_status_note,
              technician_status_updated_at: r.technician_status_updated_at,
              equipment_name: r.equipment_name,
            })),
          );
        }
        lastSyncAtByRole[roleKey] = Date.now();
        return;
      }

      if (roleKey === "customer") {
        const rows = await fetchCustomerMyOrders();
        syncWithSnapshot(
          "customer",
          rows.map((r) => ({
            id: r.id,
            status: normalizeOrderStatusForCompare(r.status),
            order_number: r.order_number,
            assigned_technician_uid: r.assigned_technician_uid,
            assigned_technician_name: r.assigned_technician_name,
            assigned_technician_email: r.assigned_technician_email,
            scheduled_start: r.scheduled_start,
            scheduled_end: r.scheduled_end,
            estimated_completion: r.estimated_completion,
            rejection_reason: r.rejection_reason,
            technician_status_action: r.technician_status_action,
            technician_status_note: r.technician_status_note,
            technician_status_updated_at: r.technician_status_updated_at,
            equipment_name: r.equipment_name,
          })),
        );
        lastSyncAtByRole[roleKey] = Date.now();
        return;
      }

      const calendar = await fetchTechnicianWorkQueue();
      const rows = calendar.queue ?? [];
      syncWithSnapshot(
        "technician",
        rows.map((r) => ({
          id: r.order_id,
          status: normalizeOrderStatusForCompare(r.order_status),
          order_number: r.order_number,
          assigned_technician_uid: r.assigned_technician_uid,
          assigned_technician_name: r.assigned_technician_name,
          assigned_technician_email: r.assigned_technician_email,
          scheduled_start: r.scheduled_start,
          scheduled_end: r.scheduled_end,
          estimated_completion: r.estimated_completion,
          technician_status_action: r.technician_status_action,
          technician_status_note: r.technician_status_note,
          technician_status_updated_at: r.technician_status_updated_at,
          equipment_name: r.equipment_name,
        })),
      );
    } catch {
      // Silent fallback for notification polling.
    } finally {
      lastSyncAtByRole[roleKey] = Date.now();
      delete inFlightSyncByRole[roleKey];
    }
  })();

  inFlightSyncByRole[roleKey] = syncTask;
  return syncTask;
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
  lastSyncAtByRole = {};
  inFlightSyncByRole = {};
  previousContactNotificationIds = {};
  emit();
}

export function useNotificationsState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getUnreadNotificationsCount() {
  return state.items.filter((item) => !item.read).length;
}
