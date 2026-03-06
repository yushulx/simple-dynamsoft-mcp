import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { buildDesiredRepos, computeRepoDiff, runDataSyncAzure } from "../../scripts/data-sync-azure.mjs";

test("computeRepoDiff classifies changed/new/unchanged/removed repos", () => {
  const currentRepos = {
    docs_core: {
      path: "documentation/core",
      commit: "1111",
      signature: "sig-1111"
    },
    docs_barcode: {
      path: "documentation/barcode",
      commit: "2222",
      signature: "sig-2222"
    },
    docs_removed: {
      path: "documentation/removed",
      commit: "3333",
      signature: "sig-3333"
    }
  };

  const desiredRepos = {
    docs_core: {
      path: "documentation/core",
      commit: "1111",
      signature: "sig-1111"
    },
    docs_barcode: {
      path: "documentation/barcode",
      commit: "9999",
      signature: "sig-9999"
    },
    docs_new: {
      path: "documentation/new",
      commit: "4444",
      signature: "sig-4444"
    }
  };

  const diff = computeRepoDiff({ currentRepos, desiredRepos });

  assert.deepEqual(diff.unchanged, ["docs_core"]);
  assert.deepEqual(diff.changed, ["docs_barcode"]);
  assert.deepEqual(diff.added, ["docs_new"]);
  assert.deepEqual(diff.removed, ["docs_removed"]);
  assert.equal(diff.hasChanges, true);
});

test("computeRepoDiff marks no-op when signatures match", () => {
  const currentRepos = {
    docs_core: {
      path: "documentation/core",
      commit: "1111",
      signature: "sig-1111"
    }
  };

  const desiredRepos = {
    docs_core: {
      path: "documentation/core",
      commit: "1111",
      signature: "sig-1111"
    }
  };

  const diff = computeRepoDiff({ currentRepos, desiredRepos });

  assert.equal(diff.hasChanges, false);
  assert.deepEqual(diff.unchanged, ["docs_core"]);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
});

test("buildDesiredRepos throws when normalized keys collide", () => {
  const manifestRepos = [
    { path: "docs/a-b", commit: "1111111" },
    { path: "docs/a_b", commit: "2222222" }
  ];

  assert.throws(
    () => buildDesiredRepos(manifestRepos, {
      embeddingModel: "text-embedding-3-large",
      indexConfig: {},
      indexVersion: "azure-shared-v1",
      schemaVersion: 1
    }),
    /Repo key collision/
  );
});

test("runDataSyncAzure writes plan, next state, and promotes current state atomically", () => {
  const root = mkdtempSync(join(tmpdir(), "data-sync-azure-test-"));
  const manifestPath = join(root, "data-manifest.json");
  const currentStatePath = join(root, "current.json");
  const nextStatePath = join(root, "next-state.json");
  const planOutputPath = join(root, "plan.json");

  try {
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ repos: [{ path: "documentation/core", commit: "abc123" }] }, null, 2)}\n`
    );
    writeFileSync(
      currentStatePath,
      `${JSON.stringify({
        schemaVersion: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
        indexVersion: "azure-shared-v1",
        repos: {}
      })}\n`
    );

    const result = runDataSyncAzure([
      "--manifest",
      manifestPath,
      "--current-state",
      currentStatePath,
      "--next-state",
      nextStatePath,
      "--plan-output",
      planOutputPath,
      "--generated-at",
      "2026-01-02T00:00:00.000Z"
    ]);

    assert.equal(existsSync(nextStatePath), true);
    assert.equal(existsSync(planOutputPath), true);
    assert.equal(existsSync(currentStatePath), true);
    assert.equal(existsSync(result.promotion.promotionPath), false);
    assert.equal(result.promotion.promotedPath, currentStatePath);

    const promoted = JSON.parse(readFileSync(currentStatePath, "utf8"));
    const nextState = JSON.parse(readFileSync(nextStatePath, "utf8"));
    const plan = JSON.parse(readFileSync(planOutputPath, "utf8"));

    assert.deepEqual(promoted, nextState);
    assert.equal(plan.summary.currentRepos, 0);
    assert.equal(plan.summary.desiredRepos, 1);
    assert.equal(plan.summary.added, 1);
    assert.equal(plan.summary.hasChanges, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
