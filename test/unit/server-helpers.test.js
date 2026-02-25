import assert from "node:assert/strict";
import test from "node:test";
import {
  createScopeHydrator,
  formatScoreLabel,
  formatScoreNote
} from "../../src/server/helpers/server-helpers.js";

test("formatScoreLabel returns empty string for invalid scores", () => {
  assert.equal(formatScoreLabel(), "");
  assert.equal(formatScoreLabel({ score: Number.NaN }), "");
});

test("formatScoreLabel returns rounded score suffix", () => {
  assert.equal(formatScoreLabel({ score: 0.12345 }), " | score: 0.123");
});

test("formatScoreNote returns empty string for invalid scores", () => {
  assert.equal(formatScoreNote(), "");
  assert.equal(formatScoreNote({ score: Number.NaN }), "");
});

test("formatScoreNote returns rounded score token", () => {
  assert.equal(formatScoreNote({ score: 0.98765 }), " score=0.988");
});

test("createScopeHydrator refreshes indexes when hydration changed", async () => {
  let resourceRefreshCount = 0;
  let ragRefreshCount = 0;
  let receivedScopes = null;
  const scope = { product: "dwt", type: "any" };
  const ensureScopeHydrated = createScopeHydrator({
    ensureDataScopesHydrated: async (scopes) => {
      receivedScopes = scopes;
      return { hydrated: ["scope"] };
    },
    refreshResourceIndex: () => {
      resourceRefreshCount += 1;
    },
    refreshRagIndexes: () => {
      ragRefreshCount += 1;
    }
  });

  await ensureScopeHydrated(scope);

  assert.deepEqual(receivedScopes, [scope]);
  assert.equal(resourceRefreshCount, 1);
  assert.equal(ragRefreshCount, 1);
});

test("createScopeHydrator skips refresh when no scopes were hydrated", async () => {
  let resourceRefreshCount = 0;
  let ragRefreshCount = 0;
  const ensureScopeHydrated = createScopeHydrator({
    ensureDataScopesHydrated: async () => ({ hydrated: [] }),
    refreshResourceIndex: () => {
      resourceRefreshCount += 1;
    },
    refreshRagIndexes: () => {
      ragRefreshCount += 1;
    }
  });

  await ensureScopeHydrated({ product: "dwt", type: "sample" });

  assert.equal(resourceRefreshCount, 0);
  assert.equal(ragRefreshCount, 0);
});

test("createScopeHydrator allows missing refresh callbacks", async () => {
  const ensureScopeHydrated = createScopeHydrator({
    ensureDataScopesHydrated: async () => ({ hydrated: ["scope"] })
  });

  await assert.doesNotReject(async () => {
    await ensureScopeHydrated({ product: "dwt", type: "sample" });
  });
});

test("createScopeHydrator throws when hydration function is missing", () => {
  assert.throws(
    () => createScopeHydrator({}),
    /ensureDataScopesHydrated must be a function/
  );
});
