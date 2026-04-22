const BASE_URL = process.env.API_BASE_URL || "https://3-20-196-151.nip.io";

async function testAdminApproval() {
  console.log("Testing Admin Approval endpoint...\n");

  try {
    console.log("Step 1: Check JSON API endpoint for approvals...");
    const jsonRes = await fetch(
      `${BASE_URL}/api/admin-pending-orders.php`,
      { credentials: "include" }
    ).catch(e => ({ status: "error", message: e.message }));

    if (jsonRes.status === "error") {
      console.log(`  ✗ Error: ${jsonRes.message}\n`);
    } else {
      console.log(`  Status: ${jsonRes.status}\n`);
      const text = await jsonRes.text();
      console.log(`  Response (first 200 chars): ${text.substring(0, 200)}\n`);
    }

    console.log("Step 2: Check legacy HTML page...");
    const legacyRes = await fetch(
      `${BASE_URL}/admin/approvals.php`,
      { 
        credentials: "include",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
        }
      }
    );
    console.log(`  Status: ${legacyRes.status}`);
    const legacyText = await legacyRes.text();
    console.log(`  Content length: ${legacyText.length}`);
    console.log(`  Contains pending orders: ${legacyText.includes("ORD-")}`);
    console.log(`  Contains order form: ${legacyText.includes("order_id") || legacyText.includes("approve")}\n`);

    console.log("Step 3: Test legacy approval action (simulated POST)...");
    const approvalRes = await fetch(
      `${BASE_URL}/admin/approvals.php`,
      {
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
      }
    );
    console.log(`  POST Status: ${approvalRes.status}`);
    const approvalText = await approvalRes.text();
    console.log(`  Response contains error: ${approvalText.includes("error")}`);
    console.log(`  Response contains success: ${approvalText.includes("success") || approvalText.includes("Successfully")}`);
    console.log(`  Response (first 300 chars): ${approvalText.substring(0, 300)}\n`);

  } catch (error) {
    console.error("Error:", error.message);
  }
}

testAdminApproval();
