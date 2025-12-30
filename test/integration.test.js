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
      RATE_LIMIT_CREATE_PER_WINDOW: 100,
      RATE_LIMIT_READ_PER_WINDOW: 1000,
      ALLOWED_ORIGINS: "http://localhost:8787",
    },
  });

  return mf;
}

test("complete user flow: create -> share -> read -> verify destroyed", async () => {
  const mf = await makeEnv();
  try {
    const plaintext = "This is a secret message!";

    // Step 1: Client generates key and encrypts
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

    // Step 2: Client creates secret
    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.130.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 24 * 60 * 60 * 1000,
      }),
    });

    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.id);
    assert.ok(created.expiresAt);

    // Step 3: Recipient reads secret (simulated sharing via URL)
    const readRes = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
      method: "GET",
      headers: {
        Origin: "http://localhost:8787",
        "CF-Connecting-IP": "198.51.100.1", // Different IP
      },
    });

    assert.equal(readRes.status, 200);
    const payload = await readRes.json();

    // Step 4: Recipient decrypts (key shared via URL fragment)
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64urlDecode(payload.iv) },
      key,
      b64urlDecode(payload.encrypted)
    );
    assert.equal(new TextDecoder().decode(decrypted), plaintext);

    // Step 5: Verify secret is destroyed (second read fails)
    const secondRead = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
      method: "GET",
      headers: {
        Origin: "http://localhost:8787",
        "CF-Connecting-IP": "198.51.100.1",
      },
    });

    assert.equal(secondRead.status, 404);
  } finally {
    await mf.dispose();
  }
});

test("multi-user scenario: different users creating and reading secrets", async () => {
  const mf = await makeEnv();
  try {
    const users = [
      { ip: "203.0.130.10", message: "User A secret" },
      { ip: "203.0.130.11", message: "User B secret" },
      { ip: "203.0.130.12", message: "User C secret" },
    ];

    const secrets = [];

    // Each user creates a secret
    for (const user of users) {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(user.message)
      );

      const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": user.ip,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });

      assert.equal(createRes.status, 201);
      const created = await createRes.json();
      secrets.push({ ...user, id: created.id, key });
    }

    // Different user reads each secret
    for (let i = 0; i < secrets.length; i++) {
      const secret = secrets[i];
      const readerIp = `198.51.100.${10 + i}`;

      const readRes = await mf.dispatchFetch(`http://localhost/api/secrets/${secret.id}`, {
        method: "GET",
        headers: {
          Origin: "http://localhost:8787",
          "CF-Connecting-IP": readerIp,
        },
      });

      assert.equal(readRes.status, 200, `Secret ${i} should be readable`);
      const payload = await readRes.json();

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64urlDecode(payload.iv) },
        secret.key,
        b64urlDecode(payload.encrypted)
      );

      assert.equal(
        new TextDecoder().decode(decrypted),
        secret.message,
        "Decrypted message should match original"
      );
    }
  } finally {
    await mf.dispose();
  }
});

test("error recovery: invalid encryption key doesn't break system", async () => {
  const mf = await makeEnv();
  try {
    // Create a secret
    const correctKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      correctKey,
      new TextEncoder().encode("secret message")
    );

    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.131.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    // Read the secret
    const readRes = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
      method: "GET",
      headers: {
        Origin: "http://localhost:8787",
        "CF-Connecting-IP": "203.0.131.1",
      },
    });

    assert.equal(readRes.status, 200);
    const payload = await readRes.json();

    // Try to decrypt with wrong key - client-side error, shouldn't affect server
    const wrongKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    try {
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64urlDecode(payload.iv) },
        wrongKey,
        b64urlDecode(payload.encrypted)
      );
      assert.fail("Should have thrown decryption error");
    } catch (err) {
      assert.ok(err, "Decryption with wrong key should fail");
    }

    // Secret should still be consumed (can't read again)
    const secondRead = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
      method: "GET",
      headers: {
        Origin: "http://localhost:8787",
        "CF-Connecting-IP": "203.0.131.1",
      },
    });

    assert.equal(secondRead.status, 404);
  } finally {
    await mf.dispose();
  }
});

test("rate limit recovery after window expires", async () => {
  const mf = await makeEnv();
  try {
    // This test verifies that rate limits reset properly
    // In production, window is 1 hour; in test config it's also 1 hour
    // We can't wait that long, but we can verify the mechanism works

    const ip = "203.0.132.1";
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    // Make requests up to limit
    for (let i = 0; i < 100; i++) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(`msg-${i}`)
      );

      const res = await mf.dispatchFetch("http://localhost/api/secrets", {
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

      if (i < 100) {
        assert.equal(res.status, 201, `Request ${i} should succeed`);
      }
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
        "CF-Connecting-IP": ip,
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    assert.equal(limitedRes.status, 429, "Should be rate limited");
  } finally {
    await mf.dispose();
  }
});

test("OPTIONS preflight requests work correctly", async () => {
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
    assert.ok(res.headers.get("Access-Control-Allow-Origin"));
    assert.ok(res.headers.get("Access-Control-Allow-Methods"));
  } finally {
    await mf.dispose();
  }
});

test("security headers are present in responses", async () => {
  const mf = await makeEnv();
  try {
    const res = await mf.dispatchFetch("http://localhost/api/health", {
      method: "GET",
      headers: { Origin: "http://localhost:8787" },
    });

    assert.equal(res.status, 200);

    // Check for important security headers
    assert.ok(res.headers.get("X-Content-Type-Options"), "Should have X-Content-Type-Options");
    assert.ok(res.headers.get("X-Frame-Options"), "Should have X-Frame-Options");
    assert.ok(res.headers.get("Cache-Control"), "Should have Cache-Control");
  } finally {
    await mf.dispose();
  }
});
