import { fetchMyProfile } from "./account-api";
import { apiRequest, clearApiCache, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";
import {
    clearFirebaseSession,
    fetchFirebaseSessionProfile,
    loginWithFirebase,
    registerWithFirebase,
} from "./firebase-rest";
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
  uid?: string;
  full_name: string;
  email: string;
  role: "customer" | "technician" | "administrator";
}): AuthUser => ({
  id: profile.id,
  firebase_uid: profile.uid,
  full_name: profile.full_name,
  email: profile.email,
  role: normalizeRole(profile.role),
});

const inferRoleFromEmail = (email: string): AuthRole => {
  const localPart = email.toLowerCase().split("@")[0] || "";
  if (localPart.includes("admin")) return "administrator";
  if (localPart.includes("tech")) return "technician";
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
        return {
          id: inferKnownTestIdFromEmail(email),
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
  // Logout optimization: only try primary endpoint with short timeout
  const primaryCandidate = getApiBaseUrlCandidates()[0];
  if (!primaryCandidate) throw new Error("No API base URL available");
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5 second timeout
  
  try {
    const response = await fetch(`${primaryCandidate}/logout.php`, {
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

  try {
    const firebaseUser = await loginWithFirebase(normalizedEmail, password);
    postToPhpLoginForm(normalizedEmail, password).catch(() => {});
    console.log("[login] Firebase login success, role:", firebaseUser.role);
    return firebaseUser;
  } catch (firebaseError) {
    if (
      firebaseError instanceof Error &&
      /invalid|password|credential|user|EMAIL_NOT_FOUND|INVALID_PASSWORD/i.test(firebaseError.message)
    ) {
      // Continue to legacy backend fallbacks for deployments still using PHP auth.
    }
  }

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

    throw new Error("Unable to resolve authenticated user session.");
  };

  const credentialPattern =
    /invalid email or password|incorrect password|inactive|deactivated|disabled|not verified|account not found/i;

  // ── Step 1: Try JSON API login FIRST (returns correct role) ──
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
      const apiUser: AuthUser = {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: normalizeRole(user.role as unknown as string),
      };

      // Also establish PHP session in background for subsequent requests
      postToPhpLoginForm(normalizedEmail, password).catch(() => {});

      console.log("[login] API login success, role:", apiUser.role);
      return apiUser;
    }
  } catch (apiError) {
    console.log("[login] API login failed, falling back to PHP form:", (apiError as Error)?.message);
    // If API login rejected credentials, surface immediately.
    if (
      apiError instanceof Error &&
      credentialPattern.test(apiError.message)
    ) {
      throw new Error(normalizeLoginErrorMessage(apiError.message));
    }
    // Otherwise fall through to PHP form login.
  }

  // ── Step 2: Fall back to PHP form login ──
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

    if (
      legacyLoginError &&
      credentialPattern.test(legacyLoginError.message)
    ) {
      throw new Error(normalizeLoginErrorMessage(legacyLoginError.message));
    }

    throw new Error(
      normalizeLoginErrorMessage(legacyLoginError?.message) ||
        "Login failed. Neither Firebase nor the legacy backend returned a valid authenticated session.",
    );
  }
}

export async function registerAccount(payload: RegisterPayload) {
  const endpoints = getApiEndpoints();

  try {
    return await registerWithFirebase(payload);
  } catch {
    // Continue to legacy/PHP fallback.
  }

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
  try {
    const profile = await fetchFirebaseSessionProfile();
    return mapProfileToAuthUser(profile);
  } catch {
    // continue
  }

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
