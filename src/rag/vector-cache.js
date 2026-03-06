import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  computeRepoSignature,
  loadSharedState,
  normalizeRepoKey,
  normalizeRepoPath
} from "../data/shared-state.js";

function ensureDirectory(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function makeCacheFileName(provider, model, cacheKey) {
  const safeModel = String(model || "default").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 32);
  return `rag-${provider}-${safeModel}-${cacheKey.slice(0, 12)}.json`;
}

function makeCheckpointFileName(provider, model, cacheKey) {
  const safeModel = String(model || "default").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 32);
  return `rag-${provider}-${safeModel}-${cacheKey.slice(0, 12)}.checkpoint.json`;
}

function loadVectorIndexCache(
  cacheFile,
  { cacheKey, signature, provider, model, requireSignature = false } = {}
) {
  if (!existsSync(cacheFile)) {
    return { hit: false, reason: "missing", payload: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (!parsed || (cacheKey && parsed.cacheKey !== cacheKey)) {
      return { hit: false, reason: "cache_key_mismatch", payload: null };
    }
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.vectors)) {
      return { hit: false, reason: "invalid_payload", payload: null };
    }
    const meta = parsed.meta || {};
    if (provider && meta.provider && meta.provider !== provider) {
      return { hit: false, reason: "provider_mismatch", payload: null };
    }
    if (model && meta.model && meta.model !== model) {
      return { hit: false, reason: "model_mismatch", payload: null };
    }
    if (signature) {
      if (!meta.signature) {
        if (requireSignature) {
          return { hit: false, reason: "missing_signature", payload: null };
        }
      } else if (meta.signature !== signature) {
        return { hit: false, reason: "signature_mismatch", payload: null };
      }
    }
    return { hit: true, reason: "ok", payload: parsed };
  } catch {
    return { hit: false, reason: "parse_error", payload: null };
  }
}

function saveVectorIndexCache(cacheDir, cacheFile, payload) {
  ensureDirectory(cacheDir);
  writeFileSync(cacheFile, JSON.stringify(payload));
}

function loadVectorIndexCheckpoint(checkpointFile, expectedKey, expectedItems) {
  if (!existsSync(checkpointFile)) {
    return { hit: false, reason: "missing", payload: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(checkpointFile, "utf8"));
    if (!parsed || parsed.cacheKey !== expectedKey) {
      return { hit: false, reason: "cache_key_mismatch", payload: null };
    }
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.vectors)) {
      return { hit: false, reason: "invalid_payload", payload: null };
    }
    if (parsed.items.length !== expectedItems.length) {
      return { hit: false, reason: "items_length_mismatch", payload: null };
    }
    for (let i = 0; i < expectedItems.length; i += 1) {
      if (parsed.items[i]?.id !== expectedItems[i]?.id || parsed.items[i]?.uri !== expectedItems[i]?.uri) {
        return { hit: false, reason: "items_mismatch", payload: null };
      }
    }
    if (parsed.vectors.length > expectedItems.length) {
      return { hit: false, reason: "vectors_overflow", payload: null };
    }
    return { hit: true, reason: "ok", payload: parsed };
  } catch {
    return { hit: false, reason: "parse_error", payload: null };
  }
}

function saveVectorIndexCheckpoint(cacheDir, checkpointFile, payload) {
  ensureDirectory(cacheDir);
  writeFileSync(checkpointFile, JSON.stringify(payload));
}

function clearVectorIndexCheckpoint(checkpointFile) {
  if (existsSync(checkpointFile)) {
    rmSync(checkpointFile, { force: true });
  }
}

function readManifestRepos(dataRoot) {
  if (!dataRoot) return [];
  const manifestPath = join(dataRoot, "metadata", "data-manifest.json");
  if (!existsSync(manifestPath)) return [];

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!Array.isArray(parsed?.repos)) return [];
    return parsed.repos
      .map((repo) => ({
        path: normalizeRepoPath(repo?.path),
        commit: String(repo?.commit || "").trim()
      }))
      .filter((repo) => repo.path && repo.commit);
  } catch {
    return [];
  }
}

function resolveSharedShardFile(sharedStatePath, shardPath) {
  const normalizedShardPath = normalizeRepoPath(shardPath);
  if (!normalizedShardPath) {
    throw new Error("shared shard path is empty");
  }
  if (isAbsolute(normalizedShardPath)) {
    return normalizedShardPath;
  }

  const stateDir = dirname(sharedStatePath);
  const stateRoot = resolve(stateDir, "..");
  const workspaceRoot = dirname(stateRoot);
  const candidates = [
    resolve(stateRoot, normalizedShardPath),
    resolve(stateDir, normalizedShardPath),
    resolve(workspaceRoot, normalizedShardPath),
    resolve(process.cwd(), normalizedShardPath)
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function parseSharedShardPayload(shardPath, raw) {
  const parsed = JSON.parse(raw);
  const candidate = parsed?.items && parsed?.vectors ? parsed : parsed?.payload;

  if (!candidate || !Array.isArray(candidate.items) || !Array.isArray(candidate.vectors)) {
    throw new Error(`shared shard ${shardPath} payload is missing items/vectors arrays`);
  }
  if (candidate.items.length !== candidate.vectors.length) {
    throw new Error(
      `shared shard ${shardPath} has mismatched items/vectors lengths (${candidate.items.length}/${candidate.vectors.length})`
    );
  }

  return {
    items: candidate.items,
    vectors: candidate.vectors
  };
}

function buildSharedIndexConfig(ragConfig) {
  return {
    chunkSize: ragConfig.chunkSize,
    chunkOverlap: ragConfig.chunkOverlap,
    maxChunksPerDoc: ragConfig.maxChunksPerDoc,
    maxTextChars: ragConfig.maxTextChars
  };
}

function createVectorCacheHelpers({ ragConfig, logRag }) {
  async function maybeLoadSharedVectorIndex({ provider, model, cacheKey, signature, cacheFile }) {
    if (provider !== "gemini") {
      return { loaded: false, reason: "provider_not_supported" };
    }

    const sharedStatePath = String(ragConfig.sharedStatePath || "").trim();
    if (!sharedStatePath) {
      return { loaded: false, reason: "shared_state_not_configured" };
    }

    if (!existsSync(sharedStatePath)) {
      return { loaded: false, reason: "shared_state_unreadable" };
    }

    let sharedState;
    try {
      sharedState = loadSharedState(readFileSync(sharedStatePath, "utf8"));
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      return {
        loaded: false,
        fatal: true,
        reason: "shared_state_invalid",
        error: normalizedError
      };
    }

    const manifestRepos = readManifestRepos(ragConfig.dataRoot);
    if (manifestRepos.length === 0) {
      return { loaded: false, reason: "manifest_missing_or_empty" };
    }

    const repoIndexConfig = buildSharedIndexConfig(ragConfig);
    const matchedShards = [];
    for (const repo of manifestRepos) {
      const repoKey = normalizeRepoKey(repo.path);
      const sharedRepo = sharedState.repos[repoKey];
      if (!sharedRepo) continue;

      const expectedSignature = computeRepoSignature({
        repo,
        embeddingModel: model,
        indexConfig: repoIndexConfig,
        indexVersion: sharedState.indexVersion
      });

      if (sharedRepo.signature !== expectedSignature) continue;
      matchedShards.push({
        repoPath: repo.path,
        shardPath: sharedRepo.shardPath,
        signature: expectedSignature
      });
    }

    if (matchedShards.length === 0) {
      return { loaded: false, reason: "no_matching_shared_shards" };
    }

    const combinedItems = [];
    const combinedVectors = [];

    try {
      for (const shard of matchedShards) {
        const shardFile = resolveSharedShardFile(sharedStatePath, shard.shardPath);
        if (!existsSync(shardFile)) {
          throw new Error(`shared shard missing repo=${shard.repoPath} path=${shard.shardPath}`);
        }
        const parsed = parseSharedShardPayload(shard.shardPath, readFileSync(shardFile, "utf8"));
        combinedItems.push(...parsed.items);
        combinedVectors.push(...parsed.vectors);
      }
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      return {
        loaded: false,
        fatal: true,
        reason: "shared_shard_error",
        error: normalizedError
      };
    }

    const payload = {
      cacheKey,
      meta: {
        provider,
        model,
        signature,
        source: "shared_state",
        sharedStatePath,
        sharedStateIndexVersion: sharedState.indexVersion,
        sharedShardCount: matchedShards.length
      },
      items: combinedItems,
      vectors: combinedVectors
    };
    saveVectorIndexCache(ragConfig.cacheDir, cacheFile, payload);
    logRag(
      `shared shard index loaded provider=${provider} shards=${matchedShards.length} items=${combinedItems.length} vectors=${combinedVectors.length}`
    );
    return {
      loaded: true,
      reason: "loaded_shared_shards",
      shardCount: matchedShards.length,
      itemCount: combinedItems.length
    };
  }

  return {
    makeCacheFileName,
    makeCheckpointFileName,
    loadVectorIndexCache,
    saveVectorIndexCache: (cacheFile, payload) => saveVectorIndexCache(ragConfig.cacheDir, cacheFile, payload),
    loadVectorIndexCheckpoint,
    saveVectorIndexCheckpoint: (checkpointFile, payload) => saveVectorIndexCheckpoint(ragConfig.cacheDir, checkpointFile, payload),
    clearVectorIndexCheckpoint,
    maybeLoadSharedVectorIndex,
    maybeDownloadPrebuiltVectorIndex: async () => ({
      downloaded: false,
      reason: "runtime_prebuilt_download_disabled"
    })
  };
}

export {
  createVectorCacheHelpers
};
