import { apiRequest } from "./api-client";

type PhpEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

const envelopeError = (payload: PhpEnvelope<unknown>) =>
  payload.error || payload.message || "Backend request failed.";

export async function phpGet<T>(path: string, options?: { noCache?: boolean; timeoutMs?: number }): Promise<T> {
  const response = await apiRequest<PhpEnvelope<T>>(path, {
    noCache: options?.noCache,
    timeoutMs: options?.timeoutMs,
  });

  if (!response?.success) {
    throw new Error(envelopeError(response));
  }

  return (response.data as T) ?? ({} as T);
}

export async function phpPost<T>(path: string, body: unknown): Promise<T> {
  const response = await apiRequest<PhpEnvelope<T>>(path, {
    method: "POST",
    body,
  });

  if (!response?.success) {
    throw new Error(envelopeError(response));
  }

  return (response.data as T) ?? ({} as T);
}
