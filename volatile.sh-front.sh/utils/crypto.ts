import { EncryptedPayload } from "../types";

const CHUNK = 0x8000;

export function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64UrlToBytes(b64url: string): Uint8Array {
  let padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  if (pad) padded += "=".repeat(4 - pad);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Generate a new AES-GCM key
 */
export async function generateKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt text with a key
 */
export async function encryptMessage(text: string, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedText
  );

  return {
    iv: bytesToB64Url(iv),
    content: bytesToB64Url(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt content with a key
 */
export async function decryptMessage(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64UrlToBytes(payload.iv) },
    key,
    b64UrlToBytes(payload.content)
  );

  return new TextDecoder().decode(decrypted);
}

export async function exportKeyToB64Url(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await window.crypto.subtle.exportKey("raw", key));
  return bytesToB64Url(raw);
}

export async function importKeyFromB64Url(keyB64Url: string): Promise<CryptoKey> {
  const raw = b64UrlToBytes(keyB64Url);
  return window.crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}

/**
 * Validate that a base64url-encoded IV is the correct length for AES-GCM (12 bytes)
 * @param b64urlIv - The base64url-encoded IV
 * @returns true if valid, false otherwise
 */
export function isValidIvLength(b64urlIv: string): boolean {
  // 12 bytes = 16 base64 chars (without padding)
  // With padding, it could be up to 24 chars
  const len = b64urlIv.replace(/=/g, "").length;
  return len >= 16 && len <= 24;
}

// Maximum plaintext size before encryption (approximately 1MB after base64 encoding)
export const MAX_PLAINTEXT_CHARS = 1_000_000;
