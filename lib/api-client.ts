import Constants from "expo-constants";
import { Platform } from "react-native";

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: RequestMethod;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

type ApiErrorPayload = {
  message?: string;
};

const DEFAULT_TIMEOUT_MS = 12000;

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");

const LOCALHOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

const extractExpoHostIp = () => {
  const hostCandidates = [
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri,
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      ?.expoGoConfig?.debuggerHost,
  ];

  for (const candidate of hostCandidates) {
    if (!candidate) continue;
    const host = candidate.split(":")[0];
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      return host;
    }
  }

  return null;
};

const resolveRuntimeBaseUrl = (baseUrl: string) => {
  if (!LOCALHOST_REGEX.test(baseUrl)) {
    return baseUrl;
  }

  if (Platform.OS === "android") {
    return baseUrl.replace(/\/\/(localhost|127\.0\.0\.1)/i, "//10.0.2.2");
  }

  const expoHostIp = extractExpoHostIp();
  if (expoHostIp) {
    return baseUrl.replace(/\/\/(localhost|127\.0\.0\.1)/i, `//${expoHostIp}`);
  }

  return baseUrl;
};

const fromExpoExtra = () => {
  const extra = Constants.expoConfig?.extra as
    | { apiBaseUrl?: string }
    | undefined;
  return extra?.apiBaseUrl;
};

export const getApiBaseUrl = () => {
  const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const configBaseUrl = fromExpoExtra();

  const baseUrl =
    envBaseUrl || configBaseUrl || "http://localhost/Capstone-project";
  return normalizeBaseUrl(resolveRuntimeBaseUrl(baseUrl));
};

const makeUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
};

export const getApiBaseUrlCandidates = () => {
  const primary = getApiBaseUrl();
  const out = new Set<string>([primary]);

  try {
    const parsed = new URL(primary);
    const origin = parsed.origin;
    const cleanPath = parsed.pathname.replace(/\/+$/, "");

    if (cleanPath && cleanPath !== "/") {
      const segments = cleanPath.split("/").filter(Boolean);
      if (segments.length > 1) {
        const parent = `/${segments.slice(0, -1).join("/")}`;
        out.add(`${origin}${parent}`);
      }
      // When a project subpath is configured (e.g. /Capstone-project), do not
      // auto-fallback to bare origin because it can hit an unrelated site.
      return Array.from(out);
    }

    out.add(origin);
  } catch {
    // Keep primary only if URL parsing fails.
  }

  return Array.from(out);
};

const makeUrlWithBase = (baseUrl: string, path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

const safeParseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;

  // Some PHP responses may include a UTF-8 BOM or incidental output before JSON.
  const cleaned = text.replace(/^\uFEFF+/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.search(/[\[{]/);
    const lastCurly = cleaned.lastIndexOf("}");
    const lastSquare = cleaned.lastIndexOf("]");
    const lastBrace = Math.max(lastCurly, lastSquare);

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonSlice);
      } catch {
        // fall through to raw text
      }
    }

    return text;
  }
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const candidates = getApiBaseUrlCandidates();
  let lastError: Error | null = null;

  for (const base of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(makeUrlWithBase(base, path), {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
        credentials: "include",
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const data = await safeParseJson(response);

      if (!response.ok) {
        if (response.status === 404) {
          lastError = new Error(`Request failed with 404 at ${base}${path}`);
          continue;
        }

        const payload = data as ApiErrorPayload | null;
        throw new Error(
          payload?.message || `Request failed with ${response.status}`,
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timed out. Check backend connectivity.");
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ?? new Error("Request failed. No backend candidates responded.")
  );
}
