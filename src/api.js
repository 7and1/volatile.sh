import { LIMITS, TTL, APP_VERSION, APP_START_TIME } from "./constants.js";
import { corsHeadersFor } from "./cors.js";
import {
  HttpError,
  isBase64Url,
  json,
  noStore,
  securityHeaders,
  withHeaders,
  readJson,
  finalizeResponse,
  generateRequestId,
  createErrorResponse,
} from "./http.js";
import { generateId } from "./cryptoId.js";
import { checkRateLimit } from "./rateLimit.js";
import { circuitBreakers } from "./circuitBreaker.js";
import { deduplicate, secretKey } from "./deduplication.js";
import { log, getBusinessMetrics, trackMetric } from "./monitoring.js";

export async function handleApi(request, env, url) {
  const requestId = generateRequestId();
  const cors = corsHeadersFor(request, env);

  // Common headers for all API responses
  const commonHeaders = {
    "X-Request-ID": requestId,
    "X-API-Version": APP_VERSION,
  };

  if (request.method === "OPTIONS") {
    if (!cors) {
      return finalizeResponse(
        json(createErrorResponse("CORS_FORBIDDEN", "Origin not allowed", 403, requestId), {
          status: 403,
        }),
        commonHeaders
      );
    }
    return finalizeResponse(new Response(null, { status: 204 }), { ...cors, ...commonHeaders });
  }

  if (!cors) {
    return finalizeResponse(
      json(createErrorResponse("CORS_FORBIDDEN", "Origin not allowed", 403, requestId), {
        status: 403,
      }),
      commonHeaders
    );
  }

  try {
    if (url.pathname === "/api/health" && request.method === "GET") {
      return finalize(json(await getHealthStatus(env), { status: 200 }), cors, commonHeaders);
    }

    if (url.pathname === "/api/secrets" && request.method === "POST") {
      const rl = await checkRateLimit(request, env, "create");
      if (!rl.ok) return finalize(rl.response, cors, commonHeaders);
      const res = await createSecret(request, env);
      return finalize(withHeaders(res, rl.headers || {}), cors, commonHeaders);
    }

    const match = url.pathname.match(/^\/api\/secrets\/([a-zA-Z0-9]+)$/);
    if (match && request.method === "GET") {
      const rl = await checkRateLimit(request, env, "read");
      if (!rl.ok) return finalize(rl.response, cors, commonHeaders);
      const res = await readSecret(match[1], env, requestId);
      return finalize(withHeaders(res, rl.headers || {}), cors, commonHeaders);
    }

    const validateMatch = url.pathname.match(/^\/api\/secrets\/([a-zA-Z0-9]+)\/validate$/);
    if (validateMatch && request.method === "GET") {
      const rl = await checkRateLimit(request, env, "read");
      if (!rl.ok) return finalize(rl.response, cors, commonHeaders);
      const res = await validateSecret(validateMatch[1], env, requestId);
      return finalize(withHeaders(res, rl.headers || {}), cors, commonHeaders);
    }

    return finalize(
      json(createErrorResponse("NOT_FOUND", "Endpoint not found", 404, requestId), { status: 404 }),
      cors,
      commonHeaders
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return finalize(
        json(createErrorResponse(err.code, err.message, err.status, requestId, err.details), {
          status: err.status,
          headers: err.headers,
        }),
        cors,
        commonHeaders
      );
    }

    // FIX: P0 - Sanitize stack traces to prevent information leakage
    const isProduction = env?.ENVIRONMENT === "production";
    log("error", "API error", {
      error: err.message,
      requestId,
      // Only include stack in non-production
      stack: isProduction ? undefined : err.stack,
      path: url.pathname,
    });

    return finalize(
      json(createErrorResponse("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId), {
        status: 500,
      }),
      cors,
      commonHeaders
    );
  }
}

function finalize(response, corsHeaders, commonHeaders = {}) {
  // P0 Performance Fix: Use single-pass finalizeResponse instead of 3x cloning
  return finalizeResponse(response, { ...corsHeaders, ...commonHeaders });
}

/**
 * Get health status with version, uptime, and DO status
 */
async function getHealthStatus(env) {
  const uptime = Date.now() - APP_START_TIME;
  const metrics = getBusinessMetrics();

  // Check Durable Object health
  const doStatus = {
    secrets: "unknown",
    rateLimiter: "unknown",
  };

  // Try to ping DOs (non-blocking)
  try {
    if (env?.SECRETS) {
      // Quick health check by creating a test DO stub
      const testDoId = env.SECRETS.idFromName("health-check-" + Date.now());
      const testStub = env.SECRETS.get(testDoId);
      // We don't actually fetch, just verify binding exists
      doStatus.secrets = "available";
    } else {
      doStatus.secrets = "unavailable";
    }

    if (env?.RATE_LIMIT) {
      doStatus.rateLimiter = "available";
    } else {
      doStatus.rateLimiter = "unavailable";
    }
  } catch (err) {
    doStatus.secrets = "error";
    doStatus.rateLimiter = "error";
  }

  return {
    ok: true,
    version: APP_VERSION,
    uptime: {
      ms: uptime,
      seconds: Math.floor(uptime / 1000),
    },
    do: doStatus,
    metrics: {
      create: metrics.create,
      read: metrics.read,
    },
  };
}

async function createSecret(request, env) {
  const body = await readJson(request);
  const encrypted = body?.encrypted;
  const iv = body?.iv;
  const ttl = body?.ttl;

  // Validate presence and non-empty content
  if (!encrypted || !iv) {
    throw new HttpError(400, "MISSING_FIELDS", "Missing encrypted data or IV");
  }

  // Validate content is not empty after trimming
  if (typeof encrypted !== "string" || encrypted.trim().length === 0) {
    throw new HttpError(400, "EMPTY_CONTENT", "Encrypted data cannot be empty");
  }
  if (typeof iv !== "string" || iv.trim().length === 0) {
    throw new HttpError(400, "EMPTY_CONTENT", "IV cannot be empty");
  }

  if (!isBase64Url(encrypted) || !isBase64Url(iv)) {
    throw new HttpError(400, "INVALID_ENCODING", "Encrypted data and IV must be base64url");
  }

  // IV must decode to exactly 12 bytes for AES-GCM-256
  // 16 base64url chars = 12 bytes (after padding)
  if (iv.length < 16 || iv.length > 24) {
    throw new HttpError(400, "INVALID_IV_LENGTH", "IV must be 12 bytes (16-22 base64url chars)");
  }

  if (encrypted.length > LIMITS.ENCRYPTED_MAX_CHARS) {
    throw new HttpError(413, "SECRET_TOO_LARGE", "Secret too large (max ~1MB encrypted)");
  }

  const ttlMs = clampTtl(ttl);
  const expiresAt = Date.now() + ttlMs;

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateId();

    try {
      // Use circuit breaker and deduplication for DO access
      const storeRes = await circuitBreakers.secrets.execute(async () => {
        return deduplicate(secretKey("store", id), async () => {
          const doId = env.SECRETS.idFromName(id);
          const stub = env.SECRETS.get(doId);
          return stub.fetch("http://do/store", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ encrypted, iv, expiresAt }),
          });
        });
      });

      if (storeRes.status === 409) continue;
      if (!storeRes.ok) {
        const msg = await safeReadError(storeRes);
        throw new HttpError(500, "STORE_FAILED", msg || "Failed to store secret");
      }

      trackMetric("create", "success");
      log("info", "Secret created", { id, ttlMs, attempt });
      return json({ id, expiresAt }, { status: 201 });
    } catch (err) {
      log("warn", "Secret creation attempt failed", {
        id,
        attempt,
        error: err.message,
      });

      // If circuit breaker is open, fail immediately
      if (err.message.includes("Circuit breaker is OPEN")) {
        trackMetric("create", "failure");
        throw new HttpError(503, "SERVICE_UNAVAILABLE", "Secret store temporarily unavailable");
      }

      // Retry on other errors
      if (attempt === 4) {
        trackMetric("create", "failure");
        throw err;
      }
    }
  }

  trackMetric("create", "failure");
  throw new HttpError(500, "ID_GENERATION_FAILED", "Failed to allocate a unique secret ID");
}

async function readSecret(id, env, requestId) {
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) {
    trackMetric("read", "failure");
    throw new HttpError(400, "INVALID_ID", "Invalid secret ID");
  }

  try {
    // Use circuit breaker and deduplication for DO access
    const res = await circuitBreakers.secrets.execute(async () => {
      return deduplicate(secretKey("read", id), async () => {
        const doId = env.SECRETS.idFromName(id);
        const stub = env.SECRETS.get(doId);
        return stub.fetch("http://do/read");
      });
    });

    // FIX: P1 - Only parse JSON if response is OK (avoid unnecessary parsing)
    if (!res.ok) {
      trackMetric("read", "failure");
      log("info", "Secret read failed", { id, status: res.status });
      // Try to get error message, but don't fail if parsing fails
      try {
        const data = await res.json();
        const errorCode = data?.error || "SECRET_NOT_FOUND";
        const errorMessage = data?.message || "Secret not found or already read";
        return json(createErrorResponse(errorCode, errorMessage, res.status, requestId), {
          status: res.status,
        });
      } catch {
        return json(
          createErrorResponse(
            "SECRET_NOT_FOUND",
            "Secret not found or already read",
            res.status,
            requestId
          ),
          { status: res.status }
        );
      }
    }

    // Only parse JSON on success
    const data = await res.json();
    trackMetric("read", "success");
    log("info", "Secret read successfully", { id });
    return json({ encrypted: data.encrypted, iv: data.iv }, { status: 200 });
  } catch (err) {
    // If circuit breaker is open, return service unavailable
    if (err.message.includes("Circuit breaker is OPEN")) {
      trackMetric("read", "failure");
      throw new HttpError(503, "SERVICE_UNAVAILABLE", "Secret store temporarily unavailable");
    }
    trackMetric("read", "failure");
    throw err;
  }
}

function clampTtl(ttl) {
  const n = Number(ttl);
  const candidate = Number.isFinite(n) ? n : TTL.DEFAULT_MS;
  return Math.min(Math.max(candidate, TTL.MIN_MS), TTL.MAX_MS);
}

async function safeReadError(res) {
  try {
    const data = await res.json();
    return data?.error || data?.message;
  } catch {
    return null;
  }
}

/**
 * Validate secret status without consuming it
 * Returns metadata about the secret (status, creation time, expiration)
 * FIX: P1 - Only parse JSON when needed
 * FIX: P0 - Added circuit breaker protection for DO access
 */
async function validateSecret(id, env, requestId) {
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) {
    throw new HttpError(400, "INVALID_ID", "Invalid secret ID");
  }

  try {
    // FIX: P0 - Use circuit breaker for DO access (consistent with readSecret)
    const res = await circuitBreakers.secrets.execute(async () => {
      const doId = env.SECRETS.idFromName(id);
      const stub = env.SECRETS.get(doId);
      return stub.fetch("http://do/validate");
    });

    // FIX: P1 - Only parse JSON if response is OK (avoid unnecessary parsing)
    if (!res.ok) {
      try {
        const data = await res.json();
        const errorCode = data?.error || "SECRET_NOT_FOUND";
        const errorMessage = data?.message || "Secret not found";
        return json(createErrorResponse(errorCode, errorMessage, res.status, requestId), {
          status: res.status,
        });
      } catch {
        return json(
          createErrorResponse("SECRET_NOT_FOUND", "Secret not found", res.status, requestId),
          { status: res.status }
        );
      }
    }

    const data = await res.json();
    return json(
      {
        id,
        status: "ready",
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        ttl: data.ttl,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err.message.includes("Circuit breaker is OPEN")) {
      throw new HttpError(503, "SERVICE_UNAVAILABLE", "Secret store temporarily unavailable");
    }
    throw err;
  }
}
