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
};

export function useFocusedPolling(
  callback: () => void | Promise<void>,
  {
    intervalMs,
    runOnMount = true,
    runOnFocus = true,
    enabled = true,
    minGapMs = 1000,
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
    const unsubscribe = subscribeLiveData(() => {
      requestInvoke();
    });

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        requestInvoke();
      }
    });

    return () => {
      unsubscribe();
      subscription.remove();
      if (scheduledInvokeRef.current) {
        clearTimeout(scheduledInvokeRef.current);
        scheduledInvokeRef.current = null;
      }
    };
  }, [requestInvoke]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      isFocusedRef.current = true;

      if (runOnFocus) {
        requestInvoke(true);
      }

      const timer = setInterval(() => {
        requestInvoke(true);
      }, intervalMs);

      return () => {
        isFocusedRef.current = false;
        clearInterval(timer);
      };
    }, [enabled, intervalMs, requestInvoke, runOnFocus]),
  );
}
