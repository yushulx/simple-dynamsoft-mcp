import test from "node:test";
import assert from "node:assert/strict";
import { resolveProfileConfig } from "../../src/rag/profile-config.js";

test("resolveProfileConfig defaults to lite when MCP_PROFILE is unset", () => {
  const resolved = resolveProfileConfig({});
  assert.equal(resolved.profile, "lite");
  assert.equal(resolved.provider, "fuse");
  assert.equal(resolved.fallback, "none");
  assert.equal(resolved.providerSource, "profile-default");
  assert.equal(resolved.fallbackSource, "profile-default");
});

test("resolveProfileConfig applies lite defaults", () => {
  const resolved = resolveProfileConfig({ MCP_PROFILE: "lite" });
  assert.equal(resolved.profile, "lite");
  assert.equal(resolved.provider, "fuse");
  assert.equal(resolved.fallback, "none");
});

test("resolveProfileConfig allows explicit provider and fallback overrides", () => {
  const resolved = resolveProfileConfig({
    MCP_PROFILE: "semantic-local",
    RAG_PROVIDER: "gemini",
    RAG_FALLBACK: "local"
  });

  assert.equal(resolved.profile, "semantic-local");
  assert.equal(resolved.provider, "gemini");
  assert.equal(resolved.fallback, "local");
  assert.equal(resolved.providerSource, "env");
  assert.equal(resolved.fallbackSource, "env");
});

test("resolveProfileConfig rejects unknown profiles", () => {
  assert.throws(
    () => resolveProfileConfig({ MCP_PROFILE: "enterprise" }),
    /Invalid MCP_PROFILE/
  );
});
