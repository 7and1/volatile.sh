/**
 * Security utilities and middleware
 * Implements request validation, abuse detection, and security controls
 */

import { SECURITY, RATE_LIMIT, BLACKLIST } from "./constants.js";
import { HttpError } from "./http.js";
import { log } from "./monitoring.js";

/**
 * Blacklist key prefix for KV storage
 */
const BLACKLIST_PREFIX = "blacklist:";
const BLACKLIST_META_KEY = "blacklist:meta";

/**
 * In-memory blacklist cache with TTL
 * FIX: P0 - Added BLACKLIST_MAX_SIZE constant and time-based cleanup
 * FIX: P1 - Using constants from constants.js
 * Persists to KV for durability across worker restarts
 */
const ipBlacklist = new Map();

/**
 * Last sync timestamp for KV blacklist
 */
let lastKvSync = 0;

/**
 * FIX: P0 - Blacklist cleanup thresholds
 * FIX: P1 - Using constants from constants.js
 */
let lastCleanupTime = Date.now();

/**
 * Load blacklist from KV storage
 * @param {object} env - Cloudflare Workers environment
 * @private
 */
async function loadBlacklistFromKv(env) {
  if (!env?.SECURITY_KV) {
    return; // KV not configured, use in-memory only
  }

  try {
    const meta = await env.SECURITY_KV.get(BLACKLIST_META_KEY, "json");
    if (!meta) return;

    const now = Date.now();
    // Only load if not synced recently
    // FIX: P1 - Using constants from constants.js
    if (now - lastKvSync < BLACKLIST.KV_SYNC_INTERVAL_MS) {
      return;
    }

    // Load all blacklist entries using list (if available) or iterate
    const list = await env.SECURITY_KV.list({ prefix: BLACKLIST_PREFIX });

    for (const key of list.keys) {
      if (key.name === BLACKLIST_META_KEY) continue;

      const entry = await env.SECURITY_KV.get(key.name, "json");
      if (entry && entry.expiresAt > now) {
        const ip = key.name.replace(BLACKLIST_PREFIX, "");
        ipBlacklist.set(ip, entry);
      }
    }

    lastKvSync = now;
    log("info", "Loaded blacklist from KV", {
      count: ipBlacklist.size,
    });
  } catch (err) {
    log("warn", "Failed to load blacklist from KV", {
      error: err.message,
    });
  }
}

/**
 * Save blacklist entry to KV storage
 * @param {string} ip - IP address to blacklist
 * @param {object} entry - Blacklist entry
 * @param {object} env - Cloudflare Workers environment
 * @private
 */
async function saveBlacklistToKv(ip, entry, env) {
  if (!env?.SECURITY_KV) {
    return; // KV not configured
  }

  try {
    const key = BLACKLIST_PREFIX + ip;
    await env.SECURITY_KV.put(key, JSON.stringify(entry), {
      expirationTtl: Math.floor((entry.expiresAt - Date.now()) / 1000),
    });

    // Update metadata
    const meta = { lastUpdate: Date.now(), count: ipBlacklist.size };
    await env.SECURITY_KV.put(BLACKLIST_META_KEY, JSON.stringify(meta));

    log("info", "Saved blacklist entry to KV", { ip });
  } catch (err) {
    log("warn", "Failed to save blacklist to KV", {
      error: err.message,
    });
  }
}

/**
 * Remove blacklist entry from KV storage
 * @param {string} ip - IP address to remove
 * @param {object} env - Cloudflare Workers environment
 * @private
 */
async function removeBlacklistFromKv(ip, env) {
  if (!env?.SECURITY_KV) {
    return;
  }

  try {
    const key = BLACKLIST_PREFIX + ip;
    await env.SECURITY_KV.delete(key);
    log("info", "Removed blacklist entry from KV", { ip });
  } catch (err) {
    log("warn", "Failed to remove blacklist from KV", {
      error: err.message,
    });
  }
}

/**
 * Request validation middleware
 * Validates request size, URL length, and headers
 */
export function validateRequest(request) {
  const url = new URL(request.url);

  // Validate URL length
  if (request.url.length > SECURITY.MAX_URL_LENGTH) {
    throw new HttpError(414, "URL_TOO_LONG", "URL exceeds maximum length");
  }

  // Validate request size
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > SECURITY.MAX_REQUEST_SIZE) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request exceeds maximum size");
  }

  // Validate headers size (prevent header bomb attacks)
  let totalHeaderSize = 0;
  for (const [key, value] of request.headers) {
    totalHeaderSize += key.length + value.length;
    if (totalHeaderSize > SECURITY.MAX_HEADER_SIZE) {
      throw new HttpError(431, "HEADERS_TOO_LARGE", "Request headers too large");
    }
  }

  // Validate HTTP method
  const allowedMethods = ["GET", "POST", "OPTIONS", "HEAD"];
  if (!allowedMethods.includes(request.method)) {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "HTTP method not allowed");
  }

  return true;
}

/**
 * Check if IP is blacklisted
 * FIX: P0 - Added time-based cleanup trigger
 * @param {string} ip - IP address to check
 * @param {object} env - Cloudflare Workers environment (optional, for KV sync)
 * @returns {Promise<boolean>} - True if IP is blacklisted
 */
export async function isBlacklisted(ip, env) {
  // FIX: P0 - Periodic time-based cleanup to prevent memory growth
  // FIX: P1 - Using constants from constants.js
  const now = Date.now();
  if (now - lastCleanupTime > BLACKLIST.CLEANUP_INTERVAL_MS) {
    cleanupBlacklist();
    lastCleanupTime = now;
  }

  // Periodically sync from KV for freshness across workers
  if (env && now - lastKvSync > BLACKLIST.KV_SYNC_INTERVAL_MS) {
    await loadBlacklistFromKv(env);
  }

  const entry = ipBlacklist.get(ip);
  if (!entry) return false;

  // Check if ban has expired
  if (now > entry.expiresAt) {
    ipBlacklist.delete(ip);
    // Also remove from KV in background
    if (env) {
      removeBlacklistFromKv(ip, env).catch(() => {});
    }
    return false;
  }

  return true;
}

/**
 * Add IP to blacklist
 * @param {string} ip - IP address to blacklist
 * @param {string} reason - Reason for blacklisting
 * @param {number} durationMs - Duration of ban in milliseconds
 * @param {object} env - Cloudflare Workers environment (optional, for KV persistence)
 */
export async function blacklistIp(
  ip,
  reason = "abuse",
  durationMs = RATE_LIMIT.BAN_DURATION_MS,
  env
) {
  const expiresAt = Date.now() + durationMs;
  const entry = {
    reason,
    expiresAt,
    timestamp: Date.now(),
  };

  ipBlacklist.set(ip, entry);

  log("warn", "IP blacklisted", {
    ip,
    reason,
    expiresAt: new Date(expiresAt).toISOString(),
  });

  // Persist to KV if available
  if (env) {
    await saveBlacklistToKv(ip, entry, env);
  }

  // FIX: P0 - Automatic cleanup (garbage collection) with reduced threshold
  // FIX: P1 - Using constants from constants.js
  if (ipBlacklist.size > BLACKLIST.MAX_SIZE) {
    cleanupBlacklist();
  }
}

/**
 * Manually remove IP from blacklist (for admin use)
 * @param {string} ip - IP address to remove
 * @param {object} env - Cloudflare Workers environment
 */
export async function unblacklistIp(ip, env) {
  ipBlacklist.delete(ip);
  if (env) {
    await removeBlacklistFromKv(ip, env);
  }

  log("info", "IP removed from blacklist", { ip });
  return true;
}

/**
 * Clean up expired blacklist entries
 * @private
 */
function cleanupBlacklist() {
  const now = Date.now();
  let removed = 0;

  for (const [ip, entry] of ipBlacklist) {
    if (now > entry.expiresAt) {
      ipBlacklist.delete(ip);
      removed++;
    }
  }

  if (removed > 0) {
    log("info", "Cleaned up blacklist", {
      removed,
      remaining: ipBlacklist.size,
    });
  }
}

/**
 * Detect abuse based on rate limit violations
 * Returns true if IP should be blacklisted
 */
export function detectAbuse(rateLimitData, limit) {
  if (!rateLimitData || rateLimitData.allowed) return false;

  // Check if request count exceeds threshold multiplier
  const count = rateLimitData.count || 0;
  const threshold = limit * RATE_LIMIT.ABUSE_THRESHOLD_MULTIPLIER;

  return count >= threshold;
}

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== "string") return "";

  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength);

  // Remove control characters except newline and tab
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Validate Content-Type header
 */
export function validateContentType(request, expectedTypes = ["application/json"]) {
  const contentType = request.headers.get("content-type") || "";
  const normalized = contentType.toLowerCase().split(";")[0].trim();

  for (const expected of expectedTypes) {
    if (normalized === expected.toLowerCase()) {
      return true;
    }
  }

  throw new HttpError(
    415,
    "UNSUPPORTED_MEDIA_TYPE",
    "Expected Content-Type: " + expectedTypes.join(" or ")
  );
}

/**
 * Generate security.txt content
 * See: https://securitytxt.org/
 */
export function generateSecurityTxt(env = {}) {
  const contact = env.SECURITY_CONTACT || "security@volatile.sh";
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return [
    "Contact: " + contact,
    "Expires: " + expires,
    "Preferred-Languages: en",
    "Canonical: https://volatile.sh/.well-known/security.txt",
    "Policy: https://volatile.sh/security-policy",
    "Acknowledgments: https://volatile.sh/security-acknowledgments",
  ].join("\n");
}
