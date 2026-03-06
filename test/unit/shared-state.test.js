import test from "node:test";
import assert from "node:assert/strict";

import {
  SHARED_STATE_SCHEMA_VERSION,
  computeRepoSignature,
  createSharedState,
  loadSharedState,
  normalizeRepoKey,
  normalizeRepoPath,
  validateSharedState
} from "../../src/data/shared-state.js";

test("computeRepoSignature is deterministic for equivalent input", () => {
  const repo = {
    path: "documentation/capture-vision-docs-js",
    commit: "0f0c2b405ee16f5a19ee4af0a8c4f36e6a457f6c"
  };

  const signatureA = computeRepoSignature({
    repo,
    embeddingModel: "text-embedding-3-large",
    indexConfig: {
      chunkSize: 1800,
      chunkOverlap: 250,
      maxChunksPerDoc: 30,
      maxTextChars: 12000
    },
    indexVersion: "azure-shared-v1"
  });

  const signatureB = computeRepoSignature({
    repo,
    embeddingModel: "text-embedding-3-large",
    indexConfig: {
      chunkSize: 1800,
      chunkOverlap: 250,
      maxChunksPerDoc: 30,
      maxTextChars: 12000
    },
    indexVersion: "azure-shared-v1"
  });

  assert.equal(signatureA, signatureB);
});

test("computeRepoSignature changes when a tracked input changes", () => {
  const base = computeRepoSignature({
    repo: {
      path: "documentation/capture-vision-docs-js",
      commit: "0f0c2b405ee16f5a19ee4af0a8c4f36e6a457f6c"
    },
    embeddingModel: "text-embedding-3-large",
    indexConfig: {
      chunkSize: 1800,
      chunkOverlap: 250
    },
    indexVersion: "azure-shared-v1"
  });

  const changedConfig = computeRepoSignature({
    repo: {
      path: "documentation/capture-vision-docs-js",
      commit: "0f0c2b405ee16f5a19ee4af0a8c4f36e6a457f6c"
    },
    embeddingModel: "text-embedding-3-large",
    indexConfig: {
      chunkSize: 2048,
      chunkOverlap: 250
    },
    indexVersion: "azure-shared-v1"
  });

  assert.notEqual(base, changedConfig);
});

test("validateSharedState reports malformed state shape", () => {
  const malformed = {
    schemaVersion: SHARED_STATE_SCHEMA_VERSION,
    generatedAt: "2026-03-06T00:00:00.000Z",
    indexVersion: "azure-shared-v1",
    repos: {
      "documentation_capture-vision-docs-js": {
        path: "documentation/capture-vision-docs-js",
        commit: "0f0c2b405ee16f5a19ee4af0a8c4f36e6a457f6c",
        signature: "deadbeef"
      }
    }
  };

  const result = validateSharedState(malformed);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /shardPath/);
});

test("createSharedState and loadSharedState normalize repo keys and paths", () => {
  const state = createSharedState({
    generatedAt: "2026-03-06T00:00:00.000Z",
    indexVersion: "azure-shared-v1",
    repos: {
      " Documentation\\Capture-Vision-Docs-JS ": {
        path: "\\documentation\\capture-vision-docs-js\\",
        commit: "0f0c2b405ee16f5a19ee4af0a8c4f36e6a457f6c",
        signature: "abc123",
        shardPath: "rag/cache/gemini-abc123.json"
      }
    }
  });

  const expectedKey = normalizeRepoKey("documentation/capture-vision-docs-js");

  assert.equal(normalizeRepoPath("\\documentation\\capture-vision-docs-js\\"), "documentation/capture-vision-docs-js");
  assert.ok(state.repos[expectedKey]);

  const loaded = loadSharedState(JSON.stringify(state));
  assert.equal(loaded.repos[expectedKey].path, "documentation/capture-vision-docs-js");

  const absoluteShardState = createSharedState({
    generatedAt: "2026-03-06T00:00:00.000Z",
    indexVersion: "azure-shared-v1",
    repos: {
      "documentation/capture-vision-docs-js": {
        path: "documentation/capture-vision-docs-js",
        commit: "0f0c2b405ee16f5a19ee4af0a8c4f36e6a457f6c",
        signature: "abs123",
        shardPath: "/mnt/mcp-cache/rag/cache/gemini-abs123.json"
      }
    }
  });
  assert.equal(
    absoluteShardState.repos[expectedKey].shardPath,
    "/mnt/mcp-cache/rag/cache/gemini-abs123.json"
  );
});

test("createSharedState throws when different repos normalize to same key", () => {
  assert.throws(
    () => {
      createSharedState({
        generatedAt: "2026-03-06T00:00:00.000Z",
        indexVersion: "azure-shared-v1",
        repos: {
          "Documentation/Capture-Vision-Docs-JS": {
            path: "documentation/capture-vision-docs-js",
            commit: "1111111111111111111111111111111111111111",
            signature: "sig-a",
            shardPath: "rag/cache/gemini-sig-a.json"
          },
          "documentation_capture vision docs js": {
            path: "documentation/capture_vision_docs_js",
            commit: "2222222222222222222222222222222222222222",
            signature: "sig-b",
            shardPath: "rag/cache/gemini-sig-b.json"
          }
        }
      });
    },
    /Repo key collision/
  );
});
