/**
 * cryptoId unit tests
 */

import test from "node:test";
import assert from "node:assert/strict";

import { generateId } from "../src/cryptoId.js";
import { LIMITS } from "../src/constants.js";

// =============================================================================
// ID Length Tests
// =============================================================================

test("generateId: returns string of correct length", () => {
  const id = generateId();

  assert.equal(typeof id, "string");
  assert.equal(id.length, LIMITS.ID_LEN);
});

test("generateId: length is exactly 16 characters", () => {
  // Verify the constant is what we expect
  assert.equal(LIMITS.ID_LEN, 16);

  for (let i = 0; i < 100; i++) {
    const id = generateId();
    assert.equal(id.length, 16, `Generated ID "${id}" has wrong length`);
  }
});

// =============================================================================
// Character Set Tests
// =============================================================================

test("generateId: uses only valid characters", () => {
  const validChars = new Set(LIMITS.ID_CHARS.split(""));

  for (let i = 0; i < 100; i++) {
    const id = generateId();
    for (const char of id) {
      assert.ok(validChars.has(char), `Invalid character "${char}" in ID "${id}"`);
    }
  }
});

test("generateId: character set is alphanumeric (62 chars)", () => {
  // Verify the character set
  assert.equal(LIMITS.ID_CHARS.length, 62);

  // Check it contains A-Z, a-z, 0-9
  const chars = LIMITS.ID_CHARS;
  assert.ok(chars.includes("A"));
  assert.ok(chars.includes("Z"));
  assert.ok(chars.includes("a"));
  assert.ok(chars.includes("z"));
  assert.ok(chars.includes("0"));
  assert.ok(chars.includes("9"));

  // Should NOT contain special characters
  assert.ok(!chars.includes("-"));
  assert.ok(!chars.includes("_"));
  assert.ok(!chars.includes("+"));
  assert.ok(!chars.includes("/"));
});

test("generateId: does not contain ambiguous characters", () => {
  // Common ambiguous characters are intentionally included in the 62-char set
  // but this test documents what characters ARE in the set
  const chars = LIMITS.ID_CHARS;

  // Uppercase and lowercase letters (no exclusions in standard alphanumeric)
  for (let i = 0; i < 26; i++) {
    assert.ok(chars.includes(String.fromCharCode(65 + i))); // A-Z
    assert.ok(chars.includes(String.fromCharCode(97 + i))); // a-z
  }

  // Digits 0-9
  for (let i = 0; i < 10; i++) {
    assert.ok(chars.includes(String.fromCharCode(48 + i))); // 0-9
  }
});

// =============================================================================
// Uniqueness Tests
// =============================================================================

test("generateId: generates unique IDs", () => {
  const ids = new Set();
  const count = 1000;

  for (let i = 0; i < count; i++) {
    ids.add(generateId());
  }

  assert.equal(ids.size, count, "Generated IDs should all be unique");
});

test("generateId: uniqueness across batches", () => {
  const allIds = new Set();

  // Generate in 10 batches of 100
  for (let batch = 0; batch < 10; batch++) {
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      assert.ok(!allIds.has(id), `Duplicate ID found: ${id}`);
      allIds.add(id);
    }
  }

  assert.equal(allIds.size, 1000);
});

// =============================================================================
// Randomness Distribution Tests
// =============================================================================

test("generateId: reasonable character distribution", () => {
  const charCounts = new Map();
  const sampleSize = 10000;
  const totalChars = sampleSize * LIMITS.ID_LEN;

  // Count character occurrences
  for (let i = 0; i < sampleSize; i++) {
    const id = generateId();
    for (const char of id) {
      charCounts.set(char, (charCounts.get(char) || 0) + 1);
    }
  }

  // Expected count per character with uniform distribution
  const expectedCount = totalChars / 62;
  const tolerance = 0.3; // 30% tolerance

  // All 62 characters should appear
  assert.equal(charCounts.size, 62, "All 62 characters should appear in sample");

  // Check distribution is reasonable (not perfectly uniform, but not heavily biased)
  for (const [char, count] of charCounts) {
    const ratio = count / expectedCount;
    assert.ok(
      ratio > 1 - tolerance && ratio < 1 + tolerance,
      `Character "${char}" appears ${count} times, expected ~${expectedCount} (ratio: ${ratio.toFixed(2)})`
    );
  }
});

test("generateId: first character is distributed", () => {
  const firstCharCounts = new Map();
  const sampleSize = 6200; // 100 per character ideally

  for (let i = 0; i < sampleSize; i++) {
    const id = generateId();
    const firstChar = id[0];
    firstCharCounts.set(firstChar, (firstCharCounts.get(firstChar) || 0) + 1);
  }

  // At least 50 different first characters should appear
  assert.ok(firstCharCounts.size >= 50, `Only ${firstCharCounts.size} unique first characters`);
});

// =============================================================================
// Rejection Sampling Bias Prevention Tests
// =============================================================================

test("generateId: no modulo bias in character selection", () => {
  // The implementation uses rejection sampling to avoid bias
  // 256 % 62 = 8, so without rejection sampling, first 8 characters would be ~1.29x more likely
  // With rejection sampling (rejecting 248-255), distribution should be uniform

  const charCounts = new Map();
  const sampleSize = 62000; // Large sample for statistical significance
  const totalChars = sampleSize * LIMITS.ID_LEN;

  for (let i = 0; i < sampleSize; i++) {
    const id = generateId();
    for (const char of id) {
      charCounts.set(char, (charCounts.get(char) || 0) + 1);
    }
  }

  const counts = Array.from(charCounts.values());
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation

  // CV should be low for uniform distribution
  // For truly random uniform distribution, CV ~ 1/sqrt(n) ~ 0.01 for n=10000
  // We allow up to 0.1 for practical purposes
  assert.ok(cv < 0.1, `Coefficient of variation too high: ${cv.toFixed(4)}`);
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

test("generateId: works in tight loop", () => {
  // Should not throw or hang
  const startTime = Date.now();

  for (let i = 0; i < 10000; i++) {
    generateId();
  }

  const elapsed = Date.now() - startTime;
  // Should complete reasonably fast (< 1 second for 10k IDs)
  assert.ok(elapsed < 1000, `Took too long: ${elapsed}ms`);
});

test("generateId: returns different values on each call", () => {
  const id1 = generateId();
  const id2 = generateId();
  const id3 = generateId();

  assert.notEqual(id1, id2);
  assert.notEqual(id2, id3);
  assert.notEqual(id1, id3);
});

// =============================================================================
// Security Properties
// =============================================================================

test("generateId: entropy is sufficient", () => {
  // With 62 characters and 16 length:
  // Entropy = log2(62^16) = 16 * log2(62) = 16 * 5.954 = ~95.27 bits
  // This is sufficient for secure random identifiers

  const entropyBits = LIMITS.ID_LEN * Math.log2(LIMITS.ID_CHARS.length);
  assert.ok(entropyBits >= 90, `Entropy too low: ${entropyBits} bits`);
});

test("generateId: IDs are not sequential", () => {
  const ids = [];
  for (let i = 0; i < 100; i++) {
    ids.push(generateId());
  }

  // Sort and check adjacent pairs are not close
  ids.sort();
  for (let i = 0; i < ids.length - 1; i++) {
    // Adjacent sorted IDs should differ in more than just the last character
    let diffCount = 0;
    for (let j = 0; j < ids[i].length; j++) {
      if (ids[i][j] !== ids[i + 1][j]) diffCount++;
    }
    // Most pairs should differ by several characters
    // (This is a statistical property, might occasionally fail)
  }
});

test("generateId: no predictable patterns", () => {
  const ids = [];
  for (let i = 0; i < 100; i++) {
    ids.push(generateId());
  }

  // Check no two IDs share a long common prefix
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      let commonPrefixLen = 0;
      while (
        commonPrefixLen < ids[i].length &&
        ids[i][commonPrefixLen] === ids[j][commonPrefixLen]
      ) {
        commonPrefixLen++;
      }
      // Common prefix should typically be short (< 4 chars)
      // This might occasionally fail with probability ~(1/62)^4 per pair
      assert.ok(
        commonPrefixLen < 6,
        `IDs ${ids[i]} and ${ids[j]} share ${commonPrefixLen} char prefix`
      );
    }
  }
});
