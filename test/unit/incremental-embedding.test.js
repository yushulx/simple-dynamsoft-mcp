// Guards the credit-saving guarantee end to end through the real provider:
// a rebuild with unchanged chunk text makes no embedding calls, and a rebuild
// after one doc changes embeds only that doc's chunk.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { createProviderOrchestrator } from "../../src/rag/providers.js";
import { createVectorCacheHelpers } from "../../src/rag/vector-cache.js";
import * as searchUtils from "../../src/rag/search-utils.js";

// `stats.failAfter`: answer HTTP 500 once that many texts were embedded.
async function startStubEmbedder() {
  const stats = { texts: 0, failAfter: Infinity };
  const vector = (text) => {
    const values = new Array(8).fill(0);
    for (let i = 0; i < text.length; i += 1) values[i % 8] += (text.charCodeAt(i) % 7) + 1;
    return values;
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const json = JSON.parse(body || "{}");
      if (stats.texts >= stats.failAfter) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: { message: "stub failure" } }));
        return;
      }
      const payload = json.requests
        ? { embeddings: json.requests.map((r) => { stats.texts += 1; return { values: vector(r.content.parts[0].text) }; }) }
        : (stats.texts += 1, { embedding: { values: vector(json.content.parts[0].text) } });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { stats, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

function makeEntries(changedBody = "second body") {
  return [
    { id: "a", uri: "doc://a", type: "doc", product: "dbr", title: "Alpha", summary: "first", tags: [], embedText: "# Alpha\nfirst body" },
    { id: "b", uri: "doc://b", type: "doc", product: "dbr", title: "Beta", summary: "second", tags: [], embedText: `# Beta\n${changedBody}` }
  ];
}

async function buildIndex({ entries, pkgVersion, cacheDir, baseUrl, overrides = {} }) {
  const ragConfig = {
    provider: "gemini", fallback: "none", profile: "semantic-gemini", cacheDir, rebuild: false,
    chunkSize: 1200, chunkOverlap: 200, maxChunksPerDoc: 0, maxTextChars: 4000, minScore: 0,
    geminiApiKey: "stub", geminiModel: "models/stub", geminiBaseUrl: baseUrl, geminiBatchSize: 16,
    geminiRetryMaxAttempts: 1, geminiRetryBaseDelayMs: 1, geminiRetryMaxDelayMs: 1, geminiRequestThrottleMs: 0,
    prebuiltIndexAutoDownload: false, prebuiltIndexUrl: "", prebuiltIndexUrlGemini: "", prebuiltIndexTimeoutMs: 1000,
    ...overrides
  };
  const noop = () => {};
  const orchestrator = createProviderOrchestrator({
    pkgVersion,
    ragConfig,
    ragLogState: { providerReady: new Set() },
    logRag: noop,
    resourceIndex: entries,
    resourceIndexByUri: new Map(entries.map((entry) => [entry.uri, entry])),
    createLexicalProvider: () => ({ search: async () => [] }),
    getRagSignatureData: () => ({ resourceCount: entries.length, docCount: entries.length }),
    utils: {
      ...searchUtils,
      createFuseSearch: () => searchUtils.createFuseSearch(entries),
      attachScore: (entry, score) => ({ ...entry, score }),
      entryMatchesScope: () => true
    },
    vectorCache: createVectorCacheHelpers({ ragConfig, pkgVersion, legacyPrebuiltIndexUrl: "", logRag: noop })
  });
  const provider = await orchestrator.loadSearchProvider("gemini");
  return provider.search("alpha", {}, 5);
}

test("rebuilds embed only chunks whose text changed", async () => {
  const stub = await startStubEmbedder();
  const cacheDir = mkdtempSync(join(tmpdir(), "incremental-embed-"));
  try {
    await buildIndex({ entries: makeEntries(), pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url });
    // Each build also embeds the one search query used to load it.
    const QUERY = 1;
    const firstBuild = stub.stats.texts;
    assert.equal(firstBuild - QUERY, 2, "first build embeds every chunk");

    // New package version, identical content: nothing to embed.
    await buildIndex({ entries: makeEntries(), pkgVersion: "1.0.1", cacheDir, baseUrl: stub.url });
    assert.equal(stub.stats.texts - firstBuild - QUERY, 0, "version-only rebuild embeds no chunks");

    // One doc's text changes: only its chunk is embedded.
    const before = stub.stats.texts;
    await buildIndex({ entries: makeEntries("second body, edited"), pkgVersion: "1.0.2", cacheDir, baseUrl: stub.url });
    assert.equal(stub.stats.texts - before - QUERY, 1, "only the edited chunk is embedded");
  } finally {
    await stub.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("same package version with edited text re-embeds the edited chunk (no stale cache hit)", async () => {
  const stub = await startStubEmbedder();
  const cacheDir = mkdtempSync(join(tmpdir(), "stale-hit-"));
  try {
    await buildIndex({ entries: makeEntries(), pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url });
    const before = stub.stats.texts;
    // Same signature inputs (counts, version), different text.
    await buildIndex({ entries: makeEntries("second body, edited"), pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url });
    assert.equal(stub.stats.texts - before, 1 + 1, "the edited chunk and the query are embedded");
  } finally {
    await stub.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("a build interrupted twice keeps the progress of both attempts", async () => {
  const stub = await startStubEmbedder();
  const cacheDir = mkdtempSync(join(tmpdir(), "resume-"));
  const entries = ["a", "b", "c", "d"].map((id) => ({
    id, uri: `doc://${id}`, type: "doc", product: "dbr", title: id, summary: id, tags: [], embedText: `# ${id}\nbody ${id}`
  }));
  const run = () => buildIndex({ entries, pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url, overrides: { geminiBatchSize: 1 } });
  try {
    stub.stats.failAfter = 1;
    await assert.rejects(run());
    stub.stats.failAfter = 2;
    await assert.rejects(run());
    assert.equal(stub.stats.texts, 2);

    stub.stats.failAfter = Infinity;
    await run();
    assert.equal(stub.stats.texts - 2, 2 + 1, "only the two never-embedded chunks and the query");
  } finally {
    await stub.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("missing chunks are taken from the release prebuilt index before any embedding call", async () => {
  const stub = await startStubEmbedder();
  const releaseDir = mkdtempSync(join(tmpdir(), "release-build-"));
  const localDir = mkdtempSync(join(tmpdir(), "local-cache-"));
  try {
    // Release: full index for both docs, packaged like a release asset.
    await buildIndex({ entries: makeEntries(), pkgVersion: "1.0.0", cacheDir: join(releaseDir, "gemini", "cache"), baseUrl: stub.url });
    const archive = join(releaseDir, "prebuilt.tar.gz");
    await tar.c({ gzip: true, file: archive, cwd: releaseDir }, ["gemini"]);

    // Local: a complete cache for the same model that covers only the first doc.
    await buildIndex({ entries: makeEntries().slice(0, 1), pkgVersion: "1.0.0", cacheDir: localDir, baseUrl: stub.url });

    const before = stub.stats.texts;
    await buildIndex({
      entries: makeEntries(), pkgVersion: "1.0.0", cacheDir: localDir, baseUrl: stub.url,
      overrides: { prebuiltIndexAutoDownload: true, prebuiltIndexUrlGemini: archive }
    });
    assert.equal(stub.stats.texts - before, 1, "only the search query is embedded; the second doc comes from the prebuilt index");
  } finally {
    await stub.close();
    rmSync(releaseDir, { recursive: true, force: true });
    rmSync(localDir, { recursive: true, force: true });
  }
});

test("a downloaded release index never overwrites vectors already embedded locally", async () => {
  const stub = await startStubEmbedder();
  const releaseDir = mkdtempSync(join(tmpdir(), "release-build-"));
  const localDir = mkdtempSync(join(tmpdir(), "local-cache-"));
  const entries = (aBody, bBody) => [
    { id: "a", uri: "doc://a", type: "doc", product: "dbr", title: "Alpha", summary: "first", tags: [], embedText: `# Alpha\n${aBody}` },
    { id: "b", uri: "doc://b", type: "doc", product: "dbr", title: "Beta", summary: "second", tags: [], embedText: `# Beta\n${bBody}` }
  ];
  const download = { prebuiltIndexAutoDownload: true };
  try {
    // Release index for the original text (same version, so same cache filename).
    await buildIndex({ entries: entries("a1", "b1"), pkgVersion: "1.0.0", cacheDir: join(releaseDir, "gemini", "cache"), baseUrl: stub.url });
    const archive = join(releaseDir, "prebuilt.tar.gz");
    await tar.c({ gzip: true, file: archive, cwd: releaseDir }, ["gemini"]);
    download.prebuiltIndexUrlGemini = archive;

    // Local build embeds an edit to A.
    await buildIndex({ entries: entries("a2", "b1"), pkgVersion: "1.0.0", cacheDir: localDir, baseUrl: stub.url, overrides: download });
    // Next build edits only B: A's local vector must survive the download.
    const before = stub.stats.texts;
    await buildIndex({ entries: entries("a2", "b2"), pkgVersion: "1.0.0", cacheDir: localDir, baseUrl: stub.url, overrides: download });
    assert.equal(stub.stats.texts - before, 1 + 1, "only B and the query are embedded");
  } finally {
    await stub.close();
    rmSync(releaseDir, { recursive: true, force: true });
    rmSync(localDir, { recursive: true, force: true });
  }
});

test("a build that would embed more than RAG_MAX_EMBED_CHUNKS fails before any embedding call", async () => {
  const stub = await startStubEmbedder();
  const cacheDir = mkdtempSync(join(tmpdir(), "embed-cap-"));
  try {
    await assert.rejects(
      buildIndex({ entries: makeEntries(), pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url, overrides: { maxEmbedChunks: 1 } }),
      /Refusing to embed 2 chunks/
    );
    assert.equal(stub.stats.texts, 0);
  } finally {
    await stub.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("semantic results carry the matched chunk as a passage, after a build and after a cache reload", async () => {
  const stub = await startStubEmbedder();
  const cacheDir = mkdtempSync(join(tmpdir(), "passages-"));
  const entries = [
    { id: "a", uri: "doc://a", type: "doc", product: "dbr", title: "Alpha", summary: "page summary", tags: ["tag"], embedText: "## Setup\nCall alpha.init() before scanning." }
  ];
  try {
    for (const label of ["fresh build", "cache reload"]) {
      const [hit] = await buildIndex({ entries, pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url });
      assert.match(hit.matchedPassage, /Setup.*Call alpha\.init\(\) before scanning\./, label);
      // The page header embedded with each chunk is not repeated in the passage.
      assert.doesNotMatch(hit.matchedPassage, /page summary/, label);
      assert.match(hit.matchedSnippet, /alpha\.init\(\)/, label);
    }
  } finally {
    await stub.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
