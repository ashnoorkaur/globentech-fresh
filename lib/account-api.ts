import { apiRequest, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { getWebRoutes } from "./web-routes";

export type ProfileDto = {
  id: number;
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
  const response = await apiRequest<ProfileDto | SuccessEnvelope<ProfileDto>>(
    endpoints.accountProfile,
  );
  return unwrap(response);
}

export async function updateMyProfile(payload: ProfileUpdatePayload) {
  const endpoints = getApiEndpoints();
  return apiRequest<{ success?: boolean; message?: string }>(
    endpoints.accountUpdateProfile,
    {
      method: "POST",
      body: {
        update_profile: true,
        ...payload,
      },
    },
  );
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
) {
  const endpoints = getApiEndpoints();
  return apiRequest<{ success?: boolean; message?: string }>(
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
}

export async function deactivateSelfAccount() {
  const endpoints = getApiEndpoints();
  return apiRequest<{ success?: boolean; message?: string }>(
    endpoints.accountDeactivateSelf,
    {
      method: "POST",
      body: {
        deactivate_self: true,
      },
    },
  );
}

export async function fetchAdminUserList() {
  const endpoints = getApiEndpoints();

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
    return await apiRequest<{ success?: boolean; message?: string }>(
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
  } catch {
    await postLegacyRoleChange(userId, role);
    return { success: true, message: "Role updated via legacy backend." };
  }
}

export async function adminDeactivateUser(userId: number) {
  const endpoints = getApiEndpoints();
  return apiRequest<{ success?: boolean; message?: string }>(
    endpoints.accountAdminDeactivateUser,
    {
      method: "POST",
      body: {
        deactivate_user: true,
        user_id: userId,
      },
    },
  );
}

export async function adminActivateUser(userId: number) {
  const endpoints = getApiEndpoints();
  return apiRequest<{ success?: boolean; message?: string }>(
    endpoints.accountAdminActivateUser,
    {
      method: "POST",
      body: {
        activate_user: true,
        user_id: userId,
      },
    },
  );
}
