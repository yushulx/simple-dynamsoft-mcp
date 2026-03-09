import assert from "node:assert/strict";
import test from "node:test";

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
