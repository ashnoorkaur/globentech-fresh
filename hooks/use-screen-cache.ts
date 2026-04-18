import { useEffect, useState } from "react";

const screenCache = new Map<string, unknown>();

export function clearScreenCache(prefix?: string) {
  if (!prefix) {
    screenCache.clear();
    return;
  }

  for (const key of Array.from(screenCache.keys())) {
    if (key.startsWith(prefix)) {
      screenCache.delete(key);
    }
  }
}

export function hasCachedScreenState(key: string) {
  return screenCache.has(key);
}

export function useCachedScreenState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (screenCache.has(key)) {
      return screenCache.get(key) as T;
    }

    return initialValue;
  });

  useEffect(() => {
    screenCache.set(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}