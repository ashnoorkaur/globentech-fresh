import { apiRequest, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { emitLiveDataRefresh } from "./live-data";
import { getWebRoutes } from "./web-routes";

export type EquipmentPayload = {
  id?: number;
  name: string;
  equipment_type: string;
  processing_time_per_sample: number;
  warmup_time: number;
  break_interval: number;
  break_duration: number;
  daily_capacity: number;
  is_available: boolean;
  last_maintenance?: string;
};

type EquipmentMutationResponse = {
  id?: number;
  equipment?: Record<string, unknown>;
};

type EquipmentListResponse = {
  equipment: EquipmentPayload[];
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

const toNumber = (value: string, fallback = 0) => {
  const parsed = Number(value.match(/\d+(?:\.\d+)?/)?.[0] || fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const fetchLegacyEquipmentHtml = async () => {
  const candidates = getApiBaseUrlCandidates().slice(0, 2);
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${getWebRoutes().adminEquipment}`, {
        method: "GET",
        credentials: "include",
      });
      if (response.status === 404) continue;
      if (!response.ok) {
        lastError = new Error(`Equipment page failed with status ${response.status}`);
        continue;
      }
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Shared website equipment page not found.");
};

const parseLegacyEquipmentRows = (html: string): EquipmentPayload[] => {
  const rows: EquipmentPayload[] = [];

  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
      .map((cell) => stripTags(cell[1]))
      .filter(Boolean);

    if (cells.length < 6) continue;
    if (/name|type|processing/i.test(cells[0])) continue;

    const idMatch = rowHtml.match(/data-id=["'](\d+)["']/i) || rowHtml.match(/equipment_id["'][^>]*value=["'](\d+)["']/i);
    rows.push({
      id: idMatch ? Number(idMatch[1]) : rows.length + 1,
      name: cells[0],
      equipment_type: cells[1] || "General",
      processing_time_per_sample: toNumber(cells[2]),
      warmup_time: toNumber(cells[3]),
      break_interval: toNumber(cells[4]),
      break_duration: 0,
      daily_capacity: toNumber(cells[5]),
      is_available: !/busy|unavailable|offline/i.test(cells[6] || rowHtml),
      last_maintenance: undefined,
    });
  }

  return rows;
};

const mergeEquipmentRows = (sources: EquipmentPayload[][]): EquipmentPayload[] => {
  const merged = new Map<string, EquipmentPayload>();

  for (const source of sources) {
    for (const item of source ?? []) {
      const name = (item.name || "").trim();
      if (!name) continue;

      const key = item.id && item.id > 0 ? `id:${item.id}` : `name:${name.toLowerCase()}`;
      const previous = merged.get(key);

      merged.set(key, {
        id: previous?.id || item.id,
        name,
        equipment_type: item.equipment_type || previous?.equipment_type || "General",
        processing_time_per_sample:
          item.processing_time_per_sample || previous?.processing_time_per_sample || 0,
        warmup_time: item.warmup_time || previous?.warmup_time || 0,
        break_interval: item.break_interval || previous?.break_interval || 0,
        break_duration: item.break_duration || previous?.break_duration || 0,
        daily_capacity: item.daily_capacity || previous?.daily_capacity || 0,
        is_available:
          typeof item.is_available === "boolean"
            ? item.is_available
            : previous?.is_available ?? true,
        last_maintenance: item.last_maintenance || previous?.last_maintenance,
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const buildMutationPayload = (
  payload: EquipmentPayload,
  mode: "add" | "update",
) => {
  const isAvailable = Boolean(payload.is_available);

  return {
    ...(mode === "add"
      ? { add_equipment: true }
      : { update_equipment: true, id: payload.id, equipment_id: payload.id }),
    name: payload.name,
    equipment_name: payload.name,
    equipment_type: payload.equipment_type,
    type: payload.equipment_type,
    processing_time_per_sample: payload.processing_time_per_sample,
    processing_time: payload.processing_time_per_sample,
    warmup_time: payload.warmup_time,
    break_interval: payload.break_interval,
    break_duration: payload.break_duration,
    daily_capacity: payload.daily_capacity,
    is_available: isAvailable,
    availability_status: isAvailable ? 1 : 0,
    status: isAvailable ? "available" : "unavailable",
    last_maintenance: payload.last_maintenance ?? "",
    last_maintenance_date: payload.last_maintenance ?? "",
  };
};

export async function fetchEquipmentList() {
  const endpoints = getApiEndpoints();
  const [apiResult, legacyResult] = await Promise.allSettled([
    apiRequest<
      | EquipmentListResponse
      | EquipmentPayload[]
      | SuccessEnvelope<EquipmentListResponse>
    >(endpoints.equipmentList, {
      noCache: true,
      timeoutMs: 12000,
    }).then((response) => {
      const unwrapped = unwrap(response);
      if (Array.isArray(unwrapped)) {
        return unwrapped;
      }
      return unwrapped?.equipment ?? [];
    }),
    fetchLegacyEquipmentHtml().then((html) => parseLegacyEquipmentRows(html)),
  ]);

  const liveRows = [
    ...(apiResult.status === "fulfilled" ? apiResult.value : []),
    ...(legacyResult.status === "fulfilled" ? legacyResult.value : []),
  ];

  if (liveRows.length > 0) {
    return mergeEquipmentRows([liveRows]);
  }

  const rejected = [apiResult, legacyResult].find(
    (result) => result.status === "rejected",
  );
  throw new Error(
    rejected && rejected.reason instanceof Error
      ? rejected.reason.message
      : "Unable to load equipment from the shared website backend.",
  );
}

export async function addEquipment(payload: EquipmentPayload) {
  const endpoints = getApiEndpoints();
  try {
    const response = await apiRequest<
      EquipmentMutationResponse | SuccessEnvelope<EquipmentMutationResponse>
    >(endpoints.equipmentAdd, {
      method: "POST",
      body: buildMutationPayload(payload, "add"),
      timeoutMs: 12000,
    });

    const result = unwrap(response);
    emitLiveDataRefresh();
    return result;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Unable to add equipment on the shared website backend.");
  }
}

export async function updateEquipment(payload: EquipmentPayload) {
  const endpoints = getApiEndpoints();
  try {
    const response = await apiRequest<
      EquipmentMutationResponse | SuccessEnvelope<EquipmentMutationResponse>
    >(endpoints.equipmentUpdate, {
      method: "POST",
      body: buildMutationPayload(payload, "update"),
      timeoutMs: 12000,
    });

    const result = unwrap(response);
    emitLiveDataRefresh();
    return result;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Unable to update equipment on the shared website backend.");
  }
}
