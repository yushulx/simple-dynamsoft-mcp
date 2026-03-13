import test from "node:test";
import assert from "node:assert/strict";
import { resolveRepoPathsForScopes } from "../../src/data/repo-map.js";

const manifest = {
  repos: [
    { path: "documentation/barcode-reader-docs-js" },
    { path: "documentation/capture-vision-docs-js" },
    { path: "documentation/mobile-document-scanner-docs-js" },
    { path: "samples/dynamsoft-barcode-reader" },
    { path: "samples/dynamsoft-capture-vision-javascript" },
    { path: "samples/mobile-document-scanner-javascript" },
    { path: "documentation/web-twain-docs" },
    { path: "samples/dynamic-web-twain" }
  ]
};

test("resolveRepoPathsForScopes picks DBR web docs and samples", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "dbr", edition: "web", type: "any" }],
    manifest
  );

  assert.deepEqual(paths, [
    "documentation/barcode-reader-docs-js",
    "samples/dynamsoft-barcode-reader"
  ]);
});

test("resolveRepoPathsForScopes respects type filter", () => {
  const docOnly = resolveRepoPathsForScopes(
    [{ product: "dcv", edition: "web", type: "doc" }],
    manifest
  );

  assert.deepEqual(docOnly, ["documentation/capture-vision-docs-js"]);
});

test("resolveRepoPathsForScopes falls back to all repos when scope empty", () => {
  const all = resolveRepoPathsForScopes([], manifest);
  assert.equal(all.length, manifest.repos.length);
});

test("resolveRepoPathsForScopes picks MDS web docs and samples", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mds", edition: "web", type: "any" }],
    manifest
  );

  assert.deepEqual(paths, [
    "documentation/mobile-document-scanner-docs-js",
    "samples/mobile-document-scanner-javascript"
  ]);
});
