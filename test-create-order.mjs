const BASE_URL = "http://localhost/Capstone-project";
const FIREBASE_API_KEY = "AIzaSyAqrrEiD7qMIWQ4Kduatkg5YOJUejYn0js";

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

async function firebaseLogin(email, password) {
  const res = await timedFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  return await res.json();
}

async function testCreateOrder() {
  console.log("Testing Create Order endpoint...\n");

  try {
    console.log("Step 1: Login as customer via Firebase...");
    const loginRes = await firebaseLogin(
      "customer@globentech.com",
      "customer123",
    );
    if (!loginRes.idToken)
      throw new Error("Login failed: " + JSON.stringify(loginRes));
    const token = loginRes.idToken;
    console.log("  ✓ Firebase Auth successful\n");

    console.log("Step 2: Check if backend needs a session login...");
    const checkRes = await timedFetch(
      `${BASE_URL}/api/customer-order-history.php`,
      {},
      6000,
    );
    console.log(`  API reachable: HTTP ${checkRes.status}\n`);

    console.log("Step 3: POST Create Order...");
    const orderPayload = {
      priority: "standard",
      sample_type: "ore",
      compound_name: "Test Compound",
      quantity: 100,
      unit: "g",
      sample_count: 100,
    };

    const createRes = await timedFetch(
      `${BASE_URL}/api/customer-create-order.php`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
      },
      10000,
    );

    const text = await createRes.text();
    console.log(`  Status: HTTP ${createRes.status}`);
    console.log(`  Response (first 300 chars):\n    ${text.slice(0, 300)}\n`);

    if (createRes.ok) {
      console.log("  ✓ SUCCESS — Order created!");
      try {
        const json = JSON.parse(text);
        console.log("  Order ID:", json.data?.id || json.id || "N/A");
      } catch {}
    } else if (createRes.status === 401 || text.includes("unauthorized")) {
      console.log("  ⚠ Status 401 Unauthorized");
      console.log("     → Backend needs a session/auth token");
      console.log(
        "     → Check how app passes credentials (cookies vs headers)",
      );
    } else if (text.includes("SQLSTATE") || text.includes("SQL")) {
      console.log("  ✗ Database error (SQL error detected)");
      console.log("     → Check if backend database tables exist");
    } else {
      console.log("  ✗ Endpoint returned error");
    }
  } catch (err) {
    console.log("\n  ✗ ERROR:", err.message);
    if (err.message.includes("abort")) {
      console.log("     → Request timed out — backend may be hanging");
      console.log("     → Check PHP error logs");
    }
  }
}

testCreateOrder();
