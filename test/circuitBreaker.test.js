/**
 * Circuit Breaker tests for volatile.sh
 * Tests circuit breaker pattern implementation
 */

import test from "node:test";
import assert from "node:assert/strict";

test("circuitBreaker: allows requests when closed", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", { failureThreshold: 3 });

  const result = await breaker.execute(() => Promise.resolve("ok"));
  assert.equal(result, "ok");
  assert.equal(breaker.getState(), "CLOSED");
});

test("circuitBreaker: opens after threshold failures", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", { failureThreshold: 3 });

  for (let i = 0; i < 3; i++) {
    await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  }

  assert.equal(breaker.getState(), "OPEN");

  await assert.rejects(
    () => breaker.execute(() => Promise.resolve("ok")),
    /Circuit breaker is OPEN/
  );
});

test("circuitBreaker: enters half-open after timeout", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", {
    failureThreshold: 2,
    resetTimeout: 100,
  });

  for (let i = 0; i < 2; i++) {
    await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  }

  assert.equal(breaker.getState(), "OPEN");

  await new Promise((resolve) => setTimeout(resolve, 150));

  await breaker.execute(() => Promise.resolve("ok"));
  assert.equal(breaker.getState(), "HALF_OPEN");
});

test("circuitBreaker: closes after successful requests in half-open", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", {
    failureThreshold: 2,
    successThreshold: 2,
    resetTimeout: 100,
  });

  for (let i = 0; i < 2; i++) {
    await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  }

  await new Promise((resolve) => setTimeout(resolve, 150));

  await breaker.execute(() => Promise.resolve("ok"));
  await breaker.execute(() => Promise.resolve("ok"));

  assert.equal(breaker.getState(), "CLOSED");
});

test("circuitBreaker: times out long-running operations", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", { timeout: 100 });

  await assert.rejects(
    () => breaker.execute(() => new Promise((resolve) => setTimeout(resolve, 200))),
    /Circuit breaker timeout/
  );
});

test("circuitBreaker: timeout counts as failure", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", {
    failureThreshold: 2,
    timeout: 50,
  });

  // First timeout
  await breaker.execute(() => new Promise((resolve) => setTimeout(resolve, 100))).catch(() => {});

  // Second timeout should open circuit
  await breaker.execute(() => new Promise((resolve) => setTimeout(resolve, 100))).catch(() => {});

  assert.equal(breaker.getState(), "OPEN");
});

test("circuitBreaker: reset method closes circuit", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", { failureThreshold: 2 });

  // Open the circuit
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});

  assert.equal(breaker.getState(), "OPEN");

  // Reset
  breaker.reset();

  assert.equal(breaker.getState(), "CLOSED");

  // Should allow requests again
  const result = await breaker.execute(() => Promise.resolve("ok"));
  assert.equal(result, "ok");
});

test("circuitBreaker: failure count resets on success", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", { failureThreshold: 3 });

  // Two failures
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});

  assert.equal(breaker.getState(), "CLOSED");

  // Success resets count
  await breaker.execute(() => Promise.resolve("ok"));

  // Need 3 more failures to open
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});

  assert.equal(breaker.getState(), "OPEN");
});

test("circuitBreaker: half-open reopens on failure", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", {
    failureThreshold: 2,
    successThreshold: 3,
    resetTimeout: 100,
  });

  // Open circuit
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});

  assert.equal(breaker.getState(), "OPEN");

  // Wait for half-open
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Success in half-open
  await breaker.execute(() => Promise.resolve("ok"));
  assert.equal(breaker.getState(), "HALF_OPEN");

  // Failure in half-open should reopen
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});

  assert.equal(breaker.getState(), "OPEN");
});

test("circuitBreaker: global circuitBreakers instance", async () => {
  const { circuitBreakers } = await import("../src/circuitBreaker.js");

  assert.ok(circuitBreakers.secrets);
  assert.ok(circuitBreakers.rateLimit);

  assert.equal(circuitBreakers.secrets.name, "SecretStore");
  assert.equal(circuitBreakers.rateLimit.name, "RateLimiter");
});

test("circuitBreaker: custom options", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("custom", {
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 5000,
    resetTimeout: 30000,
  });

  // Should not open until 10 failures
  for (let i = 0; i < 9; i++) {
    await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  }

  assert.equal(breaker.getState(), "CLOSED");

  // 10th failure opens it
  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});

  assert.equal(breaker.getState(), "OPEN");
});

test("circuitBreaker: handles synchronous exceptions", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", { failureThreshold: 2 });

  // Synchronous throw
  await assert.rejects(
    () =>
      breaker.execute(() => {
        throw new Error("sync error");
      }),
    /sync error/
  );

  assert.equal(breaker.getState(), "CLOSED"); // One failure

  await assert.rejects(
    () =>
      breaker.execute(() => {
        throw new Error("sync error");
      }),
    /sync error/
  );

  assert.equal(breaker.getState(), "OPEN"); // Two failures
});

test("circuitBreaker: getState returns current state", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");
  const breaker = new CircuitBreaker("test", { failureThreshold: 2 });

  assert.equal(breaker.getState(), "CLOSED");

  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  assert.equal(breaker.getState(), "CLOSED");

  await breaker.execute(() => Promise.reject(new Error("fail"))).catch(() => {});
  assert.equal(breaker.getState(), "OPEN");
});
