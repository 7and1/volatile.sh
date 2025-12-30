export class HttpError extends Error {
  constructor(status, code, message, headers, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.details = details;
  }
}

/**
 * Generate a unique request ID for tracing
 * Format: timestamp-random (e.g., "1704067200000-a1b2c3d4")
 */
export function generateRequestId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Create a standardized error response object
 * @param {string} code - Error code (e.g., "NOT_FOUND", "RATE_LIMITED")
 * @param {string} message - Human-readable error message
 * @param {number} status - HTTP status code
 * @param {string} requestId - Request ID for tracing
 * @param {object} [details] - Optional additional error details
 * @returns {object} Standardized error response object
 */
export function createErrorResponse(code, message, status, requestId, details) {
  const error = {
    error: {
      code,
      message,
      status,
      requestId,
    },
  };
  if (details && Object.keys(details).length > 0) {
    error.error.details = details;
  }
  return error;
}

export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function noStore(response) {
  const out = cloneResponse(response);
  out.headers.set("Cache-Control", "no-store");
  out.headers.set("Pragma", "no-cache");
  return out;
}

export function securityHeaders(response) {
  const out = cloneResponse(response);

  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("X-Frame-Options", "DENY");
  out.headers.set("Referrer-Policy", "no-referrer");
  out.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  out.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  out.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  out.headers.set("Cross-Origin-Embedder-Policy", "require-corp");

  // Safe even on HTTP; only enforced by browsers on HTTPS.
  out.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  // Content Security Policy for API responses
  out.headers.set("Content-Security-Policy", "default-src 'none'; sandbox");

  return out;
}

export function withHeaders(response, headers) {
  const out = cloneResponse(response);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

export function cloneResponse(response) {
  // Response headers may be immutable depending on how it was created.
  return new Response(response.body, response);
}

export async function readJson(request, { maxBytes = 1_500_000 } = {}) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected JSON body");
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength && contentLength > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body too large");
  }

  let text;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Failed to read request body");
  }

  if (text.length > maxBytes * 1.5) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body too large");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "BAD_JSON", "Invalid JSON");
  }
}

export function isBase64Url(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * P0 Performance Fix: Single-pass finalize that applies all headers at once.
 * Avoids 3x response cloning by merging noStore + securityHeaders + CORS in one clone.
 */
export function finalizeResponse(response, corsHeaders = {}) {
  const out = new Response(response.body, response);

  // noStore headers
  out.headers.set("Cache-Control", "no-store");
  out.headers.set("Pragma", "no-cache");

  // Security headers
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("X-Frame-Options", "DENY");
  out.headers.set("Referrer-Policy", "no-referrer");
  out.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  out.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  out.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  out.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  out.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  out.headers.set("Content-Security-Policy", "default-src 'none'; sandbox");

  // CORS headers
  for (const [k, v] of Object.entries(corsHeaders)) {
    out.headers.set(k, v);
  }

  return out;
}
