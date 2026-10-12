const test = require("node:test");
const assert = require("node:assert/strict");
const cache = require("./cache");

test("shared cache helper falls back to in-process storage", async () => {
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const key = `test:${Date.now()}`;
  const value = { products: [{ id: "one" }], nextCursor: "next" };
  await cache.setJson(key, value, 30);
  assert.deepEqual(await cache.getJson(key), value);
  if (previousUrl) process.env.UPSTASH_REDIS_REST_URL = previousUrl;
  if (previousToken) process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
});
