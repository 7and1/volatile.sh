/**
 * Cache tests for volatile.sh
 * Tests LRU cache implementation, TTL, and eviction
 */

import test from "node:test";
import assert from "node:assert/strict";

test("cache: LRUCache stores and retrieves values", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(5);

  cache.set("key1", "value1");
  assert.equal(cache.get("key1"), "value1");
});

test("cache: LRUCache evicts oldest entry when full", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(3);

  cache.set("key1", "value1");
  cache.set("key2", "value2");
  cache.set("key3", "value3");
  cache.set("key4", "value4");

  assert.equal(cache.get("key1"), undefined);
  assert.equal(cache.get("key4"), "value4");
});

test("cache: LRUCache respects TTL", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(5);

  cache.set("key1", "value1", 100);
  assert.equal(cache.get("key1"), "value1");

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(cache.get("key1"), undefined);
});

test("cache: LRUCache updates access order", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(3);

  cache.set("key1", "value1");
  cache.set("key2", "value2");
  cache.set("key3", "value3");

  cache.get("key1");

  cache.set("key4", "value4");

  assert.equal(cache.get("key1"), "value1");
  assert.equal(cache.get("key2"), undefined);
});

test("cache: LRUCache cleanup removes expired entries", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(10);

  cache.set("key1", "value1", 50);
  cache.set("key2", "value2", 50);
  cache.set("key3", "value3", 10000);

  await new Promise((resolve) => setTimeout(resolve, 100));

  const removed = cache.cleanup();
  assert.equal(removed, 2);
  assert.equal(cache.size, 1);
});

test("cache: LRUCache has method checks existence", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(10);

  assert.equal(cache.has("key1"), false);

  cache.set("key1", "value1");
  assert.equal(cache.has("key1"), true);

  cache.delete("key1");
  assert.equal(cache.has("key1"), false);
});

test("cache: LRUCache delete removes entry", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(10);

  cache.set("key1", "value1");
  assert.equal(cache.get("key1"), "value1");

  const deleted = cache.delete("key1");
  assert.equal(deleted, true);
  assert.equal(cache.get("key1"), undefined);

  // Delete non-existent key returns false
  assert.equal(cache.delete("nonexistent"), false);
});

test("cache: LRUCache clear empties cache", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(10);

  cache.set("a", "1");
  cache.set("b", "2");
  cache.set("c", "3");

  assert.equal(cache.size, 3);

  cache.clear();

  assert.equal(cache.size, 0);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), undefined);
});

test("cache: LRUCache size property tracks entries", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(5);

  assert.equal(cache.size, 0);

  cache.set("a", "1");
  assert.equal(cache.size, 1);

  cache.set("b", "2");
  cache.set("c", "3");
  assert.equal(cache.size, 3);

  // Eviction should maintain max size
  cache.set("d", "4");
  cache.set("e", "5");
  cache.set("f", "6");
  assert.equal(cache.size, 5);
});

test("cache: LRUCache updating existing key", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(10);

  cache.set("key", "value1");
  assert.equal(cache.get("key"), "value1");

  // Update existing key
  cache.set("key", "value2");
  assert.equal(cache.get("key"), "value2");
  assert.equal(cache.size, 1);
});

test("cache: LRUCache update changes recency", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(3);

  cache.set("a", "1");
  cache.set("b", "2");
  cache.set("c", "3");

  // Update "a" to make it most recent
  cache.set("a", "updated");

  // Add new - should evict "b"
  cache.set("d", "4");

  assert.equal(cache.get("a"), "updated");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), "3");
  assert.equal(cache.get("d"), "4");
});

test("cache: global rateLimitCache instance", async () => {
  const { rateLimitCache, LRUCache } = await import("../src/cache.js");

  // Should be an instance of LRUCache
  assert.ok(rateLimitCache instanceof LRUCache);

  // Should be usable
  rateLimitCache.clear();
  rateLimitCache.set("test", "value");
  assert.equal(rateLimitCache.get("test"), "value");
});

test("cache: LRUCache handles various value types", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(10);

  const obj = { nested: { value: 42 } };
  const arr = [1, 2, 3];
  const num = 123;
  const bool = true;
  const nil = null;

  cache.set("obj", obj);
  cache.set("arr", arr);
  cache.set("num", num);
  cache.set("bool", bool);
  cache.set("null", nil);

  assert.deepEqual(cache.get("obj"), obj);
  assert.deepEqual(cache.get("arr"), arr);
  assert.equal(cache.get("num"), num);
  assert.equal(cache.get("bool"), bool);
  assert.equal(cache.get("null"), null);
});

test("cache: LRUCache with zero TTL (no expiration)", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(10);

  cache.set("permanent", "value", 0);

  // Should not expire
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(cache.get("permanent"), "value");
});

test("cache: LRUCache respects max size on update", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(2);

  cache.set("a", "1");
  cache.set("b", "2");

  // Update "a" - should not increase size
  cache.set("a", "updated");

  assert.equal(cache.size, 2);

  // Add new - should evict "b" (older than "a")
  cache.set("c", "3");

  assert.equal(cache.size, 2);
  assert.equal(cache.get("a"), "updated");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), "3");
});

test("cache: LRUCache get returns undefined for expired entries", async () => {
  const { LRUCache } = await import("../src/cache.js");
  const cache = new LRUCache(10);

  cache.set("temp", "value", 50);

  // Should be present immediately
  assert.equal(cache.get("temp"), "value");

  // Wait for expiration
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Should return undefined and remove the entry
  assert.equal(cache.get("temp"), undefined);
  assert.equal(cache.size, 0);
});
