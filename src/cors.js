import { getAllowedOrigins } from "./constants.js";

/**
 * Rate limit headers that should be exposed to clients
 */
const EXPOSED_HEADERS = [
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "Retry-After",
  "X-Request-ID",
  "X-API-Version",
].join(", ");

export function corsHeadersFor(request, env, { allowMethods, allowHeaders } = {}) {
  const origin = request.headers.get("origin");
  const allowed = parseAllowedOrigins(env);

  const base = {
    "Access-Control-Allow-Methods": allowMethods || "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders || "Content-Type",
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  // Non-browser clients won't send Origin.
  // Security: Don't return CORS headers for requests without Origin
  // This prevents API abuse while still allowing legitimate curl/CLI usage
  // (they don't need CORS headers anyway since CORS is browser-only)
  if (!origin) return base;

  if (!allowed.has(origin)) return null;
  return { ...base, "Access-Control-Allow-Origin": origin };
}

function parseAllowedOrigins(env) {
  const raw = env?.ALLOWED_ORIGINS;
  if (typeof raw === "string" && raw.trim()) {
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  // Use environment-aware origins
  return new Set(getAllowedOrigins(env));
}
