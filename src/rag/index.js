import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import "dotenv/config";
import Fuse from "fuse.js";
import * as tar from "tar";
import { getResolvedDataRoot } from "../data/root.js";
import {
  resourceIndex,
  resourceIndexByUri,
  getSampleEntries,
  editionMatches,
  platformMatches,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  getRagSignatureData
} from "../server/resource-index.js";
import {
  sleepMs,
  parseRetryAfterMs,
  normalizeGeminiRetryConfig,
  isRateLimitGeminiStatus,
  GeminiHttpError,
  executeWithGeminiRetry
} from "./gemini-retry.js";
import { resolveProfileConfig } from "./profile-config.js";
import { createLexicalProvider } from "./lexical-provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataRoot = getResolvedDataRoot();

const pkgUrl = new URL("../../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));
const legacyPrebuiltIndexUrl =
  `https://github.com/yushulx/simple-dynamsoft-mcp/releases/download/v${pkg.version}/prebuilt-rag-index-${pkg.version}.tar.gz`;
const defaultPrebuiltIndexUrls = {
  local:
    `https://github.com/yushulx/simple-dynamsoft-mcp/releases/download/v${pkg.version}/prebuilt-rag-index-local-${pkg.version}.tar.gz`,
  gemini:
    `https://github.com/yushulx/simple-dynamsoft-mcp/releases/download/v${pkg.version}/prebuilt-rag-index-gemini-${pkg.version}.tar.gz`
};

// ============================================================================
// RAG configuration
// ============================================================================

function readEnvValue(key, fallback) {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  return value;
}

function readBoolEnv(key, fallback) {
  const value = readEnvValue(key, "");
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function readIntEnv(key, fallback) {
  const raw = readEnvValue(key, "");
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? fallback : value;
}

function readFloatEnv(key, fallback) {
  const raw = readEnvValue(key, "");
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isNaN(value) ? fallback : value;
}

function normalizeGeminiModel(model) {
  if (!model) return "models/embedding-001";
  if (model.startsWith("models/")) return model;
  return `models/${model}`;
}

const profileConfig = resolveProfileConfig(process.env);

const ragConfig = {
  profile: profileConfig.profile,
  profileDefaults: profileConfig.defaults,
  providerSource: profileConfig.providerSource,
  fallbackSource: profileConfig.fallbackSource,
  provider: profileConfig.provider,
  fallback: profileConfig.fallback,
  cacheDir: readEnvValue("RAG_CACHE_DIR", join(dataRoot, ".rag-cache")),
  modelCacheDir: readEnvValue("RAG_MODEL_CACHE_DIR", join(dataRoot, ".rag-cache", "models")),
  localModel: readEnvValue("RAG_LOCAL_MODEL", "Xenova/all-MiniLM-L6-v2"),
  localQuantized: readBoolEnv("RAG_LOCAL_QUANTIZED", true),
  chunkSize: readIntEnv("RAG_CHUNK_SIZE", 1200),
  chunkOverlap: readIntEnv("RAG_CHUNK_OVERLAP", 200),
  maxChunksPerDoc: readIntEnv("RAG_MAX_CHUNKS_PER_DOC", 6),
  maxTextChars: readIntEnv("RAG_MAX_TEXT_CHARS", 4000),
  minScore: readFloatEnv("RAG_MIN_SCORE", 0.2),
  includeScore: readBoolEnv("RAG_INCLUDE_SCORE", false),
  rebuild: readBoolEnv("RAG_REBUILD", false),
  prewarm: readBoolEnv("RAG_PREWARM", false),
  prewarmBlock: readBoolEnv("RAG_PREWARM_BLOCK", false),
  prebuiltIndexAutoDownload: readBoolEnv("RAG_PREBUILT_INDEX_AUTO_DOWNLOAD", true),
  prebuiltIndexUrl: readEnvValue("RAG_PREBUILT_INDEX_URL", ""),
  prebuiltIndexUrlLocal: readEnvValue("RAG_PREBUILT_INDEX_URL_LOCAL", defaultPrebuiltIndexUrls.local),
  prebuiltIndexUrlGemini: readEnvValue("RAG_PREBUILT_INDEX_URL_GEMINI", defaultPrebuiltIndexUrls.gemini),
  prebuiltIndexTimeoutMs: readIntEnv("RAG_PREBUILT_INDEX_TIMEOUT_MS", 180000),
  geminiApiKey: readEnvValue("GEMINI_API_KEY", ""),
  geminiModel: normalizeGeminiModel(readEnvValue("GEMINI_EMBED_MODEL", "models/gemini-embedding-001")),
  geminiBaseUrl: readEnvValue("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com"),
  geminiBatchSize: readIntEnv("GEMINI_EMBED_BATCH_SIZE", 16),
  geminiRetryMaxAttempts: readIntEnv("GEMINI_RETRY_MAX_ATTEMPTS", 5),
  geminiRetryBaseDelayMs: readIntEnv("GEMINI_RETRY_BASE_DELAY_MS", 500),
  geminiRetryMaxDelayMs: readIntEnv("GEMINI_RETRY_MAX_DELAY_MS", 10000),
  geminiRequestThrottleMs: readIntEnv("GEMINI_REQUEST_THROTTLE_MS", 0)
};

const ragLogState = {
  config: false,
  providerChain: false,
  localEmbedderInit: false,
  providerReady: new Set(),
  providerFirstUse: new Set(),
  fallbackUse: new Set()
};

const prebuiltDownloadAttempts = new Map();

function logRag(message) {
  console.error(`[rag] ${message}`);
}

// ============================================================================
// RAG search implementation
// ============================================================================

const fuseSearch = new Fuse(resourceIndex, {
  keys: ["title", "summary", "tags", "uri"],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true
});

function attachScore(entry, score) {
  if (!ragConfig.includeScore || !Number.isFinite(score)) return entry;
  return { ...entry, score };
}

function normalizeSearchFilters({ product, edition, platform, type }) {
  const normalizedProduct = normalizeProduct(product);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
  return {
    product: normalizedProduct,
    edition: normalizedEdition,
    platform: normalizedPlatform,
    type: type || "any"
  };
}

function entryMatchesScope(entry, filters) {
  if (filters.product && entry.product !== filters.product) return false;
  if (filters.edition && !editionMatches(filters.edition, entry.edition)) return false;
  if (filters.platform && !platformMatches(filters.platform, entry)) return false;
  if (filters.type && filters.type !== "any" && entry.type !== filters.type) return false;
  return true;
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function truncateText(text, maxChars) {
  if (!maxChars || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars));
}

function chunkText(text, chunkSize, chunkOverlap, maxChunks) {
  const cleaned = normalizeText(text);
  if (!cleaned) return [];
  if (!chunkSize || chunkSize <= 0) return [cleaned];
  const overlap = Math.min(Math.max(0, chunkOverlap), Math.max(0, chunkSize - 1));
  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= cleaned.length) break;
    start = Math.max(0, end - overlap);
    if (maxChunks && chunks.length >= maxChunks) break;
  }
  return chunks;
}

function buildEntryBaseText(entry) {
  const parts = [entry.title, entry.summary];
  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    parts.push(entry.tags.join(", "));
  }
  return normalizeText(parts.filter(Boolean).join("\n"));
}

function buildEmbeddingItems() {
  const items = [];
  for (const entry of resourceIndex) {
    const baseText = buildEntryBaseText(entry);
    if (!baseText) continue;
    if (entry.type === "doc" && entry.embedText) {
      const chunks = chunkText(entry.embedText, ragConfig.chunkSize, ragConfig.chunkOverlap, ragConfig.maxChunksPerDoc);
      if (chunks.length === 0) {
        items.push({
          id: entry.id,
          uri: entry.uri,
          text: truncateText(baseText, ragConfig.maxTextChars)
        });
        continue;
      }
      chunks.forEach((chunk, index) => {
        const combined = [baseText, chunk].filter(Boolean).join("\n\n");
        items.push({
          id: `${entry.id}#${index}`,
          uri: entry.uri,
          text: truncateText(combined, ragConfig.maxTextChars)
        });
      });
      continue;
    }
    items.push({
      id: entry.id,
      uri: entry.uri,
      text: truncateText(baseText, ragConfig.maxTextChars)
    });
  }
  return items;
}

function buildIndexSignature() {
  const signatureData = getRagSignatureData();
  return JSON.stringify({
    packageVersion: pkg.version,
    resourceCount: signatureData.resourceCount,
    dcvCoreDocCount: signatureData.dcvCoreDocCount,
    dcvWebDocCount: signatureData.dcvWebDocCount,
    dcvMobileDocCount: signatureData.dcvMobileDocCount,
    dcvServerDocCount: signatureData.dcvServerDocCount,
    dbrWebDocCount: signatureData.dbrWebDocCount,
    dbrMobileDocCount: signatureData.dbrMobileDocCount,
    dbrServerDocCount: signatureData.dbrServerDocCount,
    dwtDocCount: signatureData.dwtDocCount,
    ddvDocCount: signatureData.ddvDocCount,
    versions: signatureData.versions,
    dataSources: signatureData.dataSources,
    chunkSize: ragConfig.chunkSize,
    chunkOverlap: ragConfig.chunkOverlap,
    maxChunksPerDoc: ragConfig.maxChunksPerDoc,
    maxTextChars: ragConfig.maxTextChars
  });
}

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

function listFilesRecursive(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function readSignaturePackageVersion(signatureRaw) {
  if (!signatureRaw) return "";
  try {
    const parsed = JSON.parse(signatureRaw);
    return String(parsed?.packageVersion || "");
  } catch {
    return "";
  }
}

function listDownloadedCacheCandidatesByProvider(extractRoot, expectedCacheFileName, cacheKey, provider) {
  const allFiles = listFilesRecursive(extractRoot).filter((path) => path.toLowerCase().endsWith(".json")).sort();
  const expectedPath = allFiles.find((path) => basename(path) === expectedCacheFileName);

  const cachePrefix = cacheKey.slice(0, 12);
  const prefixPath = allFiles.find((path) => {
    const name = basename(path);
    return name.startsWith(`rag-${provider}-`) && name.endsWith(`-${cachePrefix}.json`);
  });

  const providerFiles = allFiles.filter((path) => basename(path).startsWith(`rag-${provider}-`));
  const unique = [];
  for (const path of [expectedPath, prefixPath, ...providerFiles]) {
    if (!path) continue;
    if (!unique.includes(path)) unique.push(path);
  }
  return unique;
}

function resolvePrebuiltIndexUrlCandidates(provider) {
  const override = String(ragConfig.prebuiltIndexUrl || "").trim();
  if (override) return [override];

  const candidates = [];
  if (provider === "local") {
    candidates.push(String(ragConfig.prebuiltIndexUrlLocal || "").trim());
  } else if (provider === "gemini") {
    candidates.push(String(ragConfig.prebuiltIndexUrlGemini || "").trim());
  }
  candidates.push(legacyPrebuiltIndexUrl);

  const deduped = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!deduped.includes(candidate)) deduped.push(candidate);
  }
  return deduped;
}

async function downloadPrebuiltArchive(url, outputPath, timeoutMs) {
  const source = String(url || "").trim();
  if (!source) {
    throw new Error("prebuilt URL is empty");
  }

  if (source.startsWith("file://")) {
    copyFileSync(fileURLToPath(source), outputPath);
    return { sourceType: "file", size: statSync(outputPath).size };
  }

  if (!/^https?:\/\//i.test(source)) {
    copyFileSync(resolve(source), outputPath);
    return { sourceType: "file", size: statSync(outputPath).size };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    writeFileSync(outputPath, Buffer.from(arrayBuffer));
    return { sourceType: "http", size: arrayBuffer.byteLength };
  } finally {
    clearTimeout(timer);
  }
}

async function maybeDownloadPrebuiltVectorIndex({ provider, model, cacheKey, signature, cacheFile }) {
  if (!["local", "gemini"].includes(provider)) {
    return { downloaded: false, reason: "provider_not_supported" };
  }
  if (!ragConfig.prebuiltIndexAutoDownload) {
    return { downloaded: false, reason: "auto_download_disabled" };
  }

  const sourceUrls = resolvePrebuiltIndexUrlCandidates(provider);
  if (sourceUrls.length === 0) {
    return { downloaded: false, reason: "url_not_set" };
  }

  const attemptKey = `${provider}:${cacheKey}:${sourceUrls.join("|")}`;
  if (prebuiltDownloadAttempts.has(attemptKey)) {
    return prebuiltDownloadAttempts.get(attemptKey);
  }

  const expectedCacheFileName = makeCacheFileName(provider, model, cacheKey);
  const attempt = (async () => {
    let lastReason = "not_attempted";
    for (const sourceUrl of sourceUrls) {
      const tempRoot = join(
        tmpdir(),
        `simple-dynamsoft-mcp-rag-prebuilt-${Date.now()}-${Math.random().toString(16).slice(2)}`
      );
      const archivePath = join(tempRoot, "prebuilt-rag-index.tar.gz");
      const extractRoot = join(tempRoot, "extract");

      ensureDirectory(extractRoot);
      try {
        logRag(
          `prebuilt index download start provider=${provider} url=${sourceUrl} timeout_ms=${ragConfig.prebuiltIndexTimeoutMs}`
        );
        const downloaded = await downloadPrebuiltArchive(sourceUrl, archivePath, ragConfig.prebuiltIndexTimeoutMs);
        logRag(
          `prebuilt index downloaded provider=${provider} source=${downloaded.sourceType} size=${downloaded.size}B url=${sourceUrl}`
        );

        await tar.x({
          file: archivePath,
          cwd: extractRoot,
          strict: true
        });

        const candidateFiles = listDownloadedCacheCandidatesByProvider(
          extractRoot,
          expectedCacheFileName,
          cacheKey,
          provider
        );
        if (candidateFiles.length === 0) {
          throw new Error(`cache_file_not_found expected=${expectedCacheFileName}`);
        }

        for (const sourceCacheFile of candidateFiles) {
          const candidateCache = loadVectorIndexCache(sourceCacheFile, {
            provider,
            model
          });
          if (!candidateCache.hit) {
            continue;
          }

          const cachePackageVersion = readSignaturePackageVersion(candidateCache.payload?.meta?.signature);
          if (!cachePackageVersion || cachePackageVersion !== pkg.version) {
            continue;
          }

          const migratedPayload = {
            ...candidateCache.payload,
            cacheKey,
            meta: {
              ...(candidateCache.payload.meta || {}),
              provider,
              model,
              signature
            }
          };
          saveVectorIndexCache(cacheFile, migratedPayload);
          logRag(
            `prebuilt index installed provider=${provider} cache_file=${cacheFile} source=${basename(sourceCacheFile)} mode=version_only_compat version=${cachePackageVersion}`
          );
          return { downloaded: true, reason: "installed_version_only_compat" };
        }

        throw new Error(
          `no_compatible_cache expected=${expectedCacheFileName} found=${candidateFiles.map((path) => basename(path)).join(",")}`
        );
      } catch (error) {
        lastReason = `${sourceUrl} => ${error.message}`;
        logRag(`prebuilt index unavailable provider=${provider} url=${sourceUrl} reason=${error.message}`);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }
    return { downloaded: false, reason: lastReason };
  })();

  prebuiltDownloadAttempts.set(attemptKey, attempt);
  return attempt;
}

function saveVectorIndexCache(cacheFile, payload) {
  ensureDirectory(ragConfig.cacheDir);
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

function saveVectorIndexCheckpoint(checkpointFile, payload) {
  ensureDirectory(ragConfig.cacheDir);
  writeFileSync(checkpointFile, JSON.stringify(payload));
}

function clearVectorIndexCheckpoint(checkpointFile) {
  if (existsSync(checkpointFile)) {
    rmSync(checkpointFile, { force: true });
  }
}

function normalizeVector(vector) {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  const norm = Math.sqrt(sum);
  if (!norm) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

function dotProduct(a, b) {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function isRateLimitError(error) {
  if (error?.rateLimited) return true;
  const status = Number(error?.status);
  return isRateLimitGeminiStatus(status);
}

async function embedTextsWithProgress(
  texts,
  embedder,
  batchSize = 1,
  {
    offset = 0,
    total = texts.length,
    onChunk = null,
    providerName = ""
  } = {}
) {
  const results = [];
  const normalizedBatchSize = Math.max(1, batchSize);
  let completed = offset;
  let currentBatchSize = normalizedBatchSize;
  let rateLimitFailures = 0;
  let batchDowngrades = 0;
  let singleFallbackBatches = 0;

  const reportChunk = async (vectors, mode, sourceBatchSize) => {
    if (!Array.isArray(vectors) || vectors.length === 0) return;
    completed += vectors.length;
    if (onChunk) {
      await onChunk({
        vectors,
        mode,
        sourceBatchSize,
        completed,
        total
      });
    }
  };

  if (embedder.embedBatch && normalizedBatchSize > 1) {
    let index = 0;
    while (index < texts.length) {
      const batch = texts.slice(index, index + currentBatchSize);
      try {
        const vectors = await embedder.embedBatch(batch);
        if (!Array.isArray(vectors) || vectors.length !== batch.length) {
          throw new Error(`Gemini batch response size mismatch expected=${batch.length} actual=${vectors?.length || 0}`);
        }
        results.push(...vectors);
        index += batch.length;
        rateLimitFailures = 0;
        await reportChunk(vectors, "batch", batch.length);
      } catch (error) {
        if (isRateLimitError(error)) {
          rateLimitFailures += 1;
          const nextBatchSize = Math.max(1, Math.floor(currentBatchSize / 2));
          if (nextBatchSize < currentBatchSize) {
            batchDowngrades += 1;
            logRag(
              `gemini batch downgrade provider=${providerName || "unknown"} from=${currentBatchSize} to=${nextBatchSize} ` +
              `rate_limit_failures=${rateLimitFailures}`
            );
            currentBatchSize = nextBatchSize;
            continue;
          }
        }

        singleFallbackBatches += 1;
        logRag(
          `batch embedding fallback provider=${providerName || "unknown"} batch_size=${batch.length} reason=${error.message}`
        );
        for (const text of batch) {
          const vector = await embedder.embed(text);
          results.push(vector);
          await reportChunk([vector], "single_fallback", 1);
        }
        index += batch.length;
        rateLimitFailures = 0;
      }
    }

    return {
      vectors: results,
      stats: {
        batchDowngrades,
        singleFallbackBatches,
        finalBatchSize: currentBatchSize
      }
    };
  }

  for (const text of texts) {
    const vector = await embedder.embed(text);
    results.push(vector);
    await reportChunk([vector], "single", 1);
  }

  return {
    vectors: results,
    stats: {
      batchDowngrades,
      singleFallbackBatches,
      finalBatchSize: 1
    }
  };
}

let localEmbedderPromise = null;
async function getLocalEmbedder() {
  if (localEmbedderPromise) return localEmbedderPromise;
  localEmbedderPromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    ensureDirectory(ragConfig.modelCacheDir);
    if (!ragLogState.localEmbedderInit) {
      ragLogState.localEmbedderInit = true;
      logRag(
        `init local embedder model=${ragConfig.localModel} quantized=${ragConfig.localQuantized} model_cache_dir=${ragConfig.modelCacheDir}`
      );
    }
    env.cacheDir = ragConfig.modelCacheDir;
    env.allowLocalModels = true;
    const extractor = await pipeline("feature-extraction", ragConfig.localModel, {
      quantized: ragConfig.localQuantized
    });
    return {
      embed: async (text) => {
        const output = await extractor(text, { pooling: "mean", normalize: true });
        return Array.from(output.data);
      }
    };
  })();
  return localEmbedderPromise;
}

let geminiEmbedderPromise = null;
async function getGeminiEmbedder() {
  if (!ragConfig.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is required for gemini embeddings.");
  }
  if (geminiEmbedderPromise) return geminiEmbedderPromise;
  const retryConfig = normalizeGeminiRetryConfig({
    maxAttempts: ragConfig.geminiRetryMaxAttempts,
    baseDelayMs: ragConfig.geminiRetryBaseDelayMs,
    maxDelayMs: ragConfig.geminiRetryMaxDelayMs,
    requestThrottleMs: ragConfig.geminiRequestThrottleMs
  });

  geminiEmbedderPromise = Promise.resolve((() => {
    const metrics = {
      requests: 0,
      retries: 0,
      retryDelayMs: 0,
      throttleEvents: 0,
      throttleDelayMs: 0,
      rateLimitRetries: 0
    };

    let nextAllowedAt = 0;

    const throttleRequest = async (operation) => {
      if (retryConfig.requestThrottleMs <= 0) return;
      const now = Date.now();
      const waitMs = Math.max(0, nextAllowedAt - now);
      if (waitMs > 0) {
        metrics.throttleEvents += 1;
        metrics.throttleDelayMs += waitMs;
        logRag(`gemini throttle op=${operation} wait_ms=${waitMs}`);
        await sleepMs(waitMs);
      }
      nextAllowedAt = Date.now() + retryConfig.requestThrottleMs;
    };

    const requestJson = async (operation, endpoint, body) => executeWithGeminiRetry({
      operation,
      retryConfig,
      logger: (message) => logRag(message),
      onRetry: ({ delayMs, rateLimited }) => {
        metrics.retries += 1;
        metrics.retryDelayMs += delayMs;
        if (rateLimited) {
          metrics.rateLimitRetries += 1;
        }
      },
      requestFn: async () => {
        await throttleRequest(operation);
        metrics.requests += 1;
        const response = await fetch(
          `${ragConfig.geminiBaseUrl}/v1beta/${endpoint}?key=${ragConfig.geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }
        );
        if (!response.ok) {
          const detail = await response.text();
          throw new GeminiHttpError(`Gemini ${operation} failed (${response.status}): ${detail}`, {
            status: response.status,
            detail,
            retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after"))
          });
        }
        return response.json();
      }
    });

    return {
      embed: async (text) => {
        const payload = await requestJson(
          "embedContent",
          `${ragConfig.geminiModel}:embedContent`,
          {
            content: {
              parts: [{ text }]
            }
          }
        );
        const embedding = payload.embedding?.values || payload.embedding || payload.embeddings?.[0]?.values;
        if (!embedding) {
          throw new Error("Gemini embedding response missing embedding values.");
        }
        return embedding;
      },
      embedBatch: async (texts) => {
        const payload = await requestJson(
          "batchEmbedContents",
          `${ragConfig.geminiModel}:batchEmbedContents`,
          {
            requests: texts.map((text) => ({
              model: ragConfig.geminiModel,
              content: {
                parts: [{ text }]
              }
            }))
          }
        );
        const embeddings = payload.embeddings || payload.responses;
        if (!Array.isArray(embeddings)) {
          throw new Error("Gemini batch response missing embeddings.");
        }
        return embeddings.map((item) => item.values || item.embedding?.values || item.embedding);
      },
      getMetrics: () => ({ ...metrics }),
      resetMetrics: () => {
        metrics.requests = 0;
        metrics.retries = 0;
        metrics.retryDelayMs = 0;
        metrics.throttleEvents = 0;
        metrics.throttleDelayMs = 0;
        metrics.rateLimitRetries = 0;
      }
    };
  })());
  return geminiEmbedderPromise;
}

async function createVectorProvider({ name, model, embedder, batchSize }) {
  const signature = buildIndexSignature();
  const cacheMeta = {
    provider: name,
    model,
    signature
  };
  const cacheKey = createHash("sha256").update(JSON.stringify(cacheMeta)).digest("hex");
  const cacheFile = join(ragConfig.cacheDir, makeCacheFileName(name, model, cacheKey));
  const checkpointFile = join(ragConfig.cacheDir, makeCheckpointFileName(name, model, cacheKey));
  const expectedCacheState = {
    cacheKey,
    signature,
    provider: name,
    model
  };
  logRag(
    `provider=${name} cache_file=${cacheFile} rebuild=${ragConfig.rebuild} cache_key=${cacheKey.slice(0, 12)}`
  );

  let indexPromise = null;
  const loadIndex = async () => {
    if (indexPromise) return indexPromise;
    indexPromise = (async () => {
      if (!ragConfig.rebuild) {
        let cacheState = loadVectorIndexCache(cacheFile, expectedCacheState);
        if (cacheState.hit) {
          const cached = cacheState.payload;
          logRag(
            `cache hit provider=${name} file=${cacheFile} items=${cached.items.length} vectors=${cached.vectors.length}`
          );
          return {
            items: cached.items,
            vectors: cached.vectors
          };
        }
        logRag(`cache miss provider=${name} file=${cacheFile} reason=${cacheState.reason}`);

        const downloadResult = await maybeDownloadPrebuiltVectorIndex({
          provider: name,
          model,
          cacheKey,
          signature,
          cacheFile
        });
        if (downloadResult.downloaded) {
          cacheState = loadVectorIndexCache(cacheFile, expectedCacheState);
          if (cacheState.hit) {
            const cached = cacheState.payload;
            logRag(
              `cache hit provider=${name} file=${cacheFile} source=prebuilt_download items=${cached.items.length} vectors=${cached.vectors.length}`
            );
            return {
              items: cached.items,
              vectors: cached.vectors
            };
          }
          logRag(`cache miss provider=${name} file=${cacheFile} source=prebuilt_download reason=${cacheState.reason}`);
        }
      } else {
        logRag(`cache bypass provider=${name} file=${cacheFile} reason=rebuild_true`);
        clearVectorIndexCheckpoint(checkpointFile);
      }

      const items = buildEmbeddingItems();
      const texts = items.map((item) => item.text);
      const indexedItems = items.map((item) => ({ id: item.id, uri: item.uri }));
      let normalized = [];
      let resumeFrom = 0;
      if (!ragConfig.rebuild) {
        const checkpointState = loadVectorIndexCheckpoint(checkpointFile, cacheKey, indexedItems);
        if (checkpointState.hit) {
          normalized = checkpointState.payload.vectors;
          resumeFrom = normalized.length;
          logRag(
            `checkpoint resume provider=${name} file=${checkpointFile} completed=${resumeFrom}/${texts.length}`
          );
        } else if (checkpointState.reason !== "missing") {
          logRag(`checkpoint ignored provider=${name} file=${checkpointFile} reason=${checkpointState.reason}`);
        }
      }

      if (name === "gemini" && embedder.resetMetrics) {
        embedder.resetMetrics();
      }

      const checkpointIntervalMs = 5000;
      let lastCheckpointAt = 0;
      const persistCheckpoint = (force = false) => {
        const now = Date.now();
        if (!force && now - lastCheckpointAt < checkpointIntervalMs) return;
        const payload = {
          cacheKey,
          meta: cacheMeta,
          items: indexedItems,
          vectors: normalized,
          completed: normalized.length,
          total: texts.length,
          updatedAt: new Date().toISOString()
        };
        saveVectorIndexCheckpoint(checkpointFile, payload);
        lastCheckpointAt = now;
      };

      if (resumeFrom < texts.length) {
        logRag(
          `building index provider=${name} embed_items=${texts.length} remaining=${texts.length - resumeFrom} batch_size=${batchSize}`
        );
        try {
          const embeddingResult = await embedTextsWithProgress(
            texts.slice(resumeFrom),
            embedder,
            batchSize,
            {
              offset: resumeFrom,
              total: texts.length,
              providerName: name,
              onChunk: ({ vectors, completed, total }) => {
                normalized.push(...vectors.map(normalizeVector));
                persistCheckpoint(completed >= total);
              }
            }
          );

          if (name === "gemini") {
            const metrics = embedder.getMetrics ? embedder.getMetrics() : {};
            logRag(
              `gemini build metrics provider=${name} requests=${metrics.requests || 0} retries=${metrics.retries || 0} ` +
              `retry_delay_ms=${metrics.retryDelayMs || 0} throttle_events=${metrics.throttleEvents || 0} ` +
              `throttle_delay_ms=${metrics.throttleDelayMs || 0} rate_limit_retries=${metrics.rateLimitRetries || 0} ` +
              `batch_downgrades=${embeddingResult.stats.batchDowngrades} single_fallback_batches=${embeddingResult.stats.singleFallbackBatches} ` +
              `final_batch_size=${embeddingResult.stats.finalBatchSize}`
            );
          }
        } catch (error) {
          persistCheckpoint(true);
          if (name === "gemini") {
            const metrics = embedder.getMetrics ? embedder.getMetrics() : {};
            logRag(
              `gemini build failed provider=${name} requests=${metrics.requests || 0} retries=${metrics.retries || 0} ` +
              `retry_delay_ms=${metrics.retryDelayMs || 0} throttle_events=${metrics.throttleEvents || 0} ` +
              `throttle_delay_ms=${metrics.throttleDelayMs || 0} rate_limit_retries=${metrics.rateLimitRetries || 0} ` +
              `checkpoint_completed=${normalized.length}/${texts.length} error=${error.message}`
            );
          }
          throw error;
        }
      } else {
        logRag(`checkpoint already complete provider=${name} completed=${resumeFrom}/${texts.length}`);
      }

      const payload = {
        cacheKey,
        meta: cacheMeta,
        items: indexedItems,
        vectors: normalized
      };
      saveVectorIndexCache(cacheFile, payload);
      clearVectorIndexCheckpoint(checkpointFile);
      logRag(`cache saved provider=${name} file=${cacheFile} items=${payload.items.length} vectors=${payload.vectors.length}`);
      return {
        items: payload.items,
        vectors: payload.vectors
      };
    })();
    return indexPromise;
  };

  return {
    name,
    search: async (query, filters, limit) => {
      const prepared = truncateText(normalizeText(query), ragConfig.maxTextChars);
      if (!prepared) return [];
      const index = await loadIndex();
      const queryVector = normalizeVector(await embedder.embed(prepared));
      const bestByUri = new Map();

      for (let i = 0; i < index.vectors.length; i++) {
        const score = dotProduct(queryVector, index.vectors[i]);
        if (ragConfig.minScore && score < ragConfig.minScore) continue;
        const item = index.items[i];
        const entry = resourceIndexByUri.get(item.uri);
        if (!entry || !entryMatchesScope(entry, filters)) continue;
        const existing = bestByUri.get(item.uri);
        if (!existing || score > existing.score) {
          bestByUri.set(item.uri, { entry, score });
        }
      }

      const results = Array.from(bestByUri.values())
        .sort((a, b) => b.score - a.score)
        .map((item) => attachScore(item.entry, item.score));

      if (limit) return results.slice(0, limit);
      return results;
    },
    warm: async () => {
      await loadIndex();
    }
  };
}

function createFuseProvider() {
  return {
    name: "fuse",
    search: async (query, filters, limit) => {
      const results = [];
      for (const result of fuseSearch.search(query)) {
        const entry = result.item;
        if (!entryMatchesScope(entry, filters)) continue;
        const score = Number.isFinite(result.score) ? Math.max(0, 1 - result.score) : undefined;
        results.push(attachScore(entry, score));
      }
      if (limit) return results.slice(0, limit);
      return results;
    },
    warm: async () => {}
  };
}

function resolveProviderChain() {
  let primary = ragConfig.provider;
  if (primary === "auto") {
    primary = ragConfig.geminiApiKey ? "gemini" : "local";
  }
  const chain = [primary];
  if (ragConfig.fallback && ragConfig.fallback !== "none" && ragConfig.fallback !== primary) {
    chain.push(ragConfig.fallback);
  }
  return Array.from(new Set(chain));
}

function logRagConfigOnce() {
  if (ragLogState.config) return;
  ragLogState.config = true;
  logRag(
    `config provider=${ragConfig.provider} fallback=${ragConfig.fallback} prewarm=${ragConfig.prewarm} rebuild=${ragConfig.rebuild} ` +
    `cache_dir=${ragConfig.cacheDir} prebuilt_auto_download=${ragConfig.prebuiltIndexAutoDownload} ` +
    `prebuilt_url_override=${ragConfig.prebuiltIndexUrl ? "set" : "empty"} prebuilt_url_local=${ragConfig.prebuiltIndexUrlLocal ? "set" : "empty"} ` +
    `prebuilt_url_gemini=${ragConfig.prebuiltIndexUrlGemini ? "set" : "empty"} ` +
    `prebuilt_timeout_ms=${ragConfig.prebuiltIndexTimeoutMs} gemini_retry_max_attempts=${ragConfig.geminiRetryMaxAttempts} ` +
    `gemini_retry_base_delay_ms=${ragConfig.geminiRetryBaseDelayMs} gemini_retry_max_delay_ms=${ragConfig.geminiRetryMaxDelayMs} ` +
    `gemini_request_throttle_ms=${ragConfig.geminiRequestThrottleMs}`
  );
}

const providerCache = new Map();

async function loadSearchProvider(name) {
  if (providerCache.has(name)) return providerCache.get(name);
  let providerPromise;
  if (name === "fuse") {
    providerPromise = Promise.resolve(createFuseProvider());
  } else if (name === "lexical") {
    providerPromise = Promise.resolve(createLexicalProvider({
      entries: resourceIndex,
      entryMatchesScope,
      attachScore
    }));
  } else if (name === "local") {
    providerPromise = (async () => {
      const embedder = await getLocalEmbedder();
      return createVectorProvider({
        name: "local",
        model: ragConfig.localModel,
        embedder,
        batchSize: 1
      });
    })();
  } else if (name === "gemini") {
    providerPromise = (async () => {
      const embedder = await getGeminiEmbedder();
      return createVectorProvider({
        name: "gemini",
        model: ragConfig.geminiModel,
        embedder,
        batchSize: Math.max(1, ragConfig.geminiBatchSize)
      });
    })();
  } else {
    providerPromise = Promise.reject(new Error(`Unknown search provider: ${name}`));
  }
  if (!ragLogState.providerReady.has(name)) {
    ragLogState.providerReady.add(name);
    logRag(`provider ready name=${name}`);
  }
  providerCache.set(name, providerPromise);
  return providerPromise;
}

async function searchResources({ query, product, edition, platform, type, limit }) {
  const filters = normalizeSearchFilters({ product, edition, platform, type });
  const searchQuery = query ? String(query).trim() : "";
  const maxResults = limit ? Math.min(limit, 50) : undefined;

  if (!searchQuery) {
    const results = resourceIndex.filter((entry) => entryMatchesScope(entry, filters));
    return maxResults ? results.slice(0, maxResults) : results;
  }

  logRagConfigOnce();
  const providers = resolveProviderChain();
  if (!ragLogState.providerChain) {
    ragLogState.providerChain = true;
    logRag(`provider chain=${providers.join(" -> ")}`);
  }
  let lastError = null;
  for (const name of providers) {
    try {
      const provider = await loadSearchProvider(name);
      const results = await provider.search(searchQuery, filters, maxResults);
      if (!ragLogState.providerFirstUse.has(name)) {
        ragLogState.providerFirstUse.add(name);
        logRag(`provider selected name=${name}`);
      }
      if (name !== providers[0] && !ragLogState.fallbackUse.has(name)) {
        ragLogState.fallbackUse.add(name);
        logRag(`fallback engaged selected=${name} primary=${providers[0]}`);
      }
      return results;
    } catch (error) {
      lastError = error;
      console.error(`[rag] provider "${name}" failed: ${error.message}`);
    }
  }

  if (lastError) {
    console.error(`[rag] all providers failed: ${lastError.message}`);
  }
  return [];
}

async function prewarmRagIndex() {
  if (!ragConfig.prewarm) return;
  logRagConfigOnce();
  const providers = resolveProviderChain();
  const primary = providers[0];
  if (!primary || primary === "fuse" || primary === "lexical") return;
  try {
    logRag(`prewarm start provider=${primary}`);
    const provider = await loadSearchProvider(primary);
    if (provider.warm) {
      await provider.warm();
    }
    logRag(`prewarm done provider=${primary}`);
  } catch (error) {
    console.error(`[rag] prewarm failed: ${error.message}`);
  }
}

async function getSampleSuggestions({ query, product, edition, platform, limit = 5 }) {
  const normalizedProduct = normalizeProduct(product);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
  const searchQuery = query ? String(query).trim() : "";
  const maxResults = Math.min(limit || 5, 10);

  if (searchQuery) {
    const results = await searchResources({
      query: searchQuery,
      product: normalizedProduct,
      edition: normalizedEdition,
      platform: normalizedPlatform,
      type: "sample",
      limit: maxResults
    });
    if (results.length) return results;
  }

  const matchesScope = (entry) => {
    if (normalizedProduct && entry.product !== normalizedProduct) return false;
    if (!editionMatches(normalizedEdition, entry.edition)) return false;
    if (!platformMatches(normalizedPlatform, entry)) return false;
    return entry.type === "sample";
  };

  let candidates = resourceIndex.filter(matchesScope);
  if (candidates.length === 0 && normalizedProduct) {
    candidates = resourceIndex.filter((entry) => entry.type === "sample" && entry.product === normalizedProduct);
  }

  if (searchQuery && candidates.length > 1) {
    const terms = normalizeText(searchQuery.toLowerCase()).split(/\s+/).filter(Boolean);
    const scoreEntry = (entry) => {
      const tags = Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).toLowerCase()) : [];
      const haystack = [
        String(entry.title || "").toLowerCase(),
        String(entry.summary || "").toLowerCase(),
        tags.join(" ")
      ].join(" ");
      let score = 0;
      for (const term of terms) {
        if (!term) continue;
        if (tags.some((tag) => tag === term || tag.includes(term))) score += 3;
        if (haystack.includes(term)) score += 1;
      }
      return score;
    };
    candidates = [...candidates].sort((a, b) => {
      const delta = scoreEntry(b) - scoreEntry(a);
      if (delta !== 0) return delta;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  const seen = new Set();
  const results = [];
  for (const entry of candidates) {
    if (seen.has(entry.uri)) continue;
    seen.add(entry.uri);
    results.push(entry);
    if (results.length >= maxResults) break;
  }

  return results;
}

export {
  ragConfig,
  searchResources,
  getSampleSuggestions,
  prewarmRagIndex
};
