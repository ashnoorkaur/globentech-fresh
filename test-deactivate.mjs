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

async function testDeactivateSelf() {
  console.log("Testing Deactivation endpoints...\n");

  try {
    console.log("Step 1: Login as customer...");
    const loginRes = await firebaseLogin(
      "customer@globentech.com",
      "customer123",
    );
    if (!loginRes.idToken)
      throw new Error("Login failed: " + JSON.stringify(loginRes));
    console.log("  ✓ Firebase Auth successful\n");

    console.log(
      "Step 2: POST Deactivate Self (/api/account-deactivate-self.php)...",
    );
    const deactivateRes = await timedFetch(
      `${BASE_URL}/api/account-deactivate-self.php`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deactivate_self: true,
        }),
      },
      10000,
    );

    const text = await deactivateRes.text();
    console.log(`  Status: HTTP ${deactivateRes.status}`);
    console.log(`  Response (first 300 chars):\n    ${text.slice(0, 300)}\n`);

    if (deactivateRes.ok) {
      console.log("  ✓ SUCCESS — Account deactivated!");
    } else if (deactivateRes.status === 401 || text.includes("unauthorized")) {
      console.log("  ⚠ Status 401 Unauthorized");
      console.log(
        "     → Endpoint needs session auth (backend session not established)",
      );
    } else if (text.includes("SQLSTATE") || text.includes("SQL")) {
      console.log("  ✗ Database error (SQL error)");
    } else {
      console.log("  ✗ Endpoint returned error");
    }

    console.log(
      "\nStep 3: POST Deactivate User (admin) (/api/account-admin-deactivate-user.php)...",
    );
    const adminDeactivateRes = await timedFetch(
      `${BASE_URL}/api/account-admin-deactivate-user.php`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deactivate_user: true,
          user_id: 123,
        }),
      },
      10000,
    );

    const adminText = await adminDeactivateRes.text();
    console.log(`  Status: HTTP ${adminDeactivateRes.status}`);
    console.log(
      `  Response (first 300 chars):\n    ${adminText.slice(0, 300)}\n`,
    );

    if (adminDeactivateRes.ok) {
      console.log("  ✓ SUCCESS — User deactivated!");
    } else if (
      adminDeactivateRes.status === 401 ||
      adminText.includes("unauthorized")
    ) {
      console.log("  ⚠ Status 401 Unauthorized");
      console.log("     → Endpoint needs admin session auth");
    } else {
      console.log("  ✗ Endpoint error");
    }
  } catch (err) {
    console.log("\n  ✗ ERROR:", err.message);
    if (err.message.includes("abort")) {
      console.log("     → REQUEST TIMEOUT (backend hanging)");
      console.log("     → This is why you see 'Network Request Timed Out'");
      console.log(
        "     → Check PHP error logs for `/api/account-deactivate-self.php`",
      );
    }
  }
}

testDeactivateSelf();
