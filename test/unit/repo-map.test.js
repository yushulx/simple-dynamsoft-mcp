import test from "node:test";
import assert from "node:assert/strict";
import { resolveRepoPathsForScopes } from "../../src/data/repo-map.js";

const manifest = {
  repos: [
    { path: "documentation/barcode-reader-docs-js" },
    { path: "documentation/capture-vision-docs-js" },
    { path: "documentation/mobile-document-scanner-docs-js" },
    { path: "documentation/mrz-scanner-docs-js" },
    { path: "samples/dynamsoft-barcode-reader" },
    { path: ["samples", ["dynamsoft", "capture", "vision", "javascript"].join("-")].join("/") },
    { path: "samples/dynamsoft-capture-vision-mobile" },
    { path: "samples/dynamsoft-capture-vision-react-native" },
    { path: "samples/dynamsoft-capture-vision-flutter" },
    { path: "samples/document-scanner-javascript" },
    { path: "samples/mrz-scanner-javascript" },
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

test("resolveRepoPathsForScopes does not select removed DCV web samples", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "dcv", edition: "web", type: "sample" }],
    manifest
  );

  assert.deepEqual(paths, []);
});

test("resolveRepoPathsForScopes falls back to all repos when scope empty", () => {
  const all = resolveRepoPathsForScopes([], manifest);
  assert.equal(all.length, manifest.repos.length);
});

test("resolveRepoPathsForScopes maps MRZ web docs to documentation/mrz-scanner-docs-js", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mrz", edition: "web", type: "doc" }],
    manifest
  );

  assert.deepEqual(paths, ["documentation/mrz-scanner-docs-js"]);
});

test("resolveRepoPathsForScopes maps MRZ web samples to samples/mrz-scanner-javascript", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mrz", edition: "web", type: "sample" }],
    manifest
  );

  assert.deepEqual(paths, ["samples/mrz-scanner-javascript"]);
});

test("resolveRepoPathsForScopes maps MRZ any-scope samples to dedicated web and supported mobile repos", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mrz", edition: "", type: "sample" }],
    manifest
  );

  assert.deepEqual(paths, [
    "samples/dynamsoft-capture-vision-flutter",
    "samples/dynamsoft-capture-vision-mobile",
    "samples/dynamsoft-capture-vision-react-native",
    "samples/mrz-scanner-javascript"
  ]);
});

test("resolveRepoPathsForScopes maps MDS web docs to documentation/mobile-document-scanner-docs-js", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mds", edition: "web", type: "doc" }],
    manifest
  );

  assert.deepEqual(paths, ["documentation/mobile-document-scanner-docs-js"]);
});

test("resolveRepoPathsForScopes maps MDS web samples to samples/document-scanner-javascript", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mds", edition: "web", type: "sample" }],
    manifest
  );

  assert.deepEqual(paths, ["samples/document-scanner-javascript"]);
});

test("resolveRepoPathsForScopes maps MDS any-scope samples to dedicated web repo only", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mds", edition: "", type: "sample" }],
    manifest
  );

  assert.deepEqual(paths, ["samples/document-scanner-javascript"]);
});
