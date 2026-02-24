#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function toPosixPath(path) {
  return path.replace(/\\/g, "/");
}

function fileHash(path) {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

function ensureEnvDefaults() {
  process.env.RAG_PROVIDER = process.env.RAG_PROVIDER || "local";
  process.env.RAG_FALLBACK = process.env.RAG_FALLBACK || "none";
  process.env.RAG_PREWARM = process.env.RAG_PREWARM || "true";
  process.env.RAG_PREWARM_BLOCK = process.env.RAG_PREWARM_BLOCK || "true";
  process.env.RAG_REBUILD = process.env.RAG_REBUILD || "true";
}

ensureEnvDefaults();

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const { prewarmRagIndex, ragConfig } = await import("../src/rag.js");

await prewarmRagIndex();

const cacheDir = resolve(ragConfig.cacheDir);
if (!existsSync(cacheDir)) {
  throw new Error(`RAG cache directory not found after prebuild: ${cacheDir}`);
}

const cacheFiles = readdirSync(cacheDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(cacheDir, entry.name))
  .filter((path) => path.toLowerCase().endsWith(".json"))
  .sort();

if (cacheFiles.length === 0) {
  throw new Error(`No cache JSON files found in ${cacheDir}.`);
}

const manifest = {
  packageVersion: pkg.version,
  generatedAt: new Date().toISOString(),
  ragProvider: ragConfig.provider,
  ragModel: ragConfig.localModel,
  cacheDir: toPosixPath(cacheDir),
  files: cacheFiles.map((path) => {
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
