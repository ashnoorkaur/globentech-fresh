import { apiRequest, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { getWebRoutes } from "./web-routes";

type ContactPayload = {
  order_number?: string;
  subject: string;
  message: string;
};

type ContactResponse = {
  success?: boolean;
  message?: string;
  error?: string;
};

const submitLegacyContactMessage = async (payload: ContactPayload) => {
  const route = getWebRoutes().contact;
  const candidates = getApiBaseUrlCandidates().slice(0, 2);
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${route}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          order_number: payload.order_number || "",
          subject: payload.subject,
          message: payload.message,
        }).toString(),
      });

      const text = await response.text();
      if (!response.ok) {
        lastError = new Error(`Contact form failed with status ${response.status}`);
        continue;
      }

      if (/email address\s+password\s+login|<title>\s*login/i.test(text)) {
        throw new Error("Session expired. Please log in again.");
      }

      if (/required field|failed to send|unable to send/i.test(text)) {
        throw new Error("The shared website backend could not send your message.");
      }

      return {
        success: true,
        message: "Message sent successfully.",
      } satisfies ContactResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Failed to send message.");
};

export async function sendContactMessage(payload: ContactPayload) {
  const endpoints = getApiEndpoints();

  try {
    const response = await apiRequest<ContactResponse>(endpoints.contactSend, {
      method: "POST",
      body: payload,
    });

    if (response?.success === false) {
      throw new Error(
        response.error || response.message || "Failed to send message.",
      );
    }

    return response;
  } catch {
    return submitLegacyContactMessage(payload);
  }
}
