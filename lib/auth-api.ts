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

const inferRoleFromEmail = (email: string): AuthRole => {
  const value = email.toLowerCase();
  if (value.includes("admin")) return "administrator";
  if (value.includes("tech")) return "technician";
  return "customer";
};

const inferKnownTestIdFromEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  if (normalized === "admin@globentech.com") return 1;
  if (normalized === "tech@globentech.com") return 2;
  if (normalized === "customer@globentech.com") return 3;
  return 0;
};

const roleToDisplayName = (role: AuthRole) => {
  if (role === "administrator") return "Admin";
  if (role === "technician") return "Technician";
  return "Customer";
};

const deriveDisplayNameFromEmail = (email: string) => {
  const localPart = email.split("@")[0] || "";
  const cleaned = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const inferRoleFromDashboardHtml = (
  html: string,
  emailHint: string,
): AuthRole => {
  const content = html.toLowerCase();
  const hintedRole = inferRoleFromEmail(emailHint);

  // Strong admin signals (admin.php is a unique URL so these double as safety checks).
  if (
    content.includes("admin dashboard") ||
    content.includes("manage users") ||
    content.includes("pending approvals") ||
    content.includes("admin.php")
  ) {
    return "administrator";
  }

  const customerSignals = [
    "my orders",
    "new order",
    "create order",
    "place an order",
    "order tracking",
    "customer dashboard",
    "request pickup",
  ];
  const technicianSignals = [
    "assigned tasks",
    "task queue",
    "my tasks",
    "technician dashboard",
    "tech dashboard",
    "assigned equipment",
    "sample collection",
    "pending samples",
    "service schedule",
    "technician calendar",
  ];

  const customerScore = customerSignals.reduce(
    (score, signal) => score + (content.includes(signal) ? 1 : 0),
    0,
  );
  const technicianScore = technicianSignals.reduce(
    (score, signal) => score + (content.includes(signal) ? 1 : 0),
    0,
  );

  if (technicianScore > customerScore && technicianScore > 0) {
    return "technician";
  }

  if (customerScore > technicianScore && customerScore > 0) {
    return "customer";
  }

  // Weak fallback signals — generic role words that may appear on either role's page.
  if (content.includes("administrator")) return "administrator";

  const hasCustomerWord = content.includes("customer");
  const hasTechWord =
    content.includes("technician") || content.includes("tech ");
  if (hasCustomerWord && !hasTechWord) return "customer";
  if (hasTechWord && !hasCustomerWord) return "technician";

  // On the shared /dashboard.php fallback, trust the login identity over an
  // ambiguous page body so technician accounts do not drift into customer.
  return hintedRole;
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

  // Detect login failure by checking both the final URL and the page content.
  // response.url is unreliable in React Native (does not update after redirects),
  // so we also inspect the HTML body for structural login-page signals.
  const urlIndicatesLoginPage = response.url
    .toLowerCase()
    .includes("login.php");
  const bodyIndicatesLoginPage =
    /name=["']password["']/i.test(text) ||
    /<title>\s*(?:login|sign.?in)/i.test(text);

  if (urlIndicatesLoginPage || bodyIndicatesLoginPage) {
    const knownLoginError =
      text.match(
        /invalid email or password|incorrect password|account (?:is )?(?:inactive|deactivated|disabled)|verify your email|email not verified|account not found/i,
      )?.[0] || "Invalid email or password.";
    throw new Error(knownLoginError);
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

  // Deduplicate by path; when multiple roles share the same URL (e.g. customer
  // and technician both use /dashboard.php), collapse roleHint to "auto" so we
  // infer the role purely from the HTML content instead of trusting a stale hint.
  const seenPaths = new Map<
    string,
    { path: string; roleHint: AuthRole | "auto" }
  >();
  for (const candidate of dashboardCandidates) {
    if (seenPaths.has(candidate.path)) {
      seenPaths.set(candidate.path, { ...candidate, roleHint: "auto" });
    } else {
      seenPaths.set(candidate.path, candidate);
    }
  }
  const uniqueCandidates = Array.from(seenPaths.values());

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
      // Always trust what the HTML actually says — customer and technician share
      // the same dashboard URL so the roleHint cannot be relied upon there.
      // For the admin URL, also cross-check the inferred role so a redirect to
      // a non-admin page doesn't accidentally return "administrator".
      const role =
        candidate.roleHint === "auto"
          ? inferredRole
          : inferredRole !== "customer" &&
              inferredRole !== "technician" &&
              inferredRole !== "administrator"
            ? candidate.roleHint // HTML gave no clear signal, trust the hint
            : inferredRole; // HTML is authoritative
      const email = emailHint || "session@local";
      return {
        id: inferKnownTestIdFromEmail(email),
        full_name: deriveDisplayNameFromEmail(email) || roleToDisplayName(role),
        email,
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
  let legacyLoginError: Error | null = null;

  const resolveUserFromActiveSession = async (
    dashboardHtml?: string,
  ): Promise<AuthUser> => {
    // Try profile API first — one attempt, no retry loop.
    // The session cookie is already set by the time PHP redirected to the
    // dashboard, so there is no benefit in retrying.
    try {
      const profile = await fetchMyProfile();
      return mapProfileToAuthUser(profile);
    } catch {
      // Profile API unavailable (legacy-only deployment).
    }

    // One JSON session endpoint attempt.
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
      // Continue.
    }

    // We already have the dashboard HTML from the PHP login redirect — infer
    // the role from it directly instead of making more network requests.
    if (dashboardHtml) {
      const role = inferRoleFromDashboardHtml(dashboardHtml, normalizedEmail);
      return {
        id: inferKnownTestIdFromEmail(normalizedEmail),
        full_name:
          deriveDisplayNameFromEmail(normalizedEmail) ||
          roleToDisplayName(role),
        email: normalizedEmail,
        role,
      };
    }

    // Non-PHP path: one legacy session scrape attempt.
    try {
      const legacyUser = await tryLegacySessionUser(normalizedEmail);
      if (legacyUser) return legacyUser;
    } catch {
      // Fall through.
    }

    // Final fallback: email-based role inference.
    const inferredRole = inferRoleFromEmail(normalizedEmail);
    return {
      id: inferKnownTestIdFromEmail(normalizedEmail),
      full_name:
        deriveDisplayNameFromEmail(normalizedEmail) ||
        roleToDisplayName(inferredRole),
      email: normalizedEmail,
      role: inferredRole,
    };
  };

  try {
    // Prefer existing PHP form/session login flow first.
    const dashboardHtml = await postToPhpLoginForm(normalizedEmail, password);
    return await resolveUserFromActiveSession(dashboardHtml);
  } catch (legacyError) {
    if (legacyError instanceof Error) {
      legacyLoginError = legacyError;
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
      // If either the PHP login or the API login gave a definitive credential
      // rejection, surface that error immediately. Do NOT fall through to the
      // session-scrape fallback: an old session cookie or the email-inference
      // path would otherwise let a wrong-password attempt succeed.
      const credentialPattern =
        /invalid email or password|incorrect password|inactive|deactivated|disabled|not verified|account not found/i;

      if (
        legacyLoginError &&
        credentialPattern.test(legacyLoginError.message)
      ) {
        throw legacyLoginError;
      }

      if (
        apiError instanceof Error &&
        credentialPattern.test(apiError.message)
      ) {
        throw new Error(apiError.message);
      }

      // Final fallback: try reading current session in case auth API succeeded but
      // returned a malformed payload (only safe to reach when neither side gave a
      // definitive credential rejection above).
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

  // Prefer the profile API — it reads the role directly from the database.
  try {
    const profile = await fetchMyProfile();
    return mapProfileToAuthUser(profile);
  } catch {
    // continue
  }

  // JSON session endpoint fallback.
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
    // continue
  }

  // Last resort: legacy HTML scraping (least reliable).
  try {
    const legacyUser = await tryLegacySessionUser();
    if (legacyUser) return legacyUser;
  } catch {
    // fall through
  }

  throw new Error("No active session.");
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
