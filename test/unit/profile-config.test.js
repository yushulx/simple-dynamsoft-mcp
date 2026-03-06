import test from "node:test";
import assert from "node:assert/strict";
import { resolveProfileConfig } from "../../src/rag/profile-config.js";

test("defaults to lexical mode when GEMINI_API_KEY is unset", () => {
  const resolved = resolveProfileConfig({});
  assert.equal(resolved.profile, "lite");
  assert.equal(resolved.provider, "lexical");
  assert.equal(resolved.fallback, "none");
  assert.equal(resolved.providerSource, "auto");
  assert.equal(resolved.fallbackSource, "auto");
});

test("defaults to gemini with lexical fallback when GEMINI_API_KEY is set", () => {
  const resolved = resolveProfileConfig({ GEMINI_API_KEY: "demo-key" });
  assert.equal(resolved.profile, "semantic-gemini");
  assert.equal(resolved.provider, "gemini");
  assert.equal(resolved.fallback, "lexical");
  assert.equal(resolved.providerSource, "auto");
  assert.equal(resolved.fallbackSource, "auto");
});

test("allows explicit provider/fallback overrides for advanced use", () => {
  const resolved = resolveProfileConfig({
    GEMINI_API_KEY: "demo-key",
    RAG_PROVIDER: "lexical",
    RAG_FALLBACK: "none"
  });
  assert.equal(resolved.provider, "lexical");
  assert.equal(resolved.fallback, "none");
  assert.equal(resolved.providerSource, "env");
  assert.equal(resolved.fallbackSource, "env");
});
