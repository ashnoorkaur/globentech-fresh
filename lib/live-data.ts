import { onValue, ref, type Unsubscribe } from "firebase/database";
import { db } from "../firebase/config";
import { clearApiCache } from "./api-client";

type LiveDataListener = () => void;

const listeners = new Set<LiveDataListener>();
let firebaseBridgeStarted = false;
let firebaseBridgeStops: Unsubscribe[] = [];

const createFirebaseBridgeListener = (path: string) => {
  let primed = false;
  return onValue(ref(db, path), () => {
    if (!primed) {
      primed = true;
      return;
    }
    emitLiveDataRefresh();
  });
};

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
  if (firebaseBridgeStarted) return;
  firebaseBridgeStarted = true;
  firebaseBridgeStops = [
    createFirebaseBridgeListener("orders"),
    createFirebaseBridgeListener("users"),
    createFirebaseBridgeListener("equipment"),
  ];
}

export function stopFirebaseLiveBridge() {
  for (const stop of firebaseBridgeStops) {
    stop();
  }
  firebaseBridgeStops = [];
  firebaseBridgeStarted = false;
}