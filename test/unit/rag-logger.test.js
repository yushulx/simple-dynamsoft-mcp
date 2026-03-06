import assert from "node:assert/strict";
import test from "node:test";
import { logRagConfigOnce, ragLogState } from "../../src/rag/logger.js";

const DEPRECATED_ENV_KEY = "RAG_PREBUILT_INDEX_URL";

function createRagConfig() {
  return {
    provider: "gemini",
    fallback: "lexical",
    prewarm: true,
    rebuild: false,
    cacheDir: "/tmp/rag-cache",
    sharedStatePath: "",
    geminiRetryMaxAttempts: 5,
    geminiRetryBaseDelayMs: 500,
    geminiRetryMaxDelayMs: 10000,
    geminiRequestThrottleMs: 0
  };
}

test("logRagConfigOnce warns when deprecated prebuilt env vars are set", () => {
  const previousValue = process.env[DEPRECATED_ENV_KEY];
  const logged = [];
  const originalError = console.error;
  ragLogState.config = false;
  process.env[DEPRECATED_ENV_KEY] = "https://example.test/prebuilt.tar.gz";
  console.error = (line) => {
    logged.push(String(line));
  };

  try {
    logRagConfigOnce(createRagConfig());
  } finally {
    ragLogState.config = false;
    console.error = originalError;
    if (previousValue === undefined) {
      delete process.env[DEPRECATED_ENV_KEY];
    } else {
      process.env[DEPRECATED_ENV_KEY] = previousValue;
    }
  }

  assert.ok(logged.some((line) => line.includes("event=deprecated_prebuilt_env_vars")));
  assert.ok(logged.some((line) => line.includes("RAG_PREBUILT_INDEX_URL")));
  assert.ok(logged.some((line) => line.includes("RAG_SHARED_STATE_PATH")));
});
