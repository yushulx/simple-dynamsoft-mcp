// Guards the credit-saving guarantee end to end through the real provider:
// a rebuild with unchanged chunk text makes no embedding calls, and a rebuild
// after one doc changes embeds only that doc's chunk.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderOrchestrator } from "../../src/rag/providers.js";
import { createVectorCacheHelpers } from "../../src/rag/vector-cache.js";
import * as searchUtils from "../../src/rag/search-utils.js";

// Speaks both the Gemini API and the OpenAI/Azure OpenAI `/embeddings` API.
async function startStubEmbedder() {
  const stats = { texts: 0, requests: [] };
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
      stats.requests.push({ url: req.url, headers: req.headers, body: json });
      let payload;
      if (Array.isArray(json.input)) {
        stats.texts += json.input.length;
        // Reverse order on purpose: clients must sort by `index`.
        payload = { data: json.input.map((text, index) => ({ index, embedding: vector(text) })).reverse() };
      } else if (json.requests) {
        payload = { embeddings: json.requests.map((r) => { stats.texts += 1; return { values: vector(r.content.parts[0].text) }; }) };
      } else {
        stats.texts += 1;
        payload = { embedding: { values: vector(json.content.parts[0].text) } };
      }
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

async function buildIndex({ entries, pkgVersion, cacheDir, baseUrl, provider = "gemini", overrides = {} }) {
  const ragConfig = {
    provider, fallback: "none", profile: `semantic-${provider}`, cacheDir, rebuild: false,
    chunkSize: 1200, chunkOverlap: 200, maxChunksPerDoc: 0, maxTextChars: 4000, minScore: 0,
    geminiApiKey: "stub", geminiModel: "models/stub", geminiBaseUrl: baseUrl, geminiBatchSize: 16,
    geminiRetryMaxAttempts: 1, geminiRetryBaseDelayMs: 1, geminiRetryMaxDelayMs: 1, geminiRequestThrottleMs: 0,
    openaiApiKey: "sk-stub", openaiBaseUrl: `${baseUrl}/v1`, openaiModel: "text-embedding-3-large", openaiDimensions: 0, openaiBatchSize: 64,
    azureOpenaiApiKey: "az-stub", azureOpenaiEndpoint: baseUrl, azureOpenaiDeployment: "embed-large",
    azureOpenaiModel: "text-embedding-3-large", azureOpenaiApiVersion: "2024-10-21", azureOpenaiDimensions: 0, azureOpenaiBatchSize: 64,
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
    vectorCache: createVectorCacheHelpers({ ragConfig, pkgVersion, prebuiltIndexUrlFor: () => "", logRag: noop })
  });
  const searchProvider = await orchestrator.loadSearchProvider(provider);
  return searchProvider.search("alpha", {}, 5);
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

test("azure-openai uses the deployment URL, api-key header, and reuses vectors on rebuild", async () => {
  const stub = await startStubEmbedder();
  const cacheDir = mkdtempSync(join(tmpdir(), "azure-embed-"));
  try {
    const results = await buildIndex({ entries: makeEntries(), pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url, provider: "azure-openai" });
    assert.equal(results[0]?.uri, "doc://a", "query 'alpha' should rank the Alpha doc first");

    const first = stub.stats.requests[0];
    assert.equal(first.url, "/openai/deployments/embed-large/embeddings?api-version=2024-10-21");
    assert.equal(first.headers["api-key"], "az-stub");
    assert.equal(first.headers.authorization, undefined);
    assert.equal(first.body.model, undefined, "Azure selects the model by deployment");

    const before = stub.stats.texts;
    await buildIndex({ entries: makeEntries(), pkgVersion: "1.0.1", cacheDir, baseUrl: stub.url, provider: "azure-openai" });
    assert.equal(stub.stats.texts - before, 1, "only the search query is embedded on a version-only rebuild");
  } finally {
    await stub.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("openai sends model and dimensions; changing dimensions re-embeds instead of reusing", async () => {
  const stub = await startStubEmbedder();
  const cacheDir = mkdtempSync(join(tmpdir(), "openai-embed-"));
  try {
    await buildIndex({ entries: makeEntries(), pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url, provider: "openai" });
    const first = stub.stats.requests[0];
    assert.equal(first.url, "/v1/embeddings");
    assert.equal(first.headers.authorization, "Bearer sk-stub");
    assert.equal(first.body.model, "text-embedding-3-large");
    assert.equal(first.body.dimensions, undefined);

    const before = stub.stats.texts;
    await buildIndex({
      entries: makeEntries(), pkgVersion: "1.0.0", cacheDir, baseUrl: stub.url, provider: "openai",
      overrides: { openaiDimensions: 256 }
    });
    assert.equal(stub.stats.requests.at(-1).body.dimensions, 256);
    assert.equal(stub.stats.texts - before, 2 + 1, "both chunks and the query are embedded at the new size");
  } finally {
    await stub.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("openai 429 insufficient_quota fails immediately instead of retrying", async () => {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    req.resume();
    res.statusCode = 429;
    res.end(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cacheDir = mkdtempSync(join(tmpdir(), "openai-quota-"));
  try {
    await assert.rejects(
      buildIndex({
        entries: makeEntries(), pkgVersion: "1.0.0", cacheDir, provider: "openai",
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        overrides: { geminiRetryMaxAttempts: 5 }
      }),
      /insufficient_quota/
    );
    assert.equal(requests, 1);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
