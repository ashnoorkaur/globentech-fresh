import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import {
    addFirebaseEquipment,
    fetchFirebaseEquipmentList,
    updateFirebaseEquipment,
} from "./firebase-rest";
import { emitLiveDataRefresh } from "./live-data";

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
  try {
    return await fetchFirebaseEquipmentList();
  } catch {
    // Continue to PHP fallback.
  }
  const response = await apiRequest<
    | EquipmentListResponse
    | EquipmentPayload[]
    | SuccessEnvelope<EquipmentListResponse>
  >(endpoints.equipmentList);

  const unwrapped = unwrap(response);

  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  return unwrapped?.equipment ?? [];
}

export async function addEquipment(payload: EquipmentPayload) {
  const endpoints = getApiEndpoints();
  try {
    const result = await addFirebaseEquipment(payload);
    emitLiveDataRefresh();
    return result;
  } catch {
    // Continue to PHP fallback.
  }
  const response = await apiRequest<
    EquipmentMutationResponse | SuccessEnvelope<EquipmentMutationResponse>
  >(endpoints.equipmentAdd, {
    method: "POST",
    body: buildMutationPayload(payload, "add"),
  });

  const result = unwrap(response);
  emitLiveDataRefresh();
  return result;
}

export async function updateEquipment(payload: EquipmentPayload) {
  const endpoints = getApiEndpoints();
  try {
    const result = await updateFirebaseEquipment(payload);
    emitLiveDataRefresh();
    return result;
  } catch {
    // Continue to PHP fallback.
  }
  const response = await apiRequest<
    EquipmentMutationResponse | SuccessEnvelope<EquipmentMutationResponse>
  >(endpoints.equipmentUpdate, {
    method: "POST",
    body: buildMutationPayload(payload, "update"),
  });

  const result = unwrap(response);
  emitLiveDataRefresh();
  return result;
}
