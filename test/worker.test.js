import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { clearInflight } from "../src/deduplication.js";
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
      RATE_LIMIT_CREATE_PER_WINDOW: 2,
      RATE_LIMIT_READ_PER_WINDOW: 10,
      ALLOWED_ORIGINS: "http://localhost:8787",
    },
  });

  return mf;
}

test("GET /api/health returns ok", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/health", {
      method: "GET",
      headers: { Origin: "http://localhost:8787" },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    // Health check now includes version, uptime, and DO status
    assert.equal(data.ok, true);
    assert.ok(data.version !== undefined);
    assert.ok(data.uptime !== undefined);
    assert.ok(data.do !== undefined);
    assert.ok(data.metrics !== undefined);
  } finally {
    await mf.dispose();
  }
});

test("GET / serves the frontend HTML", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/", {
      method: "GET",
      headers: { Accept: "text/html" },
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes("volatile"));
  } finally {
    await mf.dispose();
  }
});

test("end-to-end: encrypt -> create -> read -> decrypt; second read fails", async () => {
  const mf = await makeEnv();
  try {
    // Clear caches to avoid interference
    clearInflight();
    rateLimitCache.clear();

    const plaintext = "hello volatile";

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

    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.10",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.id);
    assert.equal(typeof created.expiresAt, "number");

    // Clear deduplication before read
    clearInflight();

    const readRes = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
      method: "GET",
      headers: {
        Origin: "http://localhost:8787",
        "CF-Connecting-IP": "203.0.113.10",
      },
    });
    assert.equal(readRes.status, 200);
    const payload = await readRes.json();
    assert.ok(payload.encrypted);
    assert.ok(payload.iv);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64urlDecode(payload.iv) },
      key,
      b64urlDecode(payload.encrypted)
    );
    assert.equal(new TextDecoder().decode(decrypted), plaintext);

    // Clear deduplication before second read
    clearInflight();

    const secondRead = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
      method: "GET",
      headers: {
        Origin: "http://localhost:8787",
        "CF-Connecting-IP": "203.0.113.10",
      },
    });
    assert.equal(secondRead.status, 404);
  } finally {
    await mf.dispose();
  }
});

test("rate limiting: create is limited per IP", async () => {
  const mf = await makeEnv();
  try {
    // Clear caches to avoid interference
    clearInflight();
    rateLimitCache.clear();

    const body = JSON.stringify({
      encrypted: "aGVsbG8", // base64url("hello")
      iv: "aXYxMjM0NTY3ODkw", // just a token; not validated as 12-byte here
      ttl: 60 * 60 * 1000,
    });

    const headers = {
      Origin: "http://localhost:8787",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "198.51.100.23",
    };

    const r1 = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers,
      body,
    });
    assert.equal(r1.status, 201);

    // Clear deduplication between requests
    clearInflight();

    const r2 = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers,
      body,
    });
    assert.equal(r2.status, 201);

    // Clear deduplication between requests
    clearInflight();

    const r3 = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers,
      body,
    });
    assert.equal(r3.status, 429);
    const data = await r3.json();
    assert.equal(data.error.code, "RATE_LIMITED");
  } finally {
    await mf.dispose();
  }
});

test("CORS: disallowed origin is rejected", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/health", {
      method: "GET",
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(res.status, 403);
  } finally {
    await mf.dispose();
  }
});

test("invalid ID format returns 400", async () => {
  const mf = await makeEnv();
  try {
    // Test IDs that are syntactically valid but fail format validation
    const invalidIds = ["ab", "abc"]; // Too short (< 8 chars)
    for (const id of invalidIds) {
      const res = await mf.dispatchFetch(`http://localhost/api/secrets/${id}`, {
        method: "GET",
        headers: { Origin: "http://localhost:8787" },
      });
      assert.equal(res.status, 400, `Expected 400 for invalid ID: ${id}`);
      const data = await res.json();
      assert.equal(data.error.code, "INVALID_ID");
    }
  } finally {
    await mf.dispose();
  }
});

test("IV length validation rejects invalid IVs", async () => {
  const mf = await makeEnv();
  try {
    const tooShort = "a".repeat(8); // Too short
    const tooLong = "a".repeat(30); // Too long

    const body = JSON.stringify({
      encrypted: "a".repeat(100),
      iv: tooShort,
      ttl: 60 * 60 * 1000,
    });

    const res = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.99",
      },
      body,
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error.code, "INVALID_IV_LENGTH");
  } finally {
    await mf.dispose();
  }
});

test("missing fields return proper error", async () => {
  const mf = await makeEnv();
  try {
    const testCases = [
      { body: {}, expectedError: "MISSING_FIELDS", ip: "203.0.113.10" },
      {
        body: { encrypted: "abc" },
        expectedError: "MISSING_FIELDS",
        ip: "203.0.113.11",
      },
      {
        body: { iv: "abc" },
        expectedError: "MISSING_FIELDS",
        ip: "203.0.113.12",
      },
      {
        body: { encrypted: "abc", iv: "invalid!@" },
        expectedError: "INVALID_ENCODING",
        ip: "203.0.113.13",
      },
    ];

    for (const testCase of testCases) {
      const res = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": testCase.ip,
        },
        body: JSON.stringify(testCase.body),
      });
      assert.equal(res.status, 400, `Failed for case: ${testCase.expectedError}`);
      const data = await res.json();
      assert.equal(data.error.code, testCase.expectedError);
    }
  } finally {
    await mf.dispose();
  }
});

test("TTL boundary values are enforced", async () => {
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

    const body = {
      encrypted: b64urlEncode(new Uint8Array(ciphertext)),
      iv: b64urlEncode(iv),
    };

    // Test minimum TTL (should clamp to minimum)
    const minRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.50",
      },
      body: JSON.stringify({ ...body, ttl: 1000 }), // 1 second - below min
    });
    assert.equal(minRes.status, 201);

    // Test maximum TTL (should clamp to maximum)
    const maxRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.51",
      },
      body: JSON.stringify({ ...body, ttl: 999 * 24 * 60 * 60 * 1000 }), // Way above max
    });
    assert.equal(maxRes.status, 201);
  } finally {
    await mf.dispose();
  }
});
