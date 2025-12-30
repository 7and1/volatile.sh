/**
 * Circuit Breaker pattern implementation
 * Protects against cascading failures in Durable Objects
 */

import { CIRCUIT_BREAKER } from "./constants.js";
import { log } from "./monitoring.js";

/**
 * Circuit states
 */
export const State = {
  CLOSED: "CLOSED", // Normal operation
  OPEN: "OPEN", // Failing, reject requests
  HALF_OPEN: "HALF_OPEN", // Testing if service recovered
};

/**
 * Circuit Breaker for Durable Objects
 */
export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    this.failureThreshold = options.failureThreshold || CIRCUIT_BREAKER.FAILURE_THRESHOLD;
    this.successThreshold = options.successThreshold || CIRCUIT_BREAKER.SUCCESS_THRESHOLD;
    this.timeout = options.timeout || CIRCUIT_BREAKER.TIMEOUT_MS;
    this.resetTimeout = options.resetTimeout || CIRCUIT_BREAKER.RESET_TIMEOUT_MS;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn) {
    if (this.state === State.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error("Circuit breaker is OPEN for " + this.name);
      }
      // Try to recover
      this.state = State.HALF_OPEN;
      log("info", "Circuit breaker entering HALF_OPEN state", {
        name: this.name,
      });
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute function with timeout using AbortController
   * FIX: P0 - Properly cancel timeout when fn() completes to prevent timer leaks
   * @private
   */
  async executeWithTimeout(fn) {
    const controller = new AbortController();
    const signal = controller.signal;

    // Create timeout promise with cleanup
    const timeoutPromise = new Promise((_, reject) => {
      const timerId = setTimeout(() => {
        reject(new Error("Circuit breaker timeout"));
      }, this.timeout);

      // Clean up timer when promise settles (success or failure)
      signal.addEventListener("abort", () => {
        clearTimeout(timerId);
      });
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      // Always abort to ensure timer cleanup
      controller.abort();
    }
  }

  /**
   * Handle successful execution
   * @private
   */
  onSuccess() {
    this.failureCount = 0;

    if (this.state === State.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this.state = State.CLOSED;
        this.successCount = 0;
        log("info", "Circuit breaker CLOSED", { name: this.name });
      }
    }
  }

  /**
   * Handle failed execution
   * @private
   */
  onFailure() {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.successCount = 0;

    // If in HALF_OPEN state, any failure immediately opens the circuit
    if (this.state === State.HALF_OPEN) {
      this.state = State.OPEN;
      this.nextAttemptTime = Date.now() + this.resetTimeout;

      log("warn", "Circuit breaker OPEN (failed in HALF_OPEN)", {
        name: this.name,
        failureCount: this.failureCount,
        nextAttempt: new Date(this.nextAttemptTime).toISOString(),
      });
      return;
    }

    // In CLOSED state, open after threshold is reached
    if (this.state === State.CLOSED && this.failureCount >= this.failureThreshold) {
      this.state = State.OPEN;
      this.nextAttemptTime = Date.now() + this.resetTimeout;

      log("warn", "Circuit breaker OPEN", {
        name: this.name,
        failureCount: this.failureCount,
        nextAttempt: new Date(this.nextAttemptTime).toISOString(),
      });
    }
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
}

/**
 * Global circuit breakers for Durable Objects
 */
export const circuitBreakers = {
  secrets: new CircuitBreaker("SecretStore"),
  rateLimit: new CircuitBreaker("RateLimiter"),
};
