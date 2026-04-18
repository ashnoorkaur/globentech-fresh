/**
 * Enhanced Contact API with Admin Notification Support
 *
 * Ensures contact form submissions are properly delivered to admins and logged,
 * with fallback mechanisms if direct email fails.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { getWebRoutes } from "./web-routes";

export type ContactSubmission = {
  id?: number;
  user_id?: number;
  name: string;
  email: string;
  phone?: string;
  order_number?: string;
  subject: string;
  message: string;
  category?: "technical" | "billing" | "general" | "order";
  priority?: "low" | "medium" | "high";
  created_at?: string;
};

type SuccessEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

const CONTACT_QUERY_STORAGE_KEY = "globentech-mobile:admin-queries:v1";
let adminContactsEndpointMissing = false;

const normalizeQueryText = (value?: string | null) => (value || "").replace(/\s+/g, " ").trim();

const toStoredQueryKey = (submission: ContactSubmission) =>
  [
    normalizeQueryText(submission.name).toLowerCase(),
    normalizeQueryText(submission.email).toLowerCase(),
    normalizeQueryText(submission.order_number).toUpperCase(),
    normalizeQueryText(submission.subject).toLowerCase(),
    normalizeQueryText(submission.message).toLowerCase(),
  ].join("|");

const readStoredQueries = async (): Promise<ContactSubmission[]> => {
  try {
    const raw = await AsyncStorage.getItem(CONTACT_QUERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ContactSubmission[]) : [];
  } catch {
    return [];
  }
};

const writeStoredQueries = async (items: ContactSubmission[]) => {
  try {
    await AsyncStorage.setItem(CONTACT_QUERY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage failures.
  }
};

export const rememberAdminContactQuery = async (submission: ContactSubmission) => {
  const existing = await readStoredQueries();
  const key = toStoredQueryKey(submission);
  const nextItems = [
    {
      ...submission,
      name: normalizeQueryText(submission.name),
      email: normalizeQueryText(submission.email),
      order_number: normalizeQueryText(submission.order_number) || undefined,
      subject: normalizeQueryText(submission.subject),
      message: normalizeQueryText(submission.message),
      created_at: submission.created_at || new Date().toISOString(),
    },
    ...existing.filter((item) => toStoredQueryKey(item) !== key),
  ].slice(0, 100);

  await writeStoredQueries(nextItems);
};

const unwrap = <T>(payload: T | SuccessEnvelope<T>): T => {
  const maybe = payload as SuccessEnvelope<T>;
  if (typeof maybe === "object" && maybe !== null && "data" in maybe) {
    if (maybe.data !== undefined) {
      return maybe.data;
    }
  }
  return payload as T;
};

/**
 * Get contact error message with actionable guidance
 */
function getContactErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes("timed out")) {
      return "Form submission timed out. Your message may not have reached admins. Please try again or call support directly.";
    }

    if (msg.includes("unauthorized") || msg.includes("401")) {
      return "Session expired. Please ensure you're logged in and try again.";
    }

    if (msg.includes("500")) {
      return "Backend error processing your message. Our support team has been notified.";
    }

    return error.message;
  }

  return "Failed to send message. Please try again or contact support directly.";
}

/**
 * Send a contact/support message with admin notification
 *
 * This function:
 * 1. Submits the form to the backend
 * 2. Creates a database record for tracking
 * 3. Triggers admin notification (email/in-app alert)
 * 4. Provides fallback logging if notification fails
 */
const submitLegacyContactForm = async (
  submission: ContactSubmission,
): Promise<SuccessEnvelope<{ id?: number; ticket_number?: string }>> => {
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
          order_number: submission.order_number || "",
          subject: submission.subject,
          message: submission.message,
        }).toString(),
      });

      const text = await response.text();
      if (!response.ok) {
        lastError = new Error(`Contact form failed with status ${response.status}`);
        continue;
      }

      if (/email address\s+password\s+login|<title>\s*login/i.test(text)) {
        throw new Error("Session expired. Please ensure you're logged in and try again.");
      }

      if (/required field|failed to send|unable to send/i.test(text)) {
        throw new Error("The shared website backend could not send your message.");
      }

      await rememberAdminContactQuery({
        ...submission,
        created_at: new Date().toISOString(),
      });

      return {
        success: true,
        data: {
          ticket_number: `WEB-${Date.now()}`,
        },
        message: "Message sent successfully.",
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Failed to submit contact form.");
};

export async function submitContactForm(
  submission: ContactSubmission,
): Promise<SuccessEnvelope<{ id?: number; ticket_number?: string }>> {
  const endpoints = getApiEndpoints();

  try {
    // Submit contact form and trigger admin notification
    const response = await apiRequest<
      SuccessEnvelope<{ id?: number; ticket_number?: string }>
    >(endpoints.contactSend || "/api/contact-submit.php", {
      method: "POST",
      body: {
        ...submission,
        timestamp: new Date().toISOString(),
      },
      timeoutMs: 8000,
    });

    if (!response.success) {
      throw new Error(response.message || "Failed to submit contact form.");
    }

    await rememberAdminContactQuery({
      ...submission,
      created_at: new Date().toISOString(),
    });

    return response;
  } catch (error) {
    try {
      return await submitLegacyContactForm(submission);
    } catch {
      const errorMsg = getContactErrorMessage(error);
      throw new Error(errorMsg);
    }
  }
}

/**
 * Send admin notification about a submitted order or event
 * Used internally to notify admins when customers take actions
 */
export async function notifyAdminOfEvent(payload: {
  event_type:
    | "order_created"
    | "order_updated"
    | "account_action"
    | "support_request";
  title: string;
  description: string;
  user_id?: number;
  related_id?: number;
  priority?: "low" | "medium" | "high";
}): Promise<SuccessEnvelope<{ success?: boolean }>> {
  const endpoints = getApiEndpoints();

  try {
    return await apiRequest<SuccessEnvelope<{ success?: boolean }>>(
      endpoints.contactNotificationCreate || "/api/admin-notify.php",
      {
        method: "POST",
        body: payload,
        timeoutMs: 5000,
      },
    );
  } catch (error) {
    // Notification failure is non-critical - don't throw
    console.warn(
      "Admin notification failed:",
      error instanceof Error ? error.message : String(error),
    );
    return { success: false, message: "Notification delivery failed" };
  }
}

/**
 * Retrieve contact messages (admin view)
 */
export async function fetchAdminContacts(
  status?: "new" | "responded" | "closed",
) {
  const endpoints = getApiEndpoints();

  if (adminContactsEndpointMissing) {
    return [];
  }

  try {
    const url = status
      ? `${endpoints.adminContactNotifications || "/api/admin-contacts.php"}?status=${status}`
      : endpoints.adminContactNotifications || "/api/admin-contacts.php";

    const response =
      await apiRequest<SuccessEnvelope<ContactSubmission[]>>(url);

    return unwrap(response) as ContactSubmission[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /404|not found|admin-contact-notifications\.php|admin-contacts\.php/i.test(message)
    ) {
      adminContactsEndpointMissing = true;
      return [];
    }

    console.warn("Could not fetch admin contacts:", message);
    return [];
  }
}

export async function fetchAdminQueries() {
  const [stored, remote] = await Promise.all([
    readStoredQueries(),
    fetchAdminContacts().catch(() => []),
  ]);

  const merged = new Map<string, ContactSubmission>();
  [...remote, ...stored].forEach((item) => {
    const normalized: ContactSubmission = {
      ...item,
      name: normalizeQueryText(item.name),
      email: normalizeQueryText(item.email),
      order_number: normalizeQueryText(item.order_number) || undefined,
      subject: normalizeQueryText(item.subject),
      message: normalizeQueryText(item.message),
      created_at: item.created_at || new Date().toISOString(),
    };
    merged.set(toStoredQueryKey(normalized), normalized);
  });

  return Array.from(merged.values()).sort((a, b) => {
    const at = new Date(a.created_at || 0).getTime();
    const bt = new Date(b.created_at || 0).getTime();
    return bt - at;
  });
}

/**
 * Send a response to a contact/support message
 */
export async function respondToContact(
  contactId: number,
  response: string,
): Promise<SuccessEnvelope<{ success?: boolean }>> {
  return await apiRequest<SuccessEnvelope<{ success?: boolean }>>(
    "/api/admin-respond-contact.php",
    {
      method: "POST",
      body: {
        contact_id: contactId,
        response,
      },
      timeoutMs: 5000,
    },
  );
}
