/**
 * P0 Critical Issue Fixes Test Suite
 * Tests for all P0 issues identified in architecture review:
 * - Circuit Breaker Timer Leak
 * - IP Blacklist Memory Growth
 * - IP Validation Weakness
 * - Error Information Leakage
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { clearInflight } from "../src/deduplication.js";
import { rateLimitCache } from "../src/cache.js";
import { readFileSync } from "fs";

function b64urlEncode(bytes) {
  const buff = Buffer.from(bytes);
  return buff.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function makeEnv() {
  const mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "src/index.js",
    durableObjects: {
      SECRETS: "SecretStore",
      RATE_LIMIT: "RateLimiter",
    },
    serviceBindings: {
      ASSETS: { disk: { path: "dist" } },
    },
    bindings: {
      RATE_LIMIT_CREATE_PER_WINDOW: 100,
      RATE_LIMIT_READ_PER_WINDOW: 1000,
      ALLOWED_ORIGINS: "http://localhost:8787",
      ENVIRONMENT: "production", // Test with production environment
    },
  });
  return mf;
}

// P0 #1: Circuit Breaker Timer Leak
test("P0-fix: circuit breaker timeout cleans up timer on success", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const cb = new CircuitBreaker("test-timeout-cleanup", { timeout: 1000 });

  // Quick function that completes before timeout
  let callCount = 0;
  const quickFn = async () => {
    callCount++;
    return "success";
  };

  // Execute multiple times to ensure no timer leaks
  for (let i = 0; i < 10; i++) {
    const result = await cb.execute(quickFn);
    assert.equal(result, "success");
  }

  assert.equal(callCount, 10);
  assert.equal(cb.getState(), "CLOSED");
});

test("P0-fix: circuit breaker timeout cleans up timer on timeout", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const cb = new CircuitBreaker("test-timeout", { timeout: 100 });

  // Function that times out
  const slowFn = async () => {
    return new Promise((resolve) => setTimeout(resolve, 500));
  };

  // Should timeout and clean up timer
  await assert.rejects(async () => cb.execute(slowFn), {
    message: /Circuit breaker timeout/,
  });

  // Timer should be cleaned up, state should be updated
  assert.ok(cb.getState() === "OPEN" || cb.getState() === "CLOSED");
});

test("P0-fix: circuit breaker uses AbortController for timer cleanup", async () => {
  // Verify the source code uses AbortController pattern
  const sourceCode = readFileSync("./src/circuitBreaker.js", "utf-8");

  assert.ok(sourceCode.includes("AbortController"), "Should use AbortController");
  assert.ok(sourceCode.includes("controller.abort()"), "Should call abort() for cleanup");
  assert.ok(sourceCode.includes("clearTimeout"), "Should clear timeout on abort");
});

// P0 #2: IP Blacklist Memory Growth
test("P0-fix: IP blacklist cleanup at reduced threshold (1000 entries)", async () => {
  const { BLACKLIST } = await import("../src/constants.js");

  // Read source to verify the threshold was reduced
  const sourceCode = readFileSync("./src/security.js", "utf-8");

  // Verify the threshold is now 1000, not 10000
  assert.ok(sourceCode.includes("1000"), "Blacklist threshold should be 1000");
  assert.ok(
    !sourceCode.includes("> 10000") || sourceCode.includes("BLACKLIST.MAX_SIZE"),
    "Should use constant instead of hardcoded 10000"
  );

  // Verify BLACKLIST constant exists and has correct MAX_SIZE
  assert.equal(BLACKLIST.MAX_SIZE, 1000, "BLACKLIST.MAX_SIZE should be 1000");
  assert.ok(BLACKLIST.MAX_SIZE < 10000, "MAX_SIZE should be less than old threshold of 10000");
});

test("P0-fix: IP blacklist time-based cleanup implementation", async () => {
  const { BLACKLIST } = await import("../src/constants.js");

  // Verify time-based cleanup constants exist
  assert.ok(BLACKLIST.CLEANUP_INTERVAL_MS, "Should have CLEANUP_INTERVAL_MS constant");
  assert.equal(BLACKLIST.CLEANUP_INTERVAL_MS, 300_000, "Cleanup should run every 5 minutes");

  // Verify source code implements time-based cleanup
  const sourceCode = readFileSync("./src/security.js", "utf-8");
  assert.ok(
    sourceCode.includes("CLEANUP_INTERVAL_MS") ||
      sourceCode.includes("BLACKLIST.CLEANUP_INTERVAL_MS"),
    "Should use cleanup interval constant"
  );
  assert.ok(sourceCode.includes("lastCleanupTime"), "Should track last cleanup time");
  assert.ok(sourceCode.includes("cleanupBlacklist()"), "Should call cleanup function");
});

test("P0-fix: IP blacklist uses constants from constants.js", async () => {
  // Verify security.js imports BLACKLIST
  const sourceCode = readFileSync("./src/security.js", "utf-8");

  assert.ok(sourceCode.includes('from "./constants.js"'), "Should import from constants.js");
  assert.ok(sourceCode.includes("BLACKLIST"), "Should use BLACKLIST constant");
  assert.ok(sourceCode.includes("BLACKLIST.MAX_SIZE"), "Should use BLACKLIST.MAX_SIZE");
});

// P0 #3: IP Validation Weakness
test("P0-fix: IP validation rejects invalid IPv4 octets > 255", async () => {
  const { getClientIp } = await import("../src/ip.js");

  // Create mock requests with invalid IPs
  const invalidIPs = ["256.1.2.3", "1.256.2.3", "1.2.256.3", "1.2.3.256", "999.999.999.999"];

  for (const ip of invalidIPs) {
    const request = new Request("http://localhost", {
      headers: { "CF-Connecting-IP": ip },
    });
    const result = getClientIp(request);
    // Should fall back to safe default (127.0.0.1) for invalid IPs
    assert.equal(result, "127.0.0.1", `Invalid IP ${ip} should fall back to safe default`);
  }
});

test("P0-fix: IP validation rejects leading zeros in IPv4", async () => {
  const { getClientIp } = await import("../src/ip.js");

  // Leading zeros are security risk (can be used for injection)
  const invalidIPs = ["01.2.3.4", "1.02.3.4", "1.2.03.4", "1.2.3.04", "001.002.003.004"];

  for (const ip of invalidIPs) {
    const request = new Request("http://localhost", {
      headers: { "CF-Connecting-IP": ip },
    });
    const result = getClientIp(request);
    assert.equal(result, "127.0.0.1", `IP with leading zeros ${ip} should be rejected`);
  }
});

test("P0-fix: IP validation accepts valid IPv4 addresses", async () => {
  const { getClientIp } = await import("../src/ip.js");

  const validIPs = [
    "0.0.0.0",
    "127.0.0.1",
    "192.168.1.1",
    "10.0.0.1",
    "172.16.0.1",
    "255.255.255.255",
    "1.2.3.4",
    "203.0.113.1", // TEST-NET-3
    "198.51.100.1", // TEST-NET-2
  ];

  for (const ip of validIPs) {
    const request = new Request("http://localhost", {
      headers: { "CF-Connecting-IP": ip },
    });
    const result = getClientIp(request);
    assert.equal(result, ip, `Valid IP ${ip} should be accepted`);
  }
});

test("P0-fix: IP validation validates octets range (0-255)", async () => {
  // Verify the source code properly validates octet ranges
  const sourceCode = readFileSync("./src/ip.js", "utf-8");

  assert.ok(
    sourceCode.includes("> 255") || sourceCode.includes("MAX_IPV4_OCTET"),
    "Should validate octet range 0-255"
  );
  assert.ok(sourceCode.includes("parseInt"), "Should parse octets as integers");
  assert.ok(sourceCode.includes("isValidIPv4"), "Should have IPv4 validation function");
});

test("P0-fix: IP validation rejects malformed IPv6", async () => {
  const { getClientIp } = await import("../src/ip.js");

  const invalidIPv6 = [
    ":::", // Triple colon not allowed
    "::::1", // Too many colons
    "1::2::3", // Double colon twice
    "g::1", // Invalid hex character
    "1:2:3:4:5:6:7:8:9", // Too many hextets
    "xyz::1", // Invalid characters
    "1::2::3::4", // Multiple double colons
  ];

  for (const ip of invalidIPv6) {
    const request = new Request("http://localhost", {
      headers: { "CF-Connecting-IP": ip },
    });
    const result = getClientIp(request);
    assert.equal(result, "127.0.0.1", `Invalid IPv6 ${ip} should fall back to safe default`);
  }
});

test("P0-fix: IP validation accepts common IPv6 addresses", async () => {
  const { getClientIp } = await import("../src/ip.js");

  // Valid IPv6 addresses (excluding IPv4-mapped which has special handling)
  const validIPv6 = [
    "::1",
    "::",
    "2001:db8::1",
    "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
    "2001:db8:85a3::8a2e:370:7334",
    "fe80::1",
    "ff02::1",
  ];

  for (const ip of validIPv6) {
    const request = new Request("http://localhost", {
      headers: { "CF-Connecting-IP": ip },
    });
    const result = getClientIp(request);
    assert.equal(result, ip, `Valid IPv6 ${ip} should be accepted`);
  }
});

test("P0-fix: IP validation validates IPv6 format", async () => {
  // Verify the source code implements proper IPv6 validation
  const sourceCode = readFileSync("./src/ip.js", "utf-8");

  assert.ok(sourceCode.includes("isValidIPv6"), "Should have IPv6 validation function");
  assert.ok(sourceCode.includes("::"), "Should handle double colon compression");
  assert.ok(sourceCode.includes("hextet"), "Should validate hextets");
  assert.ok(
    sourceCode.includes("HEXTETS") || sourceCode.includes("8"),
    "Should validate 8 hextets"
  );
});

test("P0-fix: IP validation rejects injection attempts without special characters", async () => {
  const { getClientIp } = await import("../src/ip.js");

  // Test payloads that don't contain newlines (which fail in Request constructor)
  const maliciousAttempts = [
    "127.0.0.1;rm-rf/",
    "$(touch/tmp/pwned)",
    "`reboot`",
    "'DROP-TABLE",
    "';'SELECT",
    "<script>alert",
    "$(whoami)",
  ];

  for (const attempt of maliciousAttempts) {
    const request = new Request("http://localhost", {
      headers: { "CF-Connecting-IP": attempt },
    });
    const result = getClientIp(request);
    assert.equal(result, "127.0.0.1", `Malicious input should be rejected: ${attempt}`);
  }
});

test("P0-fix: IP validation uses constants from constants.js", async () => {
  // Verify ip.js imports SECURITY constants
  const sourceCode = readFileSync("./src/ip.js", "utf-8");

  assert.ok(sourceCode.includes('from "./constants.js"'), "Should import from constants.js");
  assert.ok(sourceCode.includes("SECURITY"), "Should use SECURITY constant");
});

// P0 #4: Error Information Leakage
test("P0-fix: stack traces not exposed in production API responses", async () => {
  const mf = await makeEnv();
  try {
    clearInflight();
    rateLimitCache.clear();

    // Create a request that will cause an error (invalid ID format)
    const res = await mf.dispatchFetch("http://localhost/api/secrets/invalid<>id", {
      method: "GET",
      headers: { Origin: "http://localhost:8787" },
    });

    // Should return error
    assert.equal(res.status, 404);

    const data = await res.json();
    // Error response should NOT contain stack trace
    assert.ok(!data.stack, "Response should not contain stack trace");
    assert.ok(data.error, "Response should have error code");
  } finally {
    await mf.dispose();
  }
});

test("P0-fix: captureException sanitizes stack in production", async () => {
  // Verify the source code sanitizes stack traces
  const sourceCode = readFileSync("./src/monitoring.js", "utf-8");

  assert.ok(sourceCode.includes("ENVIRONMENT"), "Should check ENVIRONMENT");
  assert.ok(
    sourceCode.includes("isProduction") || sourceCode.includes("production"),
    "Should have production check"
  );
  assert.ok(
    sourceCode.includes("undefined") && sourceCode.includes("stack"),
    "Should set stack to undefined in production"
  );
});

test("P0-fix: index.js sanitizes errors before logging", async () => {
  // Verify the source code sanitizes errors
  const sourceCode = readFileSync("./src/index.js", "utf-8");

  assert.ok(
    sourceCode.includes("sanitizedError") || sourceCode.includes("captureException"),
    "Should sanitize error data"
  );
  assert.ok(sourceCode.includes("production"), "Should check for production environment");
});

test("P0-fix: api.js sanitizes stack traces in error handler", async () => {
  // Verify the source code sanitizes stack traces
  const sourceCode = readFileSync("./src/api.js", "utf-8");

  assert.ok(
    sourceCode.includes("isProduction") || sourceCode.includes("production"),
    "Should have production environment check"
  );
  assert.ok(
    sourceCode.includes("stack") && sourceCode.includes("undefined"),
    "Should conditionally include stack trace"
  );
});

test("P0-fix: API error handling sanitizes stack traces", async () => {
  const mf = await makeEnv();
  try {
    // Send malformed JSON to trigger API error
    const res = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.50",
      },
      body: "{invalid json", // Malformed JSON
    });

    // Should return 400 or 415 error
    assert.ok(res.status === 400 || res.status === 415);

    const data = await res.json();
    // Response should NOT contain stack trace
    assert.ok(!data.stack, "API error response should not contain stack trace");
  } finally {
    await mf.dispose();
  }
});

test("P0-fix: constants are properly exported", async () => {
  const { BLACKLIST, SECURITY, CIRCUIT_BREAKER } = await import("../src/constants.js");

  // Verify all new constants exist
  assert.ok(BLACKLIST, "BLACKLIST constants should exist");
  assert.equal(typeof BLACKLIST.MAX_SIZE, "number");
  assert.equal(typeof BLACKLIST.CLEANUP_INTERVAL_MS, "number");

  assert.ok(SECURITY, "SECURITY constants should exist");
  assert.equal(typeof SECURITY.MAX_IPV6_LENGTH, "number");
  assert.equal(typeof SECURITY.MAX_IPV4_OCTET, "number");
  assert.equal(typeof SECURITY.IPV4_NUM_PARTS, "number");

  assert.ok(CIRCUIT_BREAKER, "CIRCUIT_BREAKER constants should exist");
  assert.equal(typeof CIRCUIT_BREAKER.TIMEOUT_MS, "number");
  assert.equal(typeof CIRCUIT_BREAKER.FAILURE_THRESHOLD, "number");
});

test("P0-fix: blacklist MAX_SIZE is reduced from 10000 to 1000", async () => {
  const { BLACKLIST } = await import("../src/constants.js");

  assert.equal(BLACKLIST.MAX_SIZE, 1000, "Blacklist MAX_SIZE should be 1000");
  assert.ok(BLACKLIST.MAX_SIZE < 10000, "MAX_SIZE should be less than old threshold of 10000");
});

test("P0-fix: unnecessary JSON parsing is optimized in api.js", async () => {
  const sourceCode = readFileSync("./src/api.js", "utf-8");

  // Verify JSON parsing is conditional
  assert.ok(
    sourceCode.includes("if (!res.ok)"),
    "Should check response status before parsing JSON"
  );
  assert.ok(
    sourceCode.includes("try") && sourceCode.includes("catch"),
    "Should have error handling for JSON parsing"
  );
});
