import assert from "node:assert/strict";
import test from "node:test";
import {
  GeminiHttpError,
  executeWithGeminiRetry,
  normalizeGeminiRetryConfig,
  parseRetryAfterMs
} from "../../src/rag/gemini-retry.js";

test("normalizeGeminiRetryConfig parses and clamps values", () => {
  const config = normalizeGeminiRetryConfig({
    maxAttempts: "7",
    baseDelayMs: "250",
    maxDelayMs: "1200",
    requestThrottleMs: "80"
  });
  assert.deepEqual(config, {
    maxAttempts: 7,
    baseDelayMs: 250,
    maxDelayMs: 1200,
    requestThrottleMs: 80
  });

  const fallback = normalizeGeminiRetryConfig({
    maxAttempts: "-1",
    baseDelayMs: "0",
    maxDelayMs: "10",
    requestThrottleMs: "-9"
  });
  assert.equal(fallback.maxAttempts, 5);
  assert.equal(fallback.baseDelayMs, 500);
  assert.equal(fallback.maxDelayMs, 500);
  assert.equal(fallback.requestThrottleMs, 0);
});

test("parseRetryAfterMs supports both seconds and http-date", () => {
  assert.equal(parseRetryAfterMs("2", 1000), 2000);
  assert.equal(parseRetryAfterMs("", 1000), 0);
  const date = new Date(5000).toUTCString();
  assert.equal(parseRetryAfterMs(date, 1000), 4000);
});

test("executeWithGeminiRetry retries retryable errors and then succeeds", async () => {
  let attempts = 0;
  const delays = [];
  const result = await executeWithGeminiRetry({
    operation: "batchEmbedContents",
    retryConfig: {
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 1000
    },
    random: () => 0.5,
    sleep: async (ms) => {
      delays.push(ms);
    },
    requestFn: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new GeminiHttpError("rate limited", { status: 429 });
      }
      return { ok: true };
    }
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 3);
  assert.equal(delays.length, 2);
  assert.ok(delays[0] >= 100);
  assert.ok(delays[1] >= 200);
});

test("executeWithGeminiRetry does not retry non-retryable errors", async () => {
  let attempts = 0;
  await assert.rejects(
    executeWithGeminiRetry({
      operation: "embedContent",
      retryConfig: {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 1000
      },
      sleep: async () => {},
      requestFn: async () => {
        attempts += 1;
        throw new GeminiHttpError("bad request", { status: 400 });
      }
    }),
    /bad request/
  );
  assert.equal(attempts, 1);
});
