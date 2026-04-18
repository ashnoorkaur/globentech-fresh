import type { ProfileDto, ProfileUpdatePayload } from "./account-api";
import type { AdminUserDto, PendingOrderDto, ReportRequest, ReportResponse } from "./admin-api";
import type { AuthRole, AuthUser, RegisterPayload } from "./auth-api";
import type { QueueEntry } from "./calendar-api";
import type { EquipmentPayload } from "./equipment-api";
import type { CreateOrderPayload, CustomerOrderRow } from "./orders-api-enhanced";

const FIREBASE_API_KEY = "AIzaSyAqrrEiD7qMIWQ4Kduatkg5YOJUejYn0js";
const FIREBASE_DB_URL = "https://globentech-e6551-default-rtdb.firebaseio.com";
const FIREBASE_AUTH_ENABLED = true;

type FirebaseSession = {
  uid: string;
  email: string;
};

type FirebaseUserRecord = {
  uid?: string;
  name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  companyName?: string;
  address?: string;
  role?: string;
  is_active?: boolean;
  createdAt?: string;
  lastLogin?: string;
};

type FirebaseOrderRecord = {
  id?: number;
  orderNumber?: string;
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  companyName?: string;
  assignedTechnicianUid?: string;
  assignedTechnicianName?: string;
  assignedTechnicianEmail?: string;
  assignedAt?: string;
  technicianStatusAction?: string;
  technicianStatusNote?: string;
  technicianStatusUpdatedAt?: string;
  technicianStatusUpdatedBy?: string;
  priority?: string;
  status?: string;
  createdAt?: string;
  estimatedCompletion?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  equipmentName?: string;
  equipmentId?: number | string;
  sampleType?: string;
  compoundName?: string;
  quantity?: number | string;
  unit?: string;
  sampleCount?: number | string;
  notes?: string;
  rejectionReason?: string;
};

type FirebaseEquipmentRecord = {
  id?: number;
  name?: string;
  equipment_type?: string;
  processing_time_per_sample?: number | string;
  warmup_time?: number | string;
  break_interval?: number | string;
  break_duration?: number | string;
  daily_capacity?: number | string;
  is_available?: boolean;
  last_maintenance?: string;
};

let activeSession: FirebaseSession | null = null;

const toRole = (role?: string): AuthRole => {
  const value = (role || "").trim().toLowerCase();
  if (value === "administrator" || value === "admin") return "administrator";
  if (value === "technician" || value === "tech") return "technician";
  return "customer";
};

const toProfileRole = (role?: string): ProfileDto["role"] => {
  const value = toRole(role);
  return value === "administrator" ? "administrator" : value === "technician" ? "technician" : "customer";
};

const toAdminRole = (role?: string): AdminUserDto["role"] => toProfileRole(role);

const hashTextToId = (value: string) => {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 1000000) + 1;
};

const parseNumeric = (value: unknown) => {
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

const parseUnit = (value: unknown, fallback?: string) => {
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  if (typeof value === "string") {
    const match = value.match(/[a-zA-Z]+$/);
    if (match) return match[0];
  }
  return undefined;
};

const normalizePriority = (value?: string) => {
  const normalized = (value || "standard").trim().toLowerCase();
  return normalized === "high" || normalized === "priority" ? "high" : "standard";
};

const normalizeOrderStatus = (value?: string) => {
  const normalized = (value || "pending").trim().toLowerCase();
  if (normalized === "submitted") return "pending";
  if (normalized === "in_queue") return "approved";
  if (normalized === "testing" || normalized === "preparation") return "processing";
  if (normalized === "results_available") return "completed";
  return normalized;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const buildOrderNumber = () => `ORD-${String(Date.now()).slice(-6)}`;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  if (!FIREBASE_AUTH_ENABLED && /identitytoolkit\.googleapis\.com/i.test(url)) {
    throw new Error("Firebase auth is disabled. Using PHP backend login.");
  }

  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Firebase request failed with ${response.status}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}

async function readUsersMap() {
  const payload = await fetchJson<Record<string, FirebaseUserRecord> | null>(`${FIREBASE_DB_URL}/users.json`);
  return payload || {};
}

async function readOrdersMap() {
  const payload = await fetchJson<Record<string, FirebaseOrderRecord> | null>(`${FIREBASE_DB_URL}/orders.json`);
  return payload || {};
}

async function readEquipmentMap() {
  const payload = await fetchJson<Record<string, FirebaseEquipmentRecord> | null>(`${FIREBASE_DB_URL}/equipment.json`);
  return payload || {};
}

const mapUserToAuthUser = (uid: string, user: FirebaseUserRecord): AuthUser => ({
  id: hashTextToId(uid),
  firebase_uid: uid,
  full_name: user.name || user.full_name || "User",
  email: user.email || "",
  role: toRole(user.role),
});

const mapUserToProfile = (uid: string, user: FirebaseUserRecord): ProfileDto => ({
  id: hashTextToId(uid),
  uid,
  full_name: user.name || user.full_name || "User",
  email: user.email || "",
  phone: user.phone || "",
  company_name: user.company || user.companyName || "",
  address: user.address || "",
  role: toProfileRole(user.role),
  is_active: user.is_active !== false,
});

const mapUserToAdminUser = (uid: string, user: FirebaseUserRecord): AdminUserDto => ({
  id: hashTextToId(uid),
  firebase_uid: uid,
  full_name: user.name || user.full_name || "User",
  email: user.email || "",
  company_name: user.company || user.companyName || "",
  role: toAdminRole(user.role),
  is_active: user.is_active !== false,
  last_login: user.lastLogin || user.createdAt,
});

const mapOrderToCustomerRow = (
  firebaseKey: string,
  order: FirebaseOrderRecord,
  users: Record<string, FirebaseUserRecord>,
): CustomerOrderRow => {
  const customer = order.customerId ? users[order.customerId] : undefined;
  const orderNumber = order.orderNumber || `ORD-${firebaseKey.slice(-6).toUpperCase()}`;
  return {
    id: order.id || hashTextToId(firebaseKey),
    firebase_key: firebaseKey,
    order_number: orderNumber,
    customer_name: order.customerName || customer?.name || customer?.full_name || "Customer",
    company_name: order.companyName || customer?.company || customer?.companyName || "",
    status: normalizeOrderStatus(order.status),
    priority: normalizePriority(order.priority) === "high" ? "priority" : "standard",
    sample_type: order.sampleType,
    compound_name: order.compoundName,
    quantity: parseNumeric(order.quantity),
    unit: parseUnit(order.quantity, order.unit) as CustomerOrderRow["unit"],
    notes: order.notes,
    rejection_reason: order.rejectionReason,
    assigned_technician_uid: order.assignedTechnicianUid,
    assigned_technician_name: order.assignedTechnicianName,
    assigned_technician_email: order.assignedTechnicianEmail,
    equipment_id:
      typeof order.equipmentId === "string"
        ? Number(order.equipmentId) || null
        : order.equipmentId ?? null,
    equipment_name: order.equipmentName,
    sample_count: parseNumeric(order.sampleCount) || 1,
    created_at: order.createdAt,
    estimated_completion: order.estimatedCompletion,
    scheduled_start: order.scheduledStart,
    scheduled_end: order.scheduledEnd,
    technician_status_action: order.technicianStatusAction,
    technician_status_note: order.technicianStatusNote,
    technician_status_updated_at: order.technicianStatusUpdatedAt,
    technician_status_updated_by: order.technicianStatusUpdatedBy,
  };
};

const mapOrderToPending = (
  firebaseKey: string,
  order: FirebaseOrderRecord,
  users: Record<string, FirebaseUserRecord>,
): PendingOrderDto => {
  const customer = order.customerId ? users[order.customerId] : undefined;
  return {
    id: order.id || hashTextToId(firebaseKey),
    firebase_key: firebaseKey,
    order_number: order.orderNumber || `ORD-${firebaseKey.slice(-6).toUpperCase()}`,
    customer_name: order.customerName || customer?.name || customer?.full_name || "Customer",
    customer_email: order.customerEmail || customer?.email || "",
    company_name: order.companyName || customer?.company || customer?.companyName || "",
    created_at: order.createdAt || new Date().toISOString(),
    priority: normalizePriority(order.priority),
    sample_count: parseNumeric(order.sampleCount) || 1,
    sample_type: order.sampleType,
    compound_name: order.compoundName,
    quantity: parseNumeric(order.quantity),
    unit: parseUnit(order.quantity, order.unit) as PendingOrderDto["unit"],
    notes: order.notes,
    estimated_completion: order.estimatedCompletion,
    equipment_id:
      typeof order.equipmentId === "string"
        ? Number(order.equipmentId) || null
        : order.equipmentId ?? null,
    equipment_name: order.equipmentName,
    scheduled_start: order.scheduledStart,
    scheduled_end: order.scheduledEnd,
    assigned_at: order.assignedAt,
    assigned_technician_uid: order.assignedTechnicianUid,
    assigned_technician_name: order.assignedTechnicianName,
    assigned_technician_email: order.assignedTechnicianEmail,
    technician_status_action: order.technicianStatusAction,
    technician_status_note: order.technicianStatusNote,
    technician_status_updated_at: order.technicianStatusUpdatedAt,
    technician_status_updated_by: order.technicianStatusUpdatedBy,
  };
};

const mapOrderToAdminHistory = (
  firebaseKey: string,
  order: FirebaseOrderRecord,
  users: Record<string, FirebaseUserRecord>,
) => ({
  ...mapOrderToPending(firebaseKey, order, users),
  status: normalizeOrderStatus(order.status),
  rejection_reason: order.rejectionReason,
});

const mapOrderToQueueEntry = (
  firebaseKey: string,
  order: FirebaseOrderRecord,
  users: Record<string, FirebaseUserRecord>,
): QueueEntry => {
  const customer = order.customerId ? users[order.customerId] : undefined;
  const sampleTypes = toStringArray((order as FirebaseOrderRecord & { sampleTypes?: unknown }).sampleTypes);
  if (sampleTypes.length === 0 && order.sampleType?.trim()) {
    sampleTypes.push(order.sampleType.trim());
  }

  return {
    queue_id: order.id || hashTextToId(`queue:${firebaseKey}`),
    firebase_key: firebaseKey,
    order_id: order.id || hashTextToId(firebaseKey),
    order_number: order.orderNumber || `ORD-${firebaseKey.slice(-6).toUpperCase()}`,
    order_status: normalizeOrderStatus(order.status),
    priority: normalizePriority(order.priority),
    customer_name:
      order.customerName || customer?.name || customer?.full_name || undefined,
    company_name:
      order.companyName || customer?.company || customer?.companyName || undefined,
    sample_type: order.sampleType || sampleTypes[0] || undefined,
    compound_name: order.compoundName,
    quantity: parseNumeric(order.quantity),
    unit: parseUnit(order.quantity, order.unit) as QueueEntry["unit"],
    notes: order.notes,
    assigned_at: order.assignedAt,
    assigned_technician_uid: order.assignedTechnicianUid,
    assigned_technician_name: order.assignedTechnicianName,
    assigned_technician_email: order.assignedTechnicianEmail,
    technician_status_action: order.technicianStatusAction,
    technician_status_note: order.technicianStatusNote,
    technician_status_updated_at: order.technicianStatusUpdatedAt,
    technician_status_updated_by: order.technicianStatusUpdatedBy,
    sample_types: sampleTypes,
    equipment_id: typeof order.equipmentId === "string" ? Number(order.equipmentId) || null : order.equipmentId ?? null,
    equipment_name: order.equipmentName || null,
    scheduled_start: order.scheduledStart || null,
    scheduled_end: order.scheduledEnd || null,
    estimated_completion: order.estimatedCompletion || null,
    position: order.id || hashTextToId(firebaseKey),
    queue_type: normalizeOrderStatus(order.status),
  };
};

const mapEquipmentRecord = (
  firebaseKey: string,
  equipment: FirebaseEquipmentRecord,
): EquipmentPayload => ({
  id: equipment.id || hashTextToId(`equipment:${firebaseKey}`),
  name: equipment.name || `Equipment ${firebaseKey.slice(-4)}`,
  equipment_type: equipment.equipment_type || "",
  processing_time_per_sample: parseNumeric(equipment.processing_time_per_sample) || 0,
  warmup_time: parseNumeric(equipment.warmup_time) || 0,
  break_interval: parseNumeric(equipment.break_interval) || 0,
  break_duration: parseNumeric(equipment.break_duration) || 0,
  daily_capacity: parseNumeric(equipment.daily_capacity) || 0,
  is_available: equipment.is_available !== false,
  last_maintenance: equipment.last_maintenance,
});

export function getFirebaseSession() {
  return activeSession;
}

export function clearFirebaseSession() {
  activeSession = null;
}

export function setFirebaseSession(session: FirebaseSession | null) {
  activeSession = session;
}

export async function loginWithFirebase(email: string, password: string): Promise<AuthUser> {
  const payload = await fetchJson<{ localId: string; email: string; idToken: string; error?: { message?: string } }>(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const users = await readUsersMap();
  const profile = users[payload.localId];
  if (!profile) {
    throw new Error("Firebase profile not found for this account.");
  }

  const lastLogin = new Date().toISOString();
  await fetchJson(`${FIREBASE_DB_URL}/users/${payload.localId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastLogin }),
  });

  activeSession = { uid: payload.localId, email: payload.email.toLowerCase() };
  return mapUserToAuthUser(payload.localId, {
    ...profile,
    lastLogin,
  });
}

export async function registerWithFirebase(payload: RegisterPayload) {
  const authPayload = await fetchJson<{ localId: string; email: string }>(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        returnSecureToken: true,
      }),
    },
  );

  await fetchJson(
    `${FIREBASE_DB_URL}/users/${authPayload.localId}.json`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: authPayload.localId,
        name: payload.full_name,
        email: payload.email,
        phone: payload.phone || "",
        company: payload.company_name || "",
        address: payload.address || "",
        role: toRole(payload.email),
        createdAt: new Date().toISOString(),
        is_active: true,
      }),
    },
  );

  return { success: true, message: "Account created successfully." };
}

export async function fetchFirebaseProfileByUid(uid: string) {
  const user = await fetchJson<FirebaseUserRecord | null>(`${FIREBASE_DB_URL}/users/${uid}.json`);
  if (!user) throw new Error("Firebase profile not found.");
  return mapUserToProfile(uid, user);
}

export async function fetchFirebaseProfileByEmail(email: string) {
  const users = await readUsersMap();
  const normalizedEmail = email.trim().toLowerCase();
  for (const [uid, user] of Object.entries(users)) {
    if ((user.email || "").trim().toLowerCase() === normalizedEmail) {
      activeSession = { uid, email: normalizedEmail };
      return mapUserToProfile(uid, user);
    }
  }
  throw new Error("Firebase profile not found.");
}

export async function fetchFirebaseSessionProfile() {
  if (!activeSession) {
    throw new Error("No Firebase session.");
  }
  return fetchFirebaseProfileByUid(activeSession.uid);
}

export async function updateFirebaseProfile(payload: ProfileUpdatePayload) {
  if (!activeSession) throw new Error("No Firebase session.");
  await fetchJson(`${FIREBASE_DB_URL}/users/${activeSession.uid}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.full_name,
      phone: payload.phone || "",
      company: payload.company_name || "",
      address: payload.address || "",
    }),
  });
  return { success: true, message: "Profile updated." };
}

export async function fetchFirebaseAdminUsers(filters?: {
  search?: string;
  role?: string;
  status?: string;
}) {
  const users = await readUsersMap();
  let rows = Object.entries(users).map(([uid, user]) => mapUserToAdminUser(uid, user));

  if (filters?.search?.trim()) {
    const search = filters.search.trim().toLowerCase();
    rows = rows.filter((row) =>
      [row.full_name, row.email, String(row.id), row.company_name || ""]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }

  if (filters?.role && filters.role !== "all") {
    rows = rows.filter((row) => row.role === toAdminRole(filters.role));
  }

  if (filters?.status === "active") {
    rows = rows.filter((row) => row.is_active);
  } else if (filters?.status === "inactive") {
    rows = rows.filter((row) => !row.is_active);
  }

  return rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function fetchFirebaseAdminUserProfiles() {
  const users = await readUsersMap();
  return Object.entries(users).map(([uid, user]) => mapUserToProfile(uid, user));
}

export async function updateFirebaseUserRole(userId: number, role: ProfileDto["role"]) {
  const users = await readUsersMap();
  const match = Object.entries(users).find(([uid]) => hashTextToId(uid) === userId);
  if (!match) throw new Error("Firebase user not found.");
  await fetchJson(`${FIREBASE_DB_URL}/users/${match[0]}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return { success: true, message: "Role updated." };
}

export async function updateFirebaseUserActive(userId: number, isActive: boolean) {
  const users = await readUsersMap();
  const match = Object.entries(users).find(([uid]) => hashTextToId(uid) === userId);
  if (!match) throw new Error("Firebase user not found.");
  await fetchJson(`${FIREBASE_DB_URL}/users/${match[0]}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
  return { success: true, message: "User status updated." };
}

export async function fetchFirebaseCustomerOrders(user?: { firebase_uid?: string; email?: string }) {
  const users = await readUsersMap();
  const orders = await readOrdersMap();
  const currentUid = user?.firebase_uid || activeSession?.uid || "";
  const currentEmail = (user?.email || activeSession?.email || "").toLowerCase();

  return Object.entries(orders)
    .filter(([_, order]) => {
      const orderEmail = (order.customerEmail || "").toLowerCase();
      return Boolean(
        (currentUid && order.customerId === currentUid) ||
          (currentEmail && orderEmail === currentEmail),
      );
    })
    .map(([key, order]) => mapOrderToCustomerRow(key, order, users))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function createFirebaseOrder(
  payload: CreateOrderPayload,
  user?: { firebase_uid?: string; email?: string; full_name?: string },
  submitted?: { id?: number; order_number?: string; firebase_key?: string },
) {
  const users = await readUsersMap();
  let uid = user?.firebase_uid || activeSession?.uid || "";
  let profile = uid ? users[uid] : undefined;

  if (!profile && user?.email) {
    const match = Object.entries(users).find(
      ([_, candidate]) => (candidate.email || "").trim().toLowerCase() === user.email?.trim().toLowerCase(),
    );
    if (match) {
      uid = match[0];
      profile = match[1];
    }
  }

  const newRefPayload = {
    id: submitted?.id || Date.now(),
    orderNumber: submitted?.order_number || buildOrderNumber(),
    customerId: uid || undefined,
    customerEmail: user?.email || profile?.email || activeSession?.email || "",
    customerName: user?.full_name || profile?.name || profile?.full_name || "Customer",
    companyName: profile?.company || profile?.companyName || "",
    priority: payload.priority === "priority" ? "High" : "Standard",
    status: "Pending",
    createdAt: new Date().toISOString(),
    estimatedCompletion: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    sampleType: payload.sample_type,
    compoundName: payload.compound_name,
    quantity: payload.quantity,
    unit: payload.unit,
    sampleCount: payload.sample_count ?? 1,
    notes: payload.notes || "",
  };

  const created = await fetchJson<string>(`${FIREBASE_DB_URL}/orders.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newRefPayload),
  });

  return {
    success: true,
    data: {
      id: newRefPayload.id,
      order_number: newRefPayload.orderNumber,
      success: true,
      firebase_key: (created as unknown as { name?: string })?.name,
    },
  };
}

export async function fetchFirebasePendingOrders() {
  const users = await readUsersMap();
  const orders = await readOrdersMap();
  return Object.entries(orders)
    .filter(([_, order]) => normalizeOrderStatus(order.status) === "pending")
    .map(([key, order]) => mapOrderToPending(key, order, users))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function fetchFirebaseAdminOrderHistory() {
  const users = await readUsersMap();
  const orders = await readOrdersMap();
  return Object.entries(orders)
    .map(([key, order]) => mapOrderToAdminHistory(key, order, users))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

async function findFirebaseOrderEntry(match: { firebase_key?: string; orderNumber?: string; id?: number }) {
  const orders = await readOrdersMap();
  const entry = Object.entries(orders).find(([key, order]) => {
    if (match.firebase_key && key === match.firebase_key) return true;
    if (match.orderNumber && order.orderNumber === match.orderNumber) return true;
    if (typeof match.id === "number") {
      return order.id === match.id || hashTextToId(key) === match.id;
    }
    return false;
  });
  if (!entry) throw new Error("Firebase order not found.");
  return { key: entry[0], order: entry[1] };
}

export async function updateFirebaseOrderStatus(match: { firebase_key?: string; orderNumber?: string; id?: number }, status: string, extra?: Record<string, unknown>) {
  const entry = await findFirebaseOrderEntry(match);
  await fetchJson(`${FIREBASE_DB_URL}/orders/${entry.key}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, updatedAt: new Date().toISOString(), ...extra }),
  });
  return { success: true, message: "Order updated." };
}

export async function fetchFirebaseCalendarData() {
  const users = await readUsersMap();
  const orders = await readOrdersMap();
  const equipmentMap = await readEquipmentMap();
  const queue = Object.entries(orders)
    .filter(([_, order]) => {
      const status = normalizeOrderStatus(order.status);
      return status === "approved" || status === "processing" || status === "completed";
    })
    .map(([key, order]) => mapOrderToQueueEntry(key, order, users))
    .sort((a, b) => (a.scheduled_start || a.estimated_completion || "").localeCompare(b.scheduled_start || b.estimated_completion || ""));

  const equipment = Object.entries(equipmentMap)
    .map(([key, item]) => mapEquipmentRecord(key, item))
    .sort((a, b) => a.name.localeCompare(b.name));

  const utilization = equipment.map((item) => ({
    id: item.id || 0,
    name: item.name,
    equipment_type: item.equipment_type,
    slots: queue
      .filter((entry) => (entry.equipment_name || "") === item.name)
      .map((entry) => ({
        queue_id: entry.queue_id,
        order_id: entry.order_id,
        order_number: entry.order_number,
        scheduled_start: entry.scheduled_start || entry.estimated_completion || "",
        scheduled_end: entry.scheduled_end || entry.estimated_completion || "",
        order_status: entry.order_status,
      })),
  }));

  return {
    queue,
    equipment,
    utilization,
  };
}

export async function fetchFirebaseEquipmentList() {
  const equipmentMap = await readEquipmentMap();
  return Object.entries(equipmentMap)
    .map(([key, item]) => mapEquipmentRecord(key, item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addFirebaseEquipment(payload: EquipmentPayload) {
  return await fetchJson<{ name?: string }>(`${FIREBASE_DB_URL}/equipment.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: Date.now(),
      name: payload.name,
      equipment_type: payload.equipment_type,
      processing_time_per_sample: payload.processing_time_per_sample,
      warmup_time: payload.warmup_time,
      break_interval: payload.break_interval,
      break_duration: payload.break_duration,
      daily_capacity: payload.daily_capacity,
      is_available: payload.is_available,
      last_maintenance: payload.last_maintenance || "",
    }),
  });
}

async function findFirebaseEquipmentEntry(id?: number) {
  if (!id) throw new Error("Equipment id is required.");
  const equipmentMap = await readEquipmentMap();
  const entry = Object.entries(equipmentMap).find(([key, item]) => {
    return item.id === id || hashTextToId(`equipment:${key}`) === id;
  });
  if (!entry) throw new Error("Firebase equipment not found.");
  return { key: entry[0], item: entry[1] };
}

export async function updateFirebaseEquipment(payload: EquipmentPayload) {
  const entry = await findFirebaseEquipmentEntry(payload.id);
  await fetchJson(`${FIREBASE_DB_URL}/equipment/${entry.key}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      equipment_type: payload.equipment_type,
      processing_time_per_sample: payload.processing_time_per_sample,
      warmup_time: payload.warmup_time,
      break_interval: payload.break_interval,
      break_duration: payload.break_duration,
      daily_capacity: payload.daily_capacity,
      is_available: payload.is_available,
      last_maintenance: payload.last_maintenance || "",
    }),
  });
  return { success: true, message: "Equipment updated." };
}

export async function fetchFirebaseReport(request: ReportRequest): Promise<ReportResponse> {
  const orders = Object.values(await readOrdersMap());
  const normalized = orders.map((order) => normalizeOrderStatus(order.status));
  const total = orders.length;
  const completed = normalized.filter((status) => status === "completed").length;
  const processing = normalized.filter((status) => status === "processing").length;
  const pending = normalized.filter((status) => status === "pending").length;

  return {
    summary: `Realtime Firebase ${request.type} report for ${request.option}.`,
    rows: [
      { label: "Total Orders", value: total },
      { label: "Completed", value: completed },
      { label: "Processing", value: processing },
      { label: "Pending", value: pending },
    ],
  };
}