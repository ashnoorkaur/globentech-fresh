import { apiRequest, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import {
    fetchFirebaseAdminUserProfiles,
    fetchFirebaseProfileByEmail,
    fetchFirebaseSessionProfile,
    updateFirebaseProfile,
    updateFirebaseUserActive,
    updateFirebaseUserRole
} from "./firebase-rest";
import { emitLiveDataRefresh } from "./live-data";
import { getWebRoutes } from "./web-routes";

export type ProfileDto = {
  id: number;
  uid?: string;
  full_name: string;
  email: string;
  phone?: string;
  company_name?: string;
  address?: string;
  role: "customer" | "technician" | "administrator";
  is_active?: boolean;
};

export type ProfileUpdatePayload = {
  full_name: string;
  phone?: string;
  company_name?: string;
  address?: string;
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

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");

const stripTags = (value: string) =>
  decodeHtml(value.replace(/<[^>]*>/g, "")).trim();

const extractHiddenInputs = (html: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const match of html.matchAll(/<input[^>]*type=["']hidden["'][^>]*>/gi)) {
    const tag = match[0];
    const name =
      tag.match(/name=["']([^"']*)["']/i)?.[1] ||
      tag.match(/name=([^\s>]+)/i)?.[1];
    const value =
      tag.match(/value=["']([^"']*)["']/i)?.[1] ??
      tag.match(/value=([^\s>]+)/i)?.[1] ??
      "";
    if (name) out[name] = decodeHtml(value);
  }
  return out;
};

const extractInputValue = (html: string, fieldName: string) => {
  const directValue =
    html.match(
      new RegExp(
        `<input[^>]*name=["']${fieldName}["'][^>]*value=["']([^"']*)["'][^>]*>`,
        "i",
      ),
    )?.[1] ||
    html.match(
      new RegExp(
        `<input[^>]*value=["']([^"']*)["'][^>]*name=["']${fieldName}["'][^>]*>`,
        "i",
      ),
    )?.[1] ||
    html.match(
      new RegExp(
        `<textarea[^>]*name=["']${fieldName}["'][^>]*>([\\s\\S]*?)<\\/textarea>`,
        "i",
      ),
    )?.[1];

  return directValue ? decodeHtml(directValue).trim() : "";
};

const extractLabeledValue = (html: string, label: string) => {
  const normalizedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fromValueBlock =
    html.match(
      new RegExp(
        `${normalizedLabel}[\\s\\S]{0,120}?<[^>]*>([^<]+)<\\/[^>]+>`,
        "i",
      ),
    )?.[1] ||
    html.match(
      new RegExp(`${normalizedLabel}\\s*[:\\-]?\\s*([^<\\n\\r]+)`, "i"),
    )?.[1];

  return fromValueBlock ? stripTags(fromValueBlock) : "";
};

const isRolePlaceholderName = (name?: string) =>
  /^(customer|technician|admin(istrator)?|authenticated user)$/i.test(
    (name || "").trim(),
  );

const normalizeProfileRole = (role?: string): ProfileDto["role"] => {
  const value = (role || "").trim().toLowerCase();
  if (value === "administrator" || value === "admin") return "administrator";
  if (value === "technician" || value === "tech") return "technician";
  return "customer";
};

const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const deriveNameFromEmail = (email: string) => {
  const localPart = email.split("@")[0] || "";
  const cleaned = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? titleCase(cleaned) : "";
};

const fetchLegacyProfilePage = async () => {
  const route = getWebRoutes().accountSettings;
  const candidates = getApiBaseUrlCandidates().slice(0, 2); // Only try primary + 1 fallback
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout for GET

      const res = await fetch(`${base}${route}`, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 404) continue;
      if (!res.ok) {
        lastError = new Error(
          `Failed loading account settings (${res.status}).`,
        );
        continue;
      }

      const html = await res.text();
      if (
        /<title>\s*login/i.test(html) ||
        /name=["']password["']/i.test(html)
      ) {
        throw new Error("Active session required to read profile.");
      }

      return html;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Account settings backend route not found.");
};

const parseLegacyProfile = (html: string): ProfileDto => {
  const email =
    extractInputValue(html, "email") ||
    extractLabeledValue(html, "Email") ||
    stripTags(html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "");
  const fullName =
    extractInputValue(html, "full_name") ||
    extractInputValue(html, "name") ||
    extractLabeledValue(html, "Full Name") ||
    extractLabeledValue(html, "Name") ||
    deriveNameFromEmail(email);
  const phone =
    extractInputValue(html, "phone") || extractLabeledValue(html, "Phone");
  const companyName =
    extractInputValue(html, "company_name") ||
    extractInputValue(html, "company") ||
    extractLabeledValue(html, "Company") ||
    extractLabeledValue(html, "Company Name");
  const address =
    extractInputValue(html, "address") || extractLabeledValue(html, "Address");
  const idValue =
    extractInputValue(html, "user_id") ||
    extractInputValue(html, "id") ||
    extractLabeledValue(html, "User ID") ||
    extractLabeledValue(html, "ID");
  const roleValue =
    html.match(
      /<option[^>]*selected[^>]*value=["'](customer|technician|administrator|admin|tech)["'][^>]*>/i,
    )?.[1] ||
    extractInputValue(html, "role") ||
    extractLabeledValue(html, "Role");
  const statusValue =
    extractLabeledValue(html, "Status") || extractLabeledValue(html, "Active");

  const id = Number(String(idValue).match(/\d+/)?.[0] || "0");
  if (!email && !fullName && !id) {
    throw new Error(
      "Legacy account settings page did not contain profile data.",
    );
  }

  return {
    id,
    full_name: fullName,
    email,
    phone,
    company_name: companyName,
    address,
    role: normalizeProfileRole(roleValue),
    is_active: statusValue ? /active|enabled|yes/i.test(statusValue) : true,
  };
};

const fetchLegacyUsersPage = async () => {
  const routes = getWebRoutes();
  const routeCandidates = Array.from(
    new Set([
      routes.adminUsers,
      `${routes.adminDashboard}${routes.adminDashboard.includes("?") ? "&" : "?"}tab=users`,
      "/admin.php?tab=users",
    ]),
  );
  const candidates = getApiBaseUrlCandidates();
  let lastError: Error | null = null;

  for (const base of candidates) {
    for (const route of routeCandidates) {
      try {
        const res = await fetch(`${base}${route}`, {
          method: "GET",
          credentials: "include",
        });

        if (res.status === 404) continue;
        if (!res.ok) {
          lastError = new Error(`Failed loading users page (${res.status}).`);
          continue;
        }

        const html = await res.text();
        if (
          /<title>\s*login/i.test(html) ||
          /name=["']password["']/i.test(html)
        ) {
          throw new Error("Admin session required to read users.");
        }

        const looksLikeUsersPage =
          /tab=users/i.test(html) ||
          /<th[^>]*>\s*email\s*<\/th>/i.test(html) ||
          /<th[^>]*>\s*role\s*<\/th>/i.test(html) ||
          /name=["']change_role["']/i.test(html) ||
          /name=["']user_id["']/i.test(html);

        if (!looksLikeUsersPage) {
          continue;
        }

        return html;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw lastError ?? new Error("Users backend route not found.");
};

const parseLegacyUsers = (html: string): ProfileDto[] => {
  const findSelectedRole = (row: string): ProfileDto["role"] => {
    const selectedOption =
      row.match(
        /<option[^>]*selected[^>]*value=["'](customer|technician|administrator)["'][^>]*>/i,
      )?.[1] ||
      row.match(
        /<option[^>]*value=["'](customer|technician|administrator)["'][^>]*selected[^>]*>/i,
      )?.[1];

    if (
      selectedOption === "customer" ||
      selectedOption === "technician" ||
      selectedOption === "administrator"
    ) {
      return selectedOption;
    }

    const roleSelectBlock =
      row.match(
        /<select[^>]*name=["']role["'][^>]*>([\s\S]*?)<\/select>/i,
      )?.[1] || "";
    if (/value=["']administrator["']/i.test(roleSelectBlock))
      return "administrator";
    if (/value=["']technician["']/i.test(roleSelectBlock)) return "technician";
    return "customer";
  };

  // Primary strategy: rows containing change_role form controls.
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((r) => r[1])
    .filter((row) => /change_role/i.test(row) && /user_id/i.test(row));

  if (rows.length === 0) {
    // Secondary strategy: find users table by headers, with flexible class quotes.
    const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
    const usersTable = tables.find(
      (t) =>
        /<th[^>]*>\s*email\s*<\/th>/i.test(t[0]) &&
        /<th[^>]*>\s*role\s*<\/th>/i.test(t[0]),
    );
    if (!usersTable) return [];

    rows.push(
      ...[...usersTable[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((r) => r[1])
        .filter((row) => /user_id/i.test(row)),
    );

    if (rows.length === 0) {
      rows.push(
        ...[...usersTable[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
          .map((r) => r[1])
          .filter((row) => /@[a-z0-9._-]+\.[a-z]{2,}/i.test(stripTags(row))),
      );
    }
  }

  const out: ProfileDto[] = [];

  for (const row of rows) {
    if (/<th/i.test(row)) continue;

    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (c) => c[1],
    );
    if (cells.length < 2) continue;

    const userId = Number(
      row.match(/name=["']user_id["'][^>]*value=["'](\d+)["']/i)?.[1] ||
        row.match(/value=["'](\d+)["'][^>]*name=["']user_id["']/i)?.[1] ||
        "0",
    );
    const fullName = stripTags(cells[0] || "");
    const email = stripTags(cells[1] || "");
    const company = stripTags(cells[2] || "");
    const role = findSelectedRole(row);
    const statusText = stripTags(
      cells[4] || cells[cells.length - 1] || "",
    ).toLowerCase();

    if (!userId || !email) continue;

    out.push({
      id: userId,
      full_name: fullName || "User",
      email,
      role,
      is_active: statusText.includes("active"),
      phone: "",
      company_name: company,
      address: "",
    });
  }

  return out;
};

const postLegacyRoleChange = async (
  userId: number,
  role: ProfileDto["role"],
) => {
  const route = getWebRoutes().adminUsers;
  const body = new URLSearchParams({
    user_id: String(userId),
    role,
    change_role: "1",
  }).toString();
  const candidates = getApiBaseUrlCandidates();

  for (const base of candidates) {
    const res = await fetch(`${base}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "include",
      body,
    });

    if (res.status === 404) continue;
    if (!res.ok) {
      throw new Error(`Role change failed (${res.status}).`);
    }

    const text = await res.text();
    if (/failed to update role/i.test(text)) {
      throw new Error("Failed to update role.");
    }
    return;
  }

  throw new Error("Role change backend route not found.");
};

export async function fetchMyProfile() {
  const endpoints = getApiEndpoints();

  try {
    return await fetchFirebaseSessionProfile();
  } catch {
    // continue
  }

  try {
    const response = await apiRequest<ProfileDto | SuccessEnvelope<ProfileDto>>(
      endpoints.accountProfile,
    );
    const profile = unwrap(response);
    if (profile?.email || profile?.full_name || profile?.id) {
      const rawName = (profile.full_name || "").trim();
      return {
        ...profile,
        role: normalizeProfileRole(profile.role),
        full_name:
          (!isRolePlaceholderName(rawName) && rawName) ||
          deriveNameFromEmail(profile.email || ""),
      };
    }
  } catch {
    // fall through to legacy profile scraping
  }

  const html = await fetchLegacyProfilePage();
  return parseLegacyProfile(html);
}

const postLegacyProfileUpdate = async (
  payload: ProfileUpdatePayload,
): Promise<void> => {
  const route = getWebRoutes().accountSettings;
  const candidates = getApiBaseUrlCandidates();
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      // GET the settings page first to capture CSRF tokens and any other
      // hidden session-bound fields the PHP form requires.
      let hiddenFields: Record<string, string> = {};
      try {
        const getRes = await fetch(`${base}${route}`, {
          method: "GET",
          credentials: "include",
        });
        if (getRes.ok) {
          const formHtml = await getRes.text();
          if (
            !/<title>\s*login/i.test(formHtml) &&
            !formHtml.toLowerCase().includes("login.php")
          ) {
            hiddenFields = extractHiddenInputs(formHtml);
          }
        }
      } catch {
        // Non-fatal: continue without hidden fields.
      }

      const body = new URLSearchParams({
        ...hiddenFields,
        update_profile: "1",
        full_name: payload.full_name || "",
        phone: payload.phone || "",
        company_name: payload.company_name || "",
        address: payload.address || "",
      }).toString();

      const res = await fetch(`${base}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body,
      });

      if (res.status === 404) continue;

      if (!res.ok) {
        lastError = new Error(`Profile update failed (${res.status}).`);
        continue;
      }

      const text = await res.text();

      // If redirected back to login, session expired.
      if (
        /<title>\s*login/i.test(text) ||
        res.url.toLowerCase().includes("login.php")
      ) {
        throw new Error("Session expired. Please log in again.");
      }

      // Look for explicit failure messages from PHP.
      const phpError = text.match(
        /failed to update|could not update|error updating|unauthorized/i,
      )?.[0];
      if (phpError) {
        throw new Error(phpError);
      }

      // Any 200 response that doesn't contain an error is treated as success.
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        /session expired|unauthorized/i.test(error.message)
      ) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Profile update backend route not found.");
};

export async function updateMyProfile(payload: ProfileUpdatePayload) {
  const endpoints = getApiEndpoints();

  try {
    const result = await updateFirebaseProfile(payload);
    emitLiveDataRefresh();
    return result;
  } catch {
    // If the Firebase session is missing but we can still resolve the current
    // profile via backend session cookies, restore the Firebase session by
    // email and retry there before falling back to PHP endpoints.
    try {
      const profile = await fetchMyProfile();
      if (profile.email) {
        await fetchFirebaseProfileByEmail(profile.email);
        const result = await updateFirebaseProfile(payload);
        emitLiveDataRefresh();
        return result;
      }
    } catch {
      // Continue to API/PHP fallback.
    }
  }

  try {
    const result = await apiRequest<{ success?: boolean; message?: string }>(
      endpoints.accountUpdateProfile,
      {
        method: "POST",
        body: {
          update_profile: true,
          ...payload,
        },
      },
    );
    emitLiveDataRefresh();
    return result;
  } catch {
    // The JSON API endpoint may not be wired up on all backend deployments.
    // Always fall back to the legacy PHP form POST which uses the standard
    // session cookie and works on any deployment.
    await postLegacyProfileUpdate(payload);
    emitLiveDataRefresh();
    return { success: true, message: "Profile updated." };
  }
}

const postLegacyPasswordChange = async (
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> => {
  const route = getWebRoutes().accountSettings;
  const body = new URLSearchParams({
    change_password: "1",
    current_password: currentPassword,
    new_password: newPassword,
    confirm_password: confirmPassword,
  }).toString();

  const candidates = getApiBaseUrlCandidates();
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body,
      });

      if (res.status === 404) continue;
      if (!res.ok) {
        lastError = new Error(`Password change failed (${res.status}).`);
        continue;
      }

      const text = await res.text();
      if (
        /<title>\s*login/i.test(text) ||
        res.url.toLowerCase().includes("login.php")
      ) {
        throw new Error("Session expired. Please log in again.");
      }

      const phpError = text.match(
        /incorrect.*password|current password.*wrong|failed to update|could not change|unauthorized/i,
      )?.[0];
      if (phpError) throw new Error(phpError);

      return;
    } catch (error) {
      if (
        error instanceof Error &&
        /session expired|unauthorized|incorrect|wrong/i.test(error.message)
      ) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Password change backend route not found.");
};

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
) {
  const endpoints = getApiEndpoints();

  try {
    return await apiRequest<{ success?: boolean; message?: string }>(
      endpoints.accountChangePassword,
      {
        method: "POST",
        body: {
          change_password: true,
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        },
      },
    );
  } catch (apiError) {
    if (
      apiError instanceof Error &&
      /unauthorized|403|401/i.test(apiError.message)
    ) {
      await postLegacyPasswordChange(
        currentPassword,
        newPassword,
        confirmPassword,
      );
      return { success: true, message: "Password changed." };
    }
    throw apiError;
  }
}

export async function deactivateSelfAccount() {
  const endpoints = getApiEndpoints();
  const response = await apiRequest<{ success?: boolean; message?: string }>(
    endpoints.accountDeactivateSelf,
    {
      method: "POST",
      body: {
        deactivate_self: true,
      },
    },
  );
  emitLiveDataRefresh();
  return response;
}

export async function fetchAdminUserList() {
  const endpoints = getApiEndpoints();

  try {
    return await fetchFirebaseAdminUserProfiles();
  } catch {
    // continue
  }

  const loadFromLegacy = async () => {
    const html = await fetchLegacyUsersPage();
    return parseLegacyUsers(html);
  };

  try {
    const response = await apiRequest<
      ProfileDto[] | SuccessEnvelope<ProfileDto[]>
    >(endpoints.accountAdminUsers);
    const payload = unwrap(response);
    if (Array.isArray(payload) && payload.length > 0) {
      return payload;
    }

    // Legacy backend often responds with empty/non-array payload for missing API files.
    const legacyRows = await loadFromLegacy();
    if (legacyRows.length > 0) {
      return legacyRows;
    }

    return Array.isArray(payload) ? payload : [];
  } catch {
    return loadFromLegacy();
  }
}

export async function adminChangeRole(
  userId: number,
  role: ProfileDto["role"],
) {
  const endpoints = getApiEndpoints();
  try {
    const response = await updateFirebaseUserRole(userId, role);
    emitLiveDataRefresh();
    return response;
  } catch {
    // continue
  }
  try {
    const response = await apiRequest<{ success?: boolean; message?: string }>(
      endpoints.accountAdminChangeRole,
      {
        method: "POST",
        body: {
          change_role: true,
          user_id: userId,
          role,
        },
      },
    );
    emitLiveDataRefresh();
    return response;
  } catch {
    await postLegacyRoleChange(userId, role);
    emitLiveDataRefresh();
    return { success: true, message: "Role updated via legacy backend." };
  }
}

export async function adminDeactivateUser(userId: number) {
  const endpoints = getApiEndpoints();
  try {
    const response = await updateFirebaseUserActive(userId, false);
    emitLiveDataRefresh();
    return response;
  } catch {
    // continue
  }
  const response = await apiRequest<{ success?: boolean; message?: string }>(
    endpoints.accountAdminDeactivateUser,
    {
      method: "POST",
      body: {
        deactivate_user: true,
        user_id: userId,
      },
    },
  );
  emitLiveDataRefresh();
  return response;
}

export async function adminActivateUser(userId: number) {
  const endpoints = getApiEndpoints();
  try {
    const response = await updateFirebaseUserActive(userId, true);
    emitLiveDataRefresh();
    return response;
  } catch {
    // continue
  }
  const response = await apiRequest<{ success?: boolean; message?: string }>(
    endpoints.accountAdminActivateUser,
    {
      method: "POST",
      body: {
        activate_user: true,
        user_id: userId,
      },
    },
  );
  emitLiveDataRefresh();
  return response;
}
