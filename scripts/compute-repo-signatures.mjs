#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SHARED_STATE_SCHEMA_VERSION,
  computeRepoSignature,
  createSharedState,
  normalizeRepoKey,
  normalizeRepoPath
} from "../src/data/shared-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

function parseIntegerOption(flag, rawValue, { min = 0 } = {}) {
  const valueText = String(rawValue ?? "").trim();
  if (!/^-?\d+$/.test(valueText)) {
    throw new Error(`Invalid ${flag}: expected an integer, received '${rawValue}'`);
  }

  const value = Number.parseInt(valueText, 10);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid ${flag}: expected a safe integer, received '${rawValue}'`);
  }
  if (value < min) {
    throw new Error(`Invalid ${flag}: expected integer >= ${min}, received '${rawValue}'`);
  }

  return value;
}

function parseArgs(argv) {
  const args = {
    manifest: "data/metadata/data-manifest.json",
    output: "",
    embeddingModel: "text-embedding-3-large",
    indexVersion: 1,
    generatedAt: new Date().toISOString(),
    schemaVersion: SHARED_STATE_SCHEMA_VERSION,
    indexConfig: {}
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (arg === "--manifest" && value) {
      args.manifest = value;
      i++;
      continue;
    }
    if (arg === "--output" && value) {
      args.output = value;
      i++;
      continue;
    }
    if (arg === "--embedding-model" && value) {
      args.embeddingModel = value;
      i++;
      continue;
    }
    if (arg === "--index-version" && value) {
      args.indexVersion = parseIntegerOption("--index-version", value, { min: 1 });
      i++;
      continue;
    }
    if (arg === "--generated-at" && value) {
      args.generatedAt = value;
      i++;
      continue;
    }
    if (arg === "--schema-version" && value) {
      args.schemaVersion = parseIntegerOption("--schema-version", value, { min: 1 });
      i++;
      continue;
    }
    if (arg === "--chunk-size" && value) {
      args.indexConfig.chunkSize = parseIntegerOption("--chunk-size", value, { min: 0 });
      i++;
      continue;
    }
    if (arg === "--chunk-overlap" && value) {
      args.indexConfig.chunkOverlap = parseIntegerOption("--chunk-overlap", value, { min: 0 });
      i++;
      continue;
    }
    if (arg === "--max-chunks-per-doc" && value) {
      args.indexConfig.maxChunksPerDoc = parseIntegerOption("--max-chunks-per-doc", value, { min: 1 });
      i++;
      continue;
    }
    if (arg === "--max-text-chars" && value) {
      args.indexConfig.maxTextChars = parseIntegerOption("--max-text-chars", value, { min: 0 });
      i++;
    }
  }

  return args;
}

function toAbsolutePath(relativeOrAbsolutePath) {
  if (!relativeOrAbsolutePath) return "";
  if (relativeOrAbsolutePath.startsWith("/")) return relativeOrAbsolutePath;
  return join(projectRoot, relativeOrAbsolutePath);
}

function loadManifest(pathToManifest) {
  if (!existsSync(pathToManifest)) {
    throw new Error(`Manifest not found: ${pathToManifest}`);
  }
  const manifest = JSON.parse(readFileSync(pathToManifest, "utf8"));
  if (!Array.isArray(manifest?.repos)) {
    throw new Error("Manifest must include a repos array");
  }
  return manifest;
}

function buildShardPath(repoPath, signature) {
  return `rag/cache/gemini-${signature}.json`;
}

function buildReposState(manifestRepos, options) {
  const repos = {};
  const sourceByKey = new Map();

  for (const repo of manifestRepos) {
    const path = normalizeRepoPath(repo.path);
    const key = normalizeRepoKey(path);
    if (!key) continue;

    const existingPath = sourceByKey.get(key);
    if (existingPath && existingPath !== path) {
      throw new Error(
        `Repo key collision for '${key}': '${existingPath}' and '${path}' normalize to the same key`
      );
    }
    sourceByKey.set(key, path);

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
  }

  return repos;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = toAbsolutePath(options.manifest);
  const outputPath = toAbsolutePath(options.output);
  const manifest = loadManifest(manifestPath);

  const state = createSharedState({
    schemaVersion: options.schemaVersion,
    generatedAt: options.generatedAt,
    indexVersion: options.indexVersion,
    repos: buildReposState(manifest.repos, options)
  });

  const output = `${JSON.stringify(state, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(outputPath, output);
    console.log(`Wrote shared state to ${outputPath}`);
    return;
  }

  process.stdout.write(output);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}

export { buildReposState, parseArgs, parseIntegerOption };
