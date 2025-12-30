/**
 * API utility tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWithRetry, getApiErrorMessage } from "../api";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return response on first successful fetch", async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("https://example.com/api");

    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should retry on 500 error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    const promise = fetchWithRetry("https://example.com/api", {
      retryConfig: { maxRetries: 2, initialDelay: 100 },
    });

    // Advance timer for retry delay
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should call onRetry callback when retrying", async () => {
    const onRetry = vi.fn();
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    const promise = fetchWithRetry("https://example.com/api", {
      retryConfig: { maxRetries: 2, initialDelay: 100 },
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onRetry).toHaveBeenCalledWith(1, 2, 100);
  });

  it("should not retry on 404 error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const result = await fetchWithRetry("https://example.com/api");

    expect(result.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should not retry on 400 error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 } as Response);

    const result = await fetchWithRetry("https://example.com/api");

    expect(result.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should retry on 429 rate limit error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    const promise = fetchWithRetry("https://example.com/api", {
      retryConfig: { maxRetries: 2, initialDelay: 100 },
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should give up after max retries", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const promise = fetchWithRetry("https://example.com/api", {
      retryConfig: { maxRetries: 2, initialDelay: 50 },
    });

    // Advance through all retry delays
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toThrow("Network error");
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe("getApiErrorMessage", () => {
  it("should return custom message for known status codes", () => {
    const mockResponse = { status: 429 } as Response;
    const result = getApiErrorMessage(undefined, mockResponse);
    expect(result).toBe("Too many requests - please wait a moment");
  });

  it("should return custom message for 404", () => {
    const mockResponse = { status: 404 } as Response;
    const result = getApiErrorMessage(undefined, mockResponse);
    expect(result).toContain("not found");
  });

  it("should return custom message for 413", () => {
    const mockResponse = { status: 413 } as Response;
    const result = getApiErrorMessage(undefined, mockResponse);
    expect(result).toContain("too large");
  });

  it("should return generic message for unknown error", () => {
    const result = getApiErrorMessage(new Error("Unknown error"));
    expect(result).toBe("An unexpected error occurred - please try again");
  });

  it("should handle network errors", () => {
    const result = getApiErrorMessage(new TypeError("Failed to fetch"));
    expect(result).toContain("Network error");
  });
});
