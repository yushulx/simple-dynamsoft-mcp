import assert from "node:assert/strict";
import test from "node:test";

import { computeRepoDiff } from "../../scripts/data-sync-azure.mjs";

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
