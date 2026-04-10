import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { toLifecycleStatus } from "./order-workflow";
import { phpGet, phpPost } from "./php-api";

export type QueueEntry = {
  queue_id: number;
  order_id: number;
  order_number: string;
  order_status: string;
  priority: string;
  sample_types: string[];
  equipment_id: number | null;
  equipment_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_completion: string | null;
  position: number;
  queue_type: string;
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

const buildCalendarPath = (path: string, query?: CalendarQuery) => {
  const params = new URLSearchParams();
  if (query?.from) params.set("from", query.from);
  if (query?.to) params.set("to", query.to);

  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
};

export async function fetchCalendarData(query?: CalendarQuery) {
  const endpoints = getApiEndpoints();
  return phpGet<CalendarData>(buildCalendarPath(endpoints.calendarData, query));
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

  mergedQueue.sort((a, b) => a.position - b.position);

  return {
    ...calendarData,
    queue: mergedQueue,
  };
}

export async function reorderQueue(queueId: number, newPosition: number) {
  const endpoints = getApiEndpoints();
  return phpPost<Record<string, never>>(endpoints.calendarReorder, {
    queue_id: queueId,
    new_position: newPosition,
  });
}

export async function rescheduleQueue(
  queueId: number,
  scheduledStart: string,
  scheduledEnd: string,
  message?: string,
) {
  const endpoints = getApiEndpoints();
  return phpPost<Record<string, never>>(endpoints.calendarReschedule, {
    queue_id: queueId,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    message: message || "",
  });
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
  for (const path of endpointCandidates) {
    for (const body of payloadCandidates) {
      try {
        return await apiRequest<Record<string, unknown>>(path, {
          method: "POST",
          body,
        });
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
) {
  const endpoints = getApiEndpoints();
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
    start_processing: true,
    set_processing: true,
  });

  let lastError: Error | null = null;
  for (const path of candidates) {
    for (const payload of payloadCandidates) {
      try {
        return await apiRequest<Record<string, unknown>>(path, {
          method: "POST",
          body: payload,
        });
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
