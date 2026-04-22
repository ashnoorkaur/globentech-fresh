const BASE_URL = process.env.API_BASE_URL || "https://3-20-196-151.nip.io";
const FIREBASE_API_KEY = "AIzaSyAqrrEiD7qMIWQ4Kduatkg5YOJUejYn0js";

async function firebaseLogin(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  return await res.json();
}

async function testAuthenticatedApproval() {
  console.log("Testing Admin Approval with Authentication...\n");

  try {
    console.log("Step 1: Firebase Login as admin...");
    const loginRes = await firebaseLogin(
      "admin@globentech.com",
      "admin123"
    );
    if (!loginRes.idToken) {
      throw new Error("Firebase login failed: " + JSON.stringify(loginRes));
    }
    console.log("  ✓ Firebase Auth successful\n");
    console.log(`  Token: ${loginRes.idToken.substring(0, 50)}...\n`);

    console.log("Step 2: Try JSON API with token...");
    const jsonRes = await fetch(
      `${BASE_URL}/api/admin-pending-orders.php`,
      {
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${loginRes.idToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`  Status: ${jsonRes.status}`);
    const jsonText = await jsonRes.text();
    console.log(`  Response: ${jsonText.substring(0, 300)}\n`);

    console.log("Step 3: Check backend session endpoint...");
    const sessionRes = await fetch(
      `${BASE_URL}/api/auth-session.php`,
      {
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${loginRes.idToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`  Status: ${sessionRes.status}`);
    const sessionText = await sessionRes.text();
    console.log(`  Response: ${sessionText.substring(0, 300)}\n`);

    console.log("Step 4: Try approval action with token...");
    const approvalRes = await fetch(
      `${BASE_URL}/api/admin-approve-order.php`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${loginRes.idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          order_id: 999999,
          approve_order: true
        })
      }
    );
    console.log(`  Status: ${approvalRes.status}`);
    const approvalText = await approvalRes.text();
    console.log(`  Response: ${approvalText.substring(0, 400)}\n`);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

testAuthenticatedApproval();
