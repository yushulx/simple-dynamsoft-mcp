#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SHARED_STATE_SCHEMA_VERSION,
  computeRepoSignature,
  createSharedState,
  loadSharedState,
  normalizeRepoKey,
  normalizeRepoPath
} from "../src/data/shared-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const DEFAULT_EMBEDDING_MODEL = "models/gemini-embedding-001";
const DEFAULT_INDEX_VERSION = "azure-shared-v1";
const DEFAULT_INDEX_CONFIG = {
  chunkSize: 1200,
  chunkOverlap: 200,
  maxChunksPerDoc: 6,
  maxTextChars: 4000
};

function parseIntegerOption(flag, rawValue, { min = 0 } = {}) {
  const text = String(rawValue ?? "").trim();
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`Invalid ${flag}: expected an integer, received '${rawValue}'`);
  }

  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`Invalid ${flag}: expected integer >= ${min}, received '${rawValue}'`);
  }

  return value;
}

function toAbsolutePath(pathValue) {
  if (!pathValue) return "";
  if (pathValue.startsWith("/")) return pathValue;
  return join(projectRoot, pathValue);
}

function parseArgs(argv, env = process.env) {
  const currentStatePath = env.DATA_SYNC_AZURE_CURRENT_STATE_PATH || ".tmp/azure-shared-state/state/current.json";
  const defaultIndexConfig = {
    chunkSize: env.DATA_SYNC_AZURE_CHUNK_SIZE
      ? parseIntegerOption("--chunk-size", env.DATA_SYNC_AZURE_CHUNK_SIZE, { min: 0 })
      : DEFAULT_INDEX_CONFIG.chunkSize,
    chunkOverlap: env.DATA_SYNC_AZURE_CHUNK_OVERLAP
      ? parseIntegerOption("--chunk-overlap", env.DATA_SYNC_AZURE_CHUNK_OVERLAP, { min: 0 })
      : DEFAULT_INDEX_CONFIG.chunkOverlap,
    maxChunksPerDoc: env.DATA_SYNC_AZURE_MAX_CHUNKS_PER_DOC
      ? parseIntegerOption("--max-chunks-per-doc", env.DATA_SYNC_AZURE_MAX_CHUNKS_PER_DOC, { min: 1 })
      : DEFAULT_INDEX_CONFIG.maxChunksPerDoc,
    maxTextChars: env.DATA_SYNC_AZURE_MAX_TEXT_CHARS
      ? parseIntegerOption("--max-text-chars", env.DATA_SYNC_AZURE_MAX_TEXT_CHARS, { min: 0 })
      : DEFAULT_INDEX_CONFIG.maxTextChars
  };
  const defaults = {
    manifestPath: env.DATA_SYNC_AZURE_MANIFEST_PATH || "data/metadata/data-manifest.json",
    currentStatePath,
    nextStatePath: env.DATA_SYNC_AZURE_NEXT_STATE_PATH || ".tmp/azure-shared-state/state/next-state.json",
    planOutputPath: env.DATA_SYNC_AZURE_PLAN_OUTPUT_PATH || ".tmp/azure-shared-state/state/plan.json",
    embeddingModel: env.DATA_SYNC_AZURE_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    indexVersion: env.DATA_SYNC_AZURE_INDEX_VERSION || DEFAULT_INDEX_VERSION,
    generatedAt: env.DATA_SYNC_AZURE_GENERATED_AT || new Date().toISOString(),
    schemaVersion: SHARED_STATE_SCHEMA_VERSION,
    indexConfig: defaultIndexConfig
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (arg === "--manifest" && value) {
      defaults.manifestPath = value;
      i++;
      continue;
    }
    if (arg === "--current-state" && value) {
      defaults.currentStatePath = value;
      i++;
      continue;
    }
    if (arg === "--next-state" && value) {
      defaults.nextStatePath = value;
      i++;
      continue;
    }
    if (arg === "--plan-output" && value) {
      defaults.planOutputPath = value;
      i++;
      continue;
    }
    if (arg === "--embedding-model" && value) {
      defaults.embeddingModel = value;
      i++;
      continue;
    }
    if (arg === "--index-version" && value) {
      defaults.indexVersion = value;
      i++;
      continue;
    }
    if (arg === "--generated-at" && value) {
      defaults.generatedAt = value;
      i++;
      continue;
    }
    if (arg === "--schema-version" && value) {
      defaults.schemaVersion = parseIntegerOption("--schema-version", value, { min: 1 });
      i++;
      continue;
    }
    if (arg === "--chunk-size" && value) {
      defaults.indexConfig.chunkSize = parseIntegerOption("--chunk-size", value, { min: 0 });
      i++;
      continue;
    }
    if (arg === "--chunk-overlap" && value) {
      defaults.indexConfig.chunkOverlap = parseIntegerOption("--chunk-overlap", value, { min: 0 });
      i++;
      continue;
    }
    if (arg === "--max-chunks-per-doc" && value) {
      defaults.indexConfig.maxChunksPerDoc = parseIntegerOption("--max-chunks-per-doc", value, { min: 1 });
      i++;
      continue;
    }
    if (arg === "--max-text-chars" && value) {
      defaults.indexConfig.maxTextChars = parseIntegerOption("--max-text-chars", value, { min: 0 });
      i++;
    }
  }

  return {
    ...defaults,
    manifestPath: toAbsolutePath(defaults.manifestPath),
    currentStatePath: toAbsolutePath(defaults.currentStatePath),
    nextStatePath: toAbsolutePath(defaults.nextStatePath),
    planOutputPath: toAbsolutePath(defaults.planOutputPath)
  };
}

function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest?.repos)) {
    throw new Error("Manifest must include a repos array");
  }

  return manifest;
}

function buildShardPath(repoPath, signature) {
  return `rag/cache/gemini-${signature}.json`;
}

function buildDesiredRepos(manifestRepos, options) {
  const repos = {};
  const sourcePathByKey = new Map();

  for (const repo of manifestRepos) {
    const path = normalizeRepoPath(repo.path);
    const key = normalizeRepoKey(path);
    if (!key) continue;

    const existingPath = sourcePathByKey.get(key);
    if (existingPath && existingPath !== path) {
      throw new Error(
        `Repo key collision for '${key}': '${existingPath}' and '${path}' normalize to the same key`
      );
    }

    const signature = computeRepoSignature({
      repo,
      embeddingModel: options.embeddingModel,
      indexConfig: options.indexConfig,
      indexVersion: options.indexVersion,
      schemaVersion: options.schemaVersion
    });

    repos[key] = {
      path,
      commit: String(repo.commit || "").trim(),
      signature,
      shardPath: buildShardPath(path, signature)
    };
    sourcePathByKey.set(key, path);
  }

  return repos;
}

function loadCurrentState(statePath, { generatedAt, indexVersion } = {}) {
  if (!existsSync(statePath)) {
    return createSharedState({
      generatedAt,
      indexVersion,
      repos: {}
    });
  }

  return loadSharedState(readFileSync(statePath, "utf8"));
}

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function computeRepoDiff({ currentRepos, desiredRepos }) {
  const changed = [];
  const added = [];
  const unchanged = [];
  const removed = [];

  const currentKeys = new Set(Object.keys(currentRepos || {}));
  const desiredKeys = new Set(Object.keys(desiredRepos || {}));

  for (const key of desiredKeys) {
    if (!currentKeys.has(key)) {
      added.push(key);
      continue;
    }

    const currentSignature = String(currentRepos[key]?.signature || "").trim();
    const desiredSignature = String(desiredRepos[key]?.signature || "").trim();
    if (currentSignature === desiredSignature) {
      unchanged.push(key);
    } else {
      changed.push(key);
    }
  }

  for (const key of currentKeys) {
    if (!desiredKeys.has(key)) {
      removed.push(key);
    }
  }

  return {
    changed: sortStrings(changed),
    added: sortStrings(added),
    unchanged: sortStrings(unchanged),
    removed: sortStrings(removed),
    hasChanges: changed.length + added.length + removed.length > 0
  };
}

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJsonFile(filePath, payload) {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function simulateAtomicPromotion({ currentStatePath, nextState }) {
  const promotionPath = `${currentStatePath}.next.json`;
  writeJsonFile(promotionPath, nextState);
  renameSync(promotionPath, currentStatePath);
  return {
    promotionPath,
    promotedPath: currentStatePath
  };
}

function buildPlan({ options, currentState, nextState, diff }) {
  return {
    kind: "azure_shared_state_sync_plan",
    generatedAt: options.generatedAt,
    manifestPath: options.manifestPath,
    currentStatePath: options.currentStatePath,
    nextStatePath: options.nextStatePath,
    embeddingModel: options.embeddingModel,
    indexVersion: options.indexVersion,
    schemaVersion: options.schemaVersion,
    summary: {
      currentRepos: Object.keys(currentState.repos).length,
      desiredRepos: Object.keys(nextState.repos).length,
      changed: diff.changed.length,
      added: diff.added.length,
      unchanged: diff.unchanged.length,
      removed: diff.removed.length,
      hasChanges: diff.hasChanges
    },
    repos: diff
  };
}

function logSummary(plan) {
  const summary = plan.summary;
  console.log(`[data-sync-azure] manifest=${plan.manifestPath}`);
  console.log(`[data-sync-azure] current_state=${plan.currentStatePath}`);
  console.log(`[data-sync-azure] next_state=${plan.nextStatePath}`);
  console.log(
    `[data-sync-azure] repos current=${summary.currentRepos} desired=${summary.desiredRepos} ` +
      `changed=${summary.changed} added=${summary.added} unchanged=${summary.unchanged} removed=${summary.removed}`
  );
  console.log(`[data-sync-azure] has_changes=${summary.hasChanges}`);
}

function runDataSyncAzure(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv, env);
  const manifest = readManifest(options.manifestPath);
  const currentState = loadCurrentState(options.currentStatePath, {
    generatedAt: options.generatedAt,
    indexVersion: options.indexVersion
  });
  const desiredRepos = buildDesiredRepos(manifest.repos, options);
  const nextState = createSharedState({
    generatedAt: options.generatedAt,
    indexVersion: options.indexVersion,
    schemaVersion: options.schemaVersion,
    repos: desiredRepos
  });

  const diff = computeRepoDiff({
    currentRepos: currentState.repos,
    desiredRepos: nextState.repos
  });

  const plan = buildPlan({
    options,
    currentState,
    nextState,
    diff
  });

  writeJsonFile(options.planOutputPath, plan);
  writeJsonFile(options.nextStatePath, nextState);
  const promotion = simulateAtomicPromotion({
    currentStatePath: options.currentStatePath,
    nextState
  });
  logSummary(plan);
  console.log(`[data-sync-azure] plan_json=${options.planOutputPath}`);
  console.log(`[data-sync-azure] promoted_state=${promotion.promotedPath}`);

  return {
    options,
    plan,
    nextState,
    promotion
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runDataSyncAzure();
}

export {
  buildDesiredRepos,
  computeRepoDiff,
  parseArgs,
  runDataSyncAzure
};
