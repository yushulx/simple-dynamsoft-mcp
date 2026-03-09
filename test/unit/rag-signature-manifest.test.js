import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readManifestRepoCommit } from "../../src/server/resource-index/paths.js";

function createDataFixture(t, manifestRepos = []) {
  const root = mkdtempSync(join(tmpdir(), "rag-signature-manifest-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const metadataDir = join(root, "metadata");
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(
    join(metadataDir, "data-manifest.json"),
    JSON.stringify({ version: 1, repos: manifestRepos }, null, 2)
  );

  return { root, manifestPath: join(metadataDir, "data-manifest.json") };
}

test("readManifestRepoCommit reads commit from manifest without .git metadata", (t) => {
  const repoPath = "samples/dynamsoft-barcode-reader";
  const commit = "2f0a723e88e3271170672e61c214a3d1d7a31328";
  const { root, manifestPath } = createDataFixture(t, [
    { path: repoPath, commit }
  ]);

  const absoluteRepoPath = join(root, repoPath);
  mkdirSync(absoluteRepoPath, { recursive: true });

  const resolved = readManifestRepoCommit(absoluteRepoPath, {
    dataRootPath: root,
    manifestPath
  });

  assert.equal(resolved, commit);
});

test("readManifestRepoCommit ignores .git marker differences", (t) => {
  const repoPath = "documentation/barcode-reader-docs-js";
  const commit = "acab784e29ff035b355dcd6d6ebe284fcb34eef3";
  const { root, manifestPath } = createDataFixture(t, [
    { path: repoPath, commit }
  ]);

  const absoluteRepoPath = join(root, repoPath);
  mkdirSync(absoluteRepoPath, { recursive: true });
  writeFileSync(join(absoluteRepoPath, ".git"), "gitdir: ../.git/modules/mock\n");

  const resolved = readManifestRepoCommit(absoluteRepoPath, {
    dataRootPath: root,
    manifestPath
  });

  assert.equal(resolved, commit);
});

test("readManifestRepoCommit throws when manifest lacks repo commit", (t) => {
  const { root, manifestPath } = createDataFixture(t, [
    {
      path: "samples/dynamsoft-barcode-reader",
      commit: "2f0a723e88e3271170672e61c214a3d1d7a31328"
    }
  ]);

  const missingRepoPath = join(root, "samples/dynamsoft-capture-vision-nodejs");
  mkdirSync(missingRepoPath, { recursive: true });

  assert.throws(
    () => readManifestRepoCommit(missingRepoPath, { dataRootPath: root, manifestPath }),
    /Missing commit/
  );
});
