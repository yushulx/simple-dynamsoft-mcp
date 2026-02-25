import { readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { getResolvedDataRoot } from "../data/root.js";
import { resolveProfileConfig } from "./profile-config.js";

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

export {
  pkg,
  ragConfig,
  legacyPrebuiltIndexUrl,
  defaultPrebuiltIndexUrls
};
