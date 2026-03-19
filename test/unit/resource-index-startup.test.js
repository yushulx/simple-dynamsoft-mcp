import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { basename } from "node:path";
import test from "node:test";
import { inferProductFromQuery, normalizeProduct } from "../../src/server/normalizers.js";
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

test("inferProductFromQuery recognizes MRZ and MDS queries", () => {
  assert.equal(inferProductFromQuery("mrz v2"), "mrz");
  assert.equal(inferProductFromQuery("passport scanner"), "mrz");
  assert.equal(inferProductFromQuery("mds v1"), "mds");
  assert.equal(inferProductFromQuery("document scanner"), "mds");
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

test("resource index falls back when mrz-web and mds-web metadata entries are missing", async () => {
  const tempDataRoot = mkdtempSync(`${os.tmpdir()}/mcp-data-`);
  const sourceRegistry = JSON.parse(readFileSync(new URL("../../data/metadata/dynamsoft_sdks.json", import.meta.url), "utf8"));
  delete sourceRegistry.sdks["mrz-web"];
  delete sourceRegistry.sdks["mds-web"];

  mkdirSync(`${tempDataRoot}/metadata`, { recursive: true });
  writeFileSync(`${tempDataRoot}/metadata/dynamsoft_sdks.json`, `${JSON.stringify(sourceRegistry, null, 2)}\n`);
  writeFileSync(
    `${tempDataRoot}/metadata/data-manifest.json`,
    readFileSync(new URL("../../data/metadata/data-manifest.json", import.meta.url), "utf8")
  );

  const script = `
    process.env.MCP_DATA_DIR = ${JSON.stringify(tempDataRoot)};
    const api = await import(${JSON.stringify(new URL("../../src/server/resource-index.js", import.meta.url).href)});
    console.log(JSON.stringify({
      mrzWeb: api.LATEST_VERSIONS.mrz.web,
      mdsWeb: api.LATEST_VERSIONS.mds.web,
      mrzMajor: api.LATEST_MAJOR.mrz,
      mdsMajor: api.LATEST_MAJOR.mds,
      dcvWeb: api.LATEST_VERSIONS.dcv.web,
      dcvMajor: api.LATEST_MAJOR.dcv
    }));
  `;

  const output = execFileSync("node", ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  const parsed = JSON.parse(output.trim());

  assert.equal(parsed.mrzWeb, sourceRegistry.sdks["dcv-web"].version);
  assert.equal(parsed.mdsWeb, sourceRegistry.sdks["dcv-web"].version);
  assert.equal(parsed.mrzMajor, parsed.dcvMajor);
  assert.equal(parsed.mdsMajor, parsed.dcvMajor);
});
