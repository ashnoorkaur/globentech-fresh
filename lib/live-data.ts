import { clearApiCache } from "./api-client";

type LiveDataListener = () => void;

const listeners = new Set<LiveDataListener>();

export function subscribeLiveData(listener: LiveDataListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function emitLiveDataRefresh() {
  clearApiCache();

  for (const listener of listeners) {
    listener();
  }
}

export function ensureFirebaseLiveBridge() {
  // Firebase has been disabled for this app. The PHP backend is now the
  // single source of truth, so no realtime Firebase listeners are started.
}

export function stopFirebaseLiveBridge() {
  // No-op in PHP backend mode.
}