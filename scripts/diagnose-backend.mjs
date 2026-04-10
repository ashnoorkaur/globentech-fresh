#!/usr/bin/env node

/**
 * GlobenTech Backend Diagnostics & Health Check
 *
 * Run this script to diagnose backend connectivity issues:
 *   node scripts/diagnose-backend.mjs
 *
 * This tool will:
 * 1. Check if PHP server is reachable
 * 2. Test endpoint response times
 * 3. Verify session authentication works
 * 4. Identify timeout-causing endpoints
 * 5. Provide remediation steps for common issues
 */

import fs from "fs";
import fetch from "node-fetch";

const API_BASE =
  process.env.API_BASE_URL || "http://localhost/Capstone-project";
const ENDPOINTS = {
  login: "/login.php",
  createOrder: "/api/customer-create-order.php",
  deactivateAccount: "/api/account-deactivate-self.php",
  contactForm: "/api/contact-send.php",
  adminQueue: "/api/admin-pending-orders.php",
};

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(msg, color = "reset") {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function logSection(title) {
  log("\n" + "=".repeat(60), "cyan");
  log(title, "cyan");
  log("=".repeat(60), "cyan");
}

async function checkServerReachability() {
  logSection("1. Server Reachability Check");
  const start = Date.now();

  try {
    log(`Testing: ${API_BASE}`, "blue");
    const response = await fetch(API_BASE, { method: "HEAD", timeout: 5000 });
    const duration = Date.now() - start;

    log(`✓ Server is reachable (${duration}ms)`, "green");
    return { status: "pass", duration };
  } catch (error) {
    log(`✗ Server is NOT reachable`, "red");
    log(
      `  Error: ${error instanceof Error ? error.message : String(error)}`,
      "red",
    );
    log("\n📋 Troubleshooting:", "yellow");
    log("  1. Is PHP server (XAMPP/WAMP) running?", "yellow");
    log("  2. Is the Capstone-project folder in htdocs?", "yellow");
    log("  3. Check Apache error logs for PHP errors", "yellow");
    return { status: "fail", duration: Date.now() - start };
  }
}

async function checkEndpointPerformance(name, endpoint) {
  const start = Date.now();

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "OPTIONS",
      timeout: 3000,
    }).catch(() =>
      fetch(`${API_BASE}${endpoint}`, { method: "GET", timeout: 3000 }),
    );

    const duration = Date.now() - start;
    const status = response.status;

    if (status === 404) {
      log(`✗ ${name}: HTTP 404 (endpoint not found)`, "red");
      return {
        status: "fail",
        duration,
        httpStatus: status,
        reason: "not_found",
      };
    }

    if (duration > 2000) {
      log(
        `⚠ ${name}: Slow response (${duration}ms) - May hang during execution`,
        "yellow",
      );
      return { status: "warning", duration, httpStatus: status };
    }

    log(`✓ ${name}: ${duration}ms (HTTP ${status})`, "green");
    return { status: "pass", duration, httpStatus: status };
  } catch (error) {
    const duration = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);

    // TimeoutError or AbortError indicates endpoint is hanging
    if (msg.includes("timeout") || msg.includes("abort")) {
      log(
        `✗ ${name}: TIMEOUT after ${duration}ms - endpoint is hanging!`,
        "red",
      );
      return { status: "fail", duration, reason: "timeout" };
    }

    log(`✗ ${name}: ${msg}`, "red");
    return { status: "fail", duration, reason: msg };
  }
}

async function checkEndpointPerformances() {
  logSection("2. Endpoint Performance Check");

  const results = {
    login: await checkEndpointPerformance("Login Endpoint", ENDPOINTS.login),
    createOrder: await checkEndpointPerformance(
      "Create Order Endpoint",
      ENDPOINTS.createOrder,
    ),
    deactivateAccount: await checkEndpointPerformance(
      "Deactivate Account Endpoint",
      ENDPOINTS.deactivateAccount,
    ),
    contactForm: await checkEndpointPerformance(
      "Contact Form Endpoint",
      ENDPOINTS.contactForm,
    ),
    adminQueue: await checkEndpointPerformance(
      "Admin Queue Endpoint",
      ENDPOINTS.adminQueue,
    ),
  };

  return results;
}

async function analyzeResults(serverCheck, endpointChecks) {
  logSection("3. Analysis & Recommendations");

  if (serverCheck.status === "fail") {
    log("\n❌ CRITICAL: PHP server is not reachable", "red");
    log("\n🔧 Suggested Fixes:", "yellow");
    log("  1. Start XAMPP/WAMP server", "blue");
    log("  2. Verify Apache is running", "blue");
    log("  3. Check PHP error logs", "blue");
    return;
  }

  const timeouts = Object.entries(endpointChecks)
    .filter(([_, result]) => result.reason === "timeout")
    .map(([endpoint]) => endpoint);

  const notFound = Object.entries(endpointChecks)
    .filter(([_, result]) => result.reason === "not_found")
    .map(([endpoint]) => endpoint);

  const slow = Object.entries(endpointChecks)
    .filter(([_, result]) => result.status === "warning")
    .map(([endpoint]) => endpoint);

  if (timeouts.length > 0) {
    log("\n⏱️ TIMEOUT DETECTED - These endpoints are hanging:", "red");
    timeouts.forEach((endpoint) => {
      log(`    • ${endpoint}`, "red");
    });

    log("\n🔧 Common Causes:", "yellow");
    log("  1. Missing session_start() in PHP script", "blue");
    log("  2. Infinite loop in authentication check", "blue");
    log("  3. Database query hanging or timing out", "blue");
    log("  4. Synchronous blocking call with no timeout", "blue");
    log("  5. File include/require failing silently", "blue");

    log("\n📝 Action Items:", "yellow");
    log("  A. Check PHP error logs:", "blue");
    log("     tail -f /var/log/apache2/error.log", "blue");
    log("     (or check XAMPP/WAMP logs)", "blue");
    log("  B. Add error logging to PHP scripts:", "blue");
    log('     error_log("Creating order - Starting auth check", 0);', "blue");
    log("  C. Verify database connection in config", "blue");
    log("  D. Review these PHP files:", "blue");
    for (const endpoint of timeouts) {
      log(`     • ${endpoint}`, "blue");
    }
  }

  if (notFound.length > 0) {
    log("\n📛 MISSING ENDPOINTS (404):", "red");
    notFound.forEach((endpoint) => {
      log(`    • ${endpoint}`, "red");
    });
    log("\n🔧 Action Items:", "yellow");
    log("  1. Verify these PHP files exist in backend /api folder", "blue");
    log("  2. Check route names in backend-endpoints.ts match backend", "blue");
    log("  3. Ensure Apache document root points to Capstone-project", "blue");
  }

  if (slow.length > 0) {
    log("\n🐢 SLOW ENDPOINTS (>2s):", "yellow");
    slow.forEach((endpoint) => {
      log(`    • ${endpoint}`, "yellow");
    });
    log(
      "  These are slow but functional. Optimize database queries.",
      "yellow",
    );
  }

  if (timeouts.length === 0 && slow.length === 0 && notFound.length === 0) {
    log("\n✅ All endpoints are responding normally!", "green");
    log("  If you're still experiencing issues in the app:", "yellow");
    log("  1. Check browser Network tab for request details", "blue");
    log("  2. Verify session cookies are being set", "blue");
    log("  3. Check app console for error messages", "blue");
  }
}

async function createDiagnosticReport(serverCheck, endpointChecks) {
  const report = {
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    serverStatus: serverCheck.status,
    endpoints: endpointChecks,
    summary: {
      total: Object.keys(endpointChecks).length,
      passing: Object.values(endpointChecks).filter((r) => r.status === "pass")
        .length,
      warnings: Object.values(endpointChecks).filter(
        (r) => r.status === "warning",
      ).length,
      failures: Object.values(endpointChecks).filter((r) => r.status === "fail")
        .length,
    },
  };

  const filename = `diagnostics-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  log(`\n📄 Diagnostic report saved to: ${filename}`, "cyan");

  return report;
}

async function main() {
  log("\n🏥 GlobenTech Backend Diagnostics Tool", "cyan");
  log("Starting comprehensive backend health check...\n", "cyan");

  try {
    const serverCheck = await checkServerReachability();

    if (serverCheck.status === "fail") {
      await analyzeResults(serverCheck, {});
      process.exit(1);
    }

    const endpointChecks = await checkEndpointPerformances();
    await analyzeResults(serverCheck, endpointChecks);
    await createDiagnosticReport(serverCheck, endpointChecks);

    logSection("Diagnostics Complete");
    log("For detailed information, check the generated .json report", "cyan");
  } catch (error) {
    log(
      `\nFatal error during diagnostics: ${error instanceof Error ? error.message : String(error)}`,
      "red",
    );
    process.exit(1);
  }
}

main();
