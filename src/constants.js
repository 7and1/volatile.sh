export const TTL = {
  MIN_MS: 5 * 60 * 1000,
  DEFAULT_MS: 24 * 60 * 60 * 1000,
  MAX_MS: 7 * 24 * 60 * 60 * 1000,
};

export const LIMITS = {
  ENCRYPTED_MAX_CHARS: 1_400_000, // ~1MB base64url payload (includes overhead)
  ID_LEN: 16,
  ID_CHARS: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
};

export const RATE_LIMIT = {
  WINDOW_MS: 60 * 60 * 1000,
  CREATE_PER_WINDOW: 100,
  READ_PER_WINDOW: 1000,
  SHARDS: 256,
  ABUSE_THRESHOLD_MULTIPLIER: 5, // Ban after exceeding limit by 5x
  BAN_DURATION_MS: 24 * 60 * 60 * 1000, // 24 hour ban
};

export const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5, // Number of failures before opening circuit
  SUCCESS_THRESHOLD: 2, // Number of successes to close circuit
  TIMEOUT_MS: 10000, // 10 seconds
  RESET_TIMEOUT_MS: 60000, // 1 minute before attempting to close circuit
};

export const CACHE = {
  RATE_LIMIT_TTL_MS: 1000, // 1 second cache for rate limit checks
  MAX_SIZE: 1000, // Maximum number of cached entries
};

// FIX: P1 - Blacklist management constants
export const BLACKLIST = {
  MAX_SIZE: 1000, // Clean up when exceeding 1000 entries
  CLEANUP_INTERVAL_MS: 300_000, // Run cleanup every 5 minutes
  KV_SYNC_INTERVAL_MS: 60_000, // Sync with KV every minute
};

export const SECURITY = {
  MAX_REQUEST_SIZE: 2_000_000, // 2MB max request size
  MAX_URL_LENGTH: 2048,
  MAX_HEADER_SIZE: 8192,
  // FIX: P1 - Extracted magic numbers for IP validation
  MAX_IPV6_LENGTH: 45, // Maximum IPv6 address length
  MAX_IPV4_OCTET: 255, // Maximum value for IPv4 octet
  MIN_IPV6_COLONS: 2, // Minimum colons in valid IPv6
  MAX_IPV6_COLONS: 7, // Maximum colons in valid IPv6
  IPV4_NUM_PARTS: 4, // Number of octets in IPv4
  IPV6_NUM_HEXTETS: 8, // Number of hextets in IPv6
  MAX_HEX_DIGITS: 4, // Maximum hex digits per hextet
};

/**
 * CORS allowed origins
 * Can be overridden via ALLOWED_ORIGINS environment variable (comma-separated)
 * Example: ALLOWED_ORIGINS=https://example.com,https://app.example.com
 */
export const PRODUCTION_ALLOWED_ORIGINS = ["https://volatile.sh", "https://www.volatile.sh"];

export const DEVELOPMENT_ALLOWED_ORIGINS = [
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/**
 * Get allowed origins based on environment
 * @param {Object} env - Environment object with optional ENVIRONMENT variable
 * @returns {string[]} Array of allowed origins
 */
export function getAllowedOrigins(env) {
  const isDevelopment = env?.ENVIRONMENT === "development" || env?.DEV === "true";
  if (isDevelopment) {
    return [...PRODUCTION_ALLOWED_ORIGINS, ...DEVELOPMENT_ALLOWED_ORIGINS];
  }
  return PRODUCTION_ALLOWED_ORIGINS;
}

// Kept for backward compatibility - use getAllowedOrigins(env) instead
export const DEFAULT_ALLOWED_ORIGINS = PRODUCTION_ALLOWED_ORIGINS;

/**
 * Application version (set via environment variable or default)
 */
export const APP_VERSION = "1.0.0";

/**
 * Application start time (for uptime tracking)
 */
export const APP_START_TIME = Date.now();
