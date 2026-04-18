import AsyncStorage from "@react-native-async-storage/async-storage";

type UnitValue = "g" | "kg" | "mL" | "L";

type OrderRequestLike = {
  id?: number;
  order_id?: number;
  order_number?: string;
  sample_type?: string;
  compound_name?: string;
  quantity?: number;
  unit?: UnitValue;
  sample_count?: number;
  notes?: string;
  created_at?: string;
};

type RememberedOrderRequest = {
  orderId?: number;
  orderNumber?: string;
  sampleType?: string;
  compoundName?: string;
  quantity?: number;
  unit?: UnitValue;
  sampleCount?: number;
  notes?: string;
  createdAt?: string;
  capturedAt?: number;
};

const ORDER_REQUEST_STORAGE_KEY = "globentech-mobile:order-request-details:v1";
const requestStore = new Map<string, RememberedOrderRequest>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

const normalizeText = (value?: string | null) =>
  (value || "").replace(/\s+/g, " ").trim();

const hasUsableText = (value?: string | null) => {
  const normalized = normalizeText(value);
  return Boolean(
    normalized &&
      !/^(?:-|—|n\/a|na|none|pending(?:\s+website)?\s*sync|not\s+listed|not\s+provided|unknown|see\s+notes(?:\s+below)?|check\s+order\s+details|count\s+\d+|samples?|sample\s*#?|chat)$/i.test(
        normalized,
      ) &&
      !/(?:approve|reject|view\s+details|cancel\s+order|back\s+to\s+my\s+orders|virtual\s+assistant|review\s+orders|manage\s+users|manage\s+equipment|view\s+reports|system\s+administrator|project\s+prototype)/i.test(
        normalized,
      ),
  );
};

const sanitizeRememberedRequest = (
  value?: RememberedOrderRequest,
): RememberedOrderRequest | undefined => {
  if (!value) return undefined;

  return {
    ...value,
    sampleType: hasUsableText(value.sampleType)
      ? normalizeText(value.sampleType)
      : undefined,
    compoundName: hasUsableText(value.compoundName)
      ? normalizeText(value.compoundName)
      : undefined,
    notes: hasUsableText(value.notes) ? normalizeText(value.notes) : undefined,
  };
};

const toKeyCandidates = (input: { orderId?: number; orderNumber?: string }) => {
  const keys: string[] = [];
  const normalizedOrderNumber = normalizeText(input.orderNumber).toUpperCase();
  if (normalizedOrderNumber) {
    keys.push(`order:${normalizedOrderNumber}`);
  }
  if (typeof input.orderId === "number" && input.orderId > 0) {
    keys.push(`id:${input.orderId}`);
  }
  return keys;
};

const mergeValues = (
  previous: RememberedOrderRequest | undefined,
  next: RememberedOrderRequest,
): RememberedOrderRequest => {
  const safePrevious = sanitizeRememberedRequest(previous);
  const safeNext = sanitizeRememberedRequest(next) || next;

  return {
    orderId: safeNext.orderId || safePrevious?.orderId,
    orderNumber: safeNext.orderNumber || safePrevious?.orderNumber,
    sampleType: safeNext.sampleType || safePrevious?.sampleType,
    compoundName: safeNext.compoundName || safePrevious?.compoundName,
    quantity: safeNext.quantity ?? safePrevious?.quantity,
    unit: safeNext.unit || safePrevious?.unit,
    sampleCount:
      Math.max(Number(safePrevious?.sampleCount || 0), Number(safeNext.sampleCount || 0)) ||
      safePrevious?.sampleCount ||
      safeNext.sampleCount,
    notes: safeNext.notes || safePrevious?.notes,
    createdAt: safeNext.createdAt || safePrevious?.createdAt,
    capturedAt: safeNext.capturedAt || safePrevious?.capturedAt || Date.now(),
  };
};

const persistRequestStore = async () => {
  try {
    const payload = JSON.stringify(Array.from(requestStore.entries()));
    await AsyncStorage.setItem(ORDER_REQUEST_STORAGE_KEY, payload);
  } catch {
    // Ignore persistence failures and keep the in-memory cache.
  }
};

export const hydrateOrderRequestDetailsStore = async () => {
  if (hydrated) return;
  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(ORDER_REQUEST_STORAGE_KEY);
      if (!raw) {
        hydrated = true;
        return;
      }

      const entries = JSON.parse(raw) as Array<[string, RememberedOrderRequest]>;
      entries.forEach(([key, value]) => {
        if (key && value) {
          requestStore.set(key, sanitizeRememberedRequest(value) || value);
        }
      });
      hydrated = true;
    } catch {
      hydrated = true;
    }
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
};

void hydrateOrderRequestDetailsStore();

export function rememberOrderRequestDetails(row: OrderRequestLike) {
  const payload: RememberedOrderRequest = {
    orderId: row.id || row.order_id,
    orderNumber: row.order_number,
    sampleType: normalizeText(row.sample_type) || undefined,
    compoundName: normalizeText(row.compound_name) || undefined,
    quantity: row.quantity,
    unit: row.unit,
    sampleCount: row.sample_count,
    notes: normalizeText(row.notes) || undefined,
    createdAt: row.created_at,
    capturedAt: Date.now(),
  };

  const keys = toKeyCandidates(payload);
  if (keys.length === 0) {
    keys.push("recent:latest");
  } else {
    keys.push("recent:latest");
  }

  for (const key of keys) {
    requestStore.set(key, mergeValues(requestStore.get(key), payload));
  }

  void persistRequestStore();
}

export function mergeRememberedOrderRequestDetails<T extends OrderRequestLike>(row: T): T {
  const remembered = toKeyCandidates({
    orderId: row.id || row.order_id,
    orderNumber: row.order_number,
  })
    .map((key) => requestStore.get(key))
    .find(Boolean);

  const safeRemembered = sanitizeRememberedRequest(remembered);

  if (!safeRemembered) {
    return row;
  }

  return {
    ...row,
    sample_type: hasUsableText(row.sample_type)
      ? row.sample_type
      : safeRemembered.sampleType || row.sample_type,
    compound_name: hasUsableText(row.compound_name)
      ? row.compound_name
      : safeRemembered.compoundName || row.compound_name,
    quantity: row.quantity ?? safeRemembered.quantity,
    unit: row.unit || safeRemembered.unit,
    sample_count:
      Math.max(Number(row.sample_count || 0), Number(safeRemembered.sampleCount || 0)) ||
      row.sample_count ||
      safeRemembered.sampleCount,
    notes: hasUsableText(row.notes) ? row.notes : safeRemembered.notes || row.notes,
  };
}

export function getLatestRememberedOrderRequestDetails() {
  return requestStore.get("recent:latest");
}
