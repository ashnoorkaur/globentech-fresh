import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

type FocusedPollingOptions = {
  intervalMs: number;
  runOnMount?: boolean;
  runOnFocus?: boolean;
  enabled?: boolean;
};

export function useFocusedPolling(
  callback: () => void | Promise<void>,
  {
    intervalMs,
    runOnMount = true,
    runOnFocus = true,
    enabled = true,
  }: FocusedPollingOptions,
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const invoke = useCallback(() => {
    void callbackRef.current();
  }, []);

  useEffect(() => {
    if (!enabled || !runOnMount) return;
    invoke();
  }, [enabled, invoke, runOnMount]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      if (runOnFocus) {
        invoke();
      }

      const timer = setInterval(invoke, intervalMs);
      return () => clearInterval(timer);
    }, [enabled, intervalMs, invoke, runOnFocus]),
  );
}
