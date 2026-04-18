import { apiRequest, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { formatBackendTimestamp } from "./date-time";
import { fetchEquipmentList } from "./equipment-api";
import { emitLiveDataRefresh } from "./live-data";
import {
    applyLiveOrderOverride,
    hydrateLiveOrderOverrides,
    rememberLiveOrderOverride,
} from "./order-live-overrides";
import {
    mergeRememberedOrderRequestDetails,
    rememberOrderRequestDetails,
} from "./order-request-details-store";
import { toLifecycleStatus } from "./order-workflow";
import { phpGet, phpPost } from "./php-api";
import { getSessionUser } from "./session-store";
import { getWebRoutes } from "./web-routes";

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
  sample_count?: number;
  notes?: string;
  created_at?: string;
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
  queueId?: number;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
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

const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&nbsp;/gi, " ");

const stripTags = (value: string) =>
  decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const postLegacyForm = async (
  path: string,
  body: Record<string, unknown>,
) => {
  const candidates = getApiBaseUrlCandidates().slice(0, 2);
  let lastError: Error | null = null;

  const params = new URLSearchParams();
  Object.entries(body).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      params.append(key, String(value));
    }
  });

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json,text/plain,*/*",
          "User-Agent": DESKTOP_CHROME_UA,
        },
        body: params.toString(),
      });

      const text = await response.text();
      const cleaned = text.replace(/^\uFEFF+/, "").trim();
      let parsed: Record<string, unknown> | null = null;

      if (cleaned) {
        try {
          parsed = JSON.parse(cleaned) as Record<string, unknown>;
        } catch {
          parsed = { message: cleaned };
        }
      }

      if (!response.ok) {
        if (response.status === 404) {
          lastError = new Error(`Request failed with 404 at ${base}${path}`);
          continue;
        }

        const errorMessage =
          (parsed?.error as string | undefined) ||
          (parsed?.message as string | undefined) ||
          `Request failed with ${response.status}`;
        throw new Error(errorMessage);
      }

      if (parsed && parsed.success === false) {
        throw new Error(
          (parsed.error as string | undefined) ||
            (parsed.message as string | undefined) ||
            "Backend request failed.",
        );
      }

      return parsed ?? { success: true };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Form request failed.");
};

const fetchLegacyCalendarHtml = async (path: string, init?: RequestInit) => {
  const candidates = getApiBaseUrlCandidates().slice(0, 2);
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: "GET",
        credentials: "include",
        ...init,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": DESKTOP_CHROME_UA,
          ...(init?.headers as Record<string, string>),
        },
      });
      if (response.status === 404) continue;
      if (!response.ok) {
        lastError = new Error(`Calendar page failed with status ${response.status}`);
        continue;
      }
      const html = await response.text();
      if (/email address\s+password\s+login/i.test(stripTags(html))) {
        throw new Error("Session expired. Please log in again.");
      }
      return html;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Shared website calendar page not found.");
};

const inferQueueSnippetPriority = (snippet: string) => {
  const s = snippet.toLowerCase();
  if (/priority-standard|badge-standard|\bstandard\s*priority\b/.test(s)) return "standard";
  if (/badge-prioritized|priority-high|high-priority|\bhigh\b/.test(s)) return "high";
  return "standard";
};

const parseLegacyQueueHtml = (html: string): QueueEntry[] => {
  const matches = Array.from(html.matchAll(/ORD-\d{8}-\d+/gi));
  const rows: QueueEntry[] = [];

  matches.forEach((match, index) => {
    const orderNumber = match[0];
    if (rows.some((row) => row.order_number === orderNumber)) return;

    const start = Math.max(0, (match.index || 0) - 300);
    const end = Math.min(html.length, (match.index || 0) + 500);
    const snippet = html.slice(start, end);
    const status = snippet.match(/status-([a-z_]+)/i)?.[1] || "approved";

    rows.push({
      queue_id: index + 1,
      order_id: parseOrderIdFromOrderNumber(orderNumber) ?? index + 1,
      order_number: orderNumber,
      order_status: status,
      priority: inferQueueSnippetPriority(snippet),
      customer_name: undefined,
      company_name: undefined,
      sample_type: undefined,
      compound_name: undefined,
      quantity: undefined,
      unit: undefined,
      notes: undefined,
      assigned_at: undefined,
      assigned_technician_uid: undefined,
      assigned_technician_name: undefined,
      assigned_technician_email: undefined,
      technician_status_action: undefined,
      technician_status_note: undefined,
      technician_status_updated_at: undefined,
      technician_status_updated_by: undefined,
      sample_types: [],
      equipment_id: null,
      equipment_name: null,
      scheduled_start: null,
      scheduled_end: null,
      estimated_completion: null,
      position: index + 1,
      queue_type: "website_html",
    });
  });

  return rows;
};

export async function fetchCalendarData(query?: CalendarQuery) {
  const endpoints = getApiEndpoints();
  await hydrateLiveOrderOverrides();

  try {
    const phpData = await phpGet<CalendarData>(
      buildCalendarPath(endpoints.calendarData, query),
      {
        noCache: true,
        timeoutMs: 12000,
      },
    );
    const liveEquipment = await fetchEquipmentList().catch(() => []);

    return {
      queue: (phpData.queue ?? []).map((entry) => applyLiveOrderOverride(entry)),
      equipment: toEquipmentRows(
        (liveEquipment.length > 0 ? liveEquipment : phpData.equipment ?? []) as EquipmentRow[],
      ),
      utilization: phpData.utilization ?? [],
    };
  } catch (error) {
    try {
      const html = await fetchLegacyCalendarHtml(getWebRoutes().adminCalendar);
      const equipment = await fetchEquipmentList().catch(() => []);
      return {
        queue: parseLegacyQueueHtml(html).map((entry) => applyLiveOrderOverride(entry)),
        equipment: toEquipmentRows(equipment),
        utilization: [],
      };
    } catch (legacyError) {
      throw new Error(
        legacyError instanceof Error
          ? legacyError.message
          : error instanceof Error
            ? error.message
            : "Unable to load calendar data from the shared website backend.",
      );
    }
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

const toRecordOrNull = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const next = toStringOrNull(value);
    if (next) return next;
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

const toLooseNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
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
  const customerRecord =
    toRecordOrNull(row.customer_details ?? row.customerDetails) ||
    toRecordOrNull(row.customer);
  const companyRecord =
    toRecordOrNull(row.company_details ?? row.companyDetails) ||
    toRecordOrNull(row.company);
  const sampleRecord =
    toRecordOrNull(row.sample_details ?? row.sampleDetails) ||
    toRecordOrNull(row.sample);
  const equipmentRecord =
    toRecordOrNull(row.equipment_details ?? row.equipmentDetails) ||
    toRecordOrNull(row.equipment);
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
    customer_name: firstString(
      row.customer_name,
      row.customerName,
      row.customer_full_name,
      row.customerFullName,
      row.client_name,
      row.clientName,
      customerRecord?.name,
      customerRecord?.full_name,
      customerRecord?.customer_name,
      typeof row.customer === "string" ? row.customer : null,
    ) || undefined,
    company_name: firstString(
      row.company_name,
      row.companyName,
      row.customer_company,
      row.customerCompany,
      row.organization,
      row.organization_name,
      row.organizationName,
      companyRecord?.name,
      companyRecord?.company_name,
      companyRecord?.companyName,
      customerRecord?.company,
      customerRecord?.company_name,
      customerRecord?.companyName,
      typeof row.company === "string" ? row.company : null,
    ) || undefined,
    sample_type: firstString(
      row.sample_type,
      row.sampleType,
      row.sample_name,
      row.sampleName,
      row.analysis_type,
      row.analysisType,
      row.test_type,
      row.testType,
      sampleRecord?.type,
      sampleRecord?.sample_type,
      sampleRecord?.sampleType,
      sampleRecord?.name,
      typeof row.sample === "string" ? row.sample : null,
    ) || undefined,
    compound_name: firstString(
      row.compound_name,
      row.compoundName,
      row.compound,
      row.material,
      row.material_name,
      row.materialName,
      row.product_name,
      row.productName,
      sampleRecord?.compound_name,
      sampleRecord?.compoundName,
      sampleRecord?.compound,
    ) || undefined,
    quantity: toLooseNumber(row.quantity ?? row.qty ?? row.sample_count ?? row.sampleCount),
    unit: (toStringOrNull(row.unit) as QueueEntry["unit"]) || undefined,
    sample_count: toLooseNumber(row.sample_count ?? row.sampleCount ?? row.samples),
    notes: toStringOrNull(row.notes) || undefined,
    created_at: toStringOrNull(row.created_at ?? row.createdAt ?? row.submitted_at) || undefined,
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
    sample_types: (() => {
      const values = toStringArray(
        row.sample_types ??
          row.sampleTypes ??
          row.samples ??
          row.sample_list ??
          row.sampleList,
      );
      const primarySample = firstString(
        row.sample_type,
        row.sampleType,
        row.sample_name,
        row.sampleName,
        sampleRecord?.type,
        sampleRecord?.sample_type,
        sampleRecord?.sampleType,
        sampleRecord?.name,
      );
      if (values.length === 0 && primarySample) {
        return [primarySample];
      }
      return values;
    })(),
    equipment_id: toNullableNumber(row.equipment_id ?? row.equipmentId),
    equipment_name: firstString(
      row.equipment_name,
      row.equipmentName,
      row.resource,
      row.machine_name,
      row.machineName,
      equipmentRecord?.name,
      equipmentRecord?.equipment_name,
      equipmentRecord?.equipmentName,
      typeof row.equipment === "string" ? row.equipment : null,
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

const chooseBetterQueueIdentityText = (
  primary?: string,
  secondary?: string,
) => {
  const normalize = (value?: string) => (value || "").replace(/\s+/g, " ").trim();
  const isPlaceholder = (value?: string) =>
    /^(?:customer|customer name|company|unknown|not provided|-|—)$/i.test(
      normalize(value),
    );

  const left = normalize(primary);
  const right = normalize(secondary);

  if (left && !isPlaceholder(left)) return left;
  if (right && !isPlaceholder(right)) return right;
  return left || right || undefined;
};

const mergeQueueEntry = (primary: QueueEntry, fallback: QueueEntry): QueueEntry => ({
  ...primary,
  customer_name: chooseBetterQueueIdentityText(primary.customer_name, fallback.customer_name),
  company_name: chooseBetterQueueIdentityText(primary.company_name, fallback.company_name),
  sample_type: primary.sample_type || fallback.sample_type,
  compound_name: primary.compound_name || fallback.compound_name,
  quantity: primary.quantity ?? fallback.quantity,
  unit: primary.unit || fallback.unit,
  sample_count: primary.sample_count ?? fallback.sample_count,
  notes: primary.notes || fallback.notes,
  created_at: primary.created_at || fallback.created_at,
  assigned_at: primary.assigned_at || fallback.assigned_at,
  assigned_technician_uid:
    primary.assigned_technician_uid || fallback.assigned_technician_uid,
  assigned_technician_name:
    primary.assigned_technician_name || fallback.assigned_technician_name,
  assigned_technician_email:
    primary.assigned_technician_email || fallback.assigned_technician_email,
  technician_status_action:
    primary.technician_status_action || fallback.technician_status_action,
  technician_status_note:
    primary.technician_status_note || fallback.technician_status_note,
  technician_status_updated_at:
    primary.technician_status_updated_at || fallback.technician_status_updated_at,
  technician_status_updated_by:
    primary.technician_status_updated_by || fallback.technician_status_updated_by,
  sample_types:
    primary.sample_types.length > 0 ? primary.sample_types : fallback.sample_types,
  equipment_id: primary.equipment_id ?? fallback.equipment_id,
  equipment_name: primary.equipment_name || fallback.equipment_name,
  scheduled_start: primary.scheduled_start || fallback.scheduled_start,
  scheduled_end: primary.scheduled_end || fallback.scheduled_end,
  estimated_completion:
    primary.estimated_completion || fallback.estimated_completion,
  position: primary.position || fallback.position,
  queue_type: primary.queue_type || fallback.queue_type,
});

const extractQueueOrderDetailValue = (html: string, label: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const paragraphValue = html.match(
    new RegExp(`<strong[^>]*>\\s*${escaped}\\s*:?<\\/strong>\\s*([^<\\n\\r]+)`, "i"),
  )?.[1];
  const tableValue = html.match(
    new RegExp(`<th[^>]*>\\s*${escaped}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i"),
  )?.[1];
  const tdValue = html.match(
    new RegExp(`<td[^>]*>\\s*${escaped}\\s*:?<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i"),
  )?.[1];

  return stripTags(paragraphValue || tableValue || tdValue || "");
};

const hasRealQueueFieldText = (value?: string | null) => {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  return Boolean(
    normalized &&
      !/^(?:-|—|n\/a|na|none|pending(?:\s+sync|\s+website\s+sync)?|not\s+listed|not\s+provided|unknown|check\s+order\s+details|see\s+notes(?:\s+below)?|count\s+\d+|samples?|sample\s*#?|chat)$/i.test(normalized) &&
      !/(?:approve|reject|view\s+details|cancel\s+order|back\s+to\s+my\s+orders|virtual\s+assistant|review\s+orders|manage\s+users|manage\s+equipment|view\s+reports|project\s+prototype|system\s+administrator)/i.test(normalized),
  );
};

const containsQueueIdentityLeak = (
  value: string | undefined,
  row: Pick<QueueEntry, "customer_name" | "company_name" | "order_number">,
) => {
  const normalized = (value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;

  const suspects = [row.customer_name, row.company_name, row.order_number]
    .map((item) => (item || "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);

  return suspects.some((item) => normalized.includes(item));
};

const chooseBetterQueueFieldText = (
  primary: string | undefined,
  secondary: string | undefined,
  row: Pick<QueueEntry, "customer_name" | "company_name" | "order_number">,
) => {
  if (primary && hasRealQueueFieldText(primary) && !containsQueueIdentityLeak(primary, row)) {
    return primary.trim();
  }

  if (secondary && hasRealQueueFieldText(secondary) && !containsQueueIdentityLeak(secondary, row)) {
    return secondary.trim();
  }

  return undefined;
};

const normalizeQueueSampleCount = (sampleCount?: number, quantity?: number) => {
  const countCandidate = Number(sampleCount);
  if (Number.isFinite(countCandidate) && countCandidate > 1) {
    return Math.round(countCandidate);
  }

  const quantityCandidate = Number(quantity);
  if (
    Number.isFinite(quantityCandidate) &&
    quantityCandidate >= 1 &&
    quantityCandidate <= 50 &&
    Math.abs(quantityCandidate - Math.round(quantityCandidate)) < 0.0001
  ) {
    return Math.round(quantityCandidate);
  }

  if (Number.isFinite(countCandidate) && countCandidate > 0) {
    return Math.round(countCandidate);
  }

  return 1;
};

const detailCache = new Map<number, QueueEntry>();
const orderNumberDetailIdCache = new Map<string, number>();

const extractQueueListFallback = (html: string, fallback: QueueEntry): QueueEntry => {
  const orderNumber = (fallback.order_number || "").trim();
  if (!orderNumber) return fallback;

  const escaped = orderNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowHtml =
    html.match(new RegExp(`<tr[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/tr>`, "i"))?.[0] ||
    html.slice(
      Math.max(0, html.toUpperCase().indexOf(orderNumber.toUpperCase()) - 1200),
      Math.min(
        html.length,
        html.toUpperCase().indexOf(orderNumber.toUpperCase()) + 1200,
      ),
    );

  const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
    .map((match) => stripTags(match[1]))
    .filter(Boolean);

  const detailId = Number(
    rowHtml.match(/order-details\.php\?order_id=(\d+)/i)?.[1] || 0,
  );

  const looksLikeDate = (value?: string) =>
    Boolean(value && /(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b20\d{2}-\d{2}-\d{2}\b)/i.test(value));

  let customerName = fallback.customer_name;
  let companyName = fallback.company_name;
  let createdAt = fallback.created_at;
  let sampleCount = fallback.sample_count;

  const quantityCell = cells.find((cell) => /\b\d+(?:\.\d+)?\s*(kg|g|ml|l)\b/i.test(cell));
  const sampleTypeCell = cells.find(
    (cell) => /(solid|liquid|powder|gas|water|soil|oil|ore|sample)/i.test(cell) && !/sample\s*count/i.test(cell),
  );
  const compoundCell = cells.find(
    (cell) =>
      cell !== orderNumber &&
      cell !== cells[1] &&
      cell !== cells[2] &&
      cell !== quantityCell &&
      cell !== sampleTypeCell &&
      !looksLikeDate(cell) &&
      !/(submitted|approved|processing|completed|rejected|payment|result|queue|priority|standard|high|customer|company|sample\s*count)/i.test(cell) &&
      /[a-z]{3,}/i.test(cell),
  );
  const notesCell = cells.find(
    (cell) =>
      cell !== orderNumber &&
      cell !== cells[1] &&
      cell !== cells[2] &&
      cell !== quantityCell &&
      cell !== sampleTypeCell &&
      cell !== compoundCell &&
      !looksLikeDate(cell) &&
      cell.trim().length > 12 &&
      !/(submitted|approved|processing|completed|rejected|payment|result|queue|priority|standard|high|customer|company)/i.test(cell),
  );

  if (cells.length >= 6 && cells[0].trim().toUpperCase() === orderNumber.toUpperCase()) {
    if (!looksLikeDate(cells[1])) {
      customerName = cells[1] || customerName;
      companyName = cells[2] || companyName;
      createdAt = createdAt || cells[3];
      sampleCount = sampleCount ?? toLooseNumber(cells[5]);
    } else {
      createdAt = createdAt || cells[1];
      sampleCount = sampleCount ?? toLooseNumber(cells[3] || cells[4]);
    }
  }

  return {
    ...fallback,
    order_id: detailId > 0 ? detailId : fallback.order_id,
    customer_name: chooseBetterQueueIdentityText(customerName, fallback.customer_name),
    company_name: chooseBetterQueueIdentityText(companyName, fallback.company_name),
    sample_type: chooseBetterQueueFieldText(sampleTypeCell, fallback.sample_type, fallback),
    compound_name: chooseBetterQueueFieldText(compoundCell, fallback.compound_name, fallback),
    quantity: fallback.quantity ?? toLooseNumber(quantityCell),
    unit: fallback.unit || ((quantityCell?.match(/\b(kg|g|ml|l)\b/i)?.[1] as QueueEntry["unit"] | undefined)),
    notes: fallback.notes || notesCell,
    created_at: createdAt || fallback.created_at,
    sample_count: sampleCount ?? fallback.sample_count,
  };
};

const parseQueueEntryDetailsHtml = (html: string, fallback: QueueEntry): QueueEntry => {
  const sampleRows = Array.from(
    html.matchAll(
      /<tr[^>]*>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>[\s\S]*?<td[^>]*>(.*?)<\/td>\s*<\/tr>/gi,
    ),
  )
    .map((match) => ({
      compound: stripTags(match[2]),
      quantity: stripTags(match[3]),
    }))
    .filter(
      (item) =>
        hasRealQueueFieldText(item.compound) &&
        !/compound/i.test(item.compound) &&
        !containsQueueIdentityLeak(item.compound, fallback),
    );

  const compoundNames = sampleRows.map((item) => item.compound).filter(Boolean);
  const quantityText =
    extractQueueOrderDetailValue(html, "Quantity") ||
    extractQueueOrderDetailValue(html, "Qty") ||
    extractQueueOrderDetailValue(html, "Sample Quantity") ||
    sampleRows[0]?.quantity ||
    "";
  const firstQuantity = Number(
    quantityText.match(/\d+(?:\.\d+)?/)?.[0] || fallback.quantity || 0,
  );
  const detailUnit = quantityText.match(/\b(kg|g|ml|l)\b/i)?.[1] as QueueEntry["unit"] | undefined;

  const parsed = mergeRememberedOrderRequestDetails({
    ...fallback,
    id: fallback.order_id,
    customer_name:
      extractQueueOrderDetailValue(html, "Customer") || fallback.customer_name,
    company_name:
      extractQueueOrderDetailValue(html, "Company") || fallback.company_name,
    created_at:
      extractQueueOrderDetailValue(html, "Submitted") ||
      extractQueueOrderDetailValue(html, "Created") ||
      extractQueueOrderDetailValue(html, "Order Date") ||
      fallback.created_at,
    order_status:
      extractQueueOrderDetailValue(html, "Status") || fallback.order_status,
    priority:
      extractQueueOrderDetailValue(html, "Priority") || fallback.priority,
    sample_type: chooseBetterQueueFieldText(
      extractQueueOrderDetailValue(html, "Sample Type") ||
        extractQueueOrderDetailValue(html, "Type of Sample") ||
        extractQueueOrderDetailValue(html, "Order Type"),
      fallback.sample_type,
      fallback,
    ),
    compound_name: chooseBetterQueueFieldText(
      extractQueueOrderDetailValue(html, "Compound Name") ||
        extractQueueOrderDetailValue(html, "Compound") ||
        extractQueueOrderDetailValue(html, "Chemical Name") ||
        compoundNames.join(", "),
      fallback.compound_name,
      fallback,
    ),
    quantity:
      Number.isFinite(firstQuantity) && firstQuantity > 0
        ? firstQuantity
        : fallback.quantity,
    unit: detailUnit || fallback.unit,
    sample_count: normalizeQueueSampleCount(sampleRows.length || fallback.sample_count, firstQuantity),
    notes:
      extractQueueOrderDetailValue(html, "Notes") ||
      extractQueueOrderDetailValue(html, "Additional Notes") ||
      fallback.notes,
  });

  return {
    ...fallback,
    ...parsed,
    order_id: fallback.order_id,
    queue_id: fallback.queue_id,
    order_number: fallback.order_number,
    sample_types:
      fallback.sample_types.length > 0
        ? fallback.sample_types
        : parsed.sample_type
          ? [parsed.sample_type]
          : fallback.sample_types,
  };
};

const applyRememberedQueueDetails = (entry: QueueEntry): QueueEntry => {
  const remembered = mergeRememberedOrderRequestDetails({
    ...entry,
    id: entry.order_id,
  });

  return {
    ...entry,
    sample_type: remembered.sample_type || entry.sample_type,
    compound_name: remembered.compound_name || entry.compound_name,
    quantity: remembered.quantity ?? entry.quantity,
    unit: remembered.unit || entry.unit,
    sample_count: remembered.sample_count ?? entry.sample_count,
    notes: remembered.notes || entry.notes,
  };
};

const fetchTechnicianDashboardSummary = async () => {
  try {
    const html = await fetchLegacyCalendarHtml(getWebRoutes().technicianDashboard);
    const queueCount = Number(html.match(/(\d+)\s+in\s+Queue/i)?.[1] || 0);
    const pendingCount = Number(
      html.match(/(\d+)\s+Pending\s+Review/i)?.[1] ||
        html.match(/Orders\s+waiting\s+for\s+approval\s*(\d+)/i)?.[1] ||
        0,
    );
    const dashboardStatus = stripTags(
      html.match(/<strong>\s*Status:\s*<\/strong>\s*([^<]+)/i)?.[1] || "",
    );
    return { queueCount, pendingCount, dashboardStatus };
  } catch {
    return { queueCount: 0, pendingCount: 0, dashboardStatus: "" };
  }
};

export async function fetchTechnicianWorkQueue(query?: CalendarQuery) {
  const endpoints = getApiEndpoints();
  const calendarData = await fetchCalendarData(query);

  let mergedQueue = [...(calendarData.queue ?? [])];
  const knownOrderIds = new Map(mergedQueue.map((item, index) => [item.order_id, index]));
  const knownOrderNumbers = new Map(
    mergedQueue.map((item, index) => [item.order_number.toLowerCase(), index]),
  );

  try {
    const eventsPayload = await apiRequest<CalendarEventsLike>(
      endpoints.getCalendarEvents,
    );
    const rows = extractRows(eventsPayload);
    const fallbackRows = rows
      .map((row, index) => toFallbackQueueEntry(row, index))
      .filter((entry): entry is QueueEntry => Boolean(entry));

    for (const entry of fallbackRows) {
      const orderNumberKey = entry.order_number.toLowerCase();
      const existingIndex =
        knownOrderIds.get(entry.order_id) ?? knownOrderNumbers.get(orderNumberKey);

      if (existingIndex !== undefined) {
        mergedQueue[existingIndex] = mergeQueueEntry(
          mergedQueue[existingIndex],
          entry,
        );
        continue;
      }

      knownOrderIds.set(entry.order_id, mergedQueue.length);
      knownOrderNumbers.set(orderNumberKey, mergedQueue.length);
      mergedQueue.push(entry);
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

  mergedQueue = mergedQueue.map((entry) =>
    applyLiveOrderOverride(applyRememberedQueueDetails(entry)),
  );
  mergedQueue.sort((a, b) => a.position - b.position);

  const technicianSummary = await fetchTechnicianDashboardSummary();

  return {
    ...calendarData,
    queue: mergedQueue,
    dashboardQueueCount: technicianSummary.queueCount,
    dashboardPendingCount: technicianSummary.pendingCount,
    dashboardStatus: technicianSummary.dashboardStatus,
  };
}

export async function fetchQueueEntryDetails(entry: QueueEntry) {
  let base = applyRememberedQueueDetails(entry);
  const orderNumberKey = (entry.order_number || "").trim().toUpperCase();

  const candidatePages = [
    getWebRoutes().myOrders,
    getWebRoutes().orderHistory,
    getWebRoutes().adminApprovals,
  ];

  if (orderNumberKey) {
    for (const path of candidatePages) {
      try {
        const html = await fetchLegacyCalendarHtml(path, { method: "GET" });
        const fromList = extractQueueListFallback(html, base);
        base = mergeQueueEntry(fromList, base);
        if (fromList.order_id && fromList.order_id > 0) {
          orderNumberDetailIdCache.set(orderNumberKey, fromList.order_id);
          break;
        }
      } catch {
        // Keep trying other shared pages.
      }
    }
  }

  const resolvedOrderId =
    (orderNumberKey ? orderNumberDetailIdCache.get(orderNumberKey) : undefined) ||
    base.order_id;

  if (!resolvedOrderId || resolvedOrderId < 1) {
    return base;
  }

  const cached = detailCache.get(resolvedOrderId);
  if (cached) {
    return mergeQueueEntry(base, cached);
  }

  try {
    const detailPath = getWebRoutes().myOrders.replace(
      /my-orders\.php$/i,
      `order-details.php?order_id=${resolvedOrderId}`,
    );
    const detailHtml = await fetchLegacyCalendarHtml(detailPath, {
      method: "GET",
    });
    const parsed = parseQueueEntryDetailsHtml(detailHtml, {
      ...base,
      order_id: resolvedOrderId,
    });
    detailCache.set(resolvedOrderId, parsed);
    rememberOrderRequestDetails({
      order_id: parsed.order_id,
      order_number: parsed.order_number,
      sample_type: parsed.sample_type,
      compound_name: parsed.compound_name,
      quantity: parsed.quantity,
      unit: parsed.unit,
      sample_count: parsed.sample_count,
      notes: parsed.notes,
      created_at: parsed.created_at,
    });
    return mergeQueueEntry(base, parsed);
  } catch {
    return base;
  }
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

export async function assignOrderEquipment(
  order: OrderEquipmentAssignmentInput,
  equipment: { id?: number; name: string } | null,
) {
  const endpoints = getApiEndpoints();
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

  let resolvedQueueId = order.queueId;
  let resolvedScheduledStart = order.scheduledStart || null;
  let resolvedScheduledEnd = order.scheduledEnd || null;

  if (
    (!resolvedQueueId || !resolvedScheduledStart || !resolvedScheduledEnd) &&
    (order.orderNumber || order.orderId)
  ) {
    try {
      const liveQueue = await fetchTechnicianWorkQueue();
      const matched = (liveQueue.queue ?? []).find(
        (item) =>
          (order.orderNumber && item.order_number === order.orderNumber) ||
          item.order_id === order.orderId,
      );

      if (matched) {
        resolvedQueueId = resolvedQueueId ?? matched.queue_id;
        resolvedScheduledStart =
          resolvedScheduledStart ?? matched.scheduled_start ?? matched.assigned_at ?? null;
        resolvedScheduledEnd =
          resolvedScheduledEnd ??
          matched.scheduled_end ??
          matched.estimated_completion ??
          resolvedScheduledStart;
      }
    } catch {
      // Keep fallback values below.
    }
  }

  const fallbackScheduledStart =
    resolvedScheduledStart || formatBackendTimestamp(new Date());
  const fallbackScheduledEnd = resolvedScheduledEnd || fallbackScheduledStart;
  const rememberEquipmentChange = () => {
    rememberLiveOrderOverride({
      queueId: resolvedQueueId,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      equipmentId: equipment?.id ?? null,
      equipmentName: equipment?.name ?? null,
      scheduledStart: fallbackScheduledStart,
      scheduledEnd: fallbackScheduledEnd,
      estimatedCompletion: fallbackScheduledEnd,
    });
  };

  const pathCandidates = [
    endpoints.orderAssignEquipment,
    "/api.php?endpoint=order-assign-equipment",
  ];

  const bodyCandidates: Record<string, unknown>[] = [
    {
      queue_id: resolvedQueueId,
      order_id: order.orderId,
      order_number: order.orderNumber,
      equipment_id: equipment?.id ?? null,
      equipment_name: equipment?.name ?? null,
      scheduled_start: fallbackScheduledStart,
      scheduled_end: fallbackScheduledEnd,
      assign_equipment: true,
      clear_equipment: !equipment,
      technician_status_action: "equipment_assigned",
      technician_status_note: note,
      message: note,
    },
    {
      queue_id: resolvedQueueId,
      order_id: order.orderId,
      order_number: order.orderNumber,
      equipment_id: equipment?.id ?? null,
      equipment_name: equipment?.name ?? null,
      message: note,
    },
  ];

  let lastError: Error | null = null;
  for (const path of pathCandidates) {
    for (const body of bodyCandidates) {
      try {
        const result = await postLegacyForm(path, body);
        rememberEquipmentChange();
        emitLiveDataRefresh();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      try {
        const result = await phpPost<Record<string, unknown>>(path, body);
        rememberEquipmentChange();
        emitLiveDataRefresh();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      try {
        const result = await apiRequest<Record<string, unknown>>(path, {
          method: "POST",
          body,
          timeoutMs: 12000,
        });
        rememberEquipmentChange();
        emitLiveDataRefresh();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  const rescheduleNote = `${note} (equipment routing via calendar reschedule.)`;
  try {
    const response = await phpPost<Record<string, never>>(
      endpoints.calendarReschedule,
      {
        queue_id: resolvedQueueId,
        order_id: order.orderId,
        order_number: order.orderNumber,
        scheduled_start: fallbackScheduledStart,
        scheduled_end: fallbackScheduledEnd,
        equipment_id: equipment?.id ?? null,
        equipment_name: equipment?.name ?? null,
        assign_equipment: true,
        clear_equipment: !equipment,
        technician_status_action: "equipment_assigned",
        technician_status_note: rescheduleNote,
        message: rescheduleNote,
      },
    );
    rememberEquipmentChange();
    emitLiveDataRefresh();
    return response;
  } catch (error) {
    lastError = error instanceof Error ? error : lastError;
  }

  throw new Error(
    lastError?.message ||
      "Unable to assign equipment via the website backend. Use the web admin calendar or add order-assign-equipment on the server.",
  );
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
  const response = await phpPost<Record<string, never>>(endpoints.calendarReschedule, {
    queue_id: queueId,
    order_id: orderId,
    order_number: orderNumber,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    message: note,
  });
  rememberLiveOrderOverride({
    queueId,
    orderId,
    orderNumber,
    scheduledStart,
    scheduledEnd,
    estimatedCompletion: scheduledEnd,
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
  options?: {
    note?: string;
    attachmentName?: string;
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
  const note =
    options?.note?.trim() ||
    "Technician marked the order as completed from the mobile app.";
  const noteWithAttachment = options?.attachmentName?.trim()
    ? `${note} Attachment: ${options.attachmentName.trim()}`
    : note;

  const endpointCandidates = Array.from(
    new Set([
      endpoints.orderComplete,
      "/api.php?endpoint=order-complete",
      "/api/order-update-status.php",
      "/api/order-status-update.php",
    ]),
  );

  const payloadCandidates: Record<string, unknown>[] = [];
  if (typeof orderId === "number" && orderId > 0) {
    payloadCandidates.push({ order_id: orderId, complete_order: true });
    payloadCandidates.push({ order_id: orderId, status: "completed" });
    payloadCandidates.push({ order_id: orderId, order_status: "completed" });
    payloadCandidates.push({ order_id: orderId, action: "complete_order" });
    payloadCandidates.push({ id: orderId, status: "completed" });
  }
  if (orderNumber) {
    payloadCandidates.push({ order_number: orderNumber, status: "completed" });
    payloadCandidates.push({ order_number: orderNumber, order_status: "completed" });
    payloadCandidates.push({ order_number: orderNumber, action: "complete_order" });
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
    complete: true,
    update_status: true,
    action: "complete_order",
    order_status: "completed",
    message: noteWithAttachment,
    note: noteWithAttachment,
  });

  const rememberCompletedStatus = () => {
    rememberLiveOrderOverride({
      queueId,
      orderId,
      orderNumber,
      status: "completed",
    });
  };

  let lastError: Error | null = null;
  for (const path of endpointCandidates) {
    for (const body of payloadCandidates) {
      try {
        const response = await postLegacyForm(path, body);
        rememberCompletedStatus();
        emitLiveDataRefresh();
        return response;
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error(String(error));
        if (!lastError || /404/i.test(lastError.message)) {
          lastError = nextError;
        }
      }

      try {
        const response = await phpPost<Record<string, unknown>>(path, body);
        rememberCompletedStatus();
        emitLiveDataRefresh();
        return response;
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error(String(error));
        if (!lastError || /404/i.test(lastError.message)) {
          lastError = nextError;
        }
      }

      try {
        const response = await apiRequest<Record<string, unknown>>(path, {
          method: "POST",
          body,
        });
        rememberCompletedStatus();
        emitLiveDataRefresh();
        return response;
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error(String(error));
        if (!lastError || /404/i.test(lastError.message)) {
          lastError = nextError;
        }
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
  const scheduledStart = options?.scheduledStart || formatBackendTimestamp(new Date());
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

  const rememberProcessingStatus = () => {
    rememberLiveOrderOverride({
      queueId,
      orderId,
      orderNumber,
      status: "processing",
      scheduledStart,
      scheduledEnd: options?.scheduledEnd,
      estimatedCompletion: options?.scheduledEnd,
    });
  };

  let lastError: Error | null = null;
  for (const path of candidates) {
    for (const payload of payloadCandidates) {
      try {
        const response = await apiRequest<Record<string, unknown>>(path, {
          method: "POST",
          body: payload,
        });
        rememberProcessingStatus();
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
