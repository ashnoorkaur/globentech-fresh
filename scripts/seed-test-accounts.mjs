/**
 * Seed script — creates 3 test accounts in Firebase Auth + Realtime Database.
 * Run once: npm run seed
 * Requires Node.js 18+ (native fetch).
 */

const API_KEY = "AIzaSyAqrrEiD7qMIWQ4Kduatkg5YOJUejYn0js";
const DB_URL = "https://globentech-e6551-default-rtdb.firebaseio.com";

const ACCOUNTS = [
  {
    email: "admin@globentech.com",
    password: "admin123",
    name: "Administrator",
    role: "admin",
  },
  {
    email: "tech@globentech.com",
    password: "tech123",
    name: "Technician",
    role: "technician",
  },
  {
    email: "customer@globentech.com",
    password: "customer123",
    name: "Customer",
    role: "customer",
  },
];

async function createAccount({ email, password, name, role }) {
  // 1. Create user via Firebase Auth REST API
  const signUpRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const signUpData = await signUpRes.json();

  if (signUpData.error) {
    if (signUpData.error.message === "EMAIL_EXISTS") {
      console.log(`  ⚠  Already exists: ${email}`);
      return;
    }
    throw new Error(`Auth error: ${signUpData.error.message}`);
  }

  const { localId: uid, idToken } = signUpData;

  // 2. Write user profile to Realtime Database
  const dbRes = await fetch(`${DB_URL}/users/${uid}.json?auth=${idToken}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid,
      name,
      email,
      phone: "",
      company: "",
      address: "",
      role,
      createdAt: new Date().toISOString(),
    }),
  });

  if (!dbRes.ok) {
    const body = await dbRes.text();
    throw new Error(`DB write failed (${dbRes.status}): ${body}`);
  }

  console.log(`  OK  Created: ${email}  [${role}]`);
}

async function main() {
  console.log("\nSeeding test accounts...\n");
  for (const account of ACCOUNTS) {
    try {
      await createAccount(account);
    } catch (err) {
      console.error(`  ERR  ${account.email} — ${err.message}`);
    }
  }
  console.log("\nDone.");
}

main();
