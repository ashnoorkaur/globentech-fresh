/**
 * Enhanced Orders API with Session Recovery
 *
 * Automatically handles session re-establishment when requests fail due to auth issues,
 * provides detailed error messages, and ensures admin notifications are sent.
 */

import { apiRequest, getApiBaseUrlCandidates } from "./api-client";
import { fetchSessionUser } from "./auth-api";
import { getApiEndpoints } from "./backend-endpoints";
import { backendDateTimeValue } from "./date-time";
import { emitLiveDataRefresh } from "./live-data";
import {
    applyLiveOrderOverride,
    hydrateLiveOrderOverrides,
} from "./order-live-overrides";
import {
    mergeRememberedOrderRequestDetails,
    rememberOrderRequestDetails,
} from "./order-request-details-store";
import { normalizeOrderStatusForCompare } from "./order-status-normalize";
import { normalizeOrderPriorityValue } from "./order-workflow";
import { getWebRoutes } from "./web-routes";

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

const websiteOrderIdByNumber = new Map<string, number>();

const normalizeOrderKey = (orderNumber?: string) =>
  (orderNumber || "").replace(/\s+/g, " ").trim().toUpperCase();

const rememberWebsiteOrderId = (orderNumber?: string, orderId?: number) => {
  const key = normalizeOrderKey(orderNumber);
  if (!key || typeof orderId !== "number" || orderId < 1) return;
  websiteOrderIdByNumber.set(key, orderId);
};

const fetchLegacyOrdersHtml = async (path: string, init?: RequestInit) => {
  const candidates = getApiBaseUrlCandidates().slice(0, 2);
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${path}`, init);
      if (response.status === 404) continue;
      if (!response.ok) {
        lastError = new Error(`Legacy order page failed with status ${response.status}`);
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

  throw lastError ?? new Error("Shared website order page not found.");
};

const resolveLegacyOrderTypeId = (payload: CreateOrderPayload) => {
  const hint = `${payload.sample_type} ${payload.compound_name}`.toLowerCase();
  if (hint.includes("silver")) return "2";
  if (hint.includes("sulphur") || hint.includes("sulfur")) return "4";
  if (hint.includes("acid") || hint.includes("hydrochloric") || hint.includes("hcl")) return "5";
  if (payload.sample_type === "liquid" || hint.includes("water")) return "3";
  return "1";
};

const submitLegacyCustomerOrder = async (
  payload: CreateOrderPayload,
): Promise<SuccessEnvelope<{ id?: number; order_number?: string; success?: boolean }>> => {
  const routes = getWebRoutes();
  const html = await fetchLegacyOrdersHtml(routes.createOrder, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      priority: payload.priority,
      order_type_id: resolveLegacyOrderTypeId(payload),
      sample_type: payload.sample_type,
      sampleType: payload.sample_type,
      compound_name: payload.compound_name,
      quantity: String(payload.quantity),
      sample_count: String(payload.sample_count ?? payload.quantity),
      unit: payload.unit,
      notes: payload.notes || "",
      submit_order: "1",
    }).toString(),
  });

  const orderNumber =
    html.match(/ORD-\d{8}-\d+/i)?.[0] || html.match(/ORD-[A-Z0-9-]+/i)?.[0];
  const text = stripTags(html);

  if (/required|invalid|error/i.test(text) && !orderNumber && !/submitted|success/i.test(text)) {
    throw new Error("Order submission failed on the shared website backend.");
  }

  return {
    success: true,
    data: {
      id: orderNumber ? hashTextToId(orderNumber) : undefined,
      order_number: orderNumber,
      success: true,
    },
  };
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
  if (normalized.includes("cancel") && !normalized.includes("payment")) {
    return "rejected";
  }
  return normalized;
};

/** When merging API + HTML rows, keep the furthest real workflow state and never downgrade back to submitted. */
const mergeCustomerOrderStatus = (
  previous?: string | null,
  incoming?: string | null,
): string => {
  const p = (previous || "").trim();
  const n = (incoming || "").trim();
  const pc = normalizeOrderStatusForCompare(p || "pending");
  const nc = normalizeOrderStatusForCompare(n || "pending");

  if (pc === "rejected" || nc === "rejected") {
    if (nc === "rejected" && n) return n;
    if (pc === "rejected" && p) return p;
    return "rejected";
  }

  const rank = (bucket: string) => {
    if (bucket === "completed") return 5;
    if (bucket === "processing") return 4;
    if (bucket === "payment_pending") return 3;
    if (bucket === "approved") return 2;
    return 1;
  };

  const previousRank = rank(pc);
  const incomingRank = rank(nc);

  if (incomingRank > previousRank) return n || p || "submitted";
  if (previousRank > incomingRank) return p || n || "submitted";

  return n || p || "submitted";
};

const applyRejectionReasonToStatus = (
  status: string | undefined,
  rejectionReason?: string | null,
): string | undefined => {
  const reason = (rejectionReason || "").trim();
  if (!reason) return status;
  const bucket = normalizeOrderStatusForCompare(status || "pending");
  if (bucket === "completed") return status;
  if (bucket === "rejected") return status;
  if (bucket === "pending" || bucket === "approved") {
    return "rejected";
  }
  return status;
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
      !/^(?:-|—|n\/a|na|none|pending(?:\s+sync|\s+website\s+sync)?|not\s+listed|not\s+provided|unknown|check\s+order\s+details|see\s+notes(?:\s+below)?|count\s+\d+|samples?|sample\s*#?)$/i.test(
        normalized,
      ) &&
      !/(?:approve|reject|view\s+details|cancel\s+order|back\s+to\s+my\s+orders)/i.test(
        normalized,
      ),
  );
};

const chooseBetterText = (primary?: string | null, secondary?: string | null) => {
  if (hasRealOrderFieldText(primary)) return primary!.replace(/\s+/g, " ").trim();
  if (hasRealOrderFieldText(secondary)) return secondary!.replace(/\s+/g, " ").trim();
  return undefined;
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

const normalizeUnit = (value?: string | null): CustomerOrderRow["unit"] | undefined => {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "kg") return "kg";
  if (normalized === "g") return "g";
  if (normalized === "ml") return "mL";
  if (normalized === "l") return "L";
  return undefined;
};

const sanitizeCustomerOrderRow = (row: CustomerOrderRow): CustomerOrderRow => {
  const preferredId =
    websiteOrderIdByNumber.get(normalizeOrderKey(row.order_number)) || row.id;

  const nextRow = mergeRememberedOrderRequestDetails({
    ...row,
    id: selectBetterOrderId(row.order_number, preferredId, row.id),
    sample_type: chooseBetterText(row.sample_type),
    compound_name: chooseBetterText(row.compound_name),
    sample_count: normalizeSampleCount(row.sample_count, row.quantity),
    status:
      applyRejectionReasonToStatus(row.status, row.rejection_reason) ?? row.status,
  });

  rememberWebsiteOrderId(nextRow.order_number, nextRow.id);
  return applyLiveOrderOverride(nextRow);
};

const mergeCustomerOrderRows = (rows: CustomerOrderRow[]) => {
  const merged = new Map<string, CustomerOrderRow>();

  for (const rawRow of rows) {
    const row = sanitizeCustomerOrderRow(rawRow);
    const key = (row.order_number || String(row.id)).trim().toUpperCase();
    const previous = merged.get(key);

    if (!previous) {
      merged.set(key, row);
      continue;
    }

    const mergedRejection = row.rejection_reason || previous.rejection_reason;
    const mergedStatusRaw = mergeCustomerOrderStatus(previous.status, row.status);
    const mergedStatus = applyRejectionReasonToStatus(mergedStatusRaw, mergedRejection);

    merged.set(
      key,
      sanitizeCustomerOrderRow({
        ...previous,
        ...row,
        id: selectBetterOrderId(row.order_number || previous.order_number, previous.id, row.id),
        order_number: row.order_number || previous.order_number,
        customer_name: row.customer_name || previous.customer_name,
        company_name: row.company_name || previous.company_name,
        status: mergedStatus,
        priority: row.priority || previous.priority,
        sample_type: chooseBetterText(row.sample_type, previous.sample_type),
        compound_name: chooseBetterText(row.compound_name, previous.compound_name),
        quantity: row.quantity ?? previous.quantity,
        unit: row.unit || previous.unit,
        notes: row.notes || previous.notes,
        rejection_reason: mergedRejection,
        assigned_technician_uid:
          row.assigned_technician_uid || previous.assigned_technician_uid,
        assigned_technician_name:
          row.assigned_technician_name || previous.assigned_technician_name,
        assigned_technician_email:
          row.assigned_technician_email || previous.assigned_technician_email,
        equipment_id: row.equipment_id ?? previous.equipment_id,
        equipment_name: row.equipment_name || previous.equipment_name,
        sample_count: Math.max(
          normalizeSampleCount(previous.sample_count, previous.quantity),
          normalizeSampleCount(row.sample_count, row.quantity),
        ),
        created_at: row.created_at || previous.created_at,
        estimated_completion: row.estimated_completion || previous.estimated_completion,
        scheduled_start: row.scheduled_start || previous.scheduled_start,
        scheduled_end: row.scheduled_end || previous.scheduled_end,
        technician_status_action:
          row.technician_status_action || previous.technician_status_action,
        technician_status_note:
          row.technician_status_note || previous.technician_status_note,
        technician_status_updated_at:
          row.technician_status_updated_at || previous.technician_status_updated_at,
        technician_status_updated_by:
          row.technician_status_updated_by || previous.technician_status_updated_by,
      }),
    );
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = backendDateTimeValue(a.created_at);
    const bTime = backendDateTimeValue(b.created_at);
    return bTime - aTime;
  });
};

const isDemoTestOrder = (row: Partial<CustomerOrderRow>) => {
  const notes = `${row.notes || ""}`.toLowerCase();
  const orderRef = `${row.order_number || ""}`.toLowerCase();

  // Only hide explicit temporary demo rows. Real website orders can legitimately
  // use compound names like SYNCFIX-... and must remain visible so counts match.
  return /teacher-demo|final-demo/.test(`${orderRef} ${notes}`);
};

const isSameCustomerOrder = (left: Partial<CustomerOrderRow>, right: Partial<CustomerOrderRow>) => {
  const leftNumber = normalizeOrderKey(left.order_number);
  const rightNumber = normalizeOrderKey(right.order_number);
  if (leftNumber && rightNumber && leftNumber === rightNumber) return true;
  return Boolean(left.id && right.id && left.id === right.id);
};

const hasResolvedCustomerDetails = (row?: Partial<CustomerOrderRow> | null) => {
  if (!row) return false;
  return Boolean(
    hasRealOrderFieldText(row.sample_type) ||
      hasRealOrderFieldText(row.compound_name) ||
      (typeof row.quantity === "number" && Number.isFinite(row.quantity) && row.quantity > 0),
  );
};

const orderDetailsCache = new Map<string, Partial<CustomerOrderRow>>();

const extractDetailValue = (html: string, label: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const strongValue = html.match(
    new RegExp(
      `<span[^>]*class=["']order-meta-label["'][^>]*>${escaped}<\\/span>[\\s\\S]{0,120}?<strong[^>]*>([\\s\\S]*?)<\\/strong>`,
      "i",
    ),
  )?.[1];

  const plainValue = html.match(
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

  return stripTags(strongValue || plainValue || paragraphValue || tableValue || tdValue || "");
};

const parseLegacyOrderDetails = (html: string, fallback: CustomerOrderRow) => {
  const hasStructuredDetailFields = /(?:<strong[^>]*>\s*(?:sample\s*type|compound\s*name|compound|order\s*type|quantity|notes|submitted)\s*:)|(?:<th[^>]*>\s*(?:sample\s*#|sample\s*type|compound\s*name|compound|quantity|status)\s*<\/th>)/i.test(
    html,
  );
  const orderCount = Array.from(html.matchAll(/ORD-\d{8}-\d+/gi)).length;
  const looksLikeListPage = orderCount > 1 && /view details/i.test(html);

  if (!hasStructuredDetailFields || looksLikeListPage) {
    return sanitizeCustomerOrderRow(fallback);
  }

  const orderNumber =
    html.match(/ORD-\d{8}-\d+/i)?.[0] || fallback.order_number;
  const statusClass = html.match(/status-([a-z_]+)/i)?.[1];
  const statusValue =
    extractDetailValue(html, "Status") ||
    extractDetailValue(html, "Order Status") ||
    statusClass ||
    fallback.status;
  const priorityValue =
    extractDetailValue(html, "Priority") || fallback.priority || "standard";
  const sampleTypeValue = chooseBetterText(
    extractDetailValue(html, "Sample Type") ||
      extractDetailValue(html, "Order Type"),
    fallback.sample_type,
  );
  const createdAtValue =
    extractDetailValue(html, "Submitted") ||
    extractDetailValue(html, "Created") ||
    extractDetailValue(html, "Order Date") ||
    fallback.created_at;
  const sampleRows = Array.from(
    html.matchAll(
      /<tr[^>]*>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>[\s\S]*?<td[^>]*>(.*?)<\/td>\s*<\/tr>/gi,
    ),
  )
    .map((match) => ({
      sampleNo: stripTags(match[1]),
      compound: stripTags(match[2]),
      quantity: stripTags(match[3]),
      status: stripTags(match[4]),
    }))
    .filter((item) => item.compound && !/compound/i.test(item.compound));

  const compoundNames = sampleRows.map((item) => item.compound).filter(Boolean);
  const quantityText = extractDetailValue(html, "Quantity") || sampleRows[0]?.quantity || "";
  const firstQuantity = Number(
    quantityText.match(/\d+(?:\.\d+)?/)?.[0] || fallback.quantity || 0,
  );
  const unitValue = normalizeUnit(
    quantityText.match(/\b(kg|g|ml|l)\b/i)?.[1] || fallback.unit,
  );
  const notesValue = extractDetailValue(html, "Notes") || fallback.notes;

  return sanitizeCustomerOrderRow({
    ...fallback,
    order_number: orderNumber,
    status: mergeCustomerOrderStatus(
      fallback.status,
      normalizeLegacyStatus(statusValue),
    ),
    priority: normalizeOrderPriorityValue(priorityValue),
    created_at: createdAtValue,
    sample_type: sampleTypeValue,
    sample_count: normalizeSampleCount(
      sampleRows.length || fallback.sample_count,
      Number.isFinite(firstQuantity) ? firstQuantity : fallback.quantity,
    ),
    compound_name: chooseBetterText(compoundNames.join(", "), fallback.compound_name),
    quantity: Number.isFinite(firstQuantity) && firstQuantity > 0
      ? firstQuantity
      : fallback.quantity,
    unit: unitValue || fallback.unit,
    notes: notesValue,
  } satisfies CustomerOrderRow);
};

const enrichCustomerOrders = async (rows: CustomerOrderRow[]) => {
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const resolvedId =
        websiteOrderIdByNumber.get(normalizeOrderKey(row.order_number)) || row.id;
      const cacheKey = normalizeOrderKey(row.order_number) || `id:${resolvedId}`;

      if (!resolvedId || resolvedId < 1) return sanitizeCustomerOrderRow(row);

      const cached = orderDetailsCache.get(cacheKey);
      if (cached && hasResolvedCustomerDetails(cached)) {
        const cachedRow = cached as CustomerOrderRow;
        return sanitizeCustomerOrderRow({
          ...row,
          ...cachedRow,
          id: resolvedId,
          status: mergeCustomerOrderStatus(row.status, cachedRow.status),
          rejection_reason: cachedRow.rejection_reason || row.rejection_reason,
        });
      }

      try {
        const detailPath = getWebRoutes().myOrders.replace(
          /my-orders\.php$/i,
          `order-details.php?order_id=${resolvedId}`,
        );
        const detailHtml = await fetchLegacyOrdersHtml(detailPath, {
          method: "GET",
          credentials: "include",
        });
        const parsed = parseLegacyOrderDetails(detailHtml, {
          ...row,
          id: resolvedId,
        });
        const mergedParsed = sanitizeCustomerOrderRow({
          ...parsed,
          status: mergeCustomerOrderStatus(row.status, parsed.status),
          rejection_reason: parsed.rejection_reason || row.rejection_reason,
        });
        if (hasResolvedCustomerDetails(mergedParsed)) {
          orderDetailsCache.set(cacheKey, mergedParsed);
          rememberOrderRequestDetails(mergedParsed);
        }
        return mergedParsed;
      } catch {
        return sanitizeCustomerOrderRow(row);
      }
    }),
  );

  return mergeCustomerOrderRows(enriched).filter((row) => !isDemoTestOrder(row));
};

/** Clears per-order HTML detail cache so list + website status stay in sync (call on pull-to-refresh). */
export function clearCustomerOrderDetailsCache() {
  orderDetailsCache.clear();
}

const parseLegacyOrderRows = (html: string): CustomerOrderRow[] => {
  const rows: CustomerOrderRow[] = [];

  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const cellMatches = Array.from(
      rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi),
    );
    const cells = cellMatches.map((cell) => stripTags(cell[1])).filter(Boolean);

    if (cells.length < 4) continue;

    const orderNumber =
      rowHtml.match(/ORD-\d{8}-\d+/i)?.[0] ||
      cells.find((cell) => /ORD[-\d]+/i.test(cell)) ||
      cells[0];
    if (!orderNumber || /order\s*#/i.test(orderNumber)) continue;

    const idMatch = rowHtml.match(/name=["']order_id["'][^>]*value=["'](\d+)["']/i);
    const linkIdMatch = rowHtml.match(/order-details\.php\?order_id=(\d+)/i);
    const priorityClass = rowHtml.match(/badge-(priority|prioritized|standard)/i)?.[1];
    const statusClass = rowHtml.match(/status-([a-z_]+)/i)?.[1];
    const statusText = cells.find((cell) =>
      /(submitted|approved|processing|completed|rejected|disapprov|declin|deni|cancel|payment|result|queue)/i.test(
        cell,
      ),
    );
    const createdAt = cells.find((cell) => looksLikeDateText(cell)) || cells[1] || "";
    const numericCell = cells.find(
      (cell, index) => index > 1 && /\b\d+\b/.test(cell),
    );
    const quantityText =
      extractDetailValue(rowHtml, "Quantity") ||
      cells.find((cell) => /\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/i.test(cell)) ||
      "";
    const quantity = Number(quantityText.match(/\d+(?:\.\d+)?/)?.[0] || 0);

    const resolvedId = idMatch
      ? Number(idMatch[1])
      : linkIdMatch
        ? Number(linkIdMatch[1])
        : hashTextToId(orderNumber);

    rememberWebsiteOrderId(orderNumber, resolvedId);

    rows.push(
      sanitizeCustomerOrderRow({
        id: resolvedId,
        order_number: orderNumber,
        created_at: createdAt,
        priority:
          priorityClass && priorityClass.toLowerCase() !== "standard"
            ? "priority"
            : /priority|prioritized/i.test(cells[2] || "")
              ? "priority"
              : "standard",
        sample_count: Number(numericCell?.match(/\d+/)?.[0] || 1),
        status: normalizeLegacyStatus(statusText || statusClass),
        sample_type: chooseBetterText(
          extractDetailValue(rowHtml, "Sample Type") ||
            extractDetailValue(rowHtml, "Order Type"),
        ),
        compound_name: chooseBetterText(
          extractDetailValue(rowHtml, "Compound Name") ||
            extractDetailValue(rowHtml, "Compound"),
        ),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
        unit: normalizeUnit(quantityText.match(/\b(kg|g|ml|l)\b/i)?.[1]),
      }),
    );
  }

  return rows;
};

/**
 * Improved error message for order creation failures
 */
async function resolveFreshlyCreatedOrderNumber(
  payload: CreateOrderPayload,
  knownOrderNumber?: string,
) {
  if (knownOrderNumber) return knownOrderNumber;

  try {
    const html = await fetchLegacyOrdersHtml(getWebRoutes().myOrders, {
      method: "GET",
      credentials: "include",
    });

    const rows = parseLegacyOrderRows(html);
    const newest = [...rows]
      .sort(
        (left, right) =>
          backendDateTimeValue(right.created_at) - backendDateTimeValue(left.created_at),
      )
      .find((row) => {
        const recentEnough = Date.now() - backendDateTimeValue(row.created_at) <= 20 * 60 * 1000;
        const priorityMatches =
          (payload.priority === "priority" ? "priority" : "standard") ===
          (row.priority || "standard");
        return recentEnough && priorityMatches;
      });

    return newest?.order_number || knownOrderNumber;
  } catch {
    return knownOrderNumber;
  }
}

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

  // Prefer the same website form submission path used by the live GlobenTech site.
  try {
    const legacyResponse = await submitLegacyCustomerOrder(payload);
    const resolvedOrderNumber = await resolveFreshlyCreatedOrderNumber(
      payload,
      legacyResponse.data?.order_number,
    );
    rememberOrderRequestDetails({
      order_number: resolvedOrderNumber,
      sample_type: payload.sample_type,
      compound_name: payload.compound_name,
      quantity: payload.quantity,
      unit: payload.unit,
      sample_count: payload.sample_count ?? 1,
      notes: payload.notes,
    });
    emitLiveDataRefresh();
    return {
      ...legacyResponse,
      data: {
        ...legacyResponse.data,
        order_number: resolvedOrderNumber || legacyResponse.data?.order_number,
      },
    };
  } catch {
    // Fall through to API fallback for environments that still expose it.
  }

  try {
    const response = await apiRequest<
      SuccessEnvelope<{ id?: number; order_number?: string; success?: boolean }>
    >(endpoints.customerCreateOrder, {
      method: "POST",
      body: payload,
      timeoutMs: 12000,
    });

    const resolvedOrderNumber = await resolveFreshlyCreatedOrderNumber(
      payload,
      response.data?.order_number,
    );
    rememberOrderRequestDetails({
      order_number: resolvedOrderNumber,
      sample_type: payload.sample_type,
      compound_name: payload.compound_name,
      quantity: payload.quantity,
      unit: payload.unit,
      sample_count: payload.sample_count ?? 1,
      notes: payload.notes,
    });
    emitLiveDataRefresh();
    return {
      ...response,
      data: {
        ...response.data,
        order_number: resolvedOrderNumber || response.data?.order_number,
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("timed out") ||
        error.message.includes("401") ||
        error.message.includes("unauthorized"))
    ) {
      try {
        const freshUser = await fetchSessionUser();
        if (!freshUser) {
          throw new Error(
            "Session lost. Please log out and log back in to submit orders.",
          );
        }

        const retryResponse = await apiRequest<
          SuccessEnvelope<{
            id?: number;
            order_number?: string;
            success?: boolean;
          }>
        >(endpoints.customerCreateOrder, {
          method: "POST",
          body: payload,
          timeoutMs: 12000,
        });
        const resolvedOrderNumber = await resolveFreshlyCreatedOrderNumber(
          payload,
          retryResponse.data?.order_number,
        );
        rememberOrderRequestDetails({
          order_number: resolvedOrderNumber,
          sample_type: payload.sample_type,
          compound_name: payload.compound_name,
          quantity: payload.quantity,
          unit: payload.unit,
          sample_count: payload.sample_count ?? 1,
          notes: payload.notes,
        });
        emitLiveDataRefresh();
        return {
          ...retryResponse,
          data: {
            ...retryResponse.data,
            order_number: resolvedOrderNumber || retryResponse.data?.order_number,
          },
        };
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
  await hydrateLiveOrderOverrides();
  const endpoints = getApiEndpoints();
  const routes = getWebRoutes();
  const results = await Promise.allSettled([
    apiRequest<CustomerOrderRow[] | SuccessEnvelope<CustomerOrderRow[]>>(
      endpoints.customerMyOrders,
      {
        noCache: true,
        timeoutMs: 12000,
      },
    ).then((response) => toArray<CustomerOrderRow>(unwrap(response))),
    fetchLegacyOrdersHtml(routes.myOrders, {
      method: "GET",
      credentials: "include",
    }).then((html) => parseLegacyOrderRows(html)),
    fetchLegacyOrdersHtml(routes.orderHistory, {
      method: "GET",
      credentials: "include",
    }).then((html) => parseLegacyOrderRows(html)),
  ]);

  const baseRows = mergeCustomerOrderRows(
    results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
  );

  if (baseRows.length > 0) {
    const enrichedRows = await enrichCustomerOrders(mergeCustomerOrderRows(baseRows));
    enrichedRows.forEach(rememberOrderRequestDetails);
    return enrichedRows;
  }

  const rejected = results.find((result) => result.status === "rejected");
  throw new Error(
    `Unable to load customer orders from the real backend. ${getOrderErrorMessage(rejected && rejected.status === "rejected" ? rejected.reason : "Unknown error")}`,
  );
}

/**
 * Fetch customer order history
 */
export async function fetchCustomerOrderHistory() {
  await hydrateLiveOrderOverrides();
  const endpoints = getApiEndpoints();
  const routes = getWebRoutes();
  const results = await Promise.allSettled([
    apiRequest<CustomerOrderRow[] | SuccessEnvelope<CustomerOrderRow[]>>(
      endpoints.customerOrderHistory,
      {
        noCache: true,
        timeoutMs: 12000,
      },
    ).then((response) => toArray<CustomerOrderRow>(unwrap(response))),
    fetchLegacyOrdersHtml(routes.myOrders, {
      method: "GET",
      credentials: "include",
    }).then((html) => parseLegacyOrderRows(html)),
    fetchLegacyOrdersHtml(routes.orderHistory, {
      method: "GET",
      credentials: "include",
    }).then((html) => parseLegacyOrderRows(html)),
  ]);

  const baseRows = mergeCustomerOrderRows(
    results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
  );
  const finishedRows = mergeCustomerOrderRows(baseRows)
    .filter((row) => !isDemoTestOrder(row))
    .filter((row) => {
      const status = normalizeLegacyStatus(row.status);
      return (
        status === "completed" ||
        status === "results_available" ||
        status === "rejected"
      );
    });

  if (finishedRows.length > 0) {
    const enrichedRows = await enrichCustomerOrders(finishedRows);
    enrichedRows.forEach(rememberOrderRequestDetails);
    return enrichedRows;
  }

  const rejected = results.find((result) => result.status === "rejected");
  throw new Error(
    `Unable to load customer order history from the real backend. ${getOrderErrorMessage(rejected && rejected.status === "rejected" ? rejected.reason : "Unknown error")}`,
  );
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
