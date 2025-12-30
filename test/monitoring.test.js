/**
 * Monitoring module unit tests
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  log,
  captureException,
  MetricsCollector,
  createRequestContext,
  trackMetric,
  getBusinessMetrics,
  resetMetrics,
} from "../src/monitoring.js";

// =============================================================================
// log Tests
// =============================================================================

test("log: outputs structured JSON", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    log("info", "Test message");

    assert.equal(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.level, "info");
    assert.equal(parsed.message, "Test message");
    assert.ok(parsed.timestamp);
  } finally {
    console.log = originalLog;
  }
});

test("log: includes context in output", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    log("error", "Error occurred", { requestId: "req-123", path: "/api/test" });

    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.requestId, "req-123");
    assert.equal(parsed.path, "/api/test");
  } finally {
    console.log = originalLog;
  }
});

test("log: supports all log levels", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    log("debug", "Debug");
    log("info", "Info");
    log("warn", "Warning");
    log("error", "Error");

    assert.equal(logs.length, 4);

    const levels = logs.map((l) => JSON.parse(l).level);
    assert.deepEqual(levels, ["debug", "info", "warn", "error"]);
  } finally {
    console.log = originalLog;
  }
});

test("log: timestamp is ISO format", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    log("info", "Test");

    const parsed = JSON.parse(logs[0]);
    const timestamp = new Date(parsed.timestamp);
    assert.ok(!isNaN(timestamp.getTime()));
  } finally {
    console.log = originalLog;
  }
});

// =============================================================================
// captureException Tests
// =============================================================================

test("captureException: logs error message", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const error = new Error("Test error");
    await captureException(error);

    assert.ok(logs.length >= 1);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.level, "error");
    assert.equal(parsed.error, "Test error");
  } finally {
    console.log = originalLog;
  }
});

test("captureException: includes context", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const error = new Error("Test error");
    await captureException(error, { userId: "user-123" });

    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.userId, "user-123");
  } finally {
    console.log = originalLog;
  }
});

test("captureException: includes stack in non-production", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const error = new Error("Test error");
    await captureException(error, {}, { ENVIRONMENT: "development" });

    const parsed = JSON.parse(logs[0]);
    assert.ok(parsed.stack);
  } finally {
    console.log = originalLog;
  }
});

test("captureException: excludes stack in production", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const error = new Error("Test error");
    await captureException(error, {}, { ENVIRONMENT: "production" });

    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.stack, undefined);
  } finally {
    console.log = originalLog;
  }
});

test("captureException: handles errors without stack", async (t) => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const error = { message: "Plain object error" };
    await captureException(error);

    assert.ok(logs.length >= 1);
  } finally {
    console.log = originalLog;
  }
});

// =============================================================================
// MetricsCollector Tests
// =============================================================================

test("MetricsCollector: timing records values", () => {
  const collector = new MetricsCollector();

  collector.timing("response_time", 100);
  collector.timing("response_time", 200);
  collector.timing("response_time", 150);

  assert.ok(collector.metrics.size >= 1);
});

test("MetricsCollector: increment counts correctly", () => {
  const collector = new MetricsCollector();

  collector.increment("requests");
  collector.increment("requests");
  collector.increment("requests", 5);

  // Verify internal state
  const key = "requests:" + JSON.stringify({});
  const metric = collector.metrics.get(key);
  assert.deepEqual(metric.values, [1, 1, 5]);
});

test("MetricsCollector: gauge records value", () => {
  const collector = new MetricsCollector();

  collector.gauge("memory_usage", 1024);
  collector.gauge("memory_usage", 2048);

  const key = "memory_usage:" + JSON.stringify({});
  const metric = collector.metrics.get(key);
  assert.deepEqual(metric.values, [1024, 2048]);
});

test("MetricsCollector: supports tags", () => {
  const collector = new MetricsCollector();

  collector.increment("requests", 1, { method: "GET" });
  collector.increment("requests", 1, { method: "POST" });
  collector.increment("requests", 1, { method: "GET" });

  // Should have two different metric entries
  assert.equal(collector.metrics.size, 2);
});

test("MetricsCollector: flush outputs metrics", () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const collector = new MetricsCollector();

    collector.timing("response_time", 100);
    collector.timing("response_time", 200);
    collector.increment("requests", 5);

    collector.flush();

    // Should have logged metrics
    assert.ok(logs.length >= 2);

    // Metrics should be cleared after flush
    assert.equal(collector.metrics.size, 0);
  } finally {
    console.log = originalLog;
  }
});

test("MetricsCollector: timing flush calculates min/max/avg", () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const collector = new MetricsCollector();

    collector.timing("response_time", 100);
    collector.timing("response_time", 200);
    collector.timing("response_time", 300);

    collector.flush();

    const timingLog = logs.find((l) => JSON.parse(l).message === "response_time");
    const parsed = JSON.parse(timingLog);

    assert.equal(parsed.value.min, 100);
    assert.equal(parsed.value.max, 300);
    assert.equal(parsed.value.avg, 200);
    assert.equal(parsed.value.count, 3);
  } finally {
    console.log = originalLog;
  }
});

test("MetricsCollector: counter flush sums values", () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const collector = new MetricsCollector();

    collector.increment("requests", 1);
    collector.increment("requests", 2);
    collector.increment("requests", 3);

    collector.flush();

    const counterLog = logs.find((l) => JSON.parse(l).message === "requests");
    const parsed = JSON.parse(counterLog);

    assert.equal(parsed.value, 6);
  } finally {
    console.log = originalLog;
  }
});

// =============================================================================
// createRequestContext Tests
// =============================================================================

test("createRequestContext: extracts request info", () => {
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "User-Agent": "TestAgent/1.0",
      "CF-Ray": "abc123",
      "CF-IPCountry": "US",
    },
  });

  const context = createRequestContext(request);

  assert.ok(context.requestId);
  assert.equal(context.method, "POST");
  assert.equal(context.path, "/api/test");
  assert.equal(context.userAgent, "TestAgent/1.0");
  assert.equal(context.cfRay, "abc123");
  assert.equal(context.cfCountry, "US");
});

test("createRequestContext: handles missing headers", () => {
  const request = new Request("http://localhost/api/test", {
    method: "GET",
  });

  const context = createRequestContext(request);

  assert.equal(context.userAgent, "unknown");
  assert.equal(context.cfRay, "unknown");
  assert.equal(context.cfCountry, "unknown");
});

test("createRequestContext: generates unique requestIds", () => {
  const request1 = new Request("http://localhost/test");
  const request2 = new Request("http://localhost/test");

  const ctx1 = createRequestContext(request1);
  const ctx2 = createRequestContext(request2);

  assert.notEqual(ctx1.requestId, ctx2.requestId);
});

// =============================================================================
// trackMetric and getBusinessMetrics Tests
// =============================================================================

test("trackMetric: tracks create attempts", () => {
  resetMetrics();

  trackMetric("create", "attempt");
  trackMetric("create", "attempt");

  const metrics = getBusinessMetrics();
  assert.equal(metrics.create.attempts, 2);
});

test("trackMetric: tracks create successes", () => {
  resetMetrics();

  trackMetric("create", "success");
  trackMetric("create", "success");
  trackMetric("create", "success");

  const metrics = getBusinessMetrics();
  assert.equal(metrics.create.successes, 3);
});

test("trackMetric: tracks create failures", () => {
  resetMetrics();

  trackMetric("create", "failure");

  const metrics = getBusinessMetrics();
  assert.equal(metrics.create.failures, 1);
});

test("trackMetric: tracks read operations", () => {
  resetMetrics();

  // Each call to trackMetric increments attempts, plus success/failure
  trackMetric("read", "success");
  trackMetric("read", "failure");

  const metrics = getBusinessMetrics();
  // Two calls = 2 attempts
  assert.equal(metrics.read.attempts, 2);
  assert.equal(metrics.read.successes, 1);
  assert.equal(metrics.read.failures, 1);
});

test("getBusinessMetrics: calculates success rate", () => {
  resetMetrics();

  trackMetric("create", "success");
  trackMetric("create", "success");
  trackMetric("create", "success");
  trackMetric("create", "success");
  trackMetric("create", "failure");

  const metrics = getBusinessMetrics();
  assert.equal(metrics.create.attempts, 5);
  assert.equal(metrics.create.successRate, "80.00%");
});

test("getBusinessMetrics: returns N/A for zero attempts", () => {
  resetMetrics();

  const metrics = getBusinessMetrics();
  assert.equal(metrics.create.successRate, "N/A");
  assert.equal(metrics.read.successRate, "N/A");
});

test("getBusinessMetrics: includes uptime info", () => {
  resetMetrics();

  // Small delay to ensure uptime > 0
  const metrics = getBusinessMetrics();

  assert.ok(metrics.uptime.ms >= 0);
  assert.ok(metrics.uptime.seconds >= 0);
  assert.ok(typeof metrics.uptime.formatted === "string");
});

test("getBusinessMetrics: includes error info", () => {
  resetMetrics();

  const metrics = getBusinessMetrics();

  assert.ok(metrics.errors !== undefined);
  assert.equal(typeof metrics.errors.recentCount, "number");
  assert.equal(typeof metrics.errors.windowMs, "number");
});

// =============================================================================
// resetMetrics Tests
// =============================================================================

test("resetMetrics: clears all metrics", () => {
  // Add some metrics
  trackMetric("create", "success");
  trackMetric("create", "success");
  trackMetric("read", "success");
  trackMetric("read", "failure");

  // Verify they exist
  let metrics = getBusinessMetrics();
  assert.ok(metrics.create.successes > 0 || metrics.read.successes > 0);

  // Reset
  resetMetrics();

  // Verify cleared
  metrics = getBusinessMetrics();
  assert.equal(metrics.create.attempts, 0);
  assert.equal(metrics.create.successes, 0);
  assert.equal(metrics.create.failures, 0);
  assert.equal(metrics.read.attempts, 0);
  assert.equal(metrics.read.successes, 0);
  assert.equal(metrics.read.failures, 0);
});

test("resetMetrics: updates lastReset time", () => {
  resetMetrics();
  const before = Date.now();

  // Small delay
  resetMetrics();

  const metrics = getBusinessMetrics();
  assert.ok(metrics.uptime.ms < 100); // Should be very small after reset
});

// =============================================================================
// Edge Cases
// =============================================================================

test("trackMetric: ignores unknown operations", () => {
  resetMetrics();

  trackMetric("unknown", "success");

  const metrics = getBusinessMetrics();
  assert.equal(metrics.create.successes, 0);
  assert.equal(metrics.read.successes, 0);
});

test("trackMetric: ignores unknown statuses", () => {
  resetMetrics();

  trackMetric("create", "unknown");

  const metrics = getBusinessMetrics();
  // attempt is incremented
  assert.equal(metrics.create.attempts, 1);
  // but success/failure are not
  assert.equal(metrics.create.successes, 0);
  assert.equal(metrics.create.failures, 0);
});

test("MetricsCollector: flush with empty metrics does nothing", () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const collector = new MetricsCollector();
    collector.flush();

    assert.equal(logs.length, 0);
  } finally {
    console.log = originalLog;
  }
});
