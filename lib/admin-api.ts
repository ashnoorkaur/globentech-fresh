import {
  apiRequest,
  clearApiCacheMatching,
  getApiBaseUrlCandidates,
} from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { fetchCalendarData } from "./calendar-api";
import { backendDateTimeValue, parseBackendDate } from "./date-time";
import { emitLiveDataRefresh } from "./live-data";
import {
    getLatestRememberedOrderRequestDetails,
    hydrateOrderRequestDetailsStore,
    mergeRememberedOrderRequestDetails,
    rememberOrderRequestDetails,
} from "./order-request-details-store";
import { phpPost } from "./php-api";
import { normalizeOrderPriorityValue } from "./order-workflow";
import { getWebRoutes } from "./web-routes";

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
  status?: string;
  sample_type?: string;
  compound_name?: string;
  quantity?: number;
  unit?: "g" | "kg" | "mL" | "L";
  notes?: string;
  rejection_reason?: string;
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

/** Peel repeated `{ data: ... }` wrappers (common in PHP JSON APIs). */
const peelEnvelopeData = (payload: unknown): unknown => {
  let cur: unknown = payload;
  for (let i = 0; i < 8; i++) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) break;
    const o = cur as Record<string, unknown>;
    if ("data" in o && o.data !== undefined && o.data !== null) {
      cur = o.data;
      continue;
    }
    break;
  }
  return cur;
};

const collectArraysDeep = (value: unknown, maxDepth: number, out: unknown[][]): void => {
  if (maxDepth < 0 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    out.push(value);
    return;
  }
  if (typeof value !== "object") return;
  for (const v of Object.values(value as Record<string, unknown>)) {
    collectArraysDeep(v, maxDepth - 1, out);
  }
};

const rowLooksLikePendingOrder = (raw: unknown): boolean => {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  const on = r.order_number ?? r.orderNumber;
  if (typeof on === "string" && on.trim().length > 0) return true;
  const id = r.id ?? r.order_id ?? r.orderId;
  if (typeof id === "number" && id > 0) return true;
  if (typeof id === "string" && /^\d+$/.test(id)) return true;
  return false;
};

/** Pull a coarse badge hint from row HTML without mistaking generic wrappers for "high". */
const extractLegacyPriorityBadgeHint = (rowHtml: string): string | undefined => {
  if (/badge-prioritized\b/i.test(rowHtml)) return "prioritized";
  if (/badge-priority-standard\b/i.test(rowHtml) || /badge-standard\b/i.test(rowHtml)) {
    return "standard";
  }
  if (/badge-priority-high\b|badge-high-priority\b|badge-danger\b.*\b(high|rush)\b/i.test(rowHtml)) {
    return "prioritized";
  }
  if (/priority-standard\b/i.test(rowHtml)) return "standard";
  if (/priority-priority\b|priority-rush\b|priority-high\b/i.test(rowHtml)) return "prioritized";
  return undefined;
};

/**
 * Legacy HTML often contains the word "priority" in CSS (e.g. priority-standard).
 * Never treat generic `badge-priority` as high — many PHP tables use that class for both tiers.
 */
const inferPendingPriorityFromLegacy = (
  rowHtml: string,
  cells: string[],
  badgeClass?: string,
): PendingOrderDto["priority"] => {
  const row = rowHtml.toLowerCase();
  if (
    /priority-standard\b|badge-priority-standard|standard-priority|badge-secondary\b.*priority/i.test(
      row,
    )
  ) {
    return "standard";
  }
  if (
    /priority-priority\b|priority-rush\b|priority-high\b|badge-prioritized|badge-priority-high|high-priority|\bhigh\s*priority\b|\brush\b|\burgent\b/i.test(
      row,
    )
  ) {
    return "high";
  }

  const cellBlob = cells.join(" ").toLowerCase();
  if (/\b(standard|normal|regular|low)\b/.test(cellBlob)) return "standard";
  if (/\b(high|urgent|rush|critical)\b/.test(cellBlob)) return "high";
  if (
    /\bpriority\b/.test(cellBlob) &&
    !/\bstandard\b/.test(cellBlob) &&
    !/priority-standard/.test(row)
  ) {
    return "high";
  }

  const badge = (badgeClass || "").toLowerCase();
  if (badge === "standard") return "standard";
  if (badge === "prioritized") return "high";
  if (badge === "priority") {
    return "standard";
  }

  return "standard";
};

/** Map API/JSON variants onto PendingOrderDto so merge keys stay consistent. */
const coercePendingOrderRow = (raw: unknown): PendingOrderDto | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const orderNumber = String(r.order_number ?? r.orderNumber ?? "").trim();
  const idRaw = r.id ?? r.order_id ?? r.orderId;
  const idNum = typeof idRaw === "number" ? idRaw : Number(idRaw);
  const id =
    Number.isFinite(idNum) && idNum > 0
      ? idNum
      : orderNumber
        ? hashTextToId(orderNumber)
        : 0;
  if (!orderNumber && !(Number.isFinite(idNum) && idNum > 0)) return null;

  const priority = normalizeOrderPriorityValue(
    r.priority ?? r.Priority ?? r.priority_level ?? r.priorityLevel,
  );

  return {
    id,
    order_number: orderNumber,
    customer_name: String(r.customer_name ?? r.customerName ?? "Customer"),
    company_name:
      r.company_name != null
        ? String(r.company_name)
        : r.companyName != null
          ? String(r.companyName)
          : undefined,
    created_at: String(
      r.created_at ?? r.createdAt ?? r.submitted_at ?? r.submittedAt ?? "",
    ),
    priority,
    sample_count: Number(r.sample_count ?? r.sampleCount ?? 1) || 1,
    status: String(r.status ?? "submitted"),
    sample_type: r.sample_type != null ? String(r.sample_type) : r.sampleType != null ? String(r.sampleType) : undefined,
    compound_name:
      r.compound_name != null
        ? String(r.compound_name)
        : r.compoundName != null
          ? String(r.compoundName)
          : undefined,
    quantity:
      typeof r.quantity === "number"
        ? r.quantity
        : r.quantity != null
          ? Number(r.quantity)
          : undefined,
    unit: r.unit as PendingOrderDto["unit"] | undefined,
    notes: r.notes != null ? String(r.notes) : undefined,
    firebase_key: r.firebase_key != null ? String(r.firebase_key) : undefined,
  };
};

const toArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];

  const candidate = value as Record<string, unknown>;
  const knownListKeys = [
    "data",
    "rows",
    "items",
    "orders",
    "users",
    "result",
    "pending",
    "pending_orders",
    "approvals",
    "list",
  ];
  for (const key of knownListKeys) {
    const next = candidate[key];
    if (Array.isArray(next)) return next as T[];
  }

  return [];
};

/**
 * Some PHP endpoints return pending orders split across keys (e.g. high vs standard queues).
 * We must merge every pending-shaped array — never keep only the longest bucket.
 */
const pendingOrdersFromApiPayload = (
  payload: PendingOrderDto[] | SuccessEnvelope<PendingOrderDto[]> | unknown,
): PendingOrderDto[] => {
  const peeled = peelEnvelopeData(
    unwrap(payload as PendingOrderDto[] | SuccessEnvelope<PendingOrderDto[]>),
  );

  if (Array.isArray(peeled)) {
    return unionPendingRowsByKey(
      peeled
        .map((row) => coercePendingOrderRow(row))
        .filter((row): row is PendingOrderDto => Boolean(row)),
    );
  }

  const merged: PendingOrderDto[] = [];

  const direct = toArray<PendingOrderDto>(peeled);
  for (const row of direct) {
    const coerced = coercePendingOrderRow(row);
    if (coerced) merged.push(coerced);
  }

  const buckets: unknown[][] = [];
  collectArraysDeep(peeled, 8, buckets);
  for (const arr of buckets) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    if (!rowLooksLikePendingOrder(arr[0])) continue;
    for (const raw of arr) {
      const coerced = coercePendingOrderRow(raw);
      if (coerced) merged.push(coerced);
    }
  }

  return unionPendingRowsByKey(merged);
};

/**
 * Approvals HTML often lists more orders than `<td>` parsing catches (cards, compact rows).
 * Scan every ORD-… token and add rows missing from the merged list (with order_id when present).
 */
const supplementPendingFromApprovalsHtml = (
  html: string,
  rows: PendingOrderDto[],
): PendingOrderDto[] => {
  const have = new Set(
    rows.map((r) => (r.order_number || "").trim().toUpperCase()).filter(Boolean),
  );
  const extra: PendingOrderDto[] = [];
  const regex = /\b(ORD-\d{8}-[A-Z0-9]+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const ord = m[1];
    const key = ord.trim().toUpperCase();
    if (have.has(key)) continue;
    have.add(key);

    const idx = m.index ?? 0;
    const chunk = html.slice(Math.max(0, idx - 900), Math.min(html.length, idx + 900));
    const idStr =
      chunk.match(/order-details\.php\?[^"']*order_id=(\d+)/i)?.[1] ||
      chunk.match(/[?&]order_id=(\d+)/i)?.[1] ||
      chunk.match(/name=["']order_id["'][^>]*value=["'](\d+)["']/i)?.[1] ||
      chunk.match(/data-order-id=["'](\d+)["']/i)?.[1] ||
      "";
    const idNum = Number(idStr);
    const id =
      Number.isFinite(idNum) && idNum > 0 ? idNum : hashTextToId(ord);

    extra.push({
      id,
      order_number: ord,
      customer_name: "Customer",
      priority: inferPendingPriorityFromLegacy(chunk, [], undefined),
      sample_count: 1,
      created_at: "",
      status: "submitted",
    });
  }

  if (extra.length === 0) return rows;
  return unionPendingRowsByKey([...rows, ...extra]);
};

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

const hashTextToId = (value: string) => {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 1000000) + 1;
};

const isFallbackHashedId = (orderNumber: string | undefined, id: number | undefined) => {
  return Boolean(orderNumber && id && hashTextToId(orderNumber) === id);
};

const selectBetterOrderId = (
  orderNumber: string | undefined,
  primaryId: number | undefined,
  secondaryId: number | undefined,
) => {
  const first = typeof primaryId === "number" && primaryId > 0 ? primaryId : undefined;
  const second = typeof secondaryId === "number" && secondaryId > 0 ? secondaryId : undefined;

  if (first && second) {
    const firstIsHash = isFallbackHashedId(orderNumber, first);
    const secondIsHash = isFallbackHashedId(orderNumber, second);

    if (firstIsHash && !secondIsHash) return second;
    if (secondIsHash && !firstIsHash) return first;
    return first;
  }

  return first || second || 0;
};

const chooseBetterOrderNumber = (
  primary?: string | null,
  secondary?: string | null,
) => {
  const normalize = (value?: string | null) => (value || "").replace(/\s+/g, " ").trim();
  const score = (value?: string | null) => {
    const text = normalize(value);
    if (!text) return 0;
    if (/ORD-\d{8}-\d+/i.test(text)) return 3;
    if (/ORD-[A-Z0-9-]{6,}/i.test(text)) return 2;
    return 1;
  };

  return score(primary) >= score(secondary)
    ? normalize(primary) || normalize(secondary)
    : normalize(secondary) || normalize(primary);
};

/** Many PHP hosts serve a shorter “mobile” approvals table to the default RN user-agent. */
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const fetchLegacyAdminHtml = async (path: string, init?: RequestInit) => {
  const candidates = getApiBaseUrlCandidates().slice(0, 2);
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${path}`, {
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
        lastError = new Error(`Legacy admin page failed with status ${response.status}`);
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

  throw lastError ?? new Error("Shared website admin page not found.");
};

const normalizeLegacyStatus = (value?: string | null) => {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/^status_/, "");

  if (!normalized) return "submitted";
  if (normalized.includes("payment")) return "payment_pending";
  if (normalized.includes("result")) return "results_available";
  if (
    (normalized.includes("await") && normalized.includes("approv")) ||
    (normalized.includes("pending") && normalized.includes("approv"))
  ) {
    return "submitted";
  }
  return normalized;
};

const looksLikeDateText = (value?: string) =>
  Boolean(
    value &&
      /(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b20\d{2}-\d{2}-\d{2}\b)/i.test(
        value,
      ),
  );

const hasRealOrderFieldText = (value?: string | null) => {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  return Boolean(
    normalized &&
      !/^(?:-|—|n\/a|na|none|pending(?:\s+sync|\s+website\s+sync)?|not\s+listed|not\s+provided|unknown|check\s+order\s+details|see\s+notes(?:\s+below)?|count\s+\d+|samples?|sample\s*#?)$/i.test(normalized) &&
      !/(?:approve|reject|view\s+details|cancel\s+order|back\s+to\s+my\s+orders)/i.test(normalized),
  );
};

const containsIdentityLeak = (
  value: string | undefined,
  row: Pick<PendingOrderDto, "customer_name" | "company_name" | "order_number">,
) => {
  const normalized = (value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;

  const suspects = [row.customer_name, row.company_name, row.order_number]
    .map((item) => (item || "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);

  return suspects.some((item) => normalized.includes(item));
};

const chooseBetterText = (
  primary: string | undefined,
  secondary: string | undefined,
  row: Pick<PendingOrderDto, "customer_name" | "company_name" | "order_number">,
) => {
  if (primary && hasRealOrderFieldText(primary) && !containsIdentityLeak(primary, row)) {
    return primary.trim();
  }

  if (secondary && hasRealOrderFieldText(secondary) && !containsIdentityLeak(secondary, row)) {
    return secondary.trim();
  }

  return undefined;
};

const chooseBetterIdentityText = (
  primary: string | undefined,
  secondary: string | undefined,
  fallback = "",
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
  return left || right || fallback;
};

const normalizeSampleCount = (sampleCount?: number, quantity?: number) => {
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

const sanitizePendingOrderRow = (row: PendingOrderDto): PendingOrderDto =>
  mergeRememberedOrderRequestDetails({
    ...row,
    sample_count: normalizeSampleCount(row.sample_count, row.quantity),
    sample_type: chooseBetterText(row.sample_type, undefined, row),
    compound_name: chooseBetterText(row.compound_name, undefined, row),
  });

const looksLikeOrderListPage = (html: string) => {
  const orderCount = Array.from(html.matchAll(/ORD-\d{8}-\d+/gi)).length;
  return (
    orderCount > 1 ||
    /create\s+and\s+manage\s+order\s+types\s+for\s+customers/i.test(html) ||
    /<th[^>]*>\s*customer\s*<\/th>[\s\S]{0,200}<th[^>]*>\s*company\s*<\/th>[\s\S]{0,200}<th[^>]*>\s*samples\s*<\/th>/i.test(
      html,
    )
  );
};

const isDemoTestOrder = (row: Partial<PendingOrderDto>) => {
  const haystack = `${row.order_number || ""} ${row.compound_name || ""} ${row.notes || ""}`.toLowerCase();
  return /demo-check|teacher-demo|final-demo|syncfix|appsync/.test(haystack);
};

const isSamePendingOrder = (
  left: Partial<PendingOrderDto>,
  right: Partial<PendingOrderDto>,
) => {
  const leftNumber = (left.order_number || "").trim().toUpperCase();
  const rightNumber = (right.order_number || "").trim().toUpperCase();
  if (leftNumber && rightNumber && leftNumber === rightNumber) return true;
  if (left.id && right.id && left.id === right.id) return true;

  if (leftNumber && rightNumber && leftNumber !== rightNumber) return false;

  const canonicalOrd = (s: string) => /^ORD-\d{8}-/i.test((s || "").trim());
  if (canonicalOrd(leftNumber) && !rightNumber) return false;
  if (canonicalOrd(rightNumber) && !leftNumber) return false;

  const leftCustomer = (left.customer_name || "").trim().toLowerCase();
  const rightCustomer = (right.customer_name || "").trim().toLowerCase();
  const leftCompany = (left.company_name || "").trim().toLowerCase();
  const rightCompany = (right.company_name || "").trim().toLowerCase();
  const leftTime = backendDateTimeValue(left.created_at);
  const rightTime = backendDateTimeValue(right.created_at);
  const timeGap = Math.abs(leftTime - rightTime);
  const leftCount = normalizeSampleCount(left.sample_count, left.quantity);
  const rightCount = normalizeSampleCount(right.sample_count, right.quantity);
  const leftPriority = (left.priority || "").trim().toLowerCase();
  const rightPriority = (right.priority || "").trim().toLowerCase();
  const companyCompatible = !leftCompany || !rightCompany || leftCompany === rightCompany;
  const priorityCompatible = !leftPriority || !rightPriority || leftPriority === rightPriority;

  return Boolean(
    leftCustomer &&
      rightCustomer &&
      leftCustomer === rightCustomer &&
      leftTime > 0 &&
      rightTime > 0 &&
      timeGap <= 2 * 60 * 60 * 1000 &&
      leftCount === rightCount &&
      companyCompatible &&
      priorityCompatible,
  );
};

const sanitizeAdminHistoryRow = (row: AdminOrderHistoryDto): AdminOrderHistoryDto => ({
  ...(sanitizePendingOrderRow(row) as AdminOrderHistoryDto),
  status: row.status || "submitted",
});

/** If either merged source says high, keep high (fixes order-history HTML often lacking rush styling). */
const mergePendingPriorityUnion = (
  a: unknown,
  b: unknown,
): PendingOrderDto["priority"] => {
  const na = normalizeOrderPriorityValue(a);
  const nb = normalizeOrderPriorityValue(b);
  if (na === "high" || nb === "high") return "high";
  return "standard";
};

const fillNewestOrderFromRememberedRequest = <T extends PendingOrderDto>(rows: T[]) => {
  const latest = getLatestRememberedOrderRequestDetails();
  const latestOrderNumber = (latest?.orderNumber || "").trim().toUpperCase();
  if (!latest || !latestOrderNumber || rows.length === 0) return rows;

  return rows.map((row) => {
    const rowOrderNumber = (row.order_number || "").trim().toUpperCase();
    if (rowOrderNumber !== latestOrderNumber) {
      return row;
    }

    return sanitizePendingOrderRow({
      ...row,
      sample_type: row.sample_type || latest.sampleType,
      compound_name: row.compound_name || latest.compoundName,
      quantity: row.quantity ?? latest.quantity,
      unit: row.unit || latest.unit,
      sample_count: row.sample_count || latest.sampleCount || 1,
      notes: row.notes || latest.notes,
    }) as T;
  });
};

const mergeAdminHistoryDetail = (
  previous: AdminOrderHistoryDto,
  next: AdminOrderHistoryDto,
): AdminOrderHistoryDto => ({
  ...previous,
  ...next,
  order_number:
    chooseBetterOrderNumber(previous.order_number, next.order_number) ||
    previous.order_number ||
    next.order_number ||
    "",
  id: selectBetterOrderId(previous.order_number || next.order_number, previous.id, next.id),
  customer_name: chooseBetterIdentityText(previous.customer_name, next.customer_name, "Customer"),
  company_name: chooseBetterIdentityText(previous.company_name, next.company_name) || undefined,
  created_at: previous.created_at || next.created_at,
  sample_type: chooseBetterText(previous.sample_type, next.sample_type, {
    customer_name: previous.customer_name || next.customer_name,
    company_name: previous.company_name || next.company_name,
    order_number: previous.order_number || next.order_number,
  }),
  compound_name: chooseBetterText(previous.compound_name, next.compound_name, {
    customer_name: previous.customer_name || next.customer_name,
    company_name: previous.company_name || next.company_name,
    order_number: previous.order_number || next.order_number,
  }),
  quantity: previous.quantity ?? next.quantity,
  unit: previous.unit || next.unit,
  notes: previous.notes || next.notes,
  sample_count: Math.max(previous.sample_count || 0, next.sample_count || 0),
  equipment_id: next.equipment_id ?? previous.equipment_id,
  equipment_name: next.equipment_name || previous.equipment_name,
  scheduled_start: next.scheduled_start || previous.scheduled_start,
  scheduled_end: next.scheduled_end || previous.scheduled_end,
  estimated_completion: next.estimated_completion || previous.estimated_completion,
  assigned_at: next.assigned_at || previous.assigned_at,
  assigned_technician_uid:
    next.assigned_technician_uid || previous.assigned_technician_uid,
  assigned_technician_name:
    next.assigned_technician_name || previous.assigned_technician_name,
  assigned_technician_email:
    next.assigned_technician_email || previous.assigned_technician_email,
  technician_status_action:
    next.technician_status_action || previous.technician_status_action,
  technician_status_note:
    next.technician_status_note || previous.technician_status_note,
  technician_status_updated_at:
    next.technician_status_updated_at || previous.technician_status_updated_at,
  technician_status_updated_by:
    next.technician_status_updated_by || previous.technician_status_updated_by,
  priority: mergePendingPriorityUnion(previous.priority, next.priority),
});

const mergeAdminHistoryRows = (rows: AdminOrderHistoryDto[]) => {
  const merged: AdminOrderHistoryDto[] = [];

  for (const rawRow of rows) {
    const row = sanitizeAdminHistoryRow(rawRow);
    const existingIndex = merged.findIndex((candidate) => isSamePendingOrder(candidate, row));

    if (existingIndex >= 0) {
      merged[existingIndex] = mergeAdminHistoryDetail(merged[existingIndex], row);
      continue;
    }

    const sameNumberIndex = merged.findIndex(
      (candidate) =>
        (candidate.order_number || "").trim().toUpperCase() ===
        (row.order_number || "").trim().toUpperCase(),
    );

    if (sameNumberIndex >= 0) {
      merged[sameNumberIndex] = mergeAdminHistoryDetail(merged[sameNumberIndex], row);
      continue;
    }

    merged.push(row);
  }

  return merged.sort((a, b) => {
    const aTime = backendDateTimeValue(a.created_at || a.assigned_at || a.scheduled_start);
    const bTime = backendDateTimeValue(b.created_at || b.assigned_at || b.scheduled_start);
    return bTime - aTime;
  });
};

/** Order # / date cells contain large digits; never use those as sample_count. */
const parseHistoryRowSampleCount = (
  cells: string[],
  orderNumber: string,
  createdAt: string,
): number => {
  const ignore = new Set(
    [orderNumber, createdAt]
      .map((s) => (s || "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );

  const smallInt = (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!/^\d{1,3}$/.test(t)) return NaN;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 1 || n > 200) return NaN;
    return n;
  };

  const usable = (c: string | undefined) => {
    if (!c) return false;
    const t = c.replace(/\s+/g, " ").trim();
    if (!t || ignore.has(t)) return false;
    if (/ORD-/i.test(t) || looksLikeDateText(t)) return false;
    if (/\b(high|urgent|rush|standard|normal|priority)\b/i.test(t)) return false;
    return true;
  };

  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const n = smallInt(cells[i] || "");
    if (Number.isFinite(n) && usable(cells[i])) return n;
  }

  for (const c of cells) {
    const n = smallInt(c || "");
    if (Number.isFinite(n) && usable(c)) return n;
  }

  return 1;
};

const parseLegacyHistoryOrders = (html: string): AdminOrderHistoryDto[] => {
  const rows: AdminOrderHistoryDto[] = [];

  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
      .map((cell) => stripTags(cell[1]))
      .filter(Boolean);

    if (cells.length < 3) continue;

    const orderNumber =
      rowHtml.match(/ORD-\d{8}-\d+/i)?.[0] ||
      cells.find((cell) => /ORD[-\d]+/i.test(cell)) ||
      cells[0];
    if (!orderNumber || /order\s*#/i.test(orderNumber)) continue;

    const idMatch = rowHtml.match(/name=["']order_id["'][^>]*value=["'](\d+)["']/i);
    const priorityHint = extractLegacyPriorityBadgeHint(rowHtml);
    const priorityClass =
      priorityHint ||
      rowHtml.match(/badge-(standard)\b/i)?.[1]?.toLowerCase() ||
      undefined;
    const statusClass = rowHtml.match(/status-([a-z_]+)/i)?.[1];
    const statusText = cells.find((cell) =>
      /(submitted|approved|processing|completed|rejected|payment|result|queue)/i.test(
        cell,
      ),
    );
    const createdAt = cells.find((cell) => looksLikeDateText(cell)) || "";
    const quantityCell = cells.find((cell) => /\b\d+(?:\.\d+)?\s*(kg|g|ml|l)\b/i.test(cell));
    const sampleTypeCell = cells.find(
      (cell) => /(solid|liquid|powder|gas|water|soil|oil|sample)/i.test(cell) && !/sample\s*count/i.test(cell),
    );
    const customerName =
      cells.find(
        (cell) =>
          cell !== orderNumber &&
          cell !== createdAt &&
          !/(submitted|approved|processing|completed|rejected|payment|result|queue|priority|standard|sample)/i.test(
            cell,
          ),
      ) || "Customer";

    rows.push({
      id: idMatch ? Number(idMatch[1]) : hashTextToId(orderNumber),
      order_number: orderNumber,
      customer_name: customerName,
      created_at: createdAt,
      priority: inferPendingPriorityFromLegacy(rowHtml, cells, priorityClass),
      sample_count: parseHistoryRowSampleCount(cells, orderNumber, createdAt),
      status: normalizeLegacyStatus(statusText || statusClass),
      sample_type: sampleTypeCell,
      compound_name: cells.find(
        (cell) =>
          cell !== orderNumber &&
          cell !== customerName &&
          cell !== createdAt &&
          cell !== quantityCell &&
          !/(submitted|approved|processing|completed|rejected|payment|result|queue|priority|standard|high|customer|company|sample\s*count)/i.test(cell) &&
          /[a-z]{3,}/i.test(cell),
      ),
      quantity: Number(quantityCell?.match(/\d+(?:\.\d+)?/)?.[0] || 0) || undefined,
      unit: quantityCell?.match(/\b(kg|g|ml|l)\b/i)?.[1] as AdminOrderHistoryDto["unit"] | undefined,
    });
  }

  return rows;
};

const parseLegacyPendingOrders = (html: string): PendingOrderDto[] => {
  const rows: PendingOrderDto[] = [];

  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
      .map((cell) => stripTags(cell[1]))
      .filter(Boolean);

    const hasOrderRef =
      /ORD-\d{8}-\d+/i.test(rowHtml) || cells.some((c) => /^ORD-/i.test(c));
    if (cells.length < 2) continue;
    if (cells.length < 5 && !hasOrderRef) continue;

    const orderNumber =
      rowHtml.match(/ORD-\d{8}-\d+/i)?.[0] ||
      cells.find((cell) => /ORD[-\d]+/i.test(cell)) ||
      cells[0];
    if (!orderNumber || /order\s*#/i.test(orderNumber)) continue;

    const idMatch = rowHtml.match(/name=["']order_id["'][^>]*value=["'](\d+)["']/i);
    const priorityHint = extractLegacyPriorityBadgeHint(rowHtml);
    const priorityClass =
      priorityHint ||
      rowHtml.match(/badge-(standard)\b/i)?.[1]?.toLowerCase() ||
      undefined;
    const quantityCell = cells.find((cell) => /\b\d+(?:\.\d+)?\s*(kg|g|ml|l)\b/i.test(cell));
    const sampleTypeCell = cells.find(
      (cell) => /(solid|liquid|powder|gas|water|soil|oil|sample)/i.test(cell) && !/sample\s*count/i.test(cell),
    );

    const sampleCountCell =
      cells.length > 5 ? cells[5] : cells[cells.length - 1] || "";

    rows.push({
      id: idMatch ? Number(idMatch[1]) : hashTextToId(orderNumber),
      order_number: orderNumber,
      customer_name: cells[1] || "Customer",
      company_name: cells[2] || undefined,
      created_at: cells.find((cell) => looksLikeDateText(cell)) || cells[3] || "",
      priority: inferPendingPriorityFromLegacy(rowHtml, cells, priorityClass),
      sample_count: Number(sampleCountCell?.match(/\d+/)?.[0] || 1),
      status: "submitted",
      sample_type: sampleTypeCell,
      compound_name: cells.find(
        (cell) =>
          cell !== orderNumber &&
          cell !== cells[1] &&
          cell !== cells[2] &&
          cell !== quantityCell &&
          !looksLikeDateText(cell) &&
          !/(submitted|approved|processing|completed|rejected|payment|result|queue|priority|standard|high|customer|company|sample\s*count)/i.test(cell) &&
          /[a-z]{3,}/i.test(cell),
      ),
      quantity: Number(quantityCell?.match(/\d+(?:\.\d+)?/)?.[0] || 0) || undefined,
      unit: quantityCell?.match(/\b(kg|g|ml|l)\b/i)?.[1] as PendingOrderDto["unit"] | undefined,
    });
  }

  return rows;
};

const mergePendingOrderRows = (rows: PendingOrderDto[]) => {
  const merged: PendingOrderDto[] = [];

  for (const rawRow of rows) {
    const row = sanitizePendingOrderRow(rawRow);
    const existingIndex = merged.findIndex((candidate) => isSamePendingOrder(candidate, row));

    if (existingIndex >= 0) {
      const previous = merged[existingIndex];
      merged[existingIndex] = {
        ...previous,
        ...row,
        order_number:
          chooseBetterOrderNumber(previous.order_number, row.order_number) ||
          previous.order_number ||
          row.order_number,
        id: selectBetterOrderId(previous.order_number || row.order_number, previous.id, row.id),
        customer_name: chooseBetterIdentityText(previous.customer_name, row.customer_name, "Customer"),
        company_name: chooseBetterIdentityText(previous.company_name, row.company_name) || undefined,
        created_at: previous.created_at || row.created_at,
        sample_type: chooseBetterText(previous.sample_type, row.sample_type, row),
        compound_name: chooseBetterText(previous.compound_name, row.compound_name, row),
        quantity: previous.quantity ?? row.quantity,
        unit: previous.unit || row.unit,
        notes: previous.notes || row.notes,
        sample_count: Math.max(
          normalizeSampleCount(previous.sample_count, previous.quantity),
          normalizeSampleCount(row.sample_count, row.quantity),
        ),
        priority: mergePendingPriorityUnion(previous.priority, row.priority),
      };
      continue;
    }

    const sameNumberIndex = merged.findIndex(
      (candidate) =>
        (candidate.order_number || "").trim().toUpperCase() ===
        (row.order_number || "").trim().toUpperCase(),
    );

    if (sameNumberIndex >= 0) {
      const previous = merged[sameNumberIndex];
      merged[sameNumberIndex] = {
        ...previous,
        ...row,
        order_number:
          chooseBetterOrderNumber(previous.order_number, row.order_number) ||
          previous.order_number ||
          row.order_number,
        id: selectBetterOrderId(previous.order_number || row.order_number, previous.id, row.id),
        customer_name: chooseBetterIdentityText(previous.customer_name, row.customer_name, "Customer"),
        company_name: chooseBetterIdentityText(previous.company_name, row.company_name) || undefined,
        created_at: previous.created_at || row.created_at,
        sample_type: chooseBetterText(previous.sample_type, row.sample_type, row),
        compound_name: chooseBetterText(previous.compound_name, row.compound_name, row),
        quantity: previous.quantity ?? row.quantity,
        unit: previous.unit || row.unit,
        notes: previous.notes || row.notes,
        sample_count: Math.max(
          normalizeSampleCount(previous.sample_count, previous.quantity),
          normalizeSampleCount(row.sample_count, row.quantity),
        ),
        priority: mergePendingPriorityUnion(previous.priority, row.priority),
      };
      continue;
    }

    merged.push(row);
  }

  return merged.sort((a, b) => {
    const aTime = backendDateTimeValue(a.created_at);
    const bTime = backendDateTimeValue(b.created_at);
    return bTime - aTime;
  });
};

/** Stable key so API + HTML rows for the same order merge, but distinct orders are never collapsed by fuzzy matching. */
const pendingRowStableKey = (row: PendingOrderDto): string => {
  const n = (row.order_number || "").trim().toUpperCase();
  if (/^ORD-\d{8}-[A-Z0-9]+$/i.test(n)) return `n:${n}`;
  if (/^ORD-/i.test(n)) return `n:${n}`;
  if (typeof row.id === "number" && row.id > 0) return `i:${row.id}`;
  if (n) return `n:${n}`;
  return `h:${hashTextToId(`${row.customer_name}|${row.created_at}|${row.company_name}|${row.sample_count}`)}`;
};

const unionPendingRowsByKey = (rows: PendingOrderDto[]): PendingOrderDto[] => {
  const map = new Map<string, PendingOrderDto>();
  for (const raw of rows) {
    const row = sanitizePendingOrderRow(raw);
    const key = pendingRowStableKey(row);
    const prev = map.get(key);
    map.set(key, prev ? mergePendingOrderRows([prev, row])[0] : row);
  }
  return Array.from(map.values()).sort((a, b) => {
    const aTime = backendDateTimeValue(a.created_at);
    const bTime = backendDateTimeValue(b.created_at);
    return bTime - aTime;
  });
};

/** When the JSON API returns rows, only merge legacy HTML rows that match by id or order # — never fuzzy-merge the full lists. */
const mergeApiWithLegacyPending = (
  apiRows: PendingOrderDto[],
  legacyRows: PendingOrderDto[],
): PendingOrderDto[] => {
  if (apiRows.length === 0) {
    return unionPendingRowsByKey(legacyRows);
  }

  const legacyByOrder = new Map<string, PendingOrderDto>();
  const legacyById = new Map<number, PendingOrderDto>();
  const absorbLegacyPendingRow = (leg: PendingOrderDto) => {
    const key = (leg.order_number || "").trim().toUpperCase();
    if (key) {
      const prev = legacyByOrder.get(key);
      legacyByOrder.set(key, prev ? mergePendingOrderRows([prev, leg])[0] : leg);
    }
    if (typeof leg.id === "number" && leg.id > 0) {
      const prev = legacyById.get(leg.id);
      legacyById.set(leg.id, prev ? mergePendingOrderRows([prev, leg])[0] : leg);
    }
  };
  for (const leg of legacyRows) {
    absorbLegacyPendingRow(leg);
  }

  const mergedFromApi = apiRows.map((api) => {
    const key = (api.order_number || "").trim().toUpperCase();
    const byNumber = key ? legacyByOrder.get(key) : undefined;
    const byId =
      typeof api.id === "number" && api.id > 0 ? legacyById.get(api.id) : undefined;
    const leg = byNumber || byId;
    if (!leg) return api;
    const merged = mergePendingOrderRows([api, leg])[0];
    return {
      ...merged,
      priority: mergePendingPriorityUnion(api.priority, leg.priority),
    };
  });

  const apiOrderKeys = new Set(
    apiRows
      .map((r) => (r.order_number || "").trim().toUpperCase())
      .filter(Boolean),
  );
  const apiIds = new Set(
    apiRows.map((r) => r.id).filter((id): id is number => typeof id === "number" && id > 0),
  );

  const legacyOnly = legacyRows.filter((leg) => {
    const key = (leg.order_number || "").trim().toUpperCase();
    if (key && apiOrderKeys.has(key)) return false;
    if (typeof leg.id === "number" && leg.id > 0 && apiIds.has(leg.id)) return false;
    return true;
  });

  return unionPendingRowsByKey([...mergedFromApi, ...legacyOnly]);
};

const pendingDetailsCache = new Map<number, Partial<PendingOrderDto>>();

/** Clears detail scrape cache + HTTP GET cache for pending orders. Call before a fresh approvals load. */
export function resetPendingApprovalsClientCaches() {
  pendingDetailsCache.clear();
  clearApiCacheMatching("admin-pending-orders");
}

const extractOrderDetailValue = (html: string, label: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const spanValue = html.match(
    new RegExp(`${escaped}[\\s\\S]{0,120}?<span[^>]*>([\\s\\S]*?)<\\/span>`, "i"),
  )?.[1];
  const paragraphValue = html.match(
    new RegExp(`<strong[^>]*>\\s*${escaped}\\s*:?<\\/strong>\\s*([^<\\n\\r]+)`, "i"),
  )?.[1];
  const tableValue = html.match(
    new RegExp(`<th[^>]*>\\s*${escaped}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i"),
  )?.[1];
  const tdValue = html.match(
    new RegExp(`<td[^>]*>\\s*${escaped}\\s*:?<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i"),
  )?.[1];

  return stripTags(spanValue || paragraphValue || tableValue || tdValue || "");
};

const sniffPriorityFromDetailHtml = (html: string): PendingOrderDto["priority"] | null => {
  const extracted = extractOrderDetailValue(html, "Priority");
  if (extracted) return normalizeOrderPriorityValue(extracted);
  const h = html.toLowerCase();
  if (/priority-standard\b|priority-badge[^>]*priority-standard/i.test(h)) return "standard";
  if (/priority-priority\b|priority-rush\b|priority-high\b/i.test(h)) return "high";
  return null;
};

const parseLegacyPendingOrderDetails = (
  html: string,
  fallback: PendingOrderDto,
): PendingOrderDto => {
  const hasStructuredDetailFields = /(?:<strong[^>]*>\s*(?:sample\s*type|compound\s*name|order\s*type|quantity|notes|submitted)\s*:)|(?:<th[^>]*>\s*(?:sample\s*type|compound\s*name|quantity)\s*<\/th>)/i.test(
    html,
  );

  if (!hasStructuredDetailFields || looksLikeOrderListPage(html)) {
    const sniffed = sniffPriorityFromDetailHtml(html);
    if (sniffed) {
      return sanitizePendingOrderRow({
        ...fallback,
        priority: mergePendingPriorityUnion(sniffed, fallback.priority),
      });
    }
    return sanitizePendingOrderRow(fallback);
  }

  const sampleRows = hasStructuredDetailFields
    ? Array.from(
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
            hasRealOrderFieldText(item.compound) &&
            !/compound/i.test(item.compound) &&
            !containsIdentityLeak(item.compound, fallback),
        )
    : [];

  const compoundNames = sampleRows.map((item) => item.compound).filter(Boolean);
  const quantityText =
    extractOrderDetailValue(html, "Quantity") ||
    extractOrderDetailValue(html, "Qty") ||
    extractOrderDetailValue(html, "Sample Quantity") ||
    sampleRows[0]?.quantity ||
    "";
  const firstQuantity = Number(
    quantityText.match(/\d+(?:\.\d+)?/)?.[0] || fallback.quantity || 0,
  );
  const detailUnit = quantityText.match(/\b(kg|g|ml|l)\b/i)?.[1] as PendingOrderDto["unit"] | undefined;

  const detailSampleType = chooseBetterText(
    extractOrderDetailValue(html, "Sample Type") ||
      extractOrderDetailValue(html, "Type of Sample") ||
      extractOrderDetailValue(html, "Order Type"),
    fallback.sample_type,
    fallback,
  );
  const detailCompound = chooseBetterText(
    extractOrderDetailValue(html, "Compound Name") ||
      extractOrderDetailValue(html, "Compound") ||
      extractOrderDetailValue(html, "Material") ||
      compoundNames.join(", "),
    fallback.compound_name,
    fallback,
  );

  return {
    ...fallback,
    customer_name:
      extractOrderDetailValue(html, "Customer") || fallback.customer_name,
    company_name:
      extractOrderDetailValue(html, "Company") || fallback.company_name,
    created_at:
      extractOrderDetailValue(html, "Submitted") ||
      extractOrderDetailValue(html, "Created") ||
      extractOrderDetailValue(html, "Order Date") ||
      fallback.created_at,
    status:
      normalizeLegacyStatus(extractOrderDetailValue(html, "Status")) ||
      fallback.status,
    priority: mergePendingPriorityUnion(
      extractOrderDetailValue(html, "Priority") || fallback.priority,
      fallback.priority,
    ),
    sample_type: detailSampleType,
    sample_count: normalizeSampleCount(
      sampleRows.length || fallback.sample_count,
      Number.isFinite(firstQuantity) ? firstQuantity : fallback.quantity,
    ),
    compound_name: detailCompound,
    quantity:
      Number.isFinite(firstQuantity) && firstQuantity > 0
        ? firstQuantity
        : fallback.quantity,
    unit: detailUnit || fallback.unit,
    notes:
      extractOrderDetailValue(html, "Notes") ||
      extractOrderDetailValue(html, "Additional Notes") ||
      fallback.notes,
  };
};

const enrichPendingOrders = async (rows: PendingOrderDto[]) => {
  const enriched = await Promise.all(
    rows.map(async (row) => {
      if (!row.id || row.id < 1) return row;

      const cached = pendingDetailsCache.get(row.id);
      if (cached) {
        return {
          ...row,
          ...cached,
          priority: mergePendingPriorityUnion(
            (cached as Partial<PendingOrderDto>).priority,
            row.priority,
          ),
        };
      }

      try {
        const detailPath = getWebRoutes().myOrders.replace(
          /my-orders\.php$/i,
          `order-details.php?order_id=${row.id}`,
        );
        const detailHtml = await fetchLegacyAdminHtml(detailPath, {
          method: "GET",
          credentials: "include",
        });
        const parsed = sanitizePendingOrderRow(
          parseLegacyPendingOrderDetails(detailHtml, row),
        );
        const merged = {
          ...parsed,
          priority: mergePendingPriorityUnion(parsed.priority, row.priority),
        };
        pendingDetailsCache.set(row.id, merged);
        rememberOrderRequestDetails(merged);
        return merged;
      } catch {
        return row;
      }
    }),
  );

  return unionPendingRowsByKey(enriched);
};

const historyDetailsCache = new Map<number, Partial<AdminOrderHistoryDto>>();

const enrichAdminHistoryOrders = async (rows: AdminOrderHistoryDto[]) => {
  const enriched = await Promise.all(
    rows.map(async (row) => {
      if (!row.id || row.id < 1) return sanitizeAdminHistoryRow(row);

      const cached = historyDetailsCache.get(row.id);
      if (cached) {
        return mergeAdminHistoryDetail(
          sanitizeAdminHistoryRow(row),
          sanitizeAdminHistoryRow(cached as AdminOrderHistoryDto),
        );
      }

      try {
        const detailPath = getWebRoutes().myOrders.replace(
          /my-orders\.php$/i,
          `order-details.php?order_id=${row.id}`,
        );
        const detailHtml = await fetchLegacyAdminHtml(detailPath, {
          method: "GET",
          credentials: "include",
        });
        const parsedBase = sanitizePendingOrderRow(
          parseLegacyPendingOrderDetails(detailHtml, row),
        );
        const parsed: AdminOrderHistoryDto = sanitizeAdminHistoryRow({
          ...row,
          ...parsedBase,
          status: parsedBase.status || row.status || "submitted",
        });
        historyDetailsCache.set(row.id, parsed);
        rememberOrderRequestDetails(parsed);
        return mergeAdminHistoryDetail(sanitizeAdminHistoryRow(row), parsed);
      } catch {
        return sanitizeAdminHistoryRow(row);
      }
    }),
  );

  return mergeAdminHistoryRows(enriched);
};

const parseLegacyAdminUsers = (html: string): AdminUserDto[] => {
  const rows: AdminUserDto[] = [];

  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
      .map((cell) => stripTags(cell[1]))
      .filter(Boolean);

    if (cells.length < 5) continue;

    const email = cells.find((cell) => /@/.test(cell));
    if (!email) continue;

    const idMatch = rowHtml.match(/name=["']user_id["'][^>]*value=["'](\d+)["']/i);
    const roleValue =
      rowHtml.match(/<option value=["']([^"']+)["'][^>]*selected/i)?.[1] ||
      cells.find((cell) => /admin|technician|customer/i.test(cell)) ||
      "customer";
    const statusCell = cells.find((cell) => /active|inactive/i.test(cell));
    const lastLogin = cells.find((cell) => looksLikeDateText(cell));

    rows.push({
      id: idMatch ? Number(idMatch[1]) : hashTextToId(email),
      full_name: cells[0] || "User",
      email,
      company_name: cells[2] && cells[2] !== "—" ? cells[2] : undefined,
      role: /admin/i.test(roleValue)
        ? "administrator"
        : /tech/i.test(roleValue)
          ? "technician"
          : "customer",
      is_active: !/inactive/i.test(statusCell || "") && !/activate/i.test(rowHtml),
      last_login: lastLogin || undefined,
    });
  }

  return rows;
};

const postLegacyApprovalAction = async (body: Record<string, string>) => {
  const html = await fetchLegacyAdminHtml(getWebRoutes().adminApprovals, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  return {
    success: !/error/i.test(stripTags(html)),
    message: "Order updated successfully.",
  };
};

const isCompletedLikeStatus = (value?: string | null) => {
  const normalized = normalizeLegacyStatus(value);
  return normalized === "completed" || normalized === "results_available";
};

const isInReportWindow = (value: string | undefined, option: string) => {
  const normalizedOption = (option || "all").trim().toLowerCase();
  if (!value || !normalizedOption || normalizedOption === "all") return true;

  const parsed = parseBackendDate(value);
  if (!parsed) return true;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  if (normalizedOption === "today") {
    return diffDays === 0;
  }
  if (normalizedOption === "week") {
    return diffDays >= 0 && diffDays < 7;
  }
  if (normalizedOption === "month") {
    return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth();
  }

  return true;
};

const buildLiveWebsiteReport = async (request: ReportRequest): Promise<ReportResponse> => {
  const reportType = (request.type || "orders").toLowerCase() as ReportRequest["type"];
  const reportOption = (request.option || "all").toLowerCase();

  const [historyResult, calendarResult] = await Promise.allSettled([
    fetchAdminOrderHistory(),
    fetchCalendarData(),
  ]);

  const historyRows = historyResult.status === "fulfilled" ? historyResult.value : [];
  const calendarData = calendarResult.status === "fulfilled"
    ? calendarResult.value
    : { queue: [], equipment: [], utilization: [] };

  const filteredHistory = historyRows.filter((row) =>
    isInReportWindow(
      row.created_at || row.assigned_at || row.scheduled_start || row.estimated_completion,
      reportOption,
    ),
  );
  const filteredQueue = (calendarData.queue ?? []).filter((entry) =>
    isInReportWindow(
      entry.assigned_at || entry.scheduled_start || entry.estimated_completion || entry.scheduled_end || undefined,
      reportOption,
    ),
  );

  if (reportType === "queue") {
    return {
      summary: `Generated queue report from ${filteredQueue.length} live website assignment(s).`,
      rows: filteredQueue.slice(0, 100).map((entry) => ({
        order_number: entry.order_number,
        status: normalizeLegacyStatus(entry.order_status),
        priority: entry.priority || "standard",
        technician: entry.assigned_technician_name || "Awaiting assignment",
        equipment: entry.equipment_name || "Pending",
        eta: entry.estimated_completion || entry.scheduled_end || "Pending",
      })),
    };
  }

  if (reportType === "equipment") {
    return {
      summary: `Generated equipment report from ${calendarData.equipment?.length ?? 0} live website equipment record(s).`,
      rows: (calendarData.equipment ?? []).map((item) => ({
        equipment: item.name,
        type: item.equipment_type || "General",
        available: item.is_available ? "Yes" : "No",
        daily_capacity: item.daily_capacity,
        processing_time: item.processing_time_per_sample,
        maintenance: item.last_maintenance || "Not listed",
      })),
    };
  }

  if (reportType === "revenue") {
    const completedOrders = filteredHistory.filter((row) => isCompletedLikeStatus(row.status)).length;
    const paymentPending = filteredHistory.filter((row) => normalizeLegacyStatus(row.status) === "payment_pending").length;
    const highPriority = filteredHistory.filter((row) => row.priority === "high").length;
    const totalSamples = filteredHistory.reduce((sum, row) => sum + (Number(row.sample_count) || 0), 0);

    return {
      summary: `Generated revenue workflow report from ${filteredHistory.length} live website order record(s).`,
      rows: [
        { metric: "Tracked Orders", value: filteredHistory.length },
        { metric: "Completed Orders", value: completedOrders },
        { metric: "Payment Pending", value: paymentPending },
        { metric: "Priority Orders", value: highPriority },
        { metric: "Samples Processed", value: totalSamples },
      ],
    };
  }

  return {
    summary: `Generated orders report from ${filteredHistory.length} live website order(s).`,
    rows: filteredHistory.slice(0, 100).map((row) => ({
      order_number: row.order_number,
      customer: row.customer_name,
      company: row.company_name || "N/A",
      status: normalizeLegacyStatus(row.status),
      priority: row.priority,
      samples: row.sample_count,
    })),
  };
};

const withCacheBuster = (path: string) => {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}_appcb=${Date.now()}`;
};

export async function fetchPendingOrders() {
  resetPendingApprovalsClientCaches();
  await hydrateOrderRequestDetailsStore();

  const endpoints = getApiEndpoints();
  const pendingPath = withCacheBuster(endpoints.adminPendingOrders);
  let approvalsHtml = "";
  let dashboardHtml = "";
  let orderHistoryHtml = "";
  const results = await Promise.allSettled([
    apiRequest<PendingOrderDto[] | SuccessEnvelope<PendingOrderDto[]>>(
      pendingPath,
      {
        noCache: true,
        timeoutMs: 12000,
      },
    ).then((response) => pendingOrdersFromApiPayload(response)),
    fetchLegacyAdminHtml(getWebRoutes().adminApprovals, {
      method: "GET",
      credentials: "include",
    }).then((html) => {
      approvalsHtml = html;
      return parseLegacyPendingOrders(html);
    }),
    fetchLegacyAdminHtml(getWebRoutes().customerDashboard, {
      method: "GET",
      credentials: "include",
    }).then((html) => {
      dashboardHtml = html;
      return parseLegacyPendingOrders(html);
    }),
    fetchLegacyAdminHtml(getWebRoutes().orderHistory, {
      method: "GET",
      credentials: "include",
    }).then((html) => {
      orderHistoryHtml = html;
      return parseLegacyHistoryOrders(html);
    }),
  ]);

  const apiRows = results[0].status === "fulfilled" ? results[0].value : [];
  const legacyApprovals = results[1].status === "fulfilled" ? results[1].value : [];
  const legacyDashboard = results[2].status === "fulfilled" ? results[2].value : [];
  const legacyHistoryParsed = results[3].status === "fulfilled" ? results[3].value : [];
  const pendingFromOrderHistory = legacyHistoryParsed.filter((row) => {
    const st = normalizeLegacyStatus(row.status);
    const raw = (row.status || "").trim().toLowerCase();
    if (raw.includes("payment")) return false;
    if (/completed|rejected|processing|in_queue|testing|preparation|results/i.test(raw)) {
      return false;
    }
    return (
      st === "submitted" ||
      st === "pending" ||
      /awaiting\s+admin|pending\s+approval|needs\s+approval|for\s+approval|submitted/i.test(raw)
    );
  });
  const legacyRows = unionPendingRowsByKey([
    ...legacyApprovals,
    ...legacyDashboard,
    ...pendingFromOrderHistory,
  ]);

  let baseRows =
    apiRows.length > 0
      ? mergeApiWithLegacyPending(apiRows, legacyRows)
      : unionPendingRowsByKey([...apiRows, ...legacyRows]);

  if (approvalsHtml) {
    baseRows = supplementPendingFromApprovalsHtml(approvalsHtml, baseRows);
  }
  if (dashboardHtml) {
    baseRows = supplementPendingFromApprovalsHtml(dashboardHtml, baseRows);
  }
  if (orderHistoryHtml) {
    baseRows = supplementPendingFromApprovalsHtml(orderHistoryHtml, baseRows);
  }

  if (baseRows.length > 0) {
    const enriched = await enrichPendingOrders(
      fillNewestOrderFromRememberedRequest(baseRows),
    );
    return enriched.filter((row) => !isDemoTestOrder(row));
  }

  const rejected = results.find((result) => result.status === "rejected");
  throw new Error(
    rejected && rejected.reason instanceof Error
      ? rejected.reason.message
      : "Unable to load pending orders from the shared website backend.",
  );
}

export async function approveOrder(order: number | PendingOrderDto) {
  const endpoints = getApiEndpoints();
  const orderId = typeof order === "number" ? order : order.id;
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
  } catch {
    const response = await postLegacyApprovalAction({
      order_id: String(orderId),
      approve_order: "1",
    });
    emitLiveDataRefresh();
    return response;
  }
}

export async function rejectOrder(order: number | PendingOrderDto, reason: string) {
  const endpoints = getApiEndpoints();
  const orderId = typeof order === "number" ? order : order.id;
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
  } catch {
    const response = await postLegacyApprovalAction({
      order_id: String(orderId),
      reject_order: "1",
      rejection_reason: reason,
    });
    emitLiveDataRefresh();
    return response;
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

  const results = await Promise.allSettled([
    apiRequest<AdminUserDto[] | SuccessEnvelope<AdminUserDto[]>>(path, {
      noCache: true,
      timeoutMs: 12000,
    }).then((response) => toArray<AdminUserDto>(unwrap(response))),
    fetchLegacyAdminHtml(getWebRoutes().adminUsers, {
      method: "GET",
      credentials: "include",
    }).then((html) => parseLegacyAdminUsers(html)),
  ]);

  const merged = new Map<string, AdminUserDto>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const key = String(row.id || row.email || "").toLowerCase();
      const previous = merged.get(key);
      merged.set(key, {
        ...previous,
        ...row,
        id: row.id || previous?.id || 0,
        role: row.role || previous?.role || "customer",
        is_active: row.is_active ?? previous?.is_active ?? true,
        last_login: row.last_login || previous?.last_login,
      });
    }
  }

  const filtered = Array.from(merged.values()).filter((row) => {
    const matchesSearch = filters?.search
      ? `${row.full_name} ${row.email} ${row.company_name || ""}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      : true;
    const matchesRole = filters?.role ? row.role === filters.role : true;
    const matchesStatus = filters?.status
      ? filters.status === "active"
        ? row.is_active
        : !row.is_active
      : true;
    return matchesSearch && matchesRole && matchesStatus;
  });

  if (filtered.length > 0) {
    return filtered;
  }

  const rejected = results.find((result) => result.status === "rejected");
  throw new Error(
    rejected && rejected.reason instanceof Error
      ? rejected.reason.message
      : "Unable to load admin users from the shared website backend.",
  );
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
    const response = await apiRequest<
      ReportResponse | SuccessEnvelope<ReportResponse>
    >(endpoints.reportsGenerate, {
      method: "POST",
      body: request,
      timeoutMs: 12000,
    });
    return unwrap(response);
  } catch {
    try {
      await fetchLegacyAdminHtml(getWebRoutes().adminReports, {
        method: "GET",
        credentials: "include",
      });
      return await buildLiveWebsiteReport(request);
    } catch (legacyError) {
      throw new Error(
        legacyError instanceof Error
          ? legacyError.message
          : "Unable to generate report from the shared website backend.",
      );
    }
  }
}

export async function fetchAdminOrderHistory() {
  await hydrateOrderRequestDetailsStore();

  const results = await Promise.allSettled([
    fetchPendingOrders().then((pending) =>
      pending.map((row) => ({
        ...row,
        status: row.status || "submitted",
      })),
    ),
    fetchCalendarData().then((calendarData) =>
      calendarData.queue.map((entry) => ({
        id: entry.order_id,
        order_number: entry.order_number,
        customer_name: entry.customer_name || "Customer",
        company_name: entry.company_name || undefined,
        created_at: undefined as unknown as string,
        priority: normalizeOrderPriorityValue(entry.priority),
        sample_type:
          entry.sample_type ||
          (entry.sample_types?.length ? entry.sample_types.join(", ") : undefined),
        compound_name: entry.compound_name || undefined,
        quantity: entry.quantity,
        unit: entry.unit,
        notes: entry.notes || undefined,
        sample_count: normalizeSampleCount(
          entry.sample_types?.length || 0,
          entry.quantity,
        ),
        status: normalizeLegacyStatus(entry.order_status),
        equipment_id: entry.equipment_id,
        equipment_name: entry.equipment_name || undefined,
        scheduled_start: entry.scheduled_start || undefined,
        scheduled_end: entry.scheduled_end || undefined,
        estimated_completion: entry.estimated_completion || undefined,
        assigned_at: entry.assigned_at || undefined,
        assigned_technician_uid: entry.assigned_technician_uid || undefined,
        assigned_technician_name: entry.assigned_technician_name || undefined,
        assigned_technician_email: entry.assigned_technician_email || undefined,
        technician_status_action: entry.technician_status_action || undefined,
        technician_status_note: entry.technician_status_note || undefined,
        technician_status_updated_at: entry.technician_status_updated_at || undefined,
        technician_status_updated_by: entry.technician_status_updated_by || undefined,
      })),
    ),
    fetchLegacyAdminHtml(getWebRoutes().orderHistory, {
      method: "GET",
      credentials: "include",
    }).then((html) => parseLegacyHistoryOrders(html)),
  ]);

  const baseRows = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  const merged = fillNewestOrderFromRememberedRequest(
    mergeAdminHistoryRows(baseRows).filter((row) => !isDemoTestOrder(row)),
  );
  if (merged.length > 0) {
    return await enrichAdminHistoryOrders(merged);
  }

  const rejected = results.find((result) => result.status === "rejected");
  throw new Error(
    rejected && rejected.reason instanceof Error
      ? rejected.reason.message
      : "Unable to load admin order history from the shared website backend.",
  );
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
    | Pick<AdminUserDto, "firebase_uid" | "full_name" | "email" | "id">
    | null,
) {
  const endpoints = getApiEndpoints();
  const orderId = order.id;
  if (!orderId || orderId < 1) {
    throw new Error("Invalid order for technician assignment.");
  }

  const pathCandidates = [
    endpoints.orderAssignTechnician,
    "/api.php?endpoint=order-assign-technician",
  ];

  const bodyCandidates: Record<string, unknown>[] = [
    {
      order_id: orderId,
      order_number: order.order_number,
      technician_user_id: technician?.id ?? null,
      technician_email: technician?.email ?? null,
      technician_name: technician?.full_name ?? null,
      assign_technician: true,
      clear_assignment: !technician,
    },
    {
      order_id: orderId,
      technician_id: technician?.id ?? null,
      assigned_technician_email: technician?.email ?? null,
      assigned_technician_name: technician?.full_name ?? null,
    },
  ];

  let lastError: Error | null = null;
  for (const path of pathCandidates) {
    for (const body of bodyCandidates) {
      try {
        await phpPost<Record<string, unknown>>(path, body);
        emitLiveDataRefresh();
        return { success: true, message: "Technician assignment saved." };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      try {
        const response = await apiRequest<
          SuccessEnvelope<{ success?: boolean }> | { success?: boolean }
        >(path, {
          method: "POST",
          body,
          timeoutMs: 12000,
        });
        const envelope = response as SuccessEnvelope<{ success?: boolean }>;
        if (
          envelope &&
          typeof envelope === "object" &&
          (envelope.success === true || envelope.success === undefined)
        ) {
          emitLiveDataRefresh();
          return response;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  try {
    await fetchLegacyAdminHtml(getWebRoutes().orderHistory, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        assign_technician: technician ? "1" : "0",
        order_id: String(orderId),
        ...(technician?.id ? { technician_id: String(technician.id) } : {}),
        ...(technician?.email ? { technician_email: technician.email } : {}),
      }).toString(),
    });
    emitLiveDataRefresh();
    return { success: true, message: "Technician assignment saved." };
  } catch (error) {
    lastError = error instanceof Error ? error : lastError;
  }

  throw new Error(
    lastError?.message ||
      "Could not assign technician via the website backend. Ensure the server exposes technician assignment (same MySQL as the website) or use the web admin UI.",
  );
}
