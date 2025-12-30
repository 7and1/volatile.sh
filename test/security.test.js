/**
 * Security tests for volatile.sh
 * Tests encryption, rate limiting, CORS, IP blacklist, and request validation
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
      RATE_LIMIT_CREATE_PER_WINDOW: 100,
      RATE_LIMIT_READ_PER_WINDOW: 1000,
      ALLOWED_ORIGINS: "http://localhost:8787",
    },
  });

  return mf;
}

test("security: validateRequest rejects overly long URLs", async () => {
  const { validateRequest } = await import("../src/security.js");
  const longUrl = "https://example.com/" + "a".repeat(3000);
  const request = new Request(longUrl);

  assert.throws(() => validateRequest(request), {
    name: "HttpError",
    message: /URL exceeds maximum length/,
  });
});

test("security: validateRequest rejects disallowed HTTP methods", async () => {
  const { validateRequest } = await import("../src/security.js");

  // Note: Node.js/undici doesn't support TRACE and CONNECT methods
  for (const method of ["DELETE", "PUT", "PATCH"]) {
    const request = new Request("https://example.com", { method });
    assert.throws(() => validateRequest(request), {
      name: "HttpError",
      message: /HTTP method not allowed/,
    });
  }
});

test("security: validateRequest accepts allowed HTTP methods", async () => {
  const { validateRequest } = await import("../src/security.js");
  for (const method of ["GET", "POST", "OPTIONS", "HEAD"]) {
    const request = new Request("https://example.com", { method });
    assert.doesNotThrow(() => validateRequest(request));
  }
});

test("security: validateRequest rejects requests with excessive headers", async () => {
  const { validateRequest } = await import("../src/security.js");
  const { SECURITY } = await import("../src/constants.js");

  const headers = new Headers();
  // Add headers until we exceed MAX_HEADER_SIZE
  let totalSize = 0;
  let i = 0;
  while (totalSize < SECURITY.MAX_HEADER_SIZE + 100) {
    const headerName = `X-Custom-${i}`;
    const headerValue = "a".repeat(100);
    headers.set(headerName, headerValue);
    totalSize += headerName.length + headerValue.length;
    i++;
  }

  const request = new Request("https://example.com", { headers });

  assert.throws(() => validateRequest(request), {
    name: "HttpError",
    message: /headers too large/i,
  });
});

test("security: sanitizeInput removes control characters", async () => {
  const { sanitizeInput } = await import("../src/security.js");
  const input = "hello\x00world\x1F!\x7F";
  const sanitized = sanitizeInput(input);

  assert.equal(sanitized, "helloworld!");
});

test("security: sanitizeInput preserves newlines and tabs", async () => {
  const { sanitizeInput } = await import("../src/security.js");
  const input = "hello\nworld\ttest";
  const sanitized = sanitizeInput(input);

  assert.equal(sanitized, input);
});

test("security: sanitizeInput limits length", async () => {
  const { sanitizeInput } = await import("../src/security.js");
  const input = "a".repeat(2000);
  const sanitized = sanitizeInput(input, 100);

  assert.equal(sanitized.length, 100);
});

test("security: sanitizeInput handles non-string input", async () => {
  const { sanitizeInput } = await import("../src/security.js");

  assert.equal(sanitizeInput(null), "");
  assert.equal(sanitizeInput(undefined), "");
  assert.equal(sanitizeInput(123), "");
  assert.equal(sanitizeInput({}), "");
});

test("security: validateContentType accepts valid JSON", async () => {
  const { validateContentType } = await import("../src/security.js");
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });

  assert.doesNotThrow(() => validateContentType(request));
});

test("security: validateContentType accepts JSON with charset", async () => {
  const { validateContentType } = await import("../src/security.js");
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
  });

  assert.doesNotThrow(() => validateContentType(request));
});

test("security: validateContentType rejects invalid content type", async () => {
  const { validateContentType } = await import("../src/security.js");
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "text/plain" },
  });

  assert.throws(() => validateContentType(request), {
    name: "HttpError",
    message: /Expected Content-Type/,
  });
});

test("security: isBlacklisted returns false for non-blacklisted IPs", async () => {
  const { isBlacklisted } = await import("../src/security.js");

  assert.equal(await isBlacklisted("192.168.1.1"), false);
  assert.equal(await isBlacklisted("10.0.0.1"), false);
});

test("security: blacklistIp adds IP to blacklist", async () => {
  const { blacklistIp, isBlacklisted } = await import("../src/security.js");
  const testIp = "203.0.113.50";

  await blacklistIp(testIp, "test");
  assert.equal(await isBlacklisted(testIp), true);
});

test("security: blacklistIp expires after duration", async () => {
  const { blacklistIp, isBlacklisted } = await import("../src/security.js");
  const testIp = "203.0.113.51";

  // Blacklist for 100ms
  await blacklistIp(testIp, "test", 100);
  assert.equal(await isBlacklisted(testIp), true);

  // Wait for expiration
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await isBlacklisted(testIp), false);
});

test("security: detectAbuse returns true when count exceeds threshold", async () => {
  const { detectAbuse } = await import("../src/security.js");

  const rateLimitData = {
    allowed: false,
    count: 600,
  };
  const limit = 100;

  assert.equal(detectAbuse(rateLimitData, limit), true);
});

test("security: detectAbuse returns false when count is below threshold", async () => {
  const { detectAbuse } = await import("../src/security.js");

  const rateLimitData = {
    allowed: false,
    count: 200,
  };
  const limit = 100;

  assert.equal(detectAbuse(rateLimitData, limit), false);
});

test("security: detectAbuse returns false when allowed is true", async () => {
  const { detectAbuse } = await import("../src/security.js");

  const rateLimitData = {
    allowed: true,
    count: 1000,
  };
  const limit = 100;

  assert.equal(detectAbuse(rateLimitData, limit), false);
});

test("security: CORS headers are properly set for allowed origins", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/health", {
      method: "GET",
      headers: { Origin: "http://localhost:8787" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:8787");
    assert.ok(res.headers.get("Access-Control-Allow-Methods"));
    assert.ok(res.headers.get("Access-Control-Allow-Headers"));
  } finally {
    await mf.dispose();
  }
});

test("security: CORS rejects disallowed origins", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/health", {
      method: "GET",
      headers: { Origin: "https://evil.example.com" },
    });

    assert.equal(res.status, 403);
  } finally {
    await mf.dispose();
  }
});

test("security: CORS handles requests without Origin header", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/health", {
      method: "GET",
    });

    // Should allow for non-browser clients (curl, CLI tools)
    assert.equal(res.status, 200);
  } finally {
    await mf.dispose();
  }
});

test("security: OPTIONS preflight returns correct headers", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8787",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:8787");
    assert.ok(res.headers.get("Access-Control-Allow-Methods"));
    assert.ok(res.headers.get("Access-Control-Allow-Headers"));
    assert.equal(res.headers.get("Access-Control-Max-Age"), "86400");
  } finally {
    await mf.dispose();
  }
});

test("security: security.txt endpoint returns valid content", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/.well-known/security.txt", {
      method: "GET",
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/plain; charset=utf-8");

    const text = await res.text();
    assert.ok(text.includes("Contact:"));
    assert.ok(text.includes("Expires:"));
    assert.ok(text.includes("Preferred-Languages: en"));
  } finally {
    await mf.dispose();
  }
});

test("security: rate limiting enforces create limits per IP", async () => {
  const mf = await makeEnv();
  try {
    clearInflight();
    rateLimitCache.clear();

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // Use high limit for this test (configured in makeEnv)
    const limit = 100;
    const testIp = "203.0.114.10";

    // Make requests up to limit
    for (let i = 0; i < limit; i++) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(`test-${i}`)
      );

      const res = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": testIp,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });

      assert.equal(res.status, 201, `Request ${i} should succeed`);
      clearInflight();
    }

    // Next request should be rate limited
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode("over-limit")
    );

    const limitedRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": testIp,
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    assert.equal(limitedRes.status, 429);
    const data = await limitedRes.json();
    assert.equal(data.error.code, "RATE_LIMITED");
    assert.ok(limitedRes.headers.get("Retry-After"));
  } finally {
    await mf.dispose();
  }
});

test("security: different IPs have independent rate limits", async () => {
  const mf = await makeEnv();
  try {
    clearInflight();
    rateLimitCache.clear();

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // IP 1 makes a request
    const iv1 = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext1 = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv1 },
      key,
      new TextEncoder().encode("test-1")
    );

    const res1 = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.115.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext1)),
        iv: b64urlEncode(iv1),
        ttl: 60 * 60 * 1000,
      }),
    });

    assert.equal(res1.status, 201);
    clearInflight();

    // IP 2 should still be able to make requests
    const iv2 = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext2 = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv2 },
      key,
      new TextEncoder().encode("test-2")
    );

    const res2 = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.115.2",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext2)),
        iv: b64urlEncode(iv2),
        ttl: 60 * 60 * 1000,
      }),
    });

    assert.equal(res2.status, 201);
  } finally {
    await mf.dispose();
  }
});

test("security: encryption produces unique ciphertexts for same plaintext", async () => {
  const plaintext = "Hello, World!";
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);

  const ciphertexts = [];
  for (let i = 0; i < 10; i++) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext)
    );
    ciphertexts.push(b64urlEncode(new Uint8Array(ciphertext)));
  }

  // All ciphertexts should be different due to random IV
  const unique = new Set(ciphertexts);
  assert.equal(unique.size, 10);
});

test("security: encryption with wrong key fails", async () => {
  const plaintext = "Secret message";
  const key1 = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const key2 = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key1,
    new TextEncoder().encode(plaintext)
  );

  await assert.rejects(
    async () => {
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key2, ciphertext);
    },
    (err) => {
      return err.name === "OperationError";
    }
  );
});

test("security: tampered ciphertext is detected", async () => {
  const plaintext = "Secret message";
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

  // Tamper with the ciphertext
  const tampered = new Uint8Array(ciphertext);
  tampered[0] = tampered[0] ^ 0xff;

  await assert.rejects(
    async () => {
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, tampered);
    },
    (err) => {
      return err.name === "OperationError";
    }
  );
});

test("security: secret too large is rejected", async () => {
  const mf = await makeEnv();
  try {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // Generate a payload that's large enough to exceed ENCRYPTED_MAX_CHARS (1.4M)
    // but small enough to pass MAX_REQUEST_SIZE (2MB) and content-length check
    // ~1.05MB raw data encrypts to ~1.4MB base64url which should trigger SECRET_TOO_LARGE
    const largeData = "x".repeat(1_100_000);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(largeData)
    );

    const res = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.116.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    // Either PAYLOAD_TOO_LARGE (from http.js) or SECRET_TOO_LARGE (from api.js) is acceptable
    assert.equal(res.status, 413);
    const data = await res.json();
    assert.ok(
      data.error.code === "SECRET_TOO_LARGE" || data.error.code === "PAYLOAD_TOO_LARGE",
      `Expected SECRET_TOO_LARGE or PAYLOAD_TOO_LARGE, got ${data.error.code}`
    );
  } finally {
    await mf.dispose();
  }
});

test("security: response includes security headers", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/health", {
      method: "GET",
      headers: { Origin: "http://localhost:8787" },
    });

    assert.equal(res.status, 200);

    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(res.headers.get("X-Frame-Options"), "DENY");
    assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");
    assert.ok(res.headers.get("Permissions-Policy"));
    assert.ok(res.headers.get("Cross-Origin-Opener-Policy"));
    assert.ok(res.headers.get("Cross-Origin-Resource-Policy"));
    assert.ok(res.headers.get("Cross-Origin-Embedder-Policy"));
    assert.ok(res.headers.get("Strict-Transport-Security"));
    assert.ok(res.headers.get("Content-Security-Policy"));
  } finally {
    await mf.dispose();
  }
});
