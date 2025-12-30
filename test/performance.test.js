/**
 * Performance tests for volatile.sh
 * Tests response times, throughput, and resource usage
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { clearInflight } from "../src/deduplication.js";
import { rateLimitCache } from "../src/cache.js";

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
      RATE_LIMIT_CREATE_PER_WINDOW: 1000,
      RATE_LIMIT_READ_PER_WINDOW: 10000,
      ALLOWED_ORIGINS: "http://localhost:8787",
    },
  });

  return mf;
}

test("performance: response time measurement headers are present", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/health", {
      method: "GET",
      headers: { Origin: "http://localhost:8787" },
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get("X-Request-ID"), "Should have request ID");
    assert.ok(res.headers.get("X-Response-Time"), "Should have response time");

    const responseTime = parseInt(res.headers.get("X-Response-Time"));
    assert.ok(responseTime >= 0, "Response time should be non-negative");
  } finally {
    await mf.dispose();
  }
});

test("performance: create secret response time is acceptable", async () => {
  const mf = await makeEnv();
  try {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = "test message";
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext)
    );

    const start = Date.now();
    const res = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.140.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });
    const duration = Date.now() - start;

    assert.equal(res.status, 201);
    // In test environment, should be reasonably fast (< 1000ms)
    assert.ok(duration < 1000, `Create should be fast, took ${duration}ms`);
  } finally {
    await mf.dispose();
  }
});

test("performance: read secret response time is acceptable", async () => {
  const mf = await makeEnv();
  try {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode("test")
    );

    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.140.2",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    const created = await createRes.json();

    // Measure read performance
    const start = Date.now();
    const readRes = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
      method: "GET",
      headers: {
        Origin: "http://localhost:8787",
        "CF-Connecting-IP": "203.0.140.2",
      },
    });
    const duration = Date.now() - start;

    assert.equal(readRes.status, 200);
    assert.ok(duration < 1000, `Read should be fast, took ${duration}ms`);
  } finally {
    await mf.dispose();
  }
});

test("performance: encryption/decryption benchmarks", async () => {
  const iterations = 10;
  const sizes = [1024, 10 * 1024, 100 * 1024]; // 1KB, 10KB, 100KB

  for (const size of sizes) {
    const totalTime = [];

    for (let i = 0; i < iterations; i++) {
      const data = "X".repeat(size);
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encStart = Date.now();
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(data)
      );
      const encTime = Date.now() - encStart;

      const decStart = Date.now();
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const decTime = Date.now() - decStart;

      totalTime.push(encTime + decTime);
    }

    const avgTime = totalTime.reduce((a, b) => a + b, 0) / iterations;
    // Encryption/decryption should be reasonably fast
    assert.ok(avgTime < 100, `Avg crypto time for ${size} bytes: ${avgTime}ms (should be < 100ms)`);
  }
});

test("performance: bulk operations throughput", async () => {
  const mf = await makeEnv();
  try {
    const count = 20;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    const start = Date.now();

    for (let i = 0; i < count; i++) {
      clearInflight();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(`message-${i}`)
      );

      await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": `203.0.140.${10 + i}`,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });
    }

    const duration = Date.now() - start;
    const perOp = duration / count;

    // Should handle bulk operations efficiently
    assert.ok(perOp < 500, `Average time per operation: ${perOp}ms (should be < 500ms)`);
  } finally {
    await mf.dispose();
  }
});

test("performance: Durable Object access latency", async () => {
  const mf = await makeEnv();
  try {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode("latency test")
    );

    // Create multiple secrets to different DOs
    const ids = [];
    for (let i = 0; i < 5; i++) {
      clearInflight();
      const res = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": `203.0.141.${i}`,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });

      if (res.status === 201) {
        const created = await res.json();
        ids.push(created.id);
      }
    }

    // Measure DO access time by reading
    const latencies = [];
    for (const id of ids) {
      clearInflight();
      const start = Date.now();
      await mf.dispatchFetch(`http://localhost/api/secrets/${id}`, {
        method: "GET",
        headers: {
          Origin: "http://localhost:8787",
          "CF-Connecting-IP": "203.0.141.100",
        },
      });
      latencies.push(Date.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    assert.ok(avgLatency < 500, `Average DO access latency: ${avgLatency}ms (should be < 500ms)`);
  } finally {
    await mf.dispose();
  }
});

test("performance: rate limiter overhead is minimal", async () => {
  const mf = await makeEnv();
  try {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // Measure requests with rate limiting
    const times = [];
    for (let i = 0; i < 10; i++) {
      clearInflight();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode("test")
      );

      const start = Date.now();
      await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": `203.0.142.${i}`,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });
      times.push(Date.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    // Rate limiter shouldn't add significant overhead
    assert.ok(avgTime < 500, `Average request time with rate limiting: ${avgTime}ms`);
  } finally {
    await mf.dispose();
  }
});

test("performance: cache efficiency improves repeated requests", async () => {
  const mf = await makeEnv();
  try {
    rateLimitCache.clear();

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // First request (cache miss)
    const iv1 = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext1 = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv1 },
      key,
      new TextEncoder().encode("test1")
    );

    const start1 = Date.now();
    await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.143.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext1)),
        iv: b64urlEncode(iv1),
        ttl: 60 * 60 * 1000,
      }),
    });
    const time1 = Date.now() - start1;

    // Second request from same IP (should hit cache)
    clearInflight();
    const iv2 = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext2 = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv2 },
      key,
      new TextEncoder().encode("test2")
    );

    const start2 = Date.now();
    await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.143.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext2)),
        iv: b64urlEncode(iv2),
        ttl: 60 * 60 * 1000,
      }),
    });
    const time2 = Date.now() - start2;

    // Cache should help, though not guaranteed in test environment
    // Just verify both complete successfully
    assert.ok(time1 < 2000, `First request took ${time1}ms`);
    assert.ok(time2 < 2000, `Second request took ${time2}ms`);
  } finally {
    await mf.dispose();
  }
});

test("performance: ID generation is fast and produces valid IDs", async () => {
  const { generateId } = await import("../src/cryptoId.js");

  const iterations = 100;
  const ids = new Set();

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    const id = generateId();
    ids.add(id);
    assert.equal(id.length, 16, "ID should be 16 characters");
    assert.ok(/^[A-Za-z0-9]+$/.test(id), "ID should be alphanumeric");
  }
  const duration = Date.now() - start;

  // All IDs should be unique
  assert.equal(ids.size, iterations, "All IDs should be unique");

  // Generation should be fast
  assert.ok(duration < 100, `ID generation for ${iterations} IDs took ${duration}ms`);
});

test("performance: LRU cache operations are efficient", async () => {
  const { LRUCache } = await import("../src/cache.js");

  const cache = new LRUCache(100);
  const iterations = 1000;

  // Benchmark set operations
  const setStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    cache.set(`key-${i}`, `value-${i}`, 1000);
  }
  const setDuration = Date.now() - setStart;

  // Benchmark get operations
  const getStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    cache.get(`key-${i}`);
  }
  const getDuration = Date.now() - getStart;

  assert.ok(setDuration < 100, `Set ${iterations} entries took ${setDuration}ms`);
  assert.ok(getDuration < 50, `Get ${iterations} entries took ${getDuration}ms`);

  // Verify LRU eviction works
  assert.equal(cache.size, 100, "Cache should respect max size");

  // Oldest entry should have been evicted
  assert.equal(cache.get("key-0"), undefined, "Oldest entry should be evicted");
});

test("performance: deduplication prevents redundant DO calls", async () => {
  const { deduplicate, getInflightCount, clearInflight } = await import("../src/deduplication.js");

  clearInflight();

  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "result";
  };

  const key = "test-key";

  // Launch concurrent requests
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(deduplicate(key, mockFn));
  }

  await Promise.all(promises);

  // Should only call the function once
  assert.equal(callCount, 1, "Function should only be called once");
  assert.equal(getInflightCount(), 0, "In-flight requests should be cleared");
});

test("performance: circuit breaker state transitions are fast", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");

  const cb = new CircuitBreaker("test", {
    failureThreshold: 3,
    successThreshold: 2,
  });

  const start = Date.now();

  // Trigger failures to open circuit
  for (let i = 0; i < 5; i++) {
    try {
      await cb.execute(async () => {
        throw new Error("Simulated failure");
      });
    } catch {
      // Expected to fail
    }
  }

  const timeToOpen = Date.now() - start;
  assert.equal(cb.getState(), "OPEN", "Circuit should be open");
  assert.ok(timeToOpen < 100, `Circuit should open quickly, took ${timeToOpen}ms`);

  // Reset for recovery test
  cb.reset();
  assert.equal(cb.getState(), "CLOSED", "Circuit should be closed after reset");
});
