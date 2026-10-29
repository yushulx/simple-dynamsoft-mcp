#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function toPosixPath(path) {
  return path.replace(/\\/g, "/");
}

function fileHash(path) {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

function ensureEnvDefaults() {
  process.env.RAG_PROVIDER = process.env.RAG_PROVIDER || "gemini";
  process.env.RAG_FALLBACK = process.env.RAG_FALLBACK || "none";
  process.env.RAG_PREWARM = process.env.RAG_PREWARM || "true";
  process.env.RAG_PREWARM_BLOCK = process.env.RAG_PREWARM_BLOCK || "true";
  // Incremental by default: unchanged chunks reuse vectors already in the
  // cache dir (e.g. a seeded previous release). RAG_REBUILD=true forces a full re-embed.
  process.env.RAG_REBUILD = process.env.RAG_REBUILD || "false";
}

ensureEnvDefaults();

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const { prewarmRagIndex, ragConfig } = await import("../src/rag/index.js");

await prewarmRagIndex();

const cacheDir = resolve(ragConfig.cacheDir);
if (!existsSync(cacheDir)) {
  throw new Error(`RAG cache directory not found after prebuild: ${cacheDir}`);
}

// Each cache is a JSON header plus a sibling `.f32` vector file (see
// src/rag/vector-cache.js); both ship in the release archive. A header with no
// `.f32` is a pre-7.7 all-JSON cache (e.g. restored from an older CI cache):
// the runtime cannot load it, so it is deleted rather than shipped.
const allHeaders = readdirSync(cacheDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(cacheDir, entry.name))
  .filter((path) => {
    const name = basename(path).toLowerCase();
    if (!name.endsWith(".json")) return false;
    if (!name.startsWith("rag-")) return false;
    if (name.endsWith(".checkpoint.json")) return false;
    return true;
  })
  .sort();

const toVectorFile = (path) => path.replace(/\.json$/i, ".f32");
const cacheFiles = [];
for (const path of allHeaders) {
  if (existsSync(toVectorFile(path))) {
    cacheFiles.push(path);
  } else {
    rmSync(path, { force: true });
    console.log(`[rag-prebuild] removed legacy cache without vectors: ${basename(path)}`);
  }
}

if (cacheFiles.length === 0) {
  throw new Error(`No cache files with vectors found in ${cacheDir}.`);
}

const vectorFiles = cacheFiles.map(toVectorFile);

let indexSignature = "";
let indexCacheKey = "";
let indexModel = "";
const providerCacheFile = cacheFiles.find((path) => basename(path).startsWith(`rag-${ragConfig.provider}-`));
if (providerCacheFile) {
  try {
    const parsed = JSON.parse(readFileSync(providerCacheFile, "utf8"));
    indexSignature = String(parsed?.meta?.signature || "");
    indexCacheKey = String(parsed?.cacheKey || "");
    indexModel = String(parsed?.meta?.model || "");
  } catch {
    // Keep manifest generation resilient; runtime still validates cache payloads directly.
  }
}

const manifest = {
  packageVersion: pkg.version,
  generatedAt: new Date().toISOString(),
  ragProvider: ragConfig.provider,
  ragModel: indexModel,
  indexSignature,
  indexCacheKey,
  cacheDir: toPosixPath(cacheDir),
  files: [...cacheFiles, ...vectorFiles].sort().map((path) => {
    const stats = statSync(path);
    return {
      name: toPosixPath(path.slice(cacheDir.length + 1)),
      size: stats.size,
      sha256: fileHash(path)
    };
  })
};

const outputPath = join(cacheDir, "prebuilt-rag-manifest.json");
mkdirSync(cacheDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`[rag-prebuild] version=${pkg.version}`);
console.log(`[rag-prebuild] cache_dir=${cacheDir}`);
console.log(`[rag-prebuild] files=${manifest.files.length}`);
