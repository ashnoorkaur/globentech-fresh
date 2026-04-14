import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import {
    fetchFirebaseCalendarData,
    updateFirebaseOrderStatus,
} from "./firebase-rest";
import { emitLiveDataRefresh } from "./live-data";
import { toLifecycleStatus } from "./order-workflow";
import { phpGet, phpPost } from "./php-api";
import { getSessionUser } from "./session-store";

export type QueueEntry = {
  queue_id: number;
  firebase_key?: string;
  order_id: number;
  order_number: string;
  order_status: string;
  priority: string;
  customer_name?: string;
  company_name?: string;
  sample_type?: string;
  compound_name?: string;
  quantity?: number;
  unit?: "g" | "kg" | "mL" | "L";
  notes?: string;
  assigned_at?: string;
  assigned_technician_uid?: string;
  assigned_technician_name?: string;
  assigned_technician_email?: string;
  technician_status_action?: string;
  technician_status_note?: string;
  technician_status_updated_at?: string;
  technician_status_updated_by?: string;
  sample_types: string[];
  equipment_id: number | null;
  equipment_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_completion: string | null;
  position: number;
  queue_type: string;
};

export type OrderEquipmentAssignmentInput = {
  orderId: number;
  orderNumber?: string;
  firebaseKey?: string;
  status?: string;
};

export type EquipmentRow = {
  id: number;
  name: string;
  equipment_type: string;
  processing_time_per_sample: number;
  warmup_time: number;
  break_interval: number;
  break_duration: number;
  daily_capacity: number;
  is_available: boolean;
  last_maintenance?: string | null;
};

export type UtilizationSlot = {
  queue_id: number;
  order_id: number;
  order_number: string;
  scheduled_start: string;
  scheduled_end: string;
  order_status: string;
};

export type EquipmentUtilization = {
  id: number;
  name: string;
  equipment_type: string;
  slots: UtilizationSlot[];
};

type CalendarData = {
  queue: QueueEntry[];
  equipment: EquipmentRow[];
  utilization: EquipmentUtilization[];
};

type CalendarEventsLike =
  | unknown[]
  | {
      data?: unknown[];
      rows?: unknown[];
      items?: unknown[];
      result?: unknown[];
      events?: unknown[];
      success?: boolean;
    };

type CalendarQuery = {
  from?: string;
  to?: string;
};

const toEquipmentRows = (rows?: Array<Partial<EquipmentRow>>): EquipmentRow[] => {
  return (rows ?? []).map((item, index) => ({
    id: typeof item.id === "number" ? item.id : -(index + 1),
    name: item.name || `Equipment ${index + 1}`,
    equipment_type: item.equipment_type || "",
    processing_time_per_sample: item.processing_time_per_sample ?? 0,
    warmup_time: item.warmup_time ?? 0,
    break_interval: item.break_interval ?? 0,
    break_duration: item.break_duration ?? 0,
    daily_capacity: item.daily_capacity ?? 0,
    is_available: item.is_available !== false,
    last_maintenance: item.last_maintenance ?? null,
  }));
};

const buildCalendarPath = (path: string, query?: CalendarQuery) => {
  const params = new URLSearchParams();
  if (query?.from) params.set("from", query.from);
  if (query?.to) params.set("to", query.to);

  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
};

export async function fetchCalendarData(query?: CalendarQuery) {
  const endpoints = getApiEndpoints();
  try {
    const result = await fetchFirebaseCalendarData();
    return {
      queue: result.queue ?? [],
      equipment: toEquipmentRows(result.equipment),
      utilization: result.utilization ?? [],
    };
  } catch {
    // Continue to PHP fallback.
  }
  try {
    return await phpGet<CalendarData>(buildCalendarPath(endpoints.calendarData, query), {
      noCache: true,
      timeoutMs: 12000,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unable to load calendar data from the real backend.",
    );
  }
}

const toNumberOrDefault = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toStringOrNull = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => toStringOrNull(item))
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseOrderIdFromOrderNumber = (orderNumber: string): number | null => {
  const match = orderNumber.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const extractRows = (payload: CalendarEventsLike): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const wrapped = payload as Record<string, unknown>;
  const keys = ["data", "rows", "items", "result", "events"];
  for (const key of keys) {
    const candidate = wrapped[key];
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
};

const toFallbackQueueEntry = (
  item: unknown,
  index: number,
): QueueEntry | null => {
  if (!item || typeof item !== "object") return null;

  const row = item as Record<string, unknown>;
  const orderNumber =
    toStringOrNull(row.order_number ?? row.orderNumber ?? row.title) ||
    `ORDER-${index + 1}`;
  const fallbackOrderId = parseOrderIdFromOrderNumber(orderNumber) ?? 0;
  const orderId = toNumberOrDefault(
    row.order_id ?? row.orderId ?? row.id,
    fallbackOrderId,
  );
  const rawStatus =
    toStringOrNull(row.order_status ?? row.status ?? row.state) || "approved";
  const lifecycle = toLifecycleStatus(rawStatus);

  if (lifecycle === "submitted" || lifecycle === "rejected") {
    return null;
  }

  return {
    queue_id: toNumberOrDefault(row.queue_id ?? row.queueId, -(index + 1)),
    order_id: orderId,
    order_number: orderNumber,
    order_status: rawStatus,
    priority: toStringOrNull(row.priority) || "standard",
    customer_name: toStringOrNull(
      row.customer_name ?? row.customerName ?? row.customer,
    ) || undefined,
    company_name: toStringOrNull(
      row.company_name ?? row.companyName ?? row.company,
    ) || undefined,
    sample_type: toStringOrNull(row.sample_type ?? row.sampleType) || undefined,
    compound_name: toStringOrNull(
      row.compound_name ?? row.compoundName ?? row.compound,
    ) || undefined,
    quantity:
      typeof row.quantity === "number"
        ? row.quantity
        : typeof row.quantity === "string"
          ? Number(row.quantity) || undefined
          : undefined,
    unit: (toStringOrNull(row.unit) as QueueEntry["unit"]) || undefined,
    notes: toStringOrNull(row.notes) || undefined,
    assigned_at:
      toStringOrNull(row.assigned_at ?? row.assignedAt) || undefined,
    assigned_technician_uid:
      toStringOrNull(
        row.assigned_technician_uid ?? row.assignedTechnicianUid,
      ) || undefined,
    assigned_technician_name:
      toStringOrNull(
        row.assigned_technician_name ?? row.assignedTechnicianName,
      ) || undefined,
    assigned_technician_email:
      toStringOrNull(
        row.assigned_technician_email ?? row.assignedTechnicianEmail,
      ) || undefined,
    technician_status_action:
      toStringOrNull(
        row.technician_status_action ?? row.technicianStatusAction,
      ) || undefined,
    technician_status_note:
      toStringOrNull(
        row.technician_status_note ?? row.technicianStatusNote,
      ) || undefined,
    technician_status_updated_at:
      toStringOrNull(
        row.technician_status_updated_at ?? row.technicianStatusUpdatedAt,
      ) || undefined,
    technician_status_updated_by:
      toStringOrNull(
        row.technician_status_updated_by ?? row.technicianStatusUpdatedBy,
      ) || undefined,
    sample_types: toStringArray(row.sample_types ?? row.sampleTypes),
    equipment_id: toNullableNumber(row.equipment_id ?? row.equipmentId),
    equipment_name: toStringOrNull(
      row.equipment_name ?? row.equipmentName ?? row.resource,
    ),
    scheduled_start: toStringOrNull(
      row.scheduled_start ?? row.start ?? row.start_time ?? row.startTime,
    ),
    scheduled_end: toStringOrNull(
      row.scheduled_end ?? row.end ?? row.end_time ?? row.endTime,
    ),
    estimated_completion: toStringOrNull(
      row.estimated_completion ?? row.eta ?? row.scheduled_end ?? row.end,
    ),
    position: toNumberOrDefault(row.position ?? row.index, index + 1),
    queue_type: toStringOrNull(row.queue_type ?? row.type) || "event_fallback",
  };
};

export async function fetchTechnicianWorkQueue(query?: CalendarQuery) {
  const endpoints = getApiEndpoints();
  const calendarData = await fetchCalendarData(query);

  let mergedQueue = [...(calendarData.queue ?? [])];
  const knownOrderIds = new Set(mergedQueue.map((item) => item.order_id));
  const knownOrderNumbers = new Set(
    mergedQueue.map((item) => item.order_number.toLowerCase()),
  );

  try {
    const eventsPayload = await apiRequest<CalendarEventsLike>(
      endpoints.getCalendarEvents,
    );
    const rows = extractRows(eventsPayload);
    const fallbackRows = rows
      .map((row, index) => toFallbackQueueEntry(row, index))
      .filter((entry): entry is QueueEntry => Boolean(entry));

    const appendable = fallbackRows.filter((entry) => {
      const key = entry.order_number.toLowerCase();
      if (knownOrderIds.has(entry.order_id) || knownOrderNumbers.has(key)) {
        return false;
      }
      knownOrderIds.add(entry.order_id);
      knownOrderNumbers.add(key);
      return true;
    });

    if (appendable.length > 0) {
      mergedQueue = [...mergedQueue, ...appendable];
    }
  } catch {
    // Fallback endpoint is optional; keep queue-only mode if unavailable.
  }

  const sessionUser = getSessionUser();
  const technicianUid = (sessionUser?.firebase_uid || "").trim().toLowerCase();
  const technicianEmail = (sessionUser?.email || "").trim().toLowerCase();
  const technicianName = (sessionUser?.full_name || "").trim().toLowerCase();

  if (sessionUser?.role === "technician") {
    mergedQueue = mergedQueue.filter((entry) => {
      const assignedUid = (entry.assigned_technician_uid || "").trim().toLowerCase();
      const assignedEmail = (entry.assigned_technician_email || "").trim().toLowerCase();
      const assignedName = (entry.assigned_technician_name || "").trim().toLowerCase();
      const hasExplicitAssignment = Boolean(
        assignedUid || assignedEmail || assignedName,
      );

      if (!hasExplicitAssignment) {
        return true;
      }

      return (
        (technicianUid && assignedUid === technicianUid) ||
        (technicianEmail && assignedEmail === technicianEmail) ||
        (technicianName && assignedName === technicianName)
      );
    });
  }

  mergedQueue.sort((a, b) => a.position - b.position);

  return {
    ...calendarData,
    queue: mergedQueue,
  };
}

export async function reorderQueue(queueId: number, newPosition: number) {
  const endpoints = getApiEndpoints();
  const response = await phpPost<Record<string, never>>(endpoints.calendarReorder, {
    queue_id: queueId,
    new_position: newPosition,
  });
  emitLiveDataRefresh();
  return response;
}

const buildTechnicianUpdatePayload = (
  action: string,
  note: string,
  extra?: Record<string, unknown>,
) => {
  const sessionUser = getSessionUser();
  return {
    ...extra,
    technicianStatusAction: action,
    technicianStatusNote: note,
    technicianStatusUpdatedAt: new Date().toISOString(),
    technicianStatusUpdatedBy:
      sessionUser?.full_name || sessionUser?.email || "Technician",
  };
};

export async function assignOrderEquipment(
  order: OrderEquipmentAssignmentInput,
  equipment: { id?: number; name: string } | null,
) {
  const sessionUser = getSessionUser();
  const actorLabel =
    sessionUser?.role === "administrator"
      ? "Admin"
      : sessionUser?.role === "technician"
        ? "Technician"
        : "User";
  const note = equipment
    ? `${actorLabel} assigned equipment ${equipment.name} to this order.`
    : `${actorLabel} cleared the equipment assignment for this order.`;

  try {
    const response = await updateFirebaseOrderStatus(
      {
        firebase_key: order.firebaseKey,
        orderNumber: order.orderNumber,
        id: order.orderId,
      },
      order.status || "Approved",
      buildTechnicianUpdatePayload("equipment_assigned", note, {
        equipmentId: equipment?.id ?? null,
        equipmentName: equipment?.name ?? null,
      }),
    );
    emitLiveDataRefresh();
    return response;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Unable to assign equipment to this order.",
    );
  }
}

export async function rescheduleQueue(
  input:
    | number
    | {
        queueId?: number;
        orderId?: number;
        orderNumber?: string;
      },
  scheduledStart: string,
  scheduledEnd: string,
  message?: string,
) {
  const endpoints = getApiEndpoints();
  const orderId =
    typeof input === "number"
      ? undefined
      : typeof input.orderId === "number"
        ? input.orderId
        : undefined;
  const orderNumber = typeof input === "number" ? undefined : input.orderNumber;
  const queueId =
    typeof input === "number"
      ? input
      : typeof input.queueId === "number"
        ? input.queueId
        : undefined;
  const note = message || "Technician logged a delay from the mobile app.";
  try {
    const response = await updateFirebaseOrderStatus(
      { orderNumber, id: orderId ?? queueId },
      "Processing",
      buildTechnicianUpdatePayload("delay_logged", note, {
        scheduledStart,
        scheduledEnd,
        estimatedCompletion: scheduledEnd,
      }),
    );
    emitLiveDataRefresh();
    return response as unknown as Record<string, never>;
  } catch {
    // Continue to PHP fallback.
  }
  const response = await phpPost<Record<string, never>>(endpoints.calendarReschedule, {
    queue_id: queueId,
    order_id: orderId,
    order_number: orderNumber,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    message: note,
  });
  emitLiveDataRefresh();
  return response;
}

export async function completeQueueOrder(
  input:
    | number
    | {
        orderId?: number;
        orderNumber?: string;
        queueId?: number;
      },
) {
  const endpoints = getApiEndpoints();
  const orderId =
    typeof input === "number"
      ? input
      : typeof input.orderId === "number"
        ? input.orderId
        : undefined;
  const orderNumber = typeof input === "number" ? undefined : input.orderNumber;
  const queueId =
    typeof input === "number"
      ? undefined
      : typeof input.queueId === "number"
        ? input.queueId
        : undefined;
        const note = "Technician marked the order as completed from the mobile app.";

  const endpointCandidates = [
    endpoints.orderComplete,
    "/api/order-update-status.php",
    "/api/order-status-update.php",
  ];

  const payloadCandidates: Record<string, unknown>[] = [];
  if (typeof orderId === "number" && orderId > 0) {
    payloadCandidates.push({ order_id: orderId, complete_order: true });
    payloadCandidates.push({ order_id: orderId, status: "completed" });
    payloadCandidates.push({ id: orderId, status: "completed" });
  }
  if (orderNumber) {
    payloadCandidates.push({ order_number: orderNumber, status: "completed" });
    payloadCandidates.push({ order_no: orderNumber, status: "completed" });
  }
  if (typeof queueId === "number" && queueId > 0) {
    payloadCandidates.push({ queue_id: queueId, status: "completed" });
  }
  payloadCandidates.push({
    order_id: orderId,
    order_number: orderNumber,
    queue_id: queueId,
    status: "completed",
    complete_order: true,
    mark_complete: true,
  });

  let lastError: Error | null = null;
  try {
    const response = await updateFirebaseOrderStatus(
      { orderNumber, id: orderId },
      "Completed",
      buildTechnicianUpdatePayload("completed", note, {
        estimatedCompletion: new Date().toISOString(),
        scheduledEnd: new Date().toISOString(),
      }),
    );
    emitLiveDataRefresh();
    return response as Record<string, unknown>;
  } catch {
    // Continue to PHP fallback.
  }
  for (const path of endpointCandidates) {
    for (const body of payloadCandidates) {
      try {
        const response = await apiRequest<Record<string, unknown>>(path, {
          method: "POST",
          body,
        });
        emitLiveDataRefresh();
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw (
    lastError || new Error("Unable to complete order with available endpoints.")
  );
}

export async function startQueueProcessing(
  orderId: number,
  queueId?: number,
  orderNumber?: string,
  options?: {
    scheduledStart?: string;
    scheduledEnd?: string;
    note?: string;
  },
) {
  const endpoints = getApiEndpoints();
  const scheduledStart = options?.scheduledStart || new Date().toISOString();
  const note =
    options?.note || "Technician started processing from the mobile app.";
  const candidates = [
    endpoints.orderStartProcessing,
    // Some backends reuse order-complete endpoint for status transitions.
    endpoints.orderComplete,
  ];

  const payloadCandidates: Record<string, unknown>[] = [];
  if (orderId > 0) {
    payloadCandidates.push({ order_id: orderId, status: "processing" });
    payloadCandidates.push({ id: orderId, status: "processing" });
  }
  if (orderNumber) {
    payloadCandidates.push({ order_number: orderNumber, status: "processing" });
    payloadCandidates.push({ order_no: orderNumber, status: "processing" });
  }
  if (typeof queueId === "number" && queueId > 0) {
    payloadCandidates.push({ queue_id: queueId, status: "processing" });
  }
  payloadCandidates.push({
    order_id: orderId > 0 ? orderId : undefined,
    queue_id: queueId,
    order_number: orderNumber,
    status: "processing",
    scheduled_start: options?.scheduledStart,
    scheduled_end: options?.scheduledEnd,
    message: note,
    start_processing: true,
    set_processing: true,
  });

  let lastError: Error | null = null;
  try {
    const response = await updateFirebaseOrderStatus(
      { orderNumber, id: orderId },
      "Processing",
      buildTechnicianUpdatePayload("processing_started", note, {
        scheduledStart,
        scheduledEnd: options?.scheduledEnd,
        estimatedCompletion: options?.scheduledEnd,
      }),
    );
    emitLiveDataRefresh();
    return response as Record<string, unknown>;
  } catch {
    // Continue to PHP fallback.
  }
  for (const path of candidates) {
    for (const payload of payloadCandidates) {
      try {
        const response = await apiRequest<Record<string, unknown>>(path, {
          method: "POST",
          body: payload,
        });
        emitLiveDataRefresh();
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "Unable to start processing. No compatible status endpoint found.",
    )
  );
}
