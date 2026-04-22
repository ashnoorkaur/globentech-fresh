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

async function testFullAuthFlow() {
  console.log("=== Testing Full Admin Authentication Flow ===\n");

  let cookieStore = null;

  try {
    console.log("Step 1: Firebase Login...");
    const fbRes = await firebaseLogin("admin@globentech.com", "admin123");
    if (!fbRes.idToken) throw new Error("Firebase login failed");
    console.log("✓ Firebase authenticated\n");

    console.log("Step 2: PHP Login (establish session)...");
    const loginRes = await fetch(`${BASE_URL}/auth/login.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "include",
      body: new URLSearchParams({
        login: "1",
        email: "admin@globentech.com",
        password: "admin123",
      }).toString(),
    });
    console.log(`Status: ${loginRes.status}`);
    const loginText = await loginRes.text();
    console.log(`Login response contains 'password': ${loginText.includes('password')}`);
    console.log(`Login response contains 'Login': ${loginText.includes('Login')}`);
    console.log();

    console.log("Step 3: Try to GET admin approvals page (GET)...");
    const approvalsRes = await fetch(`${BASE_URL}/admin/approvals.php`, {
      credentials: "include",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
      }
    });
    console.log(`Status: ${approvalsRes.status}`);
    const approvalsText = await approvalsRes.text();
    console.log(`Contains 'ORD-': ${approvalsText.includes('ORD-')}`);
    console.log(`Contains 'password': ${approvalsText.includes('password')}`);
    console.log(`Contains 'approve': ${approvalsText.includes('approve')}`);
    console.log(`Length: ${approvalsText.length}`);
    
    // Try to detect if it's a login page
    const titleMatch = approvalsText.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      console.log(`Page title: "${titleMatch[1].trim()}"`);
    }
    console.log();

    console.log("Step 4: Try to POST approval action...");
    const approvalPostRes = await fetch(`${BASE_URL}/admin/approvals.php`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
      },
      body: new URLSearchParams({
        order_id: "999999",
        approve_order: "1"
      }).toString()
    });
    console.log(`POST Status: ${approvalPostRes.status}`);
    const approvalPostText = await approvalPostRes.text();
    console.log(`Response contains 'success': ${approvalPostText.includes('success')}`);
    console.log(`Response contains 'error': ${approvalPostText.includes('error')}`);
    const postTitleMatch = approvalPostText.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (postTitleMatch) {
      console.log(`Response page title: "${postTitleMatch[1].trim()}"`);
    }
    console.log(`Response length: ${approvalPostText.length}`);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

testFullAuthFlow();
