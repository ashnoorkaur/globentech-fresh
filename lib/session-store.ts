import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { fetchSessionUser, type AuthUser } from "./auth-api";
import { clearFirebaseSession, setFirebaseSession } from "./firebase-rest";

const SESSION_STORAGE_KEY = "globentech-mobile:session-user";

type SessionState = {
  user: AuthUser | null;
  loading: boolean;
};

let state: SessionState = {
  user: null,
  loading: true,
};

let hydratePromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((fn) => fn());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => state;

const normalizeSessionRole = (role?: string): AuthUser["role"] => {
  const value = (role || "").toLowerCase();
  if (value === "administrator" || value === "admin") return "administrator";
  if (value === "technician" || value === "tech") return "technician";
  return "customer";
};

const isGenericSessionName = (value?: string) => {
  const normalized = (value || "").trim().toLowerCase();
  return (
    normalized === "session" ||
    normalized === "authenticated user" ||
    normalized === "user" ||
    normalized === "customer" ||
    normalized === "technician" ||
    normalized === "admin" ||
    normalized === "administrator" ||
    normalized === "guest"
  );
};

const normalizeUser = (user: AuthUser | null): AuthUser | null => {
  if (!user) return null;
  return {
    ...user,
    role: normalizeSessionRole(user.role as unknown as string),
    email: user.email === "session@local" ? "" : user.email,
    full_name: isGenericSessionName(user.full_name) ? "" : user.full_name,
  };
};

const sameIdentity = (left: AuthUser | null, right: AuthUser | null) => {
  if (!left || !right) return false;

  const leftUid = (left.firebase_uid || "").trim();
  const rightUid = (right.firebase_uid || "").trim();
  if (leftUid && rightUid && leftUid === rightUid) return true;

  const leftEmail = (left.email || "").trim().toLowerCase();
  const rightEmail = (right.email || "").trim().toLowerCase();
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true;

  return Boolean(left.id > 0 && right.id > 0 && left.id === right.id);
};

const mergeWithCurrentUser = (
  incoming: AuthUser | null,
  current: AuthUser | null,
): AuthUser | null => {
  if (!incoming) return null;
  if (!current || !sameIdentity(incoming, current)) {
    return incoming;
  }

  const currentRole = normalizeSessionRole(current.role as unknown as string);
  const incomingRole = normalizeSessionRole(incoming.role as unknown as string);
  const preserveRole = currentRole !== "customer" && incomingRole === "customer";
  const incomingName = (incoming.full_name || "").trim();
  const incomingEmail = (incoming.email || "").trim();

  return {
    ...incoming,
    firebase_uid: incoming.firebase_uid || current.firebase_uid,
    email:
      incomingEmail && incomingEmail !== "session@local"
        ? incoming.email
        : current.email,
    full_name:
      incomingName && !isGenericSessionName(incomingName)
        ? incoming.full_name
        : current.full_name,
    role: preserveRole ? currentRole : incomingRole,
  };
};

const syncFirebaseSession = (user: AuthUser | null) => {
  if (user?.firebase_uid) {
    setFirebaseSession({ uid: user.firebase_uid, email: user.email });
    return;
  }
  clearFirebaseSession();
};

const persistSessionUser = async (user: AuthUser | null) => {
  if (!user) {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
};

const applySessionUser = (user: AuthUser | null, loading: boolean) => {
  const normalized = normalizeUser(mergeWithCurrentUser(user, state.user));
  syncFirebaseSession(normalized);
  state = { user: normalized, loading };
  emit();
};

export async function hydrateSession() {
  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    state = { ...state, loading: true };
    emit();

    try {
      const persistedRaw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (persistedRaw) {
        const persistedUser = normalizeUser(JSON.parse(persistedRaw) as AuthUser);
        applySessionUser(persistedUser, true);
      }

      const user = mergeWithCurrentUser(await fetchSessionUser(), state.user);
      applySessionUser(user, false);
      await persistSessionUser(normalizeUser(user));
      return;
    } catch {
      if (state.user) {
        state = { ...state, loading: false };
        emit();
        return;
      }

      applySessionUser(null, false);
      await persistSessionUser(null);
    }
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export function setSessionUser(user: AuthUser | null) {
  const merged = mergeWithCurrentUser(user, state.user);
  applySessionUser(merged, false);
  void persistSessionUser(normalizeUser(merged));
}

export function getSessionUser() {
  return state.user;
}

export function useSessionState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
