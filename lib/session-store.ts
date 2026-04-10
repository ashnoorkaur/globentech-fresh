import { useSyncExternalStore } from "react";
import { fetchSessionUser, type AuthUser } from "./auth-api";

type SessionState = {
  user: AuthUser | null;
  loading: boolean;
};

let state: SessionState = {
  user: null,
  loading: false,
};

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

const normalizeUser = (user: AuthUser | null): AuthUser | null => {
  if (!user) return null;
  return {
    ...user,
    role: normalizeSessionRole(user.role as unknown as string),
  };
};

export async function hydrateSession() {
  state = { ...state, loading: true };
  emit();

  try {
    const user = await fetchSessionUser();
    state = { user: normalizeUser(user), loading: false };
  } catch {
    state = { user: null, loading: false };
  }

  emit();
}

export function setSessionUser(user: AuthUser | null) {
  state = { user: normalizeUser(user), loading: false };
  emit();
}

export function useSessionState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
