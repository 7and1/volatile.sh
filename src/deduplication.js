/**
 * Request deduplication utilities
 * Prevents duplicate concurrent requests from overwhelming the system
 */

import { log } from "./monitoring.js";

/**
 * In-flight request tracker
 * Stores { promise, responseData } to allow cloning responses for multiple consumers
 */
const inflightRequests = new Map();

/**
 * Deduplicate concurrent requests
 * If multiple identical requests arrive simultaneously, only execute once
 *
 * FIX: P0 - Clone response for each consumer to prevent "body already consumed" errors
 * The original Response body can only be read once. We now:
 * 1. Execute the request and read/store the response data (status, headers, body)
 * 2. Return a new Response clone for each waiting request
 *
 * Note: Also handles plain objects for backward compatibility with tests
 */
export async function deduplicate(key, fn) {
  // Check if request is already in flight
  if (inflightRequests.has(key)) {
    log("info", "Deduplicating request", { key });
    const cached = inflightRequests.get(key);

    // Wait for the original request to complete
    const cachedData = await cached.promise;

    // If it's a Response-like object (has isResponse flag), reconstruct Response
    if (cachedData.isResponse) {
      return new Response(cachedData.body, {
        status: cachedData.status,
        statusText: cachedData.statusText,
        headers: new Headers(cachedData.headers),
      });
    }

    // Otherwise return the plain object (for tests/non-Response usage)
    return cachedData.data;
  }

  // Execute and track - store response data, not the Response object
  const promise = (async () => {
    const response = await fn();

    // Check if this is a Response object (has clone method)
    if (response && typeof response.clone === "function") {
      // Clone and read the response body to store it
      const clonedResponse = response.clone();
      const bodyText = await clonedResponse.text();

      // Store response data (not the Response object itself)
      return {
        isResponse: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: bodyText,
      };
    }

    // Plain object - store as-is
    return { isResponse: false, data: response };
  })();

  inflightRequests.set(key, { promise });

  try {
    const cachedData = await promise;

    // Return appropriate type based on what was stored
    if (cachedData.isResponse) {
      return new Response(cachedData.body, {
        status: cachedData.status,
        statusText: cachedData.statusText,
        headers: new Headers(cachedData.headers),
      });
    }

    return cachedData.data;
  } finally {
    // Remove key after completion
    inflightRequests.delete(key);
  }
}

/**
 * Generate deduplication key for secret operations
 */
export function secretKey(operation, id) {
  return "secret:" + operation + ":" + id;
}

/**
 * Generate deduplication key for rate limit checks
 */
export function rateLimitKey(ip, scope) {
  return "ratelimit:" + scope + ":" + ip;
}

/**
 * Clear all in-flight requests (for testing)
 */
export function clearInflight() {
  inflightRequests.clear();
}

/**
 * Get number of in-flight requests
 */
export function getInflightCount() {
  return inflightRequests.size;
}
