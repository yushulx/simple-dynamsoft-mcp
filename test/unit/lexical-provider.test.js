import test from "node:test";
import assert from "node:assert/strict";
import { createLexicalProvider } from "../../src/rag/lexical-provider.js";

function makeEntry(uri, title, summary, tags = []) {
  return {
    uri,
    type: "doc",
    product: "dwt",
    edition: "web",
    platform: "web",
    title,
    summary,
    tags
  };
}

test("lexical provider ranks stronger keyword match first", async () => {
  const entries = [
    makeEntry("doc://1", "MRZ scanner guide", "Build an mrz scanner flow", ["mrz", "scanner"]),
    makeEntry("doc://2", "Barcode basics", "General scanning guide", ["barcode"]),
    makeEntry("doc://3", "Scanner troubleshooting", "Camera troubleshooting", ["camera"])
  ];

  const provider = createLexicalProvider({
    entries,
    entryMatchesScope: () => true,
    attachScore: (entry) => entry
  });

  const results = await provider.search("mrz scanner", {}, 3);
  assert.equal(results[0].uri, "doc://1");
});

test("lexical provider respects filters and limit", async () => {
  const entries = [
    makeEntry("doc://1", "DWT read barcode", "scan barcode from doc", ["barcode"]),
    makeEntry("doc://2", "DDV hello world", "viewer quickstart", ["viewer"]),
    makeEntry("doc://3", "DWT barcode advanced", "batch barcode flow", ["barcode"])
  ];
  entries[1].product = "ddv";

  const provider = createLexicalProvider({
    entries,
    entryMatchesScope: (entry, filters) => entry.product === filters.product,
    attachScore: (entry) => entry
  });

  const results = await provider.search("barcode", { product: "dwt" }, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].product, "dwt");
});

test("lexical provider ordering is deterministic for ties", async () => {
  const entries = [
    makeEntry("doc://b", "Same title", "same terms", ["same"]),
    makeEntry("doc://a", "Same title", "same terms", ["same"])
  ];

  const provider = createLexicalProvider({
    entries,
    entryMatchesScope: () => true,
    attachScore: (entry) => entry,
    bm25Weight: 0,
    fuseWeight: 0
  });

  const results = await provider.search("same", {}, 10);
  assert.deepEqual(results.map((entry) => entry.uri), ["doc://a", "doc://b"]);
});
