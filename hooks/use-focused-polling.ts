import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { subscribeLiveData } from "../lib/live-data";

type FocusedPollingOptions = {
  intervalMs: number;
  runOnMount?: boolean;
  runOnFocus?: boolean;
  enabled?: boolean;
  minGapMs?: number;
  /** When false, do not reload on global `emitLiveDataRefresh` (reduces flicker on heavy list screens). */
  subscribeToLiveData?: boolean;
  /** When false, no `setInterval` while focused — only the initial focus/mount loads run. */
  pollWhileFocused?: boolean;
  /** When false, ignore AppState "active" (avoids surprise refetch when switching apps). */
  reloadOnAppActive?: boolean;
};

export function useFocusedPolling(
  callback: () => void | Promise<void>,
  {
    intervalMs,
    runOnMount = true,
    runOnFocus = true,
    enabled = true,
    minGapMs = 1000,
    subscribeToLiveData = true,
    pollWhileFocused = true,
    reloadOnAppActive = true,
  }: FocusedPollingOptions,
) {
  const callbackRef = useRef(callback);
  const isFocusedRef = useRef(false);
  const lastInvokedAtRef = useRef(0);
  const scheduledInvokeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const invoke = useCallback(() => {
    lastInvokedAtRef.current = Date.now();
    void callbackRef.current();
  }, []);

  const requestInvoke = useCallback(
    (allowWhileUnfocused = false) => {
      if (!enabled) return;
      if (!allowWhileUnfocused && !isFocusedRef.current) return;

      const now = Date.now();
      const elapsed = now - lastInvokedAtRef.current;

      if (elapsed >= minGapMs) {
        if (scheduledInvokeRef.current) {
          clearTimeout(scheduledInvokeRef.current);
          scheduledInvokeRef.current = null;
        }
        invoke();
        return;
      }

      if (scheduledInvokeRef.current) {
        clearTimeout(scheduledInvokeRef.current);
      }

      scheduledInvokeRef.current = setTimeout(() => {
        scheduledInvokeRef.current = null;
        if (!enabled) return;
        if (!allowWhileUnfocused && !isFocusedRef.current) return;
        invoke();
      }, minGapMs - elapsed);
    },
    [enabled, invoke, minGapMs],
  );

  useEffect(() => {
    if (!enabled || !runOnMount) return;
    requestInvoke(true);
  }, [enabled, requestInvoke, runOnMount]);

  useEffect(() => {
    const unsubscribe = subscribeToLiveData
      ? subscribeLiveData(() => {
          requestInvoke();
        })
      : () => {};

    const subscription = reloadOnAppActive
      ? AppState.addEventListener("change", (nextState) => {
          if (nextState === "active") {
            requestInvoke();
          }
        })
      : null;

    return () => {
      unsubscribe();
      subscription?.remove();
      if (scheduledInvokeRef.current) {
        clearTimeout(scheduledInvokeRef.current);
        scheduledInvokeRef.current = null;
      }
    };
  }, [requestInvoke, subscribeToLiveData, reloadOnAppActive]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      isFocusedRef.current = true;

      if (runOnFocus) {
        requestInvoke(true);
      }

      const timer =
        pollWhileFocused && intervalMs > 0
          ? setInterval(() => {
              requestInvoke(true);
            }, intervalMs)
          : null;

      return () => {
        isFocusedRef.current = false;
        if (timer) {
          clearInterval(timer);
        }
      };
    }, [enabled, intervalMs, requestInvoke, runOnFocus, pollWhileFocused]),
  );
}
