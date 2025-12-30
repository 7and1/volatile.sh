/**
 * RateLimiter Durable Object unit tests
 */

import test from "node:test";
import assert from "node:assert/strict";

// Mock storage implementation
class MockStorage {
  constructor() {
    this.data = new Map();
  }

  async get(key) {
    return this.data.get(key);
  }

  async put(key, value, options = {}) {
    this.data.set(key, value);
  }

  async delete(key) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

// Import and instantiate RateLimiter for testing
import { RateLimiter } from "../src/do/RateLimiter.js";

function createMockRateLimiter() {
  const storage = new MockStorage();
  const state = { storage };
  return { limiter: new RateLimiter(state, {}), storage };
}

function createRequest(url, method, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Test: Check endpoint routing
test("RateLimiter: returns 404 for non-check endpoints", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/unknown", "GET");
  const res = await limiter.fetch(req);

  assert.equal(res.status, 404);
  const text = await res.text();
  assert.equal(text, "Not found");
});

test("RateLimiter: returns 404 for non-POST to /check", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "GET");
  const res = await limiter.fetch(req);

  assert.equal(res.status, 404);
});

// Test: Key validation
test("RateLimiter: rejects empty key", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: "",
    limit: 10,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "BAD_KEY");
  assert.equal(data.allowed, false);
});

test("RateLimiter: rejects missing key", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    limit: 10,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "BAD_KEY");
});

test("RateLimiter: rejects non-string key", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: 12345,
    limit: 10,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "BAD_KEY");
});

// Test: Limit validation
test("RateLimiter: rejects zero limit", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 0,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "BAD_LIMIT");
});

test("RateLimiter: rejects negative limit", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: -5,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "BAD_LIMIT");
});

test("RateLimiter: rejects zero windowMs", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 10,
    windowMs: 0,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "BAD_LIMIT");
});

test("RateLimiter: rejects non-finite limit", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: Infinity,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "BAD_LIMIT");
});

// Test: Rate limiting logic
test("RateLimiter: allows first request within limit", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 5,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.allowed, true);
  assert.equal(data.count, 1);
  assert.equal(data.remaining, 4);
  assert.equal(data.limit, 5);
});

test("RateLimiter: counts multiple requests correctly", async () => {
  const { limiter } = createMockRateLimiter();

  for (let i = 1; i <= 3; i++) {
    const req = createRequest("http://localhost/check", "POST", {
      key: "test-key",
      limit: 5,
      windowMs: 60000,
    });
    const res = await limiter.fetch(req);
    const data = await res.json();

    assert.equal(data.count, i);
    assert.equal(data.remaining, 5 - i);
    assert.equal(data.allowed, true);
  }
});

test("RateLimiter: blocks requests after limit exceeded", async () => {
  const { limiter } = createMockRateLimiter();

  // Use up the limit
  for (let i = 0; i < 3; i++) {
    const req = createRequest("http://localhost/check", "POST", {
      key: "test-key",
      limit: 3,
      windowMs: 60000,
    });
    await limiter.fetch(req);
  }

  // Fourth request should be blocked
  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 3,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 429);
  const data = await res.json();
  assert.equal(data.allowed, false);
  assert.equal(data.remaining, 0);
  assert.equal(data.count, 4);
});

// Test: Sharding - different keys are independent
test("RateLimiter: different keys have independent limits", async () => {
  const { limiter } = createMockRateLimiter();

  // Exhaust limit for key1
  for (let i = 0; i < 2; i++) {
    const req = createRequest("http://localhost/check", "POST", {
      key: "key1",
      limit: 2,
      windowMs: 60000,
    });
    await limiter.fetch(req);
  }

  // key1 should be blocked
  const req1 = createRequest("http://localhost/check", "POST", {
    key: "key1",
    limit: 2,
    windowMs: 60000,
  });
  const res1 = await limiter.fetch(req1);
  assert.equal(res1.status, 429);

  // key2 should still be allowed
  const req2 = createRequest("http://localhost/check", "POST", {
    key: "key2",
    limit: 2,
    windowMs: 60000,
  });
  const res2 = await limiter.fetch(req2);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.allowed, true);
  assert.equal(data2.count, 1);
});

// Test: Window expiration
test("RateLimiter: resets count after window expires", async () => {
  const { limiter, storage } = createMockRateLimiter();

  // Make a request
  const req1 = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 2,
    windowMs: 1000, // 1 second window
  });
  const res1 = await limiter.fetch(req1);
  const data1 = await res1.json();
  assert.equal(data1.count, 1);

  // Simulate window expiration by manipulating storage
  const entry = await storage.get("test-key");
  entry.resetAt = Date.now() - 1; // Set to past
  await storage.put("test-key", entry);

  // Next request should reset
  const req2 = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 2,
    windowMs: 1000,
  });
  const res2 = await limiter.fetch(req2);
  const data2 = await res2.json();
  assert.equal(data2.count, 1); // Reset to 1
  assert.equal(data2.allowed, true);
});

// Test: Response includes resetAt timestamp
test("RateLimiter: response includes resetAt timestamp", async () => {
  const { limiter } = createMockRateLimiter();

  const before = Date.now();
  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 5,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);
  const after = Date.now();

  const data = await res.json();

  assert.ok(data.resetAt !== undefined);
  assert.ok(data.resetAt >= before + 60000);
  assert.ok(data.resetAt <= after + 60000);
});

// Test: Handles string numbers in limit/windowMs
test("RateLimiter: handles string numbers for limit and windowMs", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: "5",
    windowMs: "60000",
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.allowed, true);
  assert.equal(data.limit, 5);
});

// Test: Content-Type header in response
test("RateLimiter: returns JSON content type", async () => {
  const { limiter } = createMockRateLimiter();

  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 5,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  const contentType = res.headers.get("Content-Type");
  assert.ok(contentType.includes("application/json"));
});

// Test: Edge case - exactly at limit
test("RateLimiter: allows request exactly at limit", async () => {
  const { limiter } = createMockRateLimiter();

  // Make 4 requests (limit - 1)
  for (let i = 0; i < 4; i++) {
    const req = createRequest("http://localhost/check", "POST", {
      key: "test-key",
      limit: 5,
      windowMs: 60000,
    });
    await limiter.fetch(req);
  }

  // 5th request (exactly at limit) should be allowed
  const req = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 5,
    windowMs: 60000,
  });
  const res = await limiter.fetch(req);

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.allowed, true);
  assert.equal(data.remaining, 0);
  assert.equal(data.count, 5);
});

// Test: Limit of 1
test("RateLimiter: works with limit of 1", async () => {
  const { limiter } = createMockRateLimiter();

  // First request should be allowed
  const req1 = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 1,
    windowMs: 60000,
  });
  const res1 = await limiter.fetch(req1);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.allowed, true);

  // Second request should be blocked
  const req2 = createRequest("http://localhost/check", "POST", {
    key: "test-key",
    limit: 1,
    windowMs: 60000,
  });
  const res2 = await limiter.fetch(req2);
  assert.equal(res2.status, 429);
  const data2 = await res2.json();
  assert.equal(data2.allowed, false);
});
