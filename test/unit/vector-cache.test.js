import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVectorCacheHelpers } from "../../src/rag/vector-cache.js";

function withHelpers(fn) {
  const cacheDir = mkdtempSync(join(tmpdir(), "vector-cache-"));
  try {
    const helpers = createVectorCacheHelpers({
      ragConfig: { cacheDir, prebuiltIndexAutoDownload: false },
      pkgVersion: "0.0.0",
      prebuiltIndexUrlFor: () => "",
      logRag: () => {}
    });
    return fn(helpers, cacheDir);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

const payload = {
  cacheKey: "key-1",
  meta: { provider: "gemini", model: "m", signature: "sig" },
  items: [{ id: "a#0", uri: "doc://a" }, { id: "b#0", uri: "doc://b" }],
  vectors: [[0.6, 0.8, 0], [0, 0.25, -1.5]]
};

test("cache round-trips items and vectors through header + float32 files", () => {
  withHelpers((helpers, cacheDir) => {
    const cacheFile = join(cacheDir, "rag-gemini-m-key.json");
    helpers.saveVectorIndexCache(cacheFile, payload);
    assert.ok(existsSync(cacheFile.replace(/\.json$/, ".f32")));

    const loaded = helpers.loadVectorIndexCache(cacheFile, { cacheKey: "key-1", signature: "sig", provider: "gemini", model: "m" });
    assert.equal(loaded.hit, true);
    assert.deepEqual(loaded.payload.items, payload.items);
    assert.deepEqual(loaded.payload.vectors.map((vector) => Array.from(vector)), [[0.6000000238418579, 0.800000011920929, 0], [0, 0.25, -1.5]]);

    assert.equal(helpers.loadVectorIndexCache(cacheFile, { signature: "other" }).reason, "signature_mismatch");
  });
});

test("cache with a truncated or missing vector file is rejected", () => {
  withHelpers((helpers, cacheDir) => {
    const cacheFile = join(cacheDir, "rag-gemini-m-key.json");
    helpers.saveVectorIndexCache(cacheFile, payload);
    writeFileSync(cacheFile.replace(/\.json$/, ".f32"), Buffer.alloc(8));
    assert.equal(helpers.loadVectorIndexCache(cacheFile).reason, "vectors_size_mismatch");

    rmSync(cacheFile.replace(/\.json$/, ".f32"));
    assert.equal(helpers.loadVectorIndexCache(cacheFile).reason, "vectors_missing");
  });
});

const hashed = (items) => items.map((item, i) => ({ ...item, hash: `h${i}` }));

test("vectors are reused by chunk hash from caches and partial checkpoints", () => {
  withHelpers((helpers, cacheDir) => {
    // Previous cache: hashes h0, h1. Partial checkpoint: only h2 embedded so far.
    helpers.saveVectorIndexCache(join(cacheDir, "rag-gemini-m-old.json"), { ...payload, items: hashed(payload.items) });
    helpers.saveVectorIndexCheckpoint(join(cacheDir, "rag-gemini-m-new.checkpoint.json"), {
      cacheKey: "key-2",
      meta: payload.meta,
      items: [{ id: "c#0", uri: "doc://c", hash: "h2" }],
      vectors: [[1, 0, 0]]
    });
    // A different model's cache must not be reused.
    helpers.saveVectorIndexCache(join(cacheDir, "rag-gemini-other-x.json"), {
      ...payload, meta: { ...payload.meta, model: "other" }, items: [{ id: "z", uri: "doc://z", hash: "h9" }], vectors: [[0, 0, 1]]
    });

    const reusable = helpers.collectReusableVectors({
      provider: "gemini",
      model: "m",
      items: [{ id: "a#0", uri: "doc://a", hash: "h0" }, { id: "x", uri: "doc://x", hash: "h9" }],
      signature: "{}"
    });
    assert.deepEqual([...reusable.keys()].sort(), ["h0", "h1", "h2"]);
    assert.deepEqual(Array.from(reusable.get("h2")), [1, 0, 0]);
  });
});

test("hash-less caches are adopted only when content signature and item sequence match", () => {
  withHelpers((helpers, cacheDir) => {
    const legacySignature = JSON.stringify({ packageVersion: "7.7.0", docs: 2 });
    helpers.saveVectorIndexCache(join(cacheDir, "rag-gemini-m-legacy.json"), { ...payload, meta: { ...payload.meta, signature: legacySignature } });
    const items = hashed(payload.items);

    const sameContent = helpers.collectReusableVectors({
      provider: "gemini", model: "m", items, allowLegacyAdoption: true, signature: JSON.stringify({ packageVersion: "7.7.1", docs: 2 })
    });
    assert.deepEqual([...sameContent.keys()], ["h0", "h1"]);

    const changedContent = helpers.collectReusableVectors({
      provider: "gemini", model: "m", items, allowLegacyAdoption: true, signature: JSON.stringify({ packageVersion: "7.7.1", docs: 3 })
    });
    assert.equal(changedContent.size, 0);
  });
});

test("pruning keeps only the current cache and removes vector files of the others", () => {
  withHelpers((helpers, cacheDir) => {
    const keep = join(cacheDir, "rag-gemini-m-new.json");
    const old = join(cacheDir, "rag-gemini-m-old.json");
    helpers.saveVectorIndexCache(keep, payload);
    helpers.saveVectorIndexCache(old, payload);
    helpers.pruneOtherCaches({ provider: "gemini", model: "m", keepFile: keep });
    assert.equal(existsSync(keep), true);
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(old.replace(/\.json$/, ".f32")), false);
  });
});

test("hash-less caches are adopted by chunk id/uri even when listing order differs", () => {
  withHelpers((helpers, cacheDir) => {
    const signature = JSON.stringify({ packageVersion: "7.7.0", docs: 2 });
    helpers.saveVectorIndexCache(join(cacheDir, "rag-gemini-m-legacy.json"), { ...payload, meta: { ...payload.meta, signature } });
    // Same chunks, opposite order (e.g. case-sensitive vs case-insensitive directory listing).
    const items = [{ id: "b#0", uri: "doc://b", hash: "hb" }, { id: "a#0", uri: "doc://a", hash: "ha" }];
    const reusable = helpers.collectReusableVectors({
      provider: "gemini", model: "m", items, allowLegacyAdoption: true, signature: JSON.stringify({ packageVersion: "7.7.1", docs: 2 })
    });
    const unverifiedData = helpers.collectReusableVectors({
      provider: "gemini", model: "m", items, signature: JSON.stringify({ packageVersion: "7.7.1", docs: 2 })
    });
    assert.equal(unverifiedData.size, 0, "legacy caches are not adopted unless local data matches the pins");
    assert.deepEqual(Array.from(reusable.get("ha")).map((v) => Math.round(v * 10) / 10), [0.6, 0.8, 0]);
    assert.deepEqual(Array.from(reusable.get("hb")), [0, 0.25, -1.5]);

    const extraItem = helpers.collectReusableVectors({
      provider: "gemini", model: "m", items: [...items, { id: "c#0", uri: "doc://c", hash: "hc" }], allowLegacyAdoption: true, signature
    });
    assert.equal(extraItem.size, 0, "a different chunk set is never adopted");
  });
});
