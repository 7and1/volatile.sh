import { RATE_LIMIT, CACHE } from "./constants.js";
import { json, createErrorResponse } from "./http.js";
import { base64Url, getClientIp, sha256Bytes } from "./ip.js";
import { rateLimitCache } from "./cache.js";
import { deduplicate, rateLimitKey } from "./deduplication.js";
import { circuitBreakers } from "./circuitBreaker.js";
import { detectAbuse, blacklistIp } from "./security.js";
import { log } from "./monitoring.js";

export async function checkRateLimit(request, env, scope) {
  if (!env?.RATE_LIMIT) {
    return { ok: true };
  }

  const ip = getClientIp(request) || "unknown";
  const digest = await sha256Bytes(ip);
  const shard = digest[0].toString(16).padStart(2, "0");
  const keyHash = base64Url(digest);

  const windowMs = Number(env.RATE_LIMIT_WINDOW_MS || RATE_LIMIT.WINDOW_MS);
  const limit =
    scope === "create"
      ? Number(env.RATE_LIMIT_CREATE_PER_WINDOW || RATE_LIMIT.CREATE_PER_WINDOW)
      : Number(env.RATE_LIMIT_READ_PER_WINDOW || RATE_LIMIT.READ_PER_WINDOW);

  const cacheKey = scope + ":" + keyHash;

  // Check cache first
  const cached = rateLimitCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    log("debug", "Rate limit cache hit", { ip, scope });

    // Still enforce limit even from cache
    if (!cached.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((cached.resetAt - Date.now()) / 1000));

      return {
        ok: false,
        response: json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Too many requests. Try again later.",
            },
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": String(cached.limit),
              "X-RateLimit-Remaining": String(cached.remaining),
              "X-RateLimit-Reset": String(cached.resetAt),
              "Retry-After": String(retryAfterSec),
            },
          }
        ),
      };
    }

    return {
      ok: true,
      headers: {
        "X-RateLimit-Limit": String(cached.limit),
        "X-RateLimit-Remaining": String(cached.remaining),
        "X-RateLimit-Reset": String(cached.resetAt),
      },
    };
  }

  // Deduplicate concurrent checks
  const dedupeKey = rateLimitKey(ip, scope);

  try {
    const result = await deduplicate(dedupeKey, async () => {
      return checkRateLimitDO(env, shard, keyHash, scope, limit, windowMs);
    });

    // Cache the result
    const cacheTtl = Math.min(CACHE.RATE_LIMIT_TTL_MS, result.resetAt - Date.now());
    rateLimitCache.set(cacheKey, result, cacheTtl);

    // Detect abuse
    if (!result.allowed && detectAbuse(result, limit)) {
      blacklistIp(ip, "rate_limit_abuse");
      log("warn", "IP blacklisted for abuse", {
        ip,
        scope,
        count: result.count,
        limit,
      });
    }

    if (!result.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));

      return {
        ok: false,
        response: json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Too many requests. Try again later.",
            },
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": String(result.limit),
              "X-RateLimit-Remaining": String(result.remaining),
              "X-RateLimit-Reset": String(result.resetAt),
              "Retry-After": String(retryAfterSec),
            },
          }
        ),
      };
    }

    return {
      ok: true,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetAt),
      },
    };
  } catch (error) {
    log("error", "Rate limit check failed", {
      error: error.message,
      ip,
      scope,
    });

    // SECURITY: Fail closed with conservative local fallback
    // This prevents abuse when rate limiter DO is unavailable
    // Use a very conservative limit (10% of normal) when in degraded mode
    const degradedLimit = Math.max(1, Math.floor(limit * 0.1));
    const now = Date.now();
    const degradedKey = `degraded:${scope}:${ip}`;

    // Simple in-memory counter for degraded mode
    const degradedCount = (rateLimitCache.get(degradedKey)?.count || 0) + 1;
    rateLimitCache.set(degradedKey, { count: degradedCount }, 60000); // 1 minute window

    if (degradedCount > degradedLimit) {
      log("warn", "Rate limited in degraded mode", {
        ip,
        scope,
        degradedCount,
        degradedLimit,
      });
      return {
        ok: false,
        response: json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Too many requests. Try again later.",
            },
          },
          { status: 429, headers: { "Retry-After": "60" } }
        ),
      };
    }

    return { ok: true };
  }
}

/**
 * Check rate limit via Durable Object with circuit breaker
 * @private
 */
async function checkRateLimitDO(env, shard, keyHash, scope, limit, windowMs) {
  const doId = env.RATE_LIMIT.idFromName("rl:" + shard);
  const stub = env.RATE_LIMIT.get(doId);

  // Use circuit breaker to protect against DO failures
  return circuitBreakers.rateLimit.execute(async () => {
    const res = await stub.fetch("http://do/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: scope + ":" + keyHash,
        limit,
        windowMs,
      }),
    });

    const data = await res.json();

    return {
      allowed: data.allowed,
      limit: data.limit ?? limit,
      remaining: data.remaining ?? 0,
      resetAt: data.resetAt ?? Date.now() + windowMs,
      count: data.count ?? 0,
    };
  });
}
