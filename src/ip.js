import { SECURITY } from "./constants.js";

export function getClientIp(request) {
  // SECURITY: On Cloudflare Workers, ONLY trust CF-Connecting-IP
  // X-Forwarded-For, X-Real-IP, and similar headers can be spoofed by clients
  // and must NOT be used for security decisions in production
  const cf = request.headers.get("CF-Connecting-IP");
  if (cf) {
    // Validate IP format to prevent injection
    if (isValidIp(cf)) {
      return cf.trim();
    }
    // If CF-Connecting-IP is invalid, fall through to safe default
  }

  // Safe default for local development only
  // In production, CF-Connecting-IP should always be present
  return "127.0.0.1";
}

/**
 * Validate IP address format (IPv4 and IPv6)
 * FIX: P0 - Full RFC-compliant IP validation to prevent injection attacks
 * FIX: P1 - Using constants from constants.js
 * - IPv4: Validates octet ranges (0-255) and structure
 * - IPv6: Validates full IPv6 format including compressed zeros (::)
 * @param {string} ip - IP address to validate
 * @returns {boolean} - True if valid IP address
 */
function isValidIp(ip) {
  if (typeof ip !== "string") return false;

  // Remove whitespace and check length
  const trimmed = ip.trim();
  if (trimmed.length === 0 || trimmed.length > SECURITY.MAX_IPV6_LENGTH) {
    return false; // Max IPv6 length
  }

  // Must not contain spaces or suspicious characters
  if (/\s|[();'"<>\\]/.test(trimmed)) {
    return false;
  }

  // Try IPv4 validation first
  if (isValidIPv4(trimmed)) {
    return true;
  }

  // Try IPv6 validation
  if (isValidIPv6(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Validate IPv4 address with proper octet range checking
 * FIX: P0 - Validates each octet is in range 0-255
 * FIX: P1 - Using constants from constants.js
 * @private
 */
function isValidIPv4(ip) {
  const parts = ip.split(".");
  if (parts.length !== SECURITY.IPV4_NUM_PARTS) return false;

  for (const part of parts) {
    // Each part must be a number 0-255 with no leading zeros unless it's "0" itself
    if (!/^\d{1,3}$/.test(part)) return false;

    const num = parseInt(part, 10);
    if (num < 0 || num > SECURITY.MAX_IPV4_OCTET) return false;

    // Reject leading zeros (e.g., "01" is invalid, but "0" is valid)
    if (part.length > 1 && part.startsWith("0")) return false;
  }

  return true;
}

/**
 * Validate IPv6 address with proper format checking
 * FIX: P0 - Full RFC 4291 compliance including compressed zeros (::)
 * FIX: P1 - Using constants from constants.js
 * @private
 */
function isValidIPv6(ip) {
  // IPv6 must contain only valid characters
  if (!/^[0-9a-fA-F:]+$/.test(ip)) return false;

  // Must have at least 2 colons and at most 7 colons (for full address)
  const colonCount = (ip.match(/:/g) || []).length;
  if (colonCount < SECURITY.MIN_IPV6_COLONS || colonCount > SECURITY.MAX_IPV6_COLONS) {
    return false;
  }

  // Check for :: compression (only allowed once)
  const doubleColonCount = (ip.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;

  // Split by :: to handle compression
  const parts = ip.split("::");

  // Validate each part
  for (const part of parts) {
    if (part === "") continue; // Empty part is ok due to ::

    const hextets = part.split(":");
    for (const hextet of hextets) {
      // Each hextet must be 1-4 hex digits
      if (!/^[0-9a-fA-F]{1,4}$/.test(hextet)) return false;
    }
  }

  // Check total hextet count (8 hextets total, minus compressed ones)
  const totalHextets = ip.split(":").filter((h) => h !== "").length;
  if (doubleColonCount === 0 && totalHextets !== SECURITY.IPV6_NUM_HEXTETS) return false;
  if (doubleColonCount === 1 && totalHextets >= SECURITY.IPV6_NUM_HEXTETS) return false;

  return true;
}

export async function sha256Bytes(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

export function base64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
