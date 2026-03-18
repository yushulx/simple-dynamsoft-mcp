import assert from "node:assert/strict";
import { basename } from "node:path";
import test from "node:test";
import { normalizeProduct } from "../../src/server/normalizers.js";
import { DOC_DIRS, SAMPLE_DIRS } from "../../src/server/resource-index/config.js";
import { DOC_ROOTS, SAMPLE_ROOTS } from "../../src/server/resource-index/paths.js";

function freshResourceIndexImportUrl() {
  const url = new URL("../../src/server/resource-index.js", import.meta.url);
  url.searchParams.set("test", String(Date.now()));
  url.searchParams.set("rand", String(Math.random()));
  return url.href;
}

test("resource index is empty until explicitly initialized", async () => {
  const resourceIndexApi = await import(freshResourceIndexImportUrl());

  assert.equal(resourceIndexApi.resourceIndex.length, 0);
  assert.equal(typeof resourceIndexApi.ensureResourceIndexReady, "function");

  const initialized = resourceIndexApi.ensureResourceIndexReady();
  assert.ok(initialized.resourceCount > 0);
  assert.ok(resourceIndexApi.resourceIndex.length > 0);
});

test("normalizeProduct returns public MRZ and MDS offerings", () => {
  assert.equal(normalizeProduct("mrz"), "mrz");
  assert.equal(normalizeProduct("mds"), "mds");
});

test("resource index config routes MRZ and MDS web roots to dedicated repos", async () => {
  assert.equal(DOC_DIRS.mrzWeb, "mrz-scanner-docs-js");
  assert.equal(SAMPLE_DIRS.mrzWeb, "mrz-scanner-javascript");
  assert.equal(DOC_DIRS.mdsWeb, "mobile-document-scanner-docs-js");
  assert.equal(SAMPLE_DIRS.mdsWeb, "document-scanner-javascript");

  assert.equal(basename(DOC_ROOTS.mrzWeb), "mrz-scanner-docs-js");
  assert.equal(basename(SAMPLE_ROOTS.mrzWeb), "mrz-scanner-javascript");
  assert.equal(basename(DOC_ROOTS.mdsWeb), "mobile-document-scanner-docs-js");
  assert.equal(basename(SAMPLE_ROOTS.mdsWeb), "document-scanner-javascript");

  const resourceIndexApi = await import(freshResourceIndexImportUrl());
  assert.doesNotThrow(() => resourceIndexApi.ensureResourceIndexReady());
  assert.doesNotThrow(() => resourceIndexApi.getRagSignatureData());
});
