import { apiRequest } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";

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

export async function sendContactMessage(payload: ContactPayload) {
  const endpoints = getApiEndpoints();
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
}
