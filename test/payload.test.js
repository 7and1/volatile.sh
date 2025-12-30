import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

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

test("large payload - near 1MB limit", async () => {
  const mf = await makeEnv();
  try {
    // Generate ~900KB of data (leaving room for encryption overhead)
    const largeData = "A".repeat(900 * 1024);

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(largeData)
    );

    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.120.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    assert.equal(createRes.status, 201, "Large payload should be accepted");
    const created = await createRes.json();
    assert.ok(created.id, "Should return valid ID");
  } finally {
    await mf.dispose();
  }
});

test("payload exceeding 1MB limit is rejected", async () => {
  const mf = await makeEnv();
  try {
    // Generate >1.4M characters to exceed the limit
    const tooLargeData = "A".repeat(1_500_000);

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(tooLargeData)
    );

    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.120.2",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    assert.equal(createRes.status, 413, "Oversized payload should be rejected");
    const data = await createRes.json();
    assert.equal(data.error.code, "SECRET_TOO_LARGE");
  } finally {
    await mf.dispose();
  }
});

test("edge case: empty encrypted data", async () => {
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
      new TextEncoder().encode("")
    );

    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.120.3",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    // Empty encrypted content should still be valid
    assert.equal(createRes.status, 201, "Empty encrypted data should be accepted");
  } finally {
    await mf.dispose();
  }
});

test("various payload sizes are handled correctly", async () => {
  const mf = await makeEnv();
  try {
    const sizes = [
      1, // 1 byte
      100, // 100 bytes
      1024, // 1KB
      10 * 1024, // 10KB
      100 * 1024, // 100KB
      500 * 1024, // 500KB
    ];

    for (const size of sizes) {
      const data = "X".repeat(size);
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(data)
      );

      const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": `203.0.120.${10 + sizes.indexOf(size)}`,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });

      assert.equal(createRes.status, 201, `Payload of size ${size} should be accepted`);
    }
  } finally {
    await mf.dispose();
  }
});

test("special characters and unicode in encrypted data", async () => {
  const mf = await makeEnv();
  try {
    const testStrings = [
      "Hello, World!",
      "测试中文字符",
      "🚀🔐💯",
      '{"json": "data", "nested": {"key": "value"}}',
      "Line1\nLine2\nLine3",
      "\t\r\n special whitespace",
      "Üñïçödé tëxt",
    ];

    for (const [idx, testStr] of testStrings.entries()) {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(testStr)
      );

      const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
          "CF-Connecting-IP": `203.0.121.${idx}`,
        },
        body: JSON.stringify({
          encrypted: b64urlEncode(new Uint8Array(ciphertext)),
          iv: b64urlEncode(iv),
          ttl: 60 * 60 * 1000,
        }),
      });

      assert.equal(
        createRes.status,
        201,
        `Special characters should be handled: ${testStr.substring(0, 20)}`
      );

      const created = await createRes.json();

      // Verify we can read it back
      const readRes = await mf.dispatchFetch(`http://localhost/api/secrets/${created.id}`, {
        method: "GET",
        headers: {
          Origin: "http://localhost:8787",
          "CF-Connecting-IP": `203.0.121.${idx}`,
        },
      });

      assert.equal(readRes.status, 200);
    }
  } finally {
    await mf.dispose();
  }
});

test("binary data handling", async () => {
  const mf = await makeEnv();
  try {
    // Create binary data with all byte values
    const binaryData = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      binaryData[i] = i;
    }

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, binaryData);

    const createRes = await mf.dispatchFetch("http://localhost/api/secrets", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.122.1",
      },
      body: JSON.stringify({
        encrypted: b64urlEncode(new Uint8Array(ciphertext)),
        iv: b64urlEncode(iv),
        ttl: 60 * 60 * 1000,
      }),
    });

    assert.equal(createRes.status, 201, "Binary data should be handled correctly");
  } finally {
    await mf.dispose();
  }
});
