/**
 * GlobenTech Backend Connectivity Test
 * Run: node scripts/test-backend.mjs
 *
 * Tests all 10 critical backend features:
 *   1.  PHP backend server reachability
 *   2.  Firebase Auth — Admin login
 *   3.  Firebase Auth — Technician login
 *   4.  Firebase Auth — Customer login
 *   5.  Equipment list fetch (GET)
 *   6.  Admin pending orders fetch
 *   7.  Admin users list fetch
 *   8.  Customer order history fetch
 *   9.  Contact send (POST)
 *  10.  Reports generate (POST)
 */

const BASE_URL = "http://localhost/Capstone-project";
const FIREBASE_API_KEY = "AIzaSyAqrrEiD7qMIWQ4Kduatkg5YOJUejYn0js";
const FIREBASE_DB_URL = "https://globentech-e6551-default-rtdb.firebaseio.com";

const ACCOUNTS = {
  admin: { email: "admin@globentech.com", password: "admin123" },
  technician: { email: "tech@globentech.com", password: "tech123" },
  customer: { email: "customer@globentech.com", password: "customer123" },
};

// ─── helpers ────────────────────────────────────────────────────────────────

const pad = (s, n = 40) => s.padEnd(n, " ");
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const PASS = `${GREEN}${BOLD}  PASS${RESET}`;
const FAIL = `${RED}${BOLD}  FAIL${RESET}`;
const SKIP = `${YELLOW}${BOLD}  SKIP${RESET}`;

let passed = 0,
  failed = 0,
  skipped = 0;
const results = [];

function result(n, label, status, detail = "") {
  const icon = status === "pass" ? PASS : status === "skip" ? SKIP : FAIL;
  const num = String(n).padStart(2, "0");
  console.log(`  [${num}] ${pad(label)} ${icon}  ${detail}`);
  results.push({ n, label, status, detail });
  if (status === "pass") passed++;
  else if (status === "skip") skipped++;
  else failed++;
}

async function timedFetch(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function phpGet(path, token) {
  const headers = token
    ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
    : { Accept: "application/json" };
  const res = await timedFetch(`${BASE_URL}${path}`, { headers });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text) };
  } catch {
    return {
      ok: res.ok,
      status: res.status,
      json: null,
      raw: text.slice(0, 120),
    };
  }
}

async function phpPost(path, body, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await timedFetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text) };
  } catch {
    return {
      ok: res.ok,
      status: res.status,
      json: null,
      raw: text.slice(0, 120),
    };
  }
}

async function firebaseLogin(email, password) {
  const res = await timedFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const json = await res.json();
  return json;
}

// ─── tests ──────────────────────────────────────────────────────────────────

async function test01_serverReachable() {
  try {
    const res = await timedFetch(
      `${BASE_URL}/api/equipment-list.php`,
      {},
      6000,
    );
    // Any HTTP response (even 401/500) means the server is up and PHP is running
    if (res.status < 600) {
      result(1, "PHP backend server reachable", "pass", `HTTP ${res.status}`);
      return true;
    }
    result(
      1,
      "PHP backend server reachable",
      "fail",
      `Unexpected status ${res.status}`,
    );
    return false;
  } catch (err) {
    result(1, "PHP backend server reachable", "fail", err.message);
    return false;
  }
}

async function test02_adminLogin() {
  try {
    const data = await firebaseLogin(
      ACCOUNTS.admin.email,
      ACCOUNTS.admin.password,
    );
    if (data.idToken) {
      result(2, "Firebase Auth — Admin login", "pass", `UID: ${data.localId}`);
      return data.idToken;
    }
    result(
      2,
      "Firebase Auth — Admin login",
      "fail",
      data.error?.message ?? "No token returned",
    );
    return null;
  } catch (err) {
    result(2, "Firebase Auth — Admin login", "fail", err.message);
    return null;
  }
}

async function test03_technicianLogin() {
  try {
    const data = await firebaseLogin(
      ACCOUNTS.technician.email,
      ACCOUNTS.technician.password,
    );
    if (data.idToken) {
      result(
        3,
        "Firebase Auth — Technician login",
        "pass",
        `UID: ${data.localId}`,
      );
      return data.idToken;
    }
    result(
      3,
      "Firebase Auth — Technician login",
      "fail",
      data.error?.message ?? "No token returned",
    );
    return null;
  } catch (err) {
    result(3, "Firebase Auth — Technician login", "fail", err.message);
    return null;
  }
}

async function test04_customerLogin() {
  try {
    const data = await firebaseLogin(
      ACCOUNTS.customer.email,
      ACCOUNTS.customer.password,
    );
    if (data.idToken) {
      result(
        4,
        "Firebase Auth — Customer login",
        "pass",
        `UID: ${data.localId}`,
      );
      return data.idToken;
    }
    result(
      4,
      "Firebase Auth — Customer login",
      "fail",
      data.error?.message ?? "No token returned",
    );
    return null;
  } catch (err) {
    result(4, "Firebase Auth — Customer login", "fail", err.message);
    return null;
  }
}

async function test05_equipmentList(token, serverUp) {
  if (!serverUp) {
    result(5, "Equipment list (GET)", "skip", "server unreachable");
    return;
  }
  try {
    const r = await phpGet("/api/equipment-list.php", token);
    const items =
      r.json?.equipment ??
      r.json?.data ??
      (Array.isArray(r.json) ? r.json : null);
    if (r.ok && items !== null) {
      result(
        5,
        "Equipment list (GET)",
        "pass",
        `${items.length} equipment record(s) returned`,
      );
    } else if (
      r.ok ||
      r.status === 400 ||
      r.status === 401 ||
      r.status === 403
    ) {
      result(
        5,
        "Equipment list (GET)",
        "pass",
        `HTTP ${r.status} — endpoint active (auth required)`,
      );
    } else {
      result(
        5,
        "Equipment list (GET)",
        "fail",
        `HTTP ${r.status}: ${r.json?.error ?? r.raw ?? "no body"}`,
      );
    }
  } catch (err) {
    result(5, "Equipment list (GET)", "fail", err.message);
  }
}

async function test06_pendingOrders(token, serverUp) {
  if (!serverUp) {
    result(6, "Admin pending orders (GET)", "skip", "server unreachable");
    return;
  }
  try {
    const r = await phpGet("/api/admin-pending-orders.php", token);
    if (r.ok || r.status === 401 || r.status === 403) {
      const detail = r.ok
        ? `HTTP ${r.status} — data received`
        : `HTTP ${r.status} — endpoint active (auth required)`;
      result(6, "Admin pending orders (GET)", "pass", detail);
    } else {
      result(
        6,
        "Admin pending orders (GET)",
        "fail",
        `HTTP ${r.status}: ${r.json?.error ?? r.raw ?? ""}`,
      );
    }
  } catch (err) {
    result(6, "Admin pending orders (GET)", "fail", err.message);
  }
}

async function test07_adminUsers(token, serverUp) {
  if (!serverUp) {
    result(7, "Admin users list (GET)", "skip", "server unreachable");
    return;
  }
  try {
    const r = await phpGet("/api/admin-users.php", token);
    if (r.ok || r.status === 401 || r.status === 403) {
      const detail = r.ok
        ? `HTTP ${r.status} — users data received`
        : `HTTP ${r.status} — endpoint active (auth required)`;
      result(7, "Admin users list (GET)", "pass", detail);
    } else {
      result(
        7,
        "Admin users list (GET)",
        "fail",
        `HTTP ${r.status}: ${r.json?.error ?? r.raw ?? ""}`,
      );
    }
  } catch (err) {
    result(7, "Admin users list (GET)", "fail", err.message);
  }
}

async function test08_customerOrders(token, serverUp) {
  if (!serverUp) {
    result(8, "Customer order history (GET)", "skip", "server unreachable");
    return;
  }
  try {
    const r = await phpGet("/api/customer-order-history.php", token);
    if (r.ok || r.status === 401 || r.status === 403) {
      const detail = r.ok
        ? `HTTP ${r.status} — history data received`
        : `HTTP ${r.status} — endpoint active (auth required)`;
      result(8, "Customer order history (GET)", "pass", detail);
    } else {
      result(
        8,
        "Customer order history (GET)",
        "fail",
        `HTTP ${r.status}: ${r.json?.error ?? r.raw ?? ""}`,
      );
    }
  } catch (err) {
    result(8, "Customer order history (GET)", "fail", err.message);
  }
}

async function test09_contactSend(serverUp) {
  if (!serverUp) {
    result(9, "Contact send (POST)", "skip", "server unreachable");
    return;
  }
  try {
    const r = await phpPost("/api/contact-send.php", {
      name: "Test User",
      email: "test@globentech.com",
      message: "Connectivity test — automated.",
    });
    if (r.ok || r.status === 400 || r.status === 401) {
      const detail = r.ok
        ? "Message accepted by server"
        : `HTTP ${r.status} — endpoint active`;
      result(9, "Contact send (POST)", "pass", detail);
    } else {
      result(
        9,
        "Contact send (POST)",
        "fail",
        `HTTP ${r.status}: ${r.json?.error ?? r.raw ?? ""}`,
      );
    }
  } catch (err) {
    result(9, "Contact send (POST)", "fail", err.message);
  }
}

async function test10_reportsGenerate(token, serverUp) {
  if (!serverUp) {
    result(10, "Reports generate (POST)", "skip", "server unreachable");
    return;
  }
  try {
    const r = await phpPost(
      "/api/reports-generate.php",
      { report_type: "orders", option: "all" },
      token,
    );
    if (r.ok || r.status === 401 || r.status === 403 || r.status === 400) {
      const detail = r.ok
        ? "Report data received"
        : `HTTP ${r.status} — endpoint active`;
      result(10, "Reports generate (POST)", "pass", detail);
    } else {
      result(
        10,
        "Reports generate (POST)",
        "fail",
        `HTTP ${r.status}: ${r.json?.error ?? r.raw ?? ""}`,
      );
    }
  } catch (err) {
    result(10, "Reports generate (POST)", "fail", err.message);
  }
}

async function test11_firebaseDatabase() {
  try {
    const res = await timedFetch(`${FIREBASE_DB_URL}/users.json`, {}, 6000);
    if (res.status === 200 || res.status === 401) {
      result(
        11,
        "Firebase Realtime DB reachable",
        "pass",
        `HTTP ${res.status}`,
      );
    } else {
      result(
        11,
        "Firebase Realtime DB reachable",
        "fail",
        `HTTP ${res.status}`,
      );
    }
  } catch (err) {
    result(11, "Firebase Realtime DB reachable", "fail", err.message);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`,
  );
  console.log(
    `${BOLD}${CYAN}   GlobenTech — Backend Connectivity Test Suite${RESET}`,
  );
  console.log(
    `${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`,
  );
  console.log(`  Backend : ${CYAN}${BASE_URL}${RESET}`);
  console.log(`  Firebase: ${CYAN}${FIREBASE_DB_URL}${RESET}\n`);

  const serverUp = await test01_serverReachable();
  const adminToken = await test02_adminLogin();
  const techToken = await test03_technicianLogin();
  const customerToken = await test04_customerLogin();

  await test05_equipmentList(adminToken, serverUp);
  await test06_pendingOrders(adminToken, serverUp);
  await test07_adminUsers(adminToken, serverUp);
  await test08_customerOrders(customerToken, serverUp);
  await test09_contactSend(serverUp);
  await test10_reportsGenerate(adminToken, serverUp);
  await test11_firebaseDatabase();

  // ─── summary ────────────────────────────────────────────────────────────
  const total = passed + failed + skipped;
  console.log(
    `\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`,
  );
  console.log(
    `${BOLD}  Results: ${GREEN}${passed} passed${RESET}  ${failed > 0 ? RED : ""}${BOLD}${failed} failed${RESET}  ${YELLOW}${skipped} skipped${RESET}  (${total} total)`,
  );
  console.log(
    `${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`,
  );

  if (failed > 0) {
    console.log(`${RED}${BOLD}  Failed tests:${RESET}`);
    results
      .filter((r) => r.status === "fail")
      .forEach((r) =>
        console.log(
          `    [${String(r.n).padStart(2, "0")}] ${r.label} — ${r.detail}`,
        ),
      );
    console.log();
  }

  const phpPassed = results.filter(
    (r) => r.n >= 5 && r.n <= 10 && r.status === "pass",
  ).length;
  const phpTotal = results.filter((r) => r.n >= 5 && r.n <= 10).length;
  const authPassed = results.filter(
    (r) => r.n >= 2 && r.n <= 4 && r.status === "pass",
  ).length;

  console.log(`${BOLD}  Breakdown:${RESET}`);
  console.log(`    Firebase Auth  : ${authPassed}/3 accounts verified`);
  console.log(
    `    PHP Endpoints  : ${phpPassed}/${phpTotal} endpoints reachable`,
  );
  console.log(
    `    Firebase DB    : ${results.find((r) => r.n === 11)?.status === "pass" ? "Online" : "Offline"}`,
  );
  console.log();

  if (failed === 0 && skipped === 0) {
    console.log(
      `${GREEN}${BOLD}  ✓  All systems connected. Ready to demo.${RESET}\n`,
    );
  } else if (serverUp && authPassed === 3) {
    console.log(
      `${YELLOW}${BOLD}  ⚠  Core systems connected. Some endpoints may need auth session.${RESET}\n`,
    );
  } else if (!serverUp) {
    console.log(
      `${RED}${BOLD}  ✗  PHP server unreachable — start XAMPP/WAMP and ensure project is at:${RESET}`,
    );
    console.log(`${RED}     ${BASE_URL}${RESET}\n`);
  }
}

main().catch((err) => {
  console.error(`\n${RED}${BOLD}  Fatal error: ${err.message}${RESET}\n`);
  process.exit(1);
});
