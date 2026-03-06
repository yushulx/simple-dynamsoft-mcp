import test from "node:test";
import assert from "node:assert/strict";
import { resolveProfileConfig } from "../../src/rag/profile-config.js";

test("resolveProfileConfig defaults to lite when MCP_PROFILE is unset", () => {
  const resolved = resolveProfileConfig({});
  assert.equal(resolved.profile, "lite");
  assert.equal(resolved.provider, "lexical");
  assert.equal(resolved.fallback, "none");
  assert.equal(resolved.providerSource, "profile-default");
  assert.equal(resolved.fallbackSource, "profile-default");
});

test("resolveProfileConfig applies lite defaults", () => {
  const resolved = resolveProfileConfig({ MCP_PROFILE: "lite" });
  assert.equal(resolved.profile, "lite");
  assert.equal(resolved.provider, "lexical");
  assert.equal(resolved.fallback, "none");
});

test("resolveProfileConfig allows explicit provider and fallback overrides", () => {
  const resolved = resolveProfileConfig({
    MCP_PROFILE: "semantic-gemini",
    RAG_PROVIDER: "gemini",
    RAG_FALLBACK: "lexical"
  });

  assert.equal(resolved.profile, "semantic-gemini");
  assert.equal(resolved.provider, "gemini");
  assert.equal(resolved.fallback, "lexical");
  assert.equal(resolved.providerSource, "env");
  assert.equal(resolved.fallbackSource, "env");
});

test("resolveProfileConfig rejects removed semantic-local profile", () => {
  assert.throws(
    () => resolveProfileConfig({ MCP_PROFILE: "semantic-local" }),
    /Invalid MCP_PROFILE/
  );
});

test("resolveProfileConfig rejects unknown provider overrides", () => {
  assert.throws(
    () => resolveProfileConfig({ MCP_PROFILE: "semantic-gemini", RAG_PROVIDER: "local" }),
    /Invalid RAG_PROVIDER/
  );
});

test("resolveProfileConfig rejects unknown fallback overrides", () => {
  assert.throws(
    () => resolveProfileConfig({ MCP_PROFILE: "semantic-gemini", RAG_FALLBACK: "local" }),
    /Invalid RAG_FALLBACK/
  );
});

test("resolveProfileConfig rejects unknown profiles", () => {
  assert.throws(
    () => resolveProfileConfig({ MCP_PROFILE: "enterprise" }),
    /Invalid MCP_PROFILE/
  );
});
