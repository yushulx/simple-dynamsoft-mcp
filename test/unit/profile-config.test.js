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

test("auto-detects Azure OpenAI only when key, endpoint, and deployment are all set", () => {
  const partial = resolveProfileConfig({ AZURE_OPENAI_API_KEY: "k", AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com" });
  assert.equal(partial.provider, "lexical");

  const complete = resolveProfileConfig({
    AZURE_OPENAI_API_KEY: "k",
    AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com",
    AZURE_OPENAI_EMBED_DEPLOYMENT: "embed-large"
  });
  assert.equal(complete.provider, "azure-openai");
  assert.equal(complete.profile, "semantic-azure-openai");
  assert.equal(complete.fallback, "lexical");
});

test("explicit RAG_PROVIDER selects a vector provider even when another key is present", () => {
  const resolved = resolveProfileConfig({ GEMINI_API_KEY: "g", OPENAI_API_KEY: "o", RAG_PROVIDER: "openai" });
  assert.equal(resolved.provider, "openai");
  assert.equal(resolved.fallback, "lexical");
});
