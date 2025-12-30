/**
 * Concurrency tests for volatile.sh
 * Tests concurrent request handling, deduplication, and race conditions
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { clearInflight, getInflightCount } from "../src/deduplication.js";
import { rateLimitCache } from "../src/cache.js";

function b64urlEncode(bytes) {
  const buff = Buffer.from(bytes);
  return buff.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return new Uint8Array(Buffer.from(s, "base64"));
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

test("concurrency: deduplicate prevents duplicate concurrent requests", async () => {
  const { deduplicate } = await import("../src/deduplication.js");

  clearInflight();

  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { id: "test-id", result: "success" };
  };

  const key = "test-concurrent-key";

  // Launch 10 concurrent requests
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(deduplicate(key, mockFn));
  }

  const results = await Promise.all(promises);

  // Should only call the function once
  assert.equal(callCount, 1, "Function should only be called once");
  assert.equal(results.length, 10, "Should return results for all requests");
  assert.equal(results[0].id, "test-id", "Result should be correct");
  assert.equal(getInflightCount(), 0, "In-flight requests should be cleared");
});

test("concurrency: different keys execute independently", async () => {
  const { deduplicate } = await import("../src/deduplication.js");

  clearInflight();

  const callLog = [];
  const createMockFn = (key) => async () => {
    callLog.push(key);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return key;
  };

  // Launch 5 concurrent requests with different keys
  const promises = [];
  const keys = ["key-1", "key-2", "key-3", "key-4", "key-5"];

  for (const key of keys) {
    // Each key gets 2 concurrent requests
    promises.push(deduplicate(key, createMockFn(key)));
    promises.push(deduplicate(key, createMockFn(key)));
  }

  await Promise.all(promises);

  // Each unique key should be called exactly once
  assert.equal(callLog.length, 5, "Each key should trigger one function call");
  assert.ok(callLog.includes("key-1"));
  assert.ok(callLog.includes("key-2"));
  assert.ok(callLog.includes("key-3"));
  assert.ok(callLog.includes("key-4"));
  assert.ok(callLog.includes("key-5"));
});

test("concurrency: concurrent secret creation with different IPs", async () => {
  const mf = await makeEnv();
  try {
    clearInflight();
    rateLimitCache.clear();

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // Create 10 secrets concurrently from different IPs
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(`concurrent-test-${i}`)
      );

      promises.push(
        mf.dispatchFetch("http://localhost/api/secrets", {
          method: "POST",
          headers: {
            Origin: "http://localhost:8787",
            "Content-Type": "application/json",
            "CF-Connecting-IP": `203.0.150.${i}`,
          },
          body: JSON.stringify({
            encrypted: b64urlEncode(new Uint8Array(ciphertext)),
            iv: b64urlEncode(iv),
            ttl: 60 * 60 * 1000,
          }),
        })
      );
    }

    const results = await Promise.all(promises);

    // All requests should succeed
    for (let i = 0; i < results.length; i++) {
      assert.equal(results[i].status, 201, `Request ${i} should succeed`);
    }

    // All IDs should be unique
    const ids = await Promise.all(results.map((r) => r.json()));
    const uniqueIds = new Set(ids.map((d) => d.id));
    assert.equal(uniqueIds.size, 10, "All IDs should be unique");
  } finally {
    await mf.dispose();
  }
});

test("concurrency: concurrent reads of different secrets", async () => {
  const mf = await makeEnv();
  try {
    clearInflight();
    rateLimitCache.clear();

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // First create 5 secrets
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(`secret-${i}`)
      );

      const res = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": `203.0.151.${i}`,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });

      if (res.status === 201) {
        const data = await res.json();
        ids.push(data.id);
      }
    }

    // Now read them concurrently
    clearInflight();
    const readPromises = ids.map((id) =>
      mf.dispatchFetch(`http://localhost/api/secrets/${id}`, {
        method: "GET",
        headers: {
          Origin: "http://localhost:8787",
          "CF-Connecting-IP": "203.0.151.100",
        },
      })
    );

    const readResults = await Promise.all(readPromises);

    // All reads should succeed
    for (let i = 0; i < readResults.length; i++) {
      assert.equal(readResults[i].status, 200, `Read ${i} should succeed`);
      const data = await readResults[i].json();
      assert.ok(data.encrypted, `Read ${i} should have encrypted data`);
      assert.ok(data.iv, `Read ${i} should have IV`);
    }
  } finally {
    await mf.dispose();
  }
});

test("concurrency: concurrent reads of the same secret - first wins, others get 404", async () => {
  const mf = await makeEnv();
  try {
    clearInflight();

    const plaintext = "concurrent test";
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext)
    );

    // Create secret
    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.100",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    // Simulate 5 concurrent reads
    const reads = await Promise.all(
      Array(5)
        .fill(null)
        .map(() =>
          mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
            method: "GET",
            headers: {
              Origin: "http://localhost:8787",
              "CF-Connecting-IP": "203.0.113.100",
            },
          })
        )
    );

    const statuses = reads.map((r) => r.status);

    // Exactly one should succeed (200), others should fail (404)
    const successCount = statuses.filter((s) => s === 200).length;
    const notFoundCount = statuses.filter((s) => s === 404).length;

    assert.equal(successCount, 1, "Exactly one read should succeed");
    assert.equal(notFoundCount, 4, "Four reads should return 404");

    // Verify the successful response can be decrypted
    const successResponse = reads.find((r) => r.status === 200);
    const payload = await successResponse.json();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64urlDecode(payload.iv) },
      key,
      b64urlDecode(payload.encrypted)
    );
    assert.equal(new TextDecoder().decode(decrypted), plaintext);
  } finally {
    await mf.dispose();
  }
});

test("concurrency: concurrent creates with collision handling", async () => {
  const mf = await makeEnv();
  try {
    // Create multiple secrets rapidly
    const creates = await Promise.all(
      Array(10)
        .fill(null)
        .map(async (_, i) => {
          const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
            "encrypt",
            "decrypt",
          ]);
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode(`secret-${i}`)
          );

          return mf.dispatchFetch("http://localhost/api/secrets", {
            method: "POST",
            headers: {
              Origin: "http://localhost:8787",
              "Content-Type": "application/json",
              "CF-Connecting-IP": `203.0.113.${100 + i}`,
            },
            body: JSON.stringify({
              encrypted: b64urlEncode(new Uint8Array(ciphertext)),
              iv: b64urlEncode(iv),
              ttl: 60 * 60 * 1000,
            }),
          });
        })
    );

    // All should succeed (collision retry mechanism should work)
    const statuses = creates.map((r) => r.status);
    assert.ok(
      statuses.every((s) => s === 201),
      "All creates should succeed despite potential ID collisions"
    );

    // Verify all IDs are unique
    const bodies = await Promise.all(creates.map((r) => r.json()));
    const ids = bodies.map((b) => b.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length, "All generated IDs should be unique");
  } finally {
    await mf.dispose();
  }
});

test("concurrency: concurrent rate limit checks from same IP", async () => {
  const mf = await makeEnv();
  try {
    const ip = "203.0.113.200";
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // Fire 5 concurrent requests
    const requests = await Promise.all(
      Array(5)
        .fill(null)
        .map(async () => {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode("test")
          );

          return mf.dispatchFetch("http://localhost/api/secrets", {
            method: "POST",
            headers: {
              Origin: "http://localhost:8787",
              "Content-Type": "application/json",
              "CF-Connecting-IP": ip,
            },
            body: JSON.stringify({
              encrypted: b64urlEncode(new Uint8Array(ciphertext)),
              iv: b64urlEncode(iv),
              ttl: 60 * 60 * 1000,
            }),
          });
        })
    );

    const statuses = requests.map((r) => r.status);

    // Rate limiter should handle concurrent requests consistently
    // All should either succeed or be rate limited, no internal errors
    assert.ok(
      statuses.every((s) => s === 201 || s === 429),
      "All requests should either succeed or be rate limited"
    );
  } finally {
    await mf.dispose();
  }
});

test("concurrency: deduplication handles errors gracefully", async () => {
  const { deduplicate } = await import("../src/deduplication.js");

  clearInflight();

  let callCount = 0;
  const mockFn = async () => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new Error("Intentional error");
  };

  const key = "test-error-key";

  // Launch 5 concurrent requests that will all fail
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(deduplicate(key, mockFn).catch((err) => ({ error: err.message })));
  }

  const results = await Promise.all(promises);

  // Should only call the function once despite errors
  assert.equal(callCount, 1, "Function should only be called once");
  assert.equal(results.length, 5, "All promises should settle");
  assert.ok(results.every((r) => r.error === "Intentional error"));
});

test("concurrency: rate limit cache handles concurrent access", async () => {
  const { LRUCache } = await import("../src/cache.js");

  const cache = new LRUCache(100);

  // Concurrent sets
  const setPromises = [];
  for (let i = 0; i < 50; i++) {
    setPromises.push(cache.set(`key-${i}`, `value-${i}`, 1000));
  }

  await Promise.all(setPromises);

  // All values should be cached
  assert.equal(cache.size, 50);

  // Concurrent gets
  const getPromises = [];
  for (let i = 0; i < 50; i++) {
    getPromises.push(Promise.resolve(cache.get(`key-${i}`)));
  }

  const results = await Promise.all(getPromises);

  for (let i = 0; i < 50; i++) {
    assert.equal(results[i], `value-${i}`, `Value for key-${i} should match`);
  }
});

test("concurrency: circuit breaker handles concurrent requests", async () => {
  const { CircuitBreaker } = await import("../src/circuitBreaker.js");

  const cb = new CircuitBreaker("test-concurrent", {
    failureThreshold: 3,
    timeout: 1000,
  });

  let successCount = 0;
  let failureCount = 0;

  const promises = [];

  // Mix of successful and failing requests
  for (let i = 0; i < 10; i++) {
    const shouldFail = i >= 3;
    promises.push(
      cb
        .execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (shouldFail) {
            throw new Error("Simulated failure");
          }
          successCount++;
          return "ok";
        })
        .catch(() => {
          failureCount++;
        })
    );
  }

  await Promise.all(promises);

  // Some should succeed, some should fail
  assert.ok(successCount <= 3, `At most 3 should succeed, got ${successCount}`);
  assert.ok(failureCount >= 7, `At least 7 should fail, got ${failureCount}`);

  // Circuit should be open after threshold
  assert.equal(cb.getState(), "OPEN");
});

test("concurrency: ID generation is thread-safe", async () => {
  const { generateId } = await import("../src/cryptoId.js");

  // Generate many IDs concurrently
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(Promise.resolve(generateId()));
  }

  const ids = await Promise.all(promises);

  // All IDs should be unique
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, 100, "All IDs should be unique");

  // All IDs should be valid format
  for (const id of ids) {
    assert.equal(id.length, 16, "ID should be 16 characters");
    assert.ok(/^[A-Za-z0-9]+$/.test(id), "ID should be alphanumeric");
  }
});

test("concurrency: rapid sequential creates and reads", async () => {
  const mf = await makeEnv();
  try {
    clearInflight();
    const iterations = 20;
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = `message-${i}`;
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(plaintext)
      );

      // Create
      const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": `203.0.114.${i}`,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });

      if (createRes.status !== 201) continue; // Skip if rate limited

      const created = await createRes.json();

      // Immediate read
      const readRes = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
        method: "GET",
        headers: {
          Origin: "http://localhost:8787",
          "CF-Connecting-IP": `203.0.114.${i}`,
        },
      });

      results.push({
        createStatus: createRes.status,
        readStatus: readRes.status,
      });
    }

    // Verify successful creates had successful reads
    results
      .filter((r) => r.createStatus === 201)
      .forEach((r) => {
        assert.equal(r.readStatus, 200, "Successful create should have successful read");
      });
  } finally {
    await mf.dispose();
  }
});

test("concurrency: Durable Object state isolation - multiple secrets", async () => {
  const mf = await makeEnv();
  try {
    const secrets = [];

    // Create 5 different secrets
    for (let i = 0; i < 5; i++) {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = `isolated-${i}`;
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(plaintext)
      );

      const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": `203.0.115.${i}`,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });

      if (createRes.status === 201) {
        const created = await createRes.json();
        secrets.push({ id: created.id, key, plaintext });
      }
    }

    // Read all secrets - each should be independent
    for (const secret of secrets) {
      const readRes = await mf.dispatchFetch(`http://localhost/api/secrets/${secret.id}`, {
        method: "GET",
        headers: {
          Origin: "http://localhost:8787",
          "CF-Connecting-IP": "203.0.115.100",
        },
      });

      assert.equal(readRes.status, 200, `Secret ${secret.id} should be readable`);
      const payload = await readRes.json();

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64urlDecode(payload.iv) },
        secret.key,
        b64urlDecode(payload.encrypted)
      );

      assert.equal(
        new TextDecoder().decode(decrypted),
        secret.plaintext,
        "Decrypted content should match original"
      );
    }
  } finally {
    await mf.dispose();
  }
});
