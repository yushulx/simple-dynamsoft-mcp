import assert from "node:assert/strict";
import test from "node:test";
import { createProviderOrchestrator } from "../../src/rag/providers.js";

function createHarness({ texts, batchSize, fetchImpl }) {
  const resourceIndex = texts.map((text, index) => ({
    uri: `doc://${index + 1}`,
    content: text
  }));
  const resourceIndexByUri = new Map(resourceIndex.map((entry) => [entry.uri, entry]));

  const orchestrator = createProviderOrchestrator({
    pkgVersion: "1.0.0-test",
    ragConfig: {
      provider: "gemini",
      fallback: "none",
      profile: "test",
      geminiApiKey: "test-key",
      geminiBaseUrl: "https://example.test",
      geminiModel: "models/text-embedding-004",
      geminiBatchSize: batchSize,
      geminiRetryMaxAttempts: 1,
      geminiRetryBaseDelayMs: 10,
      geminiRetryMaxDelayMs: 10,
      geminiRequestThrottleMs: 0,
      cacheDir: "/tmp",
      rebuild: true,
      maxTextChars: 1000,
      minScore: 0
    },
    ragLogState: { providerReady: new Set() },
    logRag: () => {},
    resourceIndex,
    resourceIndexByUri,
    createLexicalProvider: () => ({
      name: "lexical",
      search: async () => [],
      warm: async () => {}
    }),
    getRagSignatureData: () => ({ seed: "test" }),
    utils: {
      createFuseSearch: () => ({ search: () => [] }),
      buildIndexSignature: () => "sig",
      buildEmbeddingItems: (entries) => entries.map((entry, index) => ({
        id: `id-${index + 1}`,
        uri: entry.uri,
        text: entry.content
      })),
      normalizeVector: (vector) => vector,
      normalizeText: (value) => value,
      truncateText: (value) => value,
      dotProduct: () => 0,
      entryMatchesScope: () => true,
      attachScore: (entry, score) => ({ ...entry, score })
    },
    vectorCache: {
      makeCacheFileName: () => "cache.json",
      makeCheckpointFileName: () => "checkpoint.json",
      clearVectorIndexCheckpoint: () => {},
      saveVectorIndexCheckpoint: () => {},
      saveVectorIndexCache: () => {},
      maybeDownloadPrebuiltVectorIndex: async () => ({ downloaded: false }),
      loadVectorIndexCache: () => ({ hit: false, reason: "missing" }),
      loadVectorIndexCheckpoint: () => ({ hit: false, reason: "missing" })
    }
  });

  return {
    async warmGeminiProvider() {
      const provider = await orchestrator.loadSearchProvider("gemini");
      const restoreFetch = global.fetch;
      global.fetch = fetchImpl;
      try {
        await provider.warm();
      } finally {
        global.fetch = restoreFetch;
      }
    }
  };
}

test("gemini single embed rejects empty embedding values payload", async () => {
  const harness = createHarness({
    texts: ["first"],
    batchSize: 1,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ embedding: { values: [] } })
    })
  });

  await assert.rejects(
    harness.warmGeminiProvider(),
    /Gemini embedding response missing embedding values/
  );
});

test("gemini batch embed rejects malformed item payloads", async () => {
  const harness = createHarness({
    texts: ["first", "second"],
    batchSize: 2,
    fetchImpl: async (url) => {
      if (String(url).includes(":batchEmbedContents")) {
        return {
          ok: true,
          json: async () => ({ embeddings: [{ values: [] }, { values: [0.1, 0.2] }] })
        };
      }
      return {
        ok: true,
        json: async () => ({ embedding: { values: [0.1, 0.2] } })
      };
    }
  });

  await assert.rejects(
    harness.warmGeminiProvider(),
    /Gemini batch embedding response malformed at index=0/
  );
});
