import { LIMITS } from "./constants.js";

/**
 * Generate a cryptographically secure random ID
 * Uses rejection sampling to avoid modulo bias
 */
export function generateId() {
  const charLen = LIMITS.ID_CHARS.length; // 62 characters
  const maxValid = 256 - (256 % charLen); // 248 = largest multiple of 62 < 256
  const result = [];

  while (result.length < LIMITS.ID_LEN) {
    // Generate more bytes than needed to reduce iterations
    const bytes = new Uint8Array(LIMITS.ID_LEN * 2);
    crypto.getRandomValues(bytes);

    for (const b of bytes) {
      if (result.length >= LIMITS.ID_LEN) break;
      // Reject values that would cause bias (248-255)
      if (b < maxValid) {
        result.push(LIMITS.ID_CHARS[b % charLen]);
      }
    }
  }

  return result.join("");
}
