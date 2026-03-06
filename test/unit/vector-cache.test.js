import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { computeRepoSignature, createSharedState } from "../../src/data/shared-state.js";
import { createVectorCacheHelpers } from "../../src/rag/vector-cache.js";

function createManifest(rootDir, repos) {
  const metadataDir = join(rootDir, "metadata");
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(join(metadataDir, "data-manifest.json"), JSON.stringify({ version: 1, repos }));
}

function makeRagConfig({ rootDir, cacheDir, sharedStatePath }) {
  return {
    cacheDir,
    dataRoot: rootDir,
    sharedStatePath,
    chunkSize: 1200,
    chunkOverlap: 200,
    maxChunksPerDoc: 6,
    maxTextChars: 4000
  };
}

function makeHelpers(ragConfig) {
  return createVectorCacheHelpers({
    ragConfig,
    pkgVersion: "1.0.0-test",
    legacyPrebuiltIndexUrl: "",
    logRag: () => {}
  });
}

test("loads shared state shards for gemini provider", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "vector-cache-shared-success-"));
  const cacheDir = join(rootDir, "cache");
  const sharedRoot = join(rootDir, "shared");
  const sharedStatePath = join(sharedRoot, "state", "current.json");
  const model = "models/gemini-embedding-001";
  const indexVersion = "azure-shared-v1";

  try {
    const manifestRepos = [
      {
        path: "documentation/capture-vision-docs-js",
        commit: "3137b83d966e795190a9681e544045a5e526c083"
      }
    ];
    createManifest(rootDir, manifestRepos);

    const repoSignature = computeRepoSignature({
      repo: manifestRepos[0],
      embeddingModel: model,
      indexConfig: {
        chunkSize: 1200,
        chunkOverlap: 200,
        maxChunksPerDoc: 6,
        maxTextChars: 4000
      },
      indexVersion
    });

    const shardPath = `rag/cache/gemini-${repoSignature}.json`;
    const shardFile = join(rootDir, shardPath);
    mkdirSync(dirname(shardFile), { recursive: true });
    writeFileSync(shardFile, JSON.stringify({
      items: [{ id: "chunk-1", uri: "doc://1" }],
      vectors: [[0.1, 0.2, 0.3]]
    }));

    const sharedState = createSharedState({
      indexVersion,
      repos: {
        "documentation/capture-vision-docs-js": {
          path: "documentation/capture-vision-docs-js",
          commit: manifestRepos[0].commit,
          signature: repoSignature,
          shardPath
        },
        "samples/dynamsoft-capture-vision-nodejs": {
          path: "samples/dynamsoft-capture-vision-nodejs",
          commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          signature: "non-matching-signature",
          shardPath: "rag/cache/gemini-non-matching-signature.json"
        }
      }
    });
    mkdirSync(dirname(sharedStatePath), { recursive: true });
    writeFileSync(sharedStatePath, JSON.stringify(sharedState));

    const ragConfig = makeRagConfig({ rootDir, cacheDir, sharedStatePath });
    const vectorCache = makeHelpers(ragConfig);

    const cacheKey = "1234567890abcdef1234567890abcdef";
    const cacheFile = join(cacheDir, vectorCache.makeCacheFileName("gemini", model, cacheKey));
    const signature = "runtime-signature";

    const result = await vectorCache.maybeLoadSharedVectorIndex({
      provider: "gemini",
      model,
      cacheKey,
      signature,
      cacheFile
    });

    assert.equal(result.loaded, true, JSON.stringify(result));
    const loaded = vectorCache.loadVectorIndexCache(cacheFile, {
      cacheKey,
      provider: "gemini",
      model,
      signature
    });
    assert.equal(loaded.hit, true);
    assert.equal(loaded.payload.items.length, 1);
    assert.equal(loaded.payload.vectors.length, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("loads shared shards when current.json is in a top-level state directory", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "vector-cache-shared-state-top-level-"));
  const cacheDir = join(rootDir, "cache");
  const sharedStatePath = join(rootDir, "state", "current.json");
  const model = "models/gemini-embedding-001";
  const indexVersion = "azure-shared-v1";

  try {
    const manifestRepos = [
      {
        path: "documentation/capture-vision-docs-js",
        commit: "3137b83d966e795190a9681e544045a5e526c083"
      }
    ];
    createManifest(rootDir, manifestRepos);

    const repoSignature = computeRepoSignature({
      repo: manifestRepos[0],
      embeddingModel: model,
      indexConfig: {
        chunkSize: 1200,
        chunkOverlap: 200,
        maxChunksPerDoc: 6,
        maxTextChars: 4000
      },
      indexVersion
    });

    const shardPath = `rag/cache/gemini-${repoSignature}.json`;
    const shardFile = join(rootDir, shardPath);
    mkdirSync(dirname(shardFile), { recursive: true });
    writeFileSync(shardFile, JSON.stringify({
      items: [{ id: "chunk-1", uri: "doc://1" }],
      vectors: [[0.1, 0.2, 0.3]]
    }));

    const sharedState = createSharedState({
      indexVersion,
      repos: {
        "documentation/capture-vision-docs-js": {
          path: "documentation/capture-vision-docs-js",
          commit: manifestRepos[0].commit,
          signature: repoSignature,
          shardPath
        }
      }
    });
    mkdirSync(dirname(sharedStatePath), { recursive: true });
    writeFileSync(sharedStatePath, JSON.stringify(sharedState));

    const ragConfig = makeRagConfig({ rootDir, cacheDir, sharedStatePath });
    const vectorCache = makeHelpers(ragConfig);

    const cacheKey = "1234567890abcdef1234567890abcdef";
    const cacheFile = join(cacheDir, vectorCache.makeCacheFileName("gemini", model, cacheKey));
    const signature = "runtime-signature";

    const result = await vectorCache.maybeLoadSharedVectorIndex({
      provider: "gemini",
      model,
      cacheKey,
      signature,
      cacheFile
    });

    assert.equal(result.loaded, true, JSON.stringify(result));
    const loaded = vectorCache.loadVectorIndexCache(cacheFile, {
      cacheKey,
      provider: "gemini",
      model,
      signature
    });
    assert.equal(loaded.hit, true);
    assert.equal(loaded.payload.items.length, 1);
    assert.equal(loaded.payload.vectors.length, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("shared shard missing returns graceful failure metadata", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "vector-cache-shared-missing-"));
  const cacheDir = join(rootDir, "cache");
  const sharedRoot = join(rootDir, "shared");
  const sharedStatePath = join(sharedRoot, "state", "current.json");
  const model = "models/gemini-embedding-001";
  const indexVersion = "azure-shared-v1";

  try {
    const manifestRepos = [
      {
        path: "documentation/capture-vision-docs-js",
        commit: "3137b83d966e795190a9681e544045a5e526c083"
      }
    ];
    createManifest(rootDir, manifestRepos);

    const repoSignature = computeRepoSignature({
      repo: manifestRepos[0],
      embeddingModel: model,
      indexConfig: {
        chunkSize: 1200,
        chunkOverlap: 200,
        maxChunksPerDoc: 6,
        maxTextChars: 4000
      },
      indexVersion
    });

    const missingShardPath = `rag/cache/gemini-${repoSignature}.json`;
    const sharedState = createSharedState({
      indexVersion,
      repos: {
        "documentation/capture-vision-docs-js": {
          path: "documentation/capture-vision-docs-js",
          commit: manifestRepos[0].commit,
          signature: repoSignature,
          shardPath: missingShardPath
        }
      }
    });
    mkdirSync(dirname(sharedStatePath), { recursive: true });
    writeFileSync(sharedStatePath, JSON.stringify(sharedState));

    const ragConfig = makeRagConfig({ rootDir, cacheDir, sharedStatePath });
    const vectorCache = makeHelpers(ragConfig);

    const result = await vectorCache.maybeLoadSharedVectorIndex({
      provider: "gemini",
      model,
      cacheKey: "1234567890abcdef1234567890abcdef",
      signature: "runtime-signature",
      cacheFile: join(cacheDir, "gemini-cache.json")
    });

    assert.equal(result.loaded, false);
    assert.equal(result.fatal, true);
    assert.match(result.reason, /shared_shard/);
    assert.ok(result.error instanceof Error);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("absolute shard paths are used directly without normalization", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "vector-cache-shared-absolute-"));
  const cacheDir = join(rootDir, "cache");
  const sharedStatePath = join(rootDir, "state", "current.json");
  const model = "models/gemini-embedding-001";
  const indexVersion = "azure-shared-v1";

  try {
    const manifestRepos = [
      {
        path: "documentation/capture-vision-docs-js",
        commit: "3137b83d966e795190a9681e544045a5e526c083"
      }
    ];
    createManifest(rootDir, manifestRepos);

    const repoSignature = computeRepoSignature({
      repo: manifestRepos[0],
      embeddingModel: model,
      indexConfig: {
        chunkSize: 1200,
        chunkOverlap: 200,
        maxChunksPerDoc: 6,
        maxTextChars: 4000
      },
      indexVersion
    });

    const absoluteShardFile = join(rootDir, "rag", "cache", `gemini-${repoSignature}.json`);
    mkdirSync(dirname(absoluteShardFile), { recursive: true });
    writeFileSync(absoluteShardFile, JSON.stringify({
      items: [{ id: "chunk-1", uri: "doc://1" }],
      vectors: [[0.1, 0.2, 0.3]]
    }));

    const sharedState = createSharedState({
      indexVersion,
      repos: {
        "documentation/capture-vision-docs-js": {
          path: "documentation/capture-vision-docs-js",
          commit: manifestRepos[0].commit,
          signature: repoSignature,
          shardPath: absoluteShardFile
        }
      }
    });

    mkdirSync(dirname(sharedStatePath), { recursive: true });
    writeFileSync(sharedStatePath, JSON.stringify(sharedState));

    const ragConfig = makeRagConfig({ rootDir, cacheDir, sharedStatePath });
    const vectorCache = makeHelpers(ragConfig);

    const cacheKey = "1234567890abcdef1234567890abcdef";
    const cacheFile = join(cacheDir, vectorCache.makeCacheFileName("gemini", model, cacheKey));
    const signature = "runtime-signature";

    const result = await vectorCache.maybeLoadSharedVectorIndex({
      provider: "gemini",
      model,
      cacheKey,
      signature,
      cacheFile
    });

    assert.equal(result.loaded, true, JSON.stringify(result));
    const loaded = vectorCache.loadVectorIndexCache(cacheFile, {
      cacheKey,
      provider: "gemini",
      model,
      signature
    });
    assert.equal(loaded.hit, true);
    assert.equal(loaded.payload.items.length, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("shared state path unset keeps existing behavior", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "vector-cache-shared-unset-"));
  const cacheDir = join(rootDir, "cache");
  const model = "models/gemini-embedding-001";

  try {
    createManifest(rootDir, []);
    const ragConfig = makeRagConfig({ rootDir, cacheDir, sharedStatePath: "" });
    const vectorCache = makeHelpers(ragConfig);

    const cacheKey = "1234567890abcdef1234567890abcdef";
    const cacheFile = join(cacheDir, vectorCache.makeCacheFileName("gemini", model, cacheKey));
    const result = await vectorCache.maybeLoadSharedVectorIndex({
      provider: "gemini",
      model,
      cacheKey,
      signature: "runtime-signature",
      cacheFile
    });

    assert.equal(result.loaded, false);
    assert.equal(result.reason, "shared_state_not_configured");
    assert.equal(existsSync(cacheFile), false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("prefers shard resolution from state root before state directory", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "vector-cache-shared-root-priority-"));
  const cacheDir = join(rootDir, "cache");
  const sharedStatePath = join(rootDir, "state", "current.json");
  const model = "models/gemini-embedding-001";
  const indexVersion = "azure-shared-v1";

  try {
    const manifestRepos = [
      {
        path: "documentation/capture-vision-docs-js",
        commit: "3137b83d966e795190a9681e544045a5e526c083"
      }
    ];
    createManifest(rootDir, manifestRepos);

    const repoSignature = computeRepoSignature({
      repo: manifestRepos[0],
      embeddingModel: model,
      indexConfig: {
        chunkSize: 1200,
        chunkOverlap: 200,
        maxChunksPerDoc: 6,
        maxTextChars: 4000
      },
      indexVersion
    });

    const shardPath = `rag/cache/gemini-${repoSignature}.json`;
    const rootShardFile = join(rootDir, shardPath);
    const stateNestedShardFile = join(rootDir, "state", shardPath);
    mkdirSync(dirname(rootShardFile), { recursive: true });
    mkdirSync(dirname(stateNestedShardFile), { recursive: true });
    writeFileSync(rootShardFile, JSON.stringify({
      items: [{ id: "root-chunk", uri: "doc://root" }],
      vectors: [[0.1, 0.2, 0.3]]
    }));
    writeFileSync(stateNestedShardFile, JSON.stringify({
      items: [{ id: "state-chunk", uri: "doc://state" }],
      vectors: [[9, 9, 9]]
    }));

    const sharedState = createSharedState({
      indexVersion,
      repos: {
        "documentation/capture-vision-docs-js": {
          path: "documentation/capture-vision-docs-js",
          commit: manifestRepos[0].commit,
          signature: repoSignature,
          shardPath
        }
      }
    });
    mkdirSync(dirname(sharedStatePath), { recursive: true });
    writeFileSync(sharedStatePath, JSON.stringify(sharedState));

    const ragConfig = makeRagConfig({ rootDir, cacheDir, sharedStatePath });
    const vectorCache = makeHelpers(ragConfig);
    const cacheKey = "1234567890abcdef1234567890abcdef";
    const cacheFile = join(cacheDir, vectorCache.makeCacheFileName("gemini", model, cacheKey));

    const result = await vectorCache.maybeLoadSharedVectorIndex({
      provider: "gemini",
      model,
      cacheKey,
      signature: "runtime-signature",
      cacheFile
    });

    assert.equal(result.loaded, true);
    const loaded = vectorCache.loadVectorIndexCache(cacheFile, {
      cacheKey,
      provider: "gemini",
      model,
      signature: "runtime-signature"
    });
    assert.equal(loaded.hit, true);
    assert.equal(loaded.payload.items[0].id, "root-chunk");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
