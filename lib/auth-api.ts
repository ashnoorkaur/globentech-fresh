import { fetchMyProfile } from "./account-api";
import { apiRequest, clearApiCache, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import { clearFirebaseSession } from "./firebase-rest";
import { getWebRoutes } from "./web-routes";

export type AuthRole = "customer" | "technician" | "administrator";

export type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  role: AuthRole;
  firebase_uid?: string;
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

const normalizeRole = (role?: string, emailHint?: string): AuthRole => {
  const value = (role || "").trim().toLowerCase();
  const normalizedEmail = (emailHint || "").trim().toLowerCase();
  const emailRole = emailHint ? inferRoleFromEmail(emailHint) : "customer";

  if (normalizedEmail === "admin@globentech.com") return "administrator";
  if (normalizedEmail === "tech@globentech.com") return "technician";
  if (normalizedEmail === "customer@globentech.com") return "customer";

  if (value.includes("admin") && emailRole !== "technician") {
    return "administrator";
  }
  if (value.includes("tech") && emailRole !== "administrator") {
    return "technician";
  }
  if (value.includes("customer")) {
    return emailRole !== "customer" ? emailRole : "customer";
  }

  return emailRole;
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
  uid?: string;
  full_name: string;
  email: string;
  role: "customer" | "technician" | "administrator";
}): AuthUser => ({
  id: profile.id,
  firebase_uid: profile.uid,
  full_name: profile.full_name,
  email: profile.email,
  role: normalizeRole(profile.role, profile.email),
});

const inferRoleFromEmail = (email: string): AuthRole => {
  const localPart = email.toLowerCase().split("@")[0] || "";
  if (localPart.includes("admin")) return "administrator";
  if (localPart.includes("tech")) return "technician";
  return "customer";
};

const extractDashboardNumericUserId = (html: string): number | null => {
  const patterns: RegExp[] = [
    /name=["']user_id["'][^>]*value=["'](\d+)["']/i,
    /name=["']id["'][^>]*value=["'](\d+)["']/i,
    /data-user-id=["'](\d+)["']/i,
    /\/account\/[^"']*[?&](?:user_)?id=(\d+)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
};

const emailsMatch = (left?: string, right?: string) => {
  const a = (left || "").trim().toLowerCase();
  const b = (right || "").trim().toLowerCase();
  if (!a || !b) return false;
  return a === b;
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

const normalizeLoginErrorMessage = (message?: string) => {
  const normalized = (message || "").trim();
  if (!normalized) {
    return "Incorrect email or password.";
  }

  if (
    /invalid email or password|incorrect password|invalid password|account not found|email not found|email_not_found|invalid_login_credentials|wrong password|invalid credential/i.test(
      normalized,
    )
  ) {
    return "Incorrect email or password.";
  }

  if (/403|401|request failed with 403|request failed with 401/i.test(normalized)) {
    return "Incorrect email or password.";
  }

  if (/inactive|deactivated|disabled/i.test(normalized)) {
    return "This account is inactive. Contact admin for access.";
  }

  if (/not verified|verify your email/i.test(normalized)) {
    return "Please verify your email before signing in.";
  }

  return normalized;
};

const inferRoleFromDashboardHtml = (
  html: string,
  emailHint: string,
): AuthRole => {
  const content = html.toLowerCase();
  const hintedRole = inferRoleFromEmail(emailHint);

  const hasAdminLinks =
    content.includes("/admin/users.php") ||
    content.includes("/admin/equipment.php") ||
    content.includes("/admin/reports.php") ||
    content.includes("/admin/catalogue.php");
  const hasCustomerLinks =
    content.includes("/orders/my-orders.php") ||
    content.includes("/orders/create-order.php") ||
    content.includes("/contact/index.php");

  if (
    content.includes("role-technician") ||
    content.includes("lab technician") ||
    content.includes("welcome, lab technician") ||
    (content.includes("review approvals") && !hasAdminLinks && !hasCustomerLinks)
  ) {
    return "technician";
  }

  if (
    content.includes("role-administrator") ||
    content.includes("system administrator") ||
    hasAdminLinks
  ) {
    return "administrator";
  }

  if (
    content.includes("role-customer") ||
    hasCustomerLinks ||
    content.includes("submit new order")
  ) {
    return "customer";
  }

  const customerSignals = [
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
    "open calendar",
    "review approvals",
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

  if (content.includes("administrator")) return "administrator";

  const hasCustomerWord = content.includes("customer");
  const hasTechWord =
    content.includes("technician") || content.includes("tech ");
  if (hasCustomerWord && !hasTechWord) return "customer";
  if (hasTechWord && !hasCustomerWord) return "technician";

  return hintedRole;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const clearExistingLoginSession = async () => {
  const endpoints = getApiEndpoints();
  clearApiCache();
  clearFirebaseSession();

  await Promise.allSettled([
    tryLegacyLogout(),
    apiRequest<{ success?: boolean; message?: string }>(endpoints.authLogout, {
      method: "POST",
      body: { logout: true },
      timeoutMs: 2500,
    }),
  ]);
};

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
    throw new Error(normalizeLoginErrorMessage(String(response.status)));
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

  // Parallel attempt with timeout: race all dashboard requests to find session
  // faster. Timeout is 3 seconds per candidate to prevent hanging on slow endpoints.
  const attemptDashboard = async (candidate: {
    path: string;
    roleHint: AuthRole | "auto";
  }): Promise<AuthUser | null> => {
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 3000),
    );

    const fetchPromise = (async () => {
      try {
        const response = await fetchLegacyPath(candidate.path, {
          method: "GET",
          credentials: "include",
          redirect: "follow",
        });

        if (!response.ok) {
          return null;
        }

        if (response.url.toLowerCase().includes("login.php")) {
          return null;
        }

        const text = await response.text();
        if (/invalid email or password|<title>\s*login/i.test(text)) {
          return null;
        }

        const inferredRole = inferRoleFromDashboardHtml(text, emailHint || "");
        const role =
          candidate.roleHint === "auto"
            ? inferredRole
            : inferredRole !== "customer" &&
                inferredRole !== "technician" &&
                inferredRole !== "administrator"
              ? candidate.roleHint
              : inferredRole;
        const email = emailHint?.trim().toLowerCase() || "";
        if (!email) return null;
        const userId = extractDashboardNumericUserId(text);
        if (!userId) return null;
        return {
          id: userId,
          full_name:
            deriveDisplayNameFromEmail(email) || roleToDisplayName(role),
          email,
          role,
        };
      } catch {
        return null;
      }
    })();

    return Promise.race([fetchPromise, timeoutPromise]);
  };

  // Race all dashboard attempts in parallel — first one to succeed returns
  // immediately without waiting for others.
  const raceResults = await Promise.allSettled(
    uniqueCandidates.map((c) => attemptDashboard(c)),
  );

  for (const result of raceResults) {
    if (result.status === "fulfilled" && result.value) {
      return result.value;
    }
  }

  return null;
};

const tryLegacyLogout = async () => {
  // Logout optimization: only try the live website logout route with short timeout.
  const primaryCandidate = getApiBaseUrlCandidates()[0];
  const routes = getWebRoutes();
  if (!primaryCandidate) throw new Error("No API base URL available");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`${primaryCandidate}${routes.login.replace(/\/login\.php$/i, "/logout.php")}`, {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Logout failed with status ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
};

export async function loginWithPassword(email: string, password: string) {
  const endpoints = getApiEndpoints();
  const normalizedEmail = email.trim().toLowerCase();
  let legacyLoginError: Error | null = null;

  const resolveUserFromActiveSession = async (
    dashboardHtml?: string,
  ): Promise<AuthUser> => {
    const hintedRole = dashboardHtml
      ? inferRoleFromDashboardHtml(dashboardHtml, normalizedEmail)
      : inferRoleFromEmail(normalizedEmail);

    try {
      const profile = await fetchMyProfile();
      if (emailsMatch(profile.email, normalizedEmail)) {
        return {
          ...mapProfileToAuthUser(profile),
          role: dashboardHtml
            ? hintedRole
            : normalizeRole(profile.role, normalizedEmail),
        };
      }
    } catch {
      // Profile API unavailable on this deployment.
    }

    try {
      await wait(300);
      const profile = await fetchMyProfile();
      if (emailsMatch(profile.email, normalizedEmail)) {
        return {
          ...mapProfileToAuthUser(profile),
          role: dashboardHtml
            ? hintedRole
            : normalizeRole(profile.role, normalizedEmail),
        };
      }
    } catch {
      // Continue.
    }

    try {
      const response = await apiRequest<AuthUser | SuccessEnvelope<AuthUser>>(
        endpoints.authSession,
      );
      const user = unwrap(response);
      if (isAuthUser(user) && emailsMatch(user.email, normalizedEmail)) {
        return {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: dashboardHtml
            ? hintedRole
            : normalizeRole(user.role as unknown as string, normalizedEmail),
        };
      }
    } catch {
      // Continue.
    }

    try {
      const legacyUser = await tryLegacySessionUser(normalizedEmail);
      if (legacyUser && (!legacyUser.email || emailsMatch(legacyUser.email, normalizedEmail))) {
        return {
          ...legacyUser,
          email: normalizedEmail,
          role: normalizeRole(legacyUser.role, normalizedEmail),
        };
      }
    } catch {
      // Fall through.
    }

    throw new Error("Unable to resolve authenticated user session.");
  };

  // Clear any stale website session first so a previous admin login does not leak into a new customer login.
  await clearExistingLoginSession();
  await wait(150);

  // Prefer the same working PHP form flow used by the live website.
  try {
    const phpLoginPromise = postToPhpLoginForm(normalizedEmail, password);
    const phpTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PHP login timeout")), 8000),
    );
    const dashboardHtml = await Promise.race([phpLoginPromise, phpTimeoutPromise]);
    return await resolveUserFromActiveSession(dashboardHtml);
  } catch (legacyError) {
    if (legacyError instanceof Error) {
      legacyLoginError = legacyError;
    }
  }

  // Secondary fallback for environments that still expose a JSON auth endpoint.
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
        timeoutMs: 6000,
      },
    );
    const user = unwrap(response);

    if (isAuthUser(user)) {
      return {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: normalizeRole(user.role as unknown as string, user.email),
      };
    }
  } catch (apiError) {
    if (apiError instanceof Error && !legacyLoginError) {
      legacyLoginError = apiError;
    }
  }

  throw new Error(
    normalizeLoginErrorMessage(legacyLoginError?.message) ||
      "Login failed. The shared website backend did not return a valid authenticated session.",
  );
}

export async function registerAccount(payload: RegisterPayload) {
  const endpoints = getApiEndpoints();
  const normalizedPayload = {
    ...payload,
    email: payload.email.trim().toLowerCase(),
  };
  const validationPattern =
    /please fill in all required fields|email already exists|passwords do not match|offensive or inappropriate language/i;
  let lastError: Error | null = null;

  // Prefer the working live website registration form first.
  try {
    return await postToPhpRegisterForm(normalizedPayload);
  } catch (legacyError) {
    if (legacyError instanceof Error) {
      lastError = legacyError;
      if (validationPattern.test(legacyError.message)) {
        throw legacyError;
      }
    }
  }

  // Try any JSON auth endpoint exposed by alternate deployments.
  try {
    return await apiRequest<
      | { success?: boolean; message?: string }
      | SuccessEnvelope<{ success?: boolean; message?: string }>
    >(endpoints.authRegister, {
      method: "POST",
      body: {
        register: true,
        ...normalizedPayload,
      },
      timeoutMs: 8000,
    });
  } catch (apiError) {
    if (apiError instanceof Error) {
      lastError = apiError;
      if (validationPattern.test(apiError.message)) {
        throw apiError;
      }
    }
  }

  throw new Error(
    normalizeLoginErrorMessage(lastError?.message) ||
      "Registration failed on the shared website backend.",
  );
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
      role: normalizeRole(raw.role as unknown as string, raw.email),
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
  
  // Clear cache immediately to prevent stale data
  clearApiCache();
  clearFirebaseSession();
  
  // Race both logout methods - return immediately when first succeeds
  // Logout is non-critical, so use aggressive short timeout
  try {
    await Promise.race([
      tryLegacyLogout(),
      apiRequest<{ success?: boolean; message?: string }>(
        endpoints.authLogout,
        {
          method: "POST",
          body: { logout: true },
          timeoutMs: 2500, // Aggressive 2.5s timeout for logout
        },
      ),
    ]);
    return { success: true, message: "Logged out successfully." };
  } catch {
    // Logout failed on backend but that's okay - session is cleared on client
    return { success: true, message: "Session cleared." };
  }
}
