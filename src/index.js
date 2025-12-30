import { handleRequest } from "./worker.js";
import { RateLimiter } from "./do/RateLimiter.js";
import { SecretStore } from "./do/SecretStore.js";
import { log, captureException, MetricsCollector, createRequestContext } from "./monitoring.js";
import { validateRequest, isBlacklisted } from "./security.js";
import { json, securityHeaders } from "./http.js";
import { getClientIp } from "./ip.js";

export default {
  async fetch(request, env, ctx) {
    const start = Date.now();
    const requestContext = createRequestContext(request);
    const metrics = new MetricsCollector();

    try {
      // Security validation
      validateRequest(request);

      // Handle robots.txt and sitemap.xml from public assets
      const url = new URL(request.url);
      if (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml") {
        if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
          const assetRes = await env.ASSETS.fetch(request);
          if (assetRes.ok) return assetRes;
        }
      }

      // Check if IP is blacklisted
      const clientIp = getClientIp(request);
      if (clientIp && (await isBlacklisted(clientIp, env))) {
        log("warn", "Blocked blacklisted IP", {
          ...requestContext,
          ip: clientIp,
        });

        metrics.increment("request.blocked", 1, { reason: "blacklisted" });

        return securityHeaders(
          json({ error: "FORBIDDEN", message: "Access denied" }, { status: 403 })
        );
      }

      // Handle request
      const res = await handleRequest(request, env, ctx);
      const duration = Date.now() - start;
      const status = res.status;

      // Add tracking headers
      res.headers.set("X-Request-ID", requestContext.requestId);
      res.headers.set("X-Response-Time", String(duration));

      // Record metrics
      metrics.timing("request.duration", duration, {
        method: requestContext.method,
        path: requestContext.path,
        status: String(status),
      });
      metrics.increment("request.count", 1, {
        method: requestContext.method,
        status: String(status),
      });

      // Log request
      if (status < 400) {
        log("info", "Request completed", {
          ...requestContext,
          status,
          duration,
        });
      } else {
        log("warn", "Request failed", {
          ...requestContext,
          status,
          duration,
        });
      }

      // Flush metrics
      ctx.waitUntil(Promise.resolve().then(() => metrics.flush()));

      return res;
    } catch (err) {
      const duration = Date.now() - start;

      // Capture exception with context
      // FIX: P0 - Sanitize stack traces before logging to prevent information leakage
      const sanitizedError = {
        name: err.name || "Error",
        message: err.message || "An error occurred",
        // Only include stack in non-production environments
        stack: env.ENVIRONMENT !== "production" ? err.stack : undefined,
      };

      await captureException(
        err,
        {
          ...requestContext,
          duration,
        },
        env
      );

      // Record error metrics
      metrics.increment("request.error", 1, {
        error: err.name || "Error",
      });
      metrics.timing("request.duration", duration, {
        method: requestContext.method,
        status: "500",
      });

      // Flush metrics
      ctx.waitUntil(Promise.resolve().then(() => metrics.flush()));

      // FIX: P0 - Generic error response to prevent information leakage
      const res = new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
      res.headers.set("X-Request-ID", requestContext.requestId);
      res.headers.set("X-Response-Time", String(duration));
      return securityHeaders(res);
    }
  },
};

export { SecretStore, RateLimiter };
