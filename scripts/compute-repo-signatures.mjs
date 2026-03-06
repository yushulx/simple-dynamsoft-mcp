#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SHARED_STATE_SCHEMA_VERSION,
  computeRepoSignature,
  createSharedState,
  normalizeRepoKey,
  normalizeRepoPath
} from "../src/data/shared-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    manifest: "data/metadata/data-manifest.json",
    output: "",
    embeddingModel: "text-embedding-3-large",
    indexVersion: "azure-shared-v1",
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
      args.indexVersion = value;
      i++;
      continue;
    }
    if (arg === "--generated-at" && value) {
      args.generatedAt = value;
      i++;
      continue;
    }
    if (arg === "--schema-version" && value) {
      args.schemaVersion = Number.parseInt(value, 10);
      i++;
      continue;
    }
    if (arg === "--chunk-size" && value) {
      args.indexConfig.chunkSize = Number.parseInt(value, 10);
      i++;
      continue;
    }
    if (arg === "--chunk-overlap" && value) {
      args.indexConfig.chunkOverlap = Number.parseInt(value, 10);
      i++;
      continue;
    }
    if (arg === "--max-chunks-per-doc" && value) {
      args.indexConfig.maxChunksPerDoc = Number.parseInt(value, 10);
      i++;
      continue;
    }
    if (arg === "--max-text-chars" && value) {
      args.indexConfig.maxTextChars = Number.parseInt(value, 10);
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
  return `shared/indexes/${normalizeRepoPath(repoPath)}/${signature}.json`;
}

function buildReposState(manifestRepos, options) {
  const repos = {};

  for (const repo of manifestRepos) {
    const path = normalizeRepoPath(repo.path);
    const key = normalizeRepoKey(path);
    if (!key) continue;

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

main();
