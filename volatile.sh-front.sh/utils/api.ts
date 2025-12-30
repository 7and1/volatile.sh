/**
 * API utilities with retry logic and exponential backoff
 */

export interface RetryConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Sleep for a specified number of milliseconds
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay
 */
const calculateDelay = (attempt: number, config: Required<RetryConfig>): number => {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelay);
};

/**
 * Check if a response status should trigger a retry
 */
const isRetryableStatus = (status: number, retryableStatuses: number[]): boolean => {
  return retryableStatuses.includes(status);
};

/**
 * Check if an error is a network error
 */
const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    // Network errors are often TypeErrors (e.g., "Failed to fetch")
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("offline") ||
      msg.includes("timeout")
    );
  }
  return false;
};

export interface FetchWithRetryOptions extends RequestInit {
  retryConfig?: RetryConfig;
  onRetry?: (attempt: number, maxRetries: number, delay: number) => void;
}

/**
 * Fetch with automatic retry and exponential backoff
 *
 * @param url - URL to fetch
 * @param options - Fetch options including retry configuration
 * @returns Response promise
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { retryConfig, onRetry, ...fetchOptions } = options;
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // If successful or non-retryable error, return
      if (response.ok || !isRetryableStatus(response.status, config.retryableStatuses)) {
        return response;
      }

      // Store response for potential return if all retries fail
      lastResponse = response;

      // Calculate delay and notify callback
      if (attempt < config.maxRetries) {
        const delay = calculateDelay(attempt, config);
        onRetry?.(attempt + 1, config.maxRetries, delay);
        await sleep(delay);
      }
    } catch (error) {
      // Network errors should be retried
      if (isNetworkError(error) && attempt < config.maxRetries) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const delay = calculateDelay(attempt, config);
        onRetry?.(attempt + 1, config.maxRetries, delay);
        await sleep(delay);
      } else {
        // Non-network error or last attempt - throw immediately
        throw error;
      }
    }
  }

  // If we get here, all retries failed
  if (lastResponse) {
    return lastResponse;
  }
  throw lastError || new Error("All retry attempts failed");
}

/**
 * User-friendly error message generator
 */
export const getApiErrorMessage = (err: unknown, response?: Response): string => {
  // Check response status first if available
  if (response) {
    switch (response.status) {
      case 400:
        return "Invalid request - please check your input";
      case 401:
        return "Unauthorized - authentication required";
      case 403:
        return "Access forbidden";
      case 404:
        return "Secret not found - it may have already been accessed";
      case 413:
        return "Secret too large - please reduce the text size";
      case 429:
        return "Too many requests - please wait a moment and try again";
      case 500:
        return "Server error - please try again";
      case 502:
        return "Bad gateway - server temporarily unavailable";
      case 503:
        return "Service unavailable - please try again later";
      case 504:
        return "Gateway timeout - please try again";
    }
  }

  // Check error messages
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("offline")) {
      return "Network error - please check your connection and try again";
    }
    if (msg.includes("timeout")) {
      return "Request timeout - please try again";
    }
    if (msg.includes("413") || msg.includes("too large")) {
      return "Secret too large - please reduce the text size";
    }
    if (msg.includes("429") || msg.includes("rate")) {
      return "Too many requests - please wait a moment";
    }
    if (msg.includes("500")) {
      return "Server error - please try again";
    }
    // Return the original error message if it's user-friendly
    if (msg.length < 100 && !msg.includes("stack")) {
      return err.message;
    }
  }

  return "An unexpected error occurred - please try again";
};
