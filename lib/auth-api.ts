import { fetchMyProfile } from "./account-api";
import { apiRequest, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { getWebRoutes } from "./web-routes";

export type AuthRole = "customer" | "technician" | "administrator";

export type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  role: AuthRole;
};

export type RegisterPayload = {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
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

const normalizeRole = (role?: string): AuthRole => {
  const value = (role || "").toLowerCase();
  if (value === "administrator" || value === "admin") return "administrator";
  if (value === "technician" || value === "tech") return "technician";
  return "customer";
};

const isAuthUser = (value: unknown): value is AuthUser => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthUser>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.full_name === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.role === "string"
  );
};

const mapProfileToAuthUser = (profile: {
  id: number;
  full_name: string;
  email: string;
  role: "customer" | "technician" | "administrator";
}): AuthUser => ({
  id: profile.id,
  full_name: profile.full_name,
  email: profile.email,
  role: normalizeRole(profile.role),
});

const buildNameFromEmail = (email: string) => {
  const local = email.split("@")[0] || "user";
  const spaced = local.replace(/[._-]+/g, " ").trim();
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const inferRoleFromEmail = (email: string): AuthRole => {
  const value = email.toLowerCase();
  if (value.includes("admin")) return "administrator";
  if (value.includes("tech")) return "technician";
  return "customer";
};

const inferRoleFromDashboardHtml = (
  html: string,
  emailHint: string,
): AuthRole => {
  const content = html.toLowerCase();

  // Prefer explicit role words when present in account/dashboard templates.
  if (
    content.includes("administrator") ||
    content.includes("admin dashboard")
  ) {
    return "administrator";
  }

  if (content.includes("technician") || content.includes("assigned tasks")) {
    return "technician";
  }

  if (
    content.includes("customer") ||
    content.includes("my orders") ||
    content.includes("new order")
  ) {
    return "customer";
  }

  if (
    content.includes("manage users") ||
    content.includes("pending approvals") ||
    content.includes("admin.php")
  ) {
    return "administrator";
  }

  if (content.includes("assigned tasks") || content.includes("technician")) {
    return "technician";
  }

  return inferRoleFromEmail(emailHint);
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const fetchLegacyPath = async (path: string, init?: RequestInit) => {
  const candidates = getApiBaseUrlCandidates();
  let lastResponse: Response | null = null;

  for (const base of candidates) {
    const response = await fetch(`${base}${path}`, init);
    lastResponse = response;
    if (response.status !== 404) {
      return response;
    }
  }

  throw new Error(
    `Legacy endpoint not found for ${path}. Tried: ${candidates.join(", ")}`,
  );
};

const postToPhpLoginForm = async (email: string, password: string) => {
  const routes = getWebRoutes();
  const body = new URLSearchParams({
    login: "1",
    email,
    password,
  }).toString();

  const response = await fetchLegacyPath(routes.login, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    credentials: "include",
    body,
  });

  if (!response.ok) {
    throw new Error(`Legacy login failed with status ${response.status}.`);
  }

  const text = await response.text();
  const endedBackOnLogin = response.url.toLowerCase().includes("login.php");
  const stillOnLoginForm =
    endedBackOnLogin ||
    /<input[^>]*name=["']password["']/i.test(text) ||
    /<form[^>]*(id|name|class)=["'][^"']*login/i.test(text);
  if (stillOnLoginForm) {
    throw new Error("Invalid email or password.");
  }

  return text;
};

const postToPhpRegisterForm = async (payload: RegisterPayload) => {
  const routes = getWebRoutes();
  const body = new URLSearchParams({
    register: "1",
    full_name: payload.full_name,
    email: payload.email,
    password: payload.password,
    confirm_password: payload.confirm_password,
    phone: payload.phone || "",
    company_name: payload.company_name || "",
    address: payload.address || "",
  }).toString();

  const response = await fetchLegacyPath(routes.signup, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    credentials: "include",
    body,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Legacy register failed with status ${response.status}.`);
  }

  const text = await response.text();
  const url = response.url.toLowerCase();
  // Treat common post-register destinations as success and keep UX simple.
  if (
    url.includes("verify-email.php") ||
    url.includes("login.php") ||
    url.includes("dashboard")
  ) {
    return { success: true, message: "Account created successfully." };
  }

  if (/registration successful|account created|signup successful/i.test(text)) {
    return { success: true, message: "Account created successfully." };
  }

  const knownError =
    text.match(
      /please fill in all required fields|email already exists|failed to send verification email|passwords do not match|offensive or inappropriate language is not allowed/i,
    )?.[0] || "Registration failed on legacy backend.";

  throw new Error(knownError);
};

const tryLegacySessionUser = async (
  emailHint?: string,
): Promise<AuthUser | null> => {
  const routes = getWebRoutes();
  const dashboardCandidates: Array<{
    path: string;
    roleHint: AuthRole | "auto";
  }> = [
    { path: routes.adminDashboard, roleHint: "administrator" },
    { path: routes.technicianDashboard, roleHint: "technician" },
    { path: routes.customerDashboard, roleHint: "customer" },
    { path: routes.home, roleHint: "auto" },
  ];

  const uniqueCandidates = dashboardCandidates.filter(
    (candidate, index, self) =>
      self.findIndex((item) => item.path === candidate.path) === index,
  );

  for (const candidate of uniqueCandidates) {
    try {
      const response = await fetchLegacyPath(candidate.path, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
      });

      if (!response.ok) {
        continue;
      }

      if (response.url.toLowerCase().includes("login.php")) {
        continue;
      }

      const text = await response.text();
      if (/invalid email or password|<title>\s*login/i.test(text)) {
        continue;
      }

      const inferredRole = inferRoleFromDashboardHtml(text, emailHint || "");
      const role =
        candidate.roleHint === "auto" ? inferredRole : candidate.roleHint;
      return {
        id: 0,
        full_name: "Authenticated User",
        email: emailHint || "session@local",
        role,
      };
    } catch {
      continue;
    }
  }

  return null;
};

const tryLegacyLogout = async () => {
  await fetchLegacyPath("/logout.php", {
    method: "GET",
    credentials: "include",
  });
};

export async function loginWithPassword(email: string, password: string) {
  const endpoints = getApiEndpoints();
  const normalizedEmail = email.trim().toLowerCase();

  const resolveUserFromActiveSession = async (
    dashboardHtml?: string,
  ): Promise<AuthUser> => {
    // Session cookie may need a moment before profile endpoints reflect it.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const profile = await fetchMyProfile();
        return mapProfileToAuthUser(profile);
      } catch {
        // Continue to fallbacks below.
      }

      try {
        const response = await apiRequest<AuthUser | SuccessEnvelope<AuthUser>>(
          endpoints.authSession,
        );
        const user = unwrap(response);
        if (isAuthUser(user)) {
          return {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: normalizeRole(user.role as unknown as string),
          };
        }
      } catch {
        // Continue to legacy session fallback.
      }

      try {
        const legacyUser = await tryLegacySessionUser(normalizedEmail);
        if (legacyUser) return legacyUser;
      } catch {
        // Ignore and retry.
      }

      if (attempt < 2) {
        await wait(250);
      }
    }

    return {
      id: 0,
      full_name: buildNameFromEmail(normalizedEmail),
      email: normalizedEmail,
      role: dashboardHtml
        ? inferRoleFromDashboardHtml(dashboardHtml, normalizedEmail)
        : inferRoleFromEmail(normalizedEmail),
    };
  };

  try {
    // Prefer existing PHP form/session login flow first.
    const dashboardHtml = await postToPhpLoginForm(normalizedEmail, password);
    return await resolveUserFromActiveSession(dashboardHtml);
  } catch (legacyError) {
    if (
      legacyError instanceof Error &&
      /invalid email or password/i.test(legacyError.message)
    ) {
      throw legacyError;
    }

    try {
      const response = await apiRequest<AuthUser | SuccessEnvelope<AuthUser>>(
        endpoints.authLogin,
        {
          method: "POST",
          body: {
            login: true,
            email: normalizedEmail,
            password,
          },
        },
      );
      const user = unwrap(response);

      if (!isAuthUser(user)) {
        throw new Error(
          "Login endpoint response shape is invalid. Expected user data with id/full_name/email/role.",
        );
      }

      return {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: normalizeRole(user.role as unknown as string),
      };
    } catch (apiError) {
      // Final fallback: try reading current session in case auth API succeeded but
      // returned a malformed payload.
      try {
        return await resolveUserFromActiveSession();
      } catch {
        // keep original error below
      }

      if (apiError instanceof Error) {
        throw new Error(
          `Login failed. Backend auth contract mismatch. Ensure login.php is reachable and session starts correctly. Details: ${apiError.message}`,
        );
      }
      throw new Error("Login failed. Backend auth contract mismatch.");
    }
  }
}

export async function registerAccount(payload: RegisterPayload) {
  const endpoints = getApiEndpoints();

  // Prefer direct API registration (no email verification UX requirement).
  try {
    return await apiRequest<
      | { success?: boolean; message?: string }
      | SuccessEnvelope<{ success?: boolean; message?: string }>
    >(endpoints.authRegister, {
      method: "POST",
      body: {
        register: true,
        ...payload,
      },
    });
  } catch (apiError) {
    if (
      apiError instanceof Error &&
      /please fill in all required fields|email already exists|passwords do not match|offensive or inappropriate language/i.test(
        apiError.message,
      )
    ) {
      throw apiError;
    }

    // Fallback for legacy deployments.
    return await postToPhpRegisterForm(payload);
  }
}

export async function fetchSessionUser() {
  const endpoints = getApiEndpoints();
  try {
    const legacyUser = await tryLegacySessionUser();
    if (legacyUser) return legacyUser;
  } catch {
    // continue with API fallbacks
  }

  try {
    const profile = await fetchMyProfile();
    return mapProfileToAuthUser(profile);
  } catch {
    try {
      const response = await apiRequest<AuthUser | SuccessEnvelope<AuthUser>>(
        endpoints.authSession,
      );
      const raw = unwrap(response);
      return {
        id: raw.id,
        full_name: raw.full_name,
        email: raw.email,
        role: normalizeRole(raw.role as unknown as string),
      };
    } catch {
      throw new Error("No active session.");
    }
  }
}

export async function logoutSession() {
  const endpoints = getApiEndpoints();
  try {
    await tryLegacyLogout();
    return { success: true, message: "Logged out using legacy backend." };
  } catch {
    return await apiRequest<{ success?: boolean; message?: string }>(
      endpoints.authLogout,
      {
        method: "POST",
        body: { logout: true },
      },
    );
  }
}
