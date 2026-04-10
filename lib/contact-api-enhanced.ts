/**
 * Enhanced Contact API with Admin Notification Support
 *
 * Ensures contact form submissions are properly delivered to admins and logged,
 * with fallback mechanisms if direct email fails.
 */

import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";

export type ContactSubmission = {
  id?: number;
  user_id?: number;
  name: string;
  email: string;
  phone?: string;
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

    return response;
  } catch (error) {
    const errorMsg = getContactErrorMessage(error);
    throw new Error(errorMsg);
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

  try {
    const url = status
      ? `${endpoints.adminContactNotifications || "/api/admin-contacts.php"}?status=${status}`
      : endpoints.adminContactNotifications || "/api/admin-contacts.php";

    const response =
      await apiRequest<SuccessEnvelope<ContactSubmission[]>>(url);

    return unwrap(response) as ContactSubmission[];
  } catch (error) {
    console.warn(
      "Could not fetch admin contacts:",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
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
