/**
 * Crypto utility tests
 * Enhanced tests for client-side encryption functionality
 */

import { describe, it, expect, vi } from "vitest";
import {
  bytesToB64Url,
  b64UrlToBytes,
  isValidIvLength,
  generateKey,
  encryptMessage,
  decryptMessage,
  exportKeyToB64Url,
  importKeyFromB64Url,
  MAX_PLAINTEXT_CHARS,
} from "../utils/crypto";

// Mock Web Crypto API
const mockRandomValues = vi.fn();
const mockGenerateKey = vi.fn();
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();
const mockExportKey = vi.fn();
const mockImportKey = vi.fn();
const mockDigest = vi.fn();

Object.assign(global, {
  crypto: {
    getRandomValues: mockRandomValues,
    subtle: {
      generateKey: mockGenerateKey,
      encrypt: mockEncrypt,
      decrypt: mockDecrypt,
      exportKey: mockExportKey,
      importKey: mockImportKey,
      digest: mockDigest,
    },
  },
});

describe("Crypto Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("bytesToB64Url", () => {
    it("should encode Uint8Array to base64url", () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      const encoded = bytesToB64Url(bytes);
      expect(encoded).toBe("SGVsbG8");
    });

    it("should handle empty array", () => {
      const bytes = new Uint8Array([]);
      const encoded = bytesToB64Url(bytes);
      expect(encoded).toBe("");
    });

    it("should handle special characters", () => {
      const bytes = new Uint8Array([255, 254, 253]);
      const encoded = bytesToB64Url(bytes);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });

    it("should convert correctly round-trip", () => {
      const original = new Uint8Array([1, 2, 3, 255, 254, 253]);
      const encoded = bytesToB64Url(original);
      const decoded = b64UrlToBytes(encoded);
      expect(Array.from(decoded)).toEqual(Array.from(original));
    });

    it("should handle large arrays efficiently", () => {
      const largeArray = new Uint8Array(10000);
      for (let i = 0; i < 10000; i++) {
        largeArray[i] = i % 256;
      }
      const encoded = bytesToB64Url(largeArray);
      expect(encoded.length).toBeGreaterThan(0);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("b64UrlToBytes", () => {
    it("should decode base64url to Uint8Array", () => {
      const encoded = "SGVsbG8";
      const bytes = b64UrlToBytes(encoded);
      expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
    });

    it("should handle padding", () => {
      const encoded = "SGVsbG8"; // 5 bytes = 40 bits
      const bytes = b64UrlToBytes(encoded);
      expect(bytes.length).toBe(5);
    });

    it("should handle url-safe characters", () => {
      const encoded = "PDw_Pj4-"; // Contains -, _, =
      const bytes = b64UrlToBytes(encoded);
      expect(bytes.length).toBeGreaterThan(0);
    });

    it("should handle empty string", () => {
      const bytes = b64UrlToBytes("");
      expect(bytes.length).toBe(0);
    });
  });

  describe("isValidIvLength", () => {
    it("should accept valid IV lengths", () => {
      expect(isValidIvLength("aaaaaaaaaaaaaaaaaaaa")).toBe(true); // 16 chars
      expect(isValidIvLength("aaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true); // 24 chars
      expect(isValidIvLength("BBBBBBBBBBBBBBBBBBBB")).toBe(true); // 20 chars
    });

    it("should reject invalid IV lengths", () => {
      expect(isValidIvLength("short")).toBe(false); // too short
      expect(isValidIvLength("a".repeat(30))).toBe(false); // too long
      expect(isValidIvLength("")).toBe(false); // empty
    });

    it("should ignore padding in length calculation", () => {
      expect(isValidIvLength("abcd===")).toBe(true); // 4 chars after removing padding
      expect(isValidIvLength("abcde==")).toBe(true); // 5 chars after removing padding
    });
  });

  describe("Constants", () => {
    it("should export MAX_PLAINTEXT_CHARS constant", () => {
      expect(MAX_PLAINTEXT_CHARS).toBe(1_000_000);
    });
  });

  describe("generateKey", () => {
    it("should generate AES-GCM key", async () => {
      const mockKey = { type: "secret" } as CryptoKey;
      mockGenerateKey.mockResolvedValue(mockKey);

      const key = await generateKey();
      expect(key).toBe(mockKey);
      expect(mockGenerateKey).toHaveBeenCalledWith({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
    });
  });

  describe("encryptMessage", () => {
    it("should encrypt message with key", async () => {
      const mockKey = {} as CryptoKey;
      const mockIv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const mockCiphertext = new Uint8Array([10, 20, 30]);

      mockRandomValues.mockReturnValue(mockIv);
      mockEncrypt.mockResolvedValue(mockCiphertext);

      const result = await encryptMessage("hello", mockKey);

      expect(mockEncrypt).toHaveBeenCalledWith(
        { name: "AES-GCM", iv: mockIv },
        mockKey,
        new TextEncoder().encode("hello")
      );
      expect(result.iv).toBe(bytesToB64Url(mockIv));
      expect(result.content).toBe(bytesToB64Url(mockCiphertext));
    });
  });

  describe("decryptMessage", () => {
    it("should decrypt message with key", async () => {
      const mockKey = {} as CryptoKey;
      const plaintext = "hello world";
      const plaintextBytes = new TextEncoder().encode(plaintext);

      mockDecrypt.mockResolvedValue(plaintextBytes.buffer);

      const payload = {
        content: bytesToB64Url(new Uint8Array(plaintextBytes)),
        iv: bytesToB64Url(new Uint8Array(12)),
      };

      const result = await decryptMessage(payload, mockKey);
      expect(result).toBe(plaintext);
    });
  });

  describe("exportKeyToB64Url", () => {
    it("should export key as base64url", async () => {
      const rawKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const mockKey = {} as CryptoKey;

      mockExportKey.mockResolvedValue(rawKey.buffer);

      const result = await exportKeyToB64Url(mockKey);
      expect(result).toBe(bytesToB64Url(rawKey));
      expect(mockExportKey).toHaveBeenCalledWith("raw", mockKey);
    });
  });

  describe("importKeyFromB64Url", () => {
    it("should import key from base64url", async () => {
      const rawKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const b64 = bytesToB64Url(rawKey);
      const mockKey = {} as CryptoKey;

      mockImportKey.mockResolvedValue(mockKey);

      const result = await importKeyFromB64Url(b64);
      expect(result).toBe(mockKey);
      expect(mockImportKey).toHaveBeenCalledWith("raw", rawKey, { name: "AES-GCM" }, false, [
        "decrypt",
      ]);
    });
  });

  describe("round-trip encryption/decryption", () => {
    it("should encrypt and decrypt successfully", async () => {
      const plaintext = "This is a secret message!";
      const iv = new Uint8Array(12);
      const ciphertext = new Uint8Array(
        Buffer.from(plaintext).map((b, i) => b ^ i) // Simple xor for test
      );

      mockRandomValues.mockReturnValue(iv);

      const mockKey = {} as CryptoKey;
      mockEncrypt.mockResolvedValue(ciphertext.buffer);
      mockDecrypt.mockResolvedValue(Buffer.from(plaintext).buffer);

      const encrypted = await encryptMessage(plaintext, mockKey);
      const decrypted = await decryptMessage(encrypted, mockKey);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string encryption", async () => {
      const mockKey = {} as CryptoKey;
      const mockIv = new Uint8Array(12);
      const emptyCiphertext = new Uint8Array(0);

      mockRandomValues.mockReturnValue(mockIv);
      mockEncrypt.mockResolvedValue(emptyCiphertext.buffer);

      const result = await encryptMessage("", mockKey);
      expect(result.content).toBe("");
    });

    it("should handle special characters in message", async () => {
      const mockKey = {} as CryptoKey;
      const mockIv = new Uint8Array(12);

      mockRandomValues.mockReturnValue(mockIv);

      const specialText = "Hello\nWorld\t!@#$%^&*()";
      const encoded = new TextEncoder().encode(specialText);
      mockEncrypt.mockResolvedValue(encoded.buffer);

      const result = await encryptMessage(specialText, mockKey);
      expect(result).toBeDefined();
    });

    it("should handle unicode characters", async () => {
      const mockKey = {} as CryptoKey;
      const mockIv = new Uint8Array(12);

      mockRandomValues.mockReturnValue(mockIv);

      const unicodeText = "Hello 世界 🌍";
      const encoded = new TextEncoder().encode(unicodeText);
      mockEncrypt.mockResolvedValue(encoded.buffer);

      const result = await encryptMessage(unicodeText, mockKey);
      expect(result).toBeDefined();
    });
  });
});
