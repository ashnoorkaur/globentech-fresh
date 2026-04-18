import AsyncStorage from "@react-native-async-storage/async-storage";

export type LiveOrderOverride = {
  queueId?: number;
  orderId?: number;
  orderNumber?: string;
  status?: string | null;
  equipmentId?: number | null;
  equipmentName?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  estimatedCompletion?: string | null;
  updatedAt: number;
};

type LiveOrderLike = {
  queue_id?: number;
  order_id?: number;
  id?: number;
  order_number?: string;
  status?: string | null;
  order_status?: string | null;
  equipment_id?: number | null;
  equipment_name?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  estimated_completion?: string | null;
};

const STORAGE_KEY = "globentech-mobile:live-order-overrides:v1";
const overrides = new Map<string, LiveOrderOverride>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

const normalizeText = (value?: string | null) =>
  (value || "").replace(/\s+/g, " ").trim();

const normalizeOrderKey = (value?: string | null) =>
  normalizeText(value).toUpperCase();

const keysFor = (input: {
  queueId?: number;
  orderId?: number;
  orderNumber?: string;
}) => {
  const keys: string[] = [];

  if (typeof input.queueId === "number" && input.queueId > 0) {
    keys.push(`queue:${input.queueId}`);
  }

  if (typeof input.orderId === "number" && input.orderId > 0) {
    keys.push(`order:${input.orderId}`);
  }

  const orderKey = normalizeOrderKey(input.orderNumber);
  if (orderKey) {
    keys.push(`number:${orderKey}`);
  }

  return keys;
};

const mergeOverride = (
  previous: LiveOrderOverride | undefined,
  next: Omit<LiveOrderOverride, "updatedAt">,
): LiveOrderOverride => ({
  ...previous,
  ...next,
  queueId: next.queueId ?? previous?.queueId,
  orderId: next.orderId ?? previous?.orderId,
  orderNumber: normalizeText(next.orderNumber) || previous?.orderNumber,
  updatedAt: Date.now(),
});

const persistOverrides = async () => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(overrides.entries())),
    );
  } catch {
    // Ignore storage issues and keep the in-memory cache.
  }
};

export async function hydrateLiveOrderOverrides() {
  if (hydrated) return;
  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const entries = JSON.parse(raw) as Array<[string, LiveOrderOverride]>;
        entries.forEach(([key, value]) => {
          if (key && value) {
            overrides.set(key, value);
          }
        });
      }
    } catch {
      // Ignore hydration failures.
    } finally {
      hydrated = true;
    }
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

void hydrateLiveOrderOverrides();

export function rememberLiveOrderOverride(
  next: Omit<LiveOrderOverride, "updatedAt">,
) {
  const keys = keysFor(next);
  if (keys.length === 0) return;

  const existing = keys.map((key) => overrides.get(key)).find(Boolean);
  const merged = mergeOverride(existing, next);

  keysFor(merged).forEach((key) => {
    overrides.set(key, merged);
  });

  void persistOverrides();
}

export function applyLiveOrderOverride<T extends LiveOrderLike>(row: T): T {
  const match = keysFor({
    queueId: row.queue_id,
    orderId: row.order_id ?? row.id,
    orderNumber: row.order_number,
  })
    .map((key) => overrides.get(key))
    .find(Boolean);

  if (!match) {
    return row;
  }

  return {
    ...row,
    ...(match.status !== undefined
      ? {
          status: match.status,
          order_status: match.status,
        }
      : {}),
    ...(match.equipmentId !== undefined
      ? { equipment_id: match.equipmentId }
      : {}),
    ...(match.equipmentName !== undefined
      ? { equipment_name: match.equipmentName }
      : {}),
    ...(match.scheduledStart !== undefined
      ? { scheduled_start: match.scheduledStart }
      : {}),
    ...(match.scheduledEnd !== undefined
      ? { scheduled_end: match.scheduledEnd }
      : {}),
    ...(match.estimatedCompletion !== undefined
      ? { estimated_completion: match.estimatedCompletion }
      : {}),
  } as T;
}
