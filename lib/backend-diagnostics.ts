/**
 * Backend Connectivity Diagnostics
 *
 * This module helps identify and diagnose backend connectivity issues,
 * particularly with PHP session authentication and API endpoint timeouts.
 */

import Constants from "expo-constants";
import { getApiBaseUrl, getApiBaseUrlCandidates } from "./api-client";
import { getApiEndpoints } from "./backend-endpoints";

export interface DiagnosticResult {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  detail?: string;
  duration?: number;
}

/**
 * Simple health check - verifies the backend server is reachable
 */
export async function checkServerReachability(): Promise<DiagnosticResult> {
  const start = Date.now();
  const baseUrl = getApiBaseUrl();

  try {
    const response = await fetch(baseUrl, {
      method: "HEAD",
    });

    return {
      name: "Server Reachability",
      status: "pass",
      message: `Backend server is reachable at ${baseUrl}`,
      detail: `HTTP ${response.status}`,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name: "Server Reachability",
      status: "fail",
      message: `Cannot reach backend server at ${baseUrl}`,
      detail: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check if PHP login endpoint responds quickly (indicates session can be established)
 */
export async function checkPhpLoginEndpoint(): Promise<DiagnosticResult> {
  const start = Date.now();
  const endpoints = getApiEndpoints();

  try {
    // Don't actually log in - just check if endpoint responds
    const response = await fetch(endpoints.authLogin, {
      method: "OPTIONS",
    }).catch(() =>
      fetch(endpoints.authLogin, {
        method: "GET",
      }),
    );

    const duration = Date.now() - start;

    if (duration > 3000) {
      return {
        name: "PHP Login Endpoint Response Time",
        status: "warning",
        message:
          "Login endpoint responds slowly (may indicate DB connection issues)",
        detail: `Response time: ${duration}ms (threshold: 3000ms)`,
        duration,
      };
    }

    return {
      name: "PHP Login Endpoint Response Time",
      status: "pass",
      message: "Login endpoint responds quickly",
      detail: `Response time: ${duration}ms`,
      duration,
    };
  } catch (error) {
    return {
      name: "PHP Login Endpoint Response Time",
      status: "fail",
      message: "Login endpoint is not responding",
      detail: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

/**
 * Check if order creation endpoint is accessible (doesn't require auth to check headers)
 */
export async function checkOrderEndpointAccessibility(): Promise<DiagnosticResult> {
  const start = Date.now();
  const endpoints = getApiEndpoints();

  try {
    const response = await fetch(endpoints.customerCreateOrder, {
      method: "OPTIONS",
    }).catch(() =>
      fetch(endpoints.customerCreateOrder, {
        method: "GET",
      }),
    );

    const duration = Date.now() - start;

    if (duration > 2000) {
      return {
        name: "Order Endpoint Accessibility",
        status: "warning",
        message: "Order endpoint accessible but slow response",
        detail: `Response time: ${duration}ms. May hang during auth checks.`,
        duration,
      };
    }

    return {
      name: "Order Endpoint Accessibility",
      status: "pass",
      message: "Order endpoint is accessible",
      detail: `HTTP ${response.status} - ${duration}ms`,
      duration,
    };
  } catch (error) {
    return {
      name: "Order Endpoint Accessibility",
      status: "fail",
      message: "Order endpoint is not accessible",
      detail: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

/**
 * Get current API configuration for debugging
 */
export function getApiConfiguration() {
  return {
    baseUrl: getApiBaseUrl(),
    candidates: getApiBaseUrlCandidates(),
    endpoints: getApiEndpoints(),
    expoConfig: {
      apiBaseUrl: (
        Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined
      )?.apiBaseUrl,
    },
  };
}

/**
 * Comprehensive diagnostics report
 */
export interface DiagnosticsReport {
  timestamp: string;
  configuration: ReturnType<typeof getApiConfiguration>;
  checks: DiagnosticResult[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
    recommendation: string;
  };
}

/**
 * Run all diagnostic checks
 */
export async function runDiagnostics(): Promise<DiagnosticsReport> {
  const checks = await Promise.all([
    checkServerReachability(),
    checkPhpLoginEndpoint(),
    checkOrderEndpointAccessibility(),
  ]);

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warning").length;

  let recommendation = "All systems operational.";

  if (failed > 0) {
    recommendation =
      "Backend server is unreachable. Check if the PHP server is running (XAMPP, etc.).";
  } else if (warnings > 0) {
    recommendation =
      "Backend is slow or hanging. Check PHP database connections and query performance.";
  }

  return {
    timestamp: new Date().toISOString(),
    configuration: getApiConfiguration(),
    checks,
    summary: {
      passed,
      failed,
      warnings,
      recommendation,
    },
  };
}

/**
 * Format diagnostics report as readable text
 */
export function formatDiagnosticsReport(report: DiagnosticsReport): string {
  const lines = [
    "=== GLOBENTECH BACKEND DIAGNOSTICS ===",
    `Timestamp: ${report.timestamp}`,
    "",
    "API Configuration:",
    `  Base URL: ${report.configuration.baseUrl}`,
    `  Candidates: ${report.configuration.candidates.join(", ")}`,
    "",
    "Health Checks:",
  ];

  for (const check of report.checks) {
    const status =
      check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : "⚠";
    lines.push(`  ${status} ${check.name}: ${check.message}`);
    if (check.detail) {
      lines.push(`      Detail: ${check.detail}`);
    }
    if (check.duration) {
      lines.push(`      Duration: ${check.duration}ms`);
    }
  }

  lines.push("");
  lines.push("Summary:");
  lines.push(`  Passed: ${report.summary.passed}`);
  lines.push(`  Failed: ${report.summary.failed}`);
  lines.push(`  Warnings: ${report.summary.warnings}`);
  lines.push("");
  lines.push(`Recommendation: ${report.summary.recommendation}`);
  lines.push("");
  lines.push("Common Issues & Fixes:");
  lines.push("  1. PHP Server Not Running:");
  lines.push("     - Start XAMPP/WAMP and ensure Apache is running");
  lines.push("     - Verify Capstone-project folder exists in htdocs");
  lines.push("");
  lines.push("  2. Session Auth Timeout:");
  lines.push("     - Check PHP files for missing session_start()");
  lines.push("     - Verify database connection in PHP config");
  lines.push("     - Check PHP error logs for auth script hangs");
  lines.push("");
  lines.push("  3. Order/Deactivate Endpoints Time Out:");
  lines.push("     - These endpoints may have infinite loops in auth checks");
  lines.push("     - Look for missing error handling in PHP error logs");
  lines.push("     - Check if database queries are hanging");
  lines.push("");

  return lines.join("\n");
}
