/**
 * HTTP utility functions unit tests
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  HttpError,
  generateRequestId,
  createErrorResponse,
  json,
  noStore,
  securityHeaders,
  withHeaders,
  cloneResponse,
  readJson,
  isBase64Url,
} from "../src/http.js";

// =============================================================================
// HttpError Tests
// =============================================================================

test("HttpError: constructs with all parameters", () => {
  const error = new HttpError(
    400,
    "BAD_REQUEST",
    "Invalid input",
    { "X-Custom": "header" },
    {
      field: "value",
    }
  );

  assert.equal(error.status, 400);
  assert.equal(error.code, "BAD_REQUEST");
  assert.equal(error.message, "Invalid input");
  assert.deepEqual(error.headers, { "X-Custom": "header" });
  assert.deepEqual(error.details, { field: "value" });
  assert.equal(error.name, "HttpError");
});

test("HttpError: extends Error", () => {
  const error = new HttpError(500, "INTERNAL_ERROR", "Server error");

  assert.ok(error instanceof Error);
  assert.ok(error instanceof HttpError);
});

test("HttpError: works with minimal parameters", () => {
  const error = new HttpError(404, "NOT_FOUND", "Resource not found");

  assert.equal(error.status, 404);
  assert.equal(error.code, "NOT_FOUND");
  assert.equal(error.message, "Resource not found");
  assert.equal(error.headers, undefined);
  assert.equal(error.details, undefined);
});

// =============================================================================
// generateRequestId Tests
// =============================================================================

test("generateRequestId: returns string", () => {
  const id = generateRequestId();
  assert.equal(typeof id, "string");
});

test("generateRequestId: format is timestamp-random", () => {
  const id = generateRequestId();
  const parts = id.split("-");

  assert.equal(parts.length, 2);

  // First part should be a valid timestamp
  const timestamp = parseInt(parts[0], 10);
  assert.ok(!isNaN(timestamp));
  assert.ok(timestamp > 0);

  // Second part should be alphanumeric
  assert.ok(/^[a-z0-9]+$/.test(parts[1]));
});

test("generateRequestId: generates unique IDs", () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    ids.add(generateRequestId());
  }
  // All 100 should be unique
  assert.equal(ids.size, 100);
});

// =============================================================================
// createErrorResponse Tests
// =============================================================================

test("createErrorResponse: creates standard error object", () => {
  const response = createErrorResponse("NOT_FOUND", "Resource not found", 404, "req-123");

  assert.deepEqual(response, {
    error: {
      code: "NOT_FOUND",
      message: "Resource not found",
      status: 404,
      requestId: "req-123",
    },
  });
});

test("createErrorResponse: includes details when provided", () => {
  const response = createErrorResponse("VALIDATION_ERROR", "Invalid input", 400, "req-456", {
    field: "email",
    reason: "Invalid format",
  });

  assert.deepEqual(response.error.details, {
    field: "email",
    reason: "Invalid format",
  });
});

test("createErrorResponse: excludes details when empty object", () => {
  const response = createErrorResponse("ERROR", "Error", 500, "req-789", {});

  assert.equal(response.error.details, undefined);
});

test("createErrorResponse: excludes details when null", () => {
  const response = createErrorResponse("ERROR", "Error", 500, "req-789", null);

  assert.equal(response.error.details, undefined);
});

// =============================================================================
// json Tests
// =============================================================================

test("json: creates Response with JSON body", async () => {
  const res = json({ foo: "bar" });

  assert.ok(res instanceof Response);
  const data = await res.json();
  assert.deepEqual(data, { foo: "bar" });
});

test("json: sets Content-Type header", () => {
  const res = json({});

  assert.equal(res.headers.get("Content-Type"), "application/json; charset=utf-8");
});

test("json: accepts custom status code", () => {
  const res = json({}, { status: 201 });

  assert.equal(res.status, 201);
});

test("json: accepts custom headers", () => {
  const res = json({}, { headers: { "X-Custom": "value" } });

  assert.equal(res.headers.get("X-Custom"), "value");
  assert.equal(res.headers.get("Content-Type"), "application/json; charset=utf-8");
});

test("json: serializes complex objects", async () => {
  const data = {
    array: [1, 2, 3],
    nested: { deep: { value: true } },
    null: null,
    number: 42,
  };
  const res = json(data);
  const parsed = await res.json();

  assert.deepEqual(parsed, data);
});

// =============================================================================
// noStore Tests
// =============================================================================

test("noStore: adds Cache-Control no-store header", () => {
  const original = new Response("test");
  const res = noStore(original);

  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("noStore: adds Pragma no-cache header", () => {
  const original = new Response("test");
  const res = noStore(original);

  assert.equal(res.headers.get("Pragma"), "no-cache");
});

test("noStore: preserves original body", async () => {
  const original = new Response("original body");
  const res = noStore(original);

  const text = await res.text();
  assert.equal(text, "original body");
});

// =============================================================================
// securityHeaders Tests
// =============================================================================

test("securityHeaders: sets X-Content-Type-Options", () => {
  const original = new Response("test");
  const res = securityHeaders(original);

  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
});

test("securityHeaders: sets X-Frame-Options", () => {
  const original = new Response("test");
  const res = securityHeaders(original);

  assert.equal(res.headers.get("X-Frame-Options"), "DENY");
});

test("securityHeaders: sets Referrer-Policy", () => {
  const original = new Response("test");
  const res = securityHeaders(original);

  assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");
});

test("securityHeaders: sets Permissions-Policy", () => {
  const original = new Response("test");
  const res = securityHeaders(original);

  const policy = res.headers.get("Permissions-Policy");
  assert.ok(policy.includes("camera=()"));
  assert.ok(policy.includes("microphone=()"));
  assert.ok(policy.includes("geolocation=()"));
});

test("securityHeaders: sets HSTS", () => {
  const original = new Response("test");
  const res = securityHeaders(original);

  const hsts = res.headers.get("Strict-Transport-Security");
  assert.ok(hsts.includes("max-age=31536000"));
  assert.ok(hsts.includes("includeSubDomains"));
  assert.ok(hsts.includes("preload"));
});

test("securityHeaders: sets Content-Security-Policy", () => {
  const original = new Response("test");
  const res = securityHeaders(original);

  assert.equal(res.headers.get("Content-Security-Policy"), "default-src 'none'; sandbox");
});

test("securityHeaders: sets Cross-Origin headers", () => {
  const original = new Response("test");
  const res = securityHeaders(original);

  assert.equal(res.headers.get("Cross-Origin-Opener-Policy"), "same-origin");
  assert.equal(res.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  assert.equal(res.headers.get("Cross-Origin-Embedder-Policy"), "require-corp");
});

// =============================================================================
// withHeaders Tests
// =============================================================================

test("withHeaders: adds custom headers", () => {
  const original = new Response("test");
  const res = withHeaders(original, { "X-Custom": "value" });

  assert.equal(res.headers.get("X-Custom"), "value");
});

test("withHeaders: adds multiple headers", () => {
  const original = new Response("test");
  const res = withHeaders(original, {
    "X-First": "one",
    "X-Second": "two",
  });

  assert.equal(res.headers.get("X-First"), "one");
  assert.equal(res.headers.get("X-Second"), "two");
});

test("withHeaders: overwrites existing headers", () => {
  const original = new Response("test", {
    headers: { "X-Existing": "old" },
  });
  const res = withHeaders(original, { "X-Existing": "new" });

  assert.equal(res.headers.get("X-Existing"), "new");
});

// =============================================================================
// cloneResponse Tests
// =============================================================================

test("cloneResponse: creates new Response", () => {
  const original = new Response("test");
  const cloned = cloneResponse(original);

  assert.ok(cloned instanceof Response);
  assert.notStrictEqual(cloned, original);
});

test("cloneResponse: preserves status", () => {
  const original = new Response("test", { status: 201 });
  const cloned = cloneResponse(original);

  assert.equal(cloned.status, 201);
});

test("cloneResponse: preserves body", async () => {
  const original = new Response("test body");
  const cloned = cloneResponse(original);

  const text = await cloned.text();
  assert.equal(text, "test body");
});

// =============================================================================
// readJson Tests
// =============================================================================

test("readJson: parses valid JSON", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ foo: "bar" }),
  });

  const data = await readJson(request);
  assert.deepEqual(data, { foo: "bar" });
});

test("readJson: throws HttpError for non-JSON content type", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not json",
  });

  await assert.rejects(
    async () => await readJson(request),
    (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 415);
      assert.equal(err.code, "UNSUPPORTED_MEDIA_TYPE");
      return true;
    }
  );
});

test("readJson: throws HttpError for too large content-length", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "10000000", // 10MB
    },
    body: "{}",
  });

  await assert.rejects(
    async () => await readJson(request),
    (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 413);
      assert.equal(err.code, "PAYLOAD_TOO_LARGE");
      return true;
    }
  );
});

test("readJson: throws HttpError for invalid JSON", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json {",
  });

  await assert.rejects(
    async () => await readJson(request),
    (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 400);
      assert.equal(err.code, "BAD_JSON");
      return true;
    }
  );
});

test("readJson: accepts custom maxBytes", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "1000",
    },
    body: JSON.stringify({ data: "a".repeat(500) }),
  });

  await assert.rejects(
    async () => await readJson(request, { maxBytes: 100 }),
    (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 413);
      return true;
    }
  );
});

test("readJson: handles application/json with charset", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ foo: "bar" }),
  });

  const data = await readJson(request);
  assert.deepEqual(data, { foo: "bar" });
});

test("readJson: handles missing content-type", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ foo: "bar" }),
  });

  await assert.rejects(
    async () => await readJson(request),
    (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 415);
      return true;
    }
  );
});

// =============================================================================
// isBase64Url Tests
// =============================================================================

test("isBase64Url: returns true for valid base64url", () => {
  assert.equal(isBase64Url("aGVsbG8"), true);
  assert.equal(isBase64Url("aGVsbG8td29ybGQ"), true);
  assert.equal(
    isBase64Url("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"),
    true
  );
});

test("isBase64Url: returns false for standard base64 characters", () => {
  assert.equal(isBase64Url("aGVsbG8+d29ybGQ="), false); // + and = not allowed
  assert.equal(isBase64Url("aGVsbG8/d29ybGQ"), false); // / not allowed
});

test("isBase64Url: returns false for non-string", () => {
  assert.equal(isBase64Url(null), false);
  assert.equal(isBase64Url(undefined), false);
  assert.equal(isBase64Url(123), false);
  assert.equal(isBase64Url({}), false);
  assert.equal(isBase64Url([]), false);
});

test("isBase64Url: returns true for empty string", () => {
  // Empty string matches the regex (no invalid characters)
  assert.equal(isBase64Url(""), false);
});

test("isBase64Url: returns false for strings with spaces", () => {
  assert.equal(isBase64Url("hello world"), false);
  assert.equal(isBase64Url(" hello"), false);
  assert.equal(isBase64Url("hello "), false);
});

test("isBase64Url: returns false for strings with special characters", () => {
  assert.equal(isBase64Url("hello!"), false);
  assert.equal(isBase64Url("hello@world"), false);
  assert.equal(isBase64Url("hello#"), false);
  assert.equal(isBase64Url("hello$"), false);
  assert.equal(isBase64Url("hello%"), false);
});

test("isBase64Url: accepts underscore and hyphen", () => {
  assert.equal(isBase64Url("hello_world"), true);
  assert.equal(isBase64Url("hello-world"), true);
  assert.equal(isBase64Url("_-_-_"), true);
});

test("isBase64Url: works with typical base64url encoded values", () => {
  // These are actual base64url encoded strings
  assert.equal(isBase64Url("SGVsbG8gV29ybGQ"), true); // "Hello World"
  assert.equal(isBase64Url("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), true); // JWT header
});
