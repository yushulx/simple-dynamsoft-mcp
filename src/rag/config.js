import { readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { getResolvedDataRoot } from "../data/root.js";
import { resolveProfileConfig } from "./profile-config.js";
import { isVectorProvider } from "./embedding-providers.js";

const dataRoot = getResolvedDataRoot();

const pkgUrl = new URL("../../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));

// Release asset per embedding provider, e.g. prebuilt-rag-index-azure-openai-7.8.0.tar.gz.
function defaultPrebuiltIndexUrl(provider) {
  return `https://github.com/yushulx/simple-dynamsoft-mcp/releases/download/v${pkg.version}/prebuilt-rag-index-${provider}-${pkg.version}.tar.gz`;
}

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
const defaultPrewarm = isVectorProvider(profileConfig.provider);

const ragConfig = {
  profile: profileConfig.profile,
  profileDefaults: profileConfig.defaults,
  providerSource: profileConfig.providerSource,
  fallbackSource: profileConfig.fallbackSource,
  provider: profileConfig.provider,
  fallback: profileConfig.fallback,
  cacheDir: readEnvValue("RAG_CACHE_DIR", join(dataRoot, ".rag-cache")),
  modelCacheDir: readEnvValue("RAG_MODEL_CACHE_DIR", join(dataRoot, ".rag-cache", "models")),
  chunkSize: readIntEnv("RAG_CHUNK_SIZE", 1200),
  chunkOverlap: readIntEnv("RAG_CHUNK_OVERLAP", 200),
  // 0 = embed every chunk of every doc (~19.7k chunks vs ~10.3k at the old cap
  // of 6). Each chunk is one Gemini embedding per release prebuild; the vector
  // cache is header + float32 (src/rag/vector-cache.js), so there is no size cap.
  maxChunksPerDoc: readIntEnv("RAG_MAX_CHUNKS_PER_DOC", 0),
  maxTextChars: readIntEnv("RAG_MAX_TEXT_CHARS", 4000),
  minScore: readFloatEnv("RAG_MIN_SCORE", 0.2),
  includeScore: readBoolEnv("RAG_INCLUDE_SCORE", false),
  rebuild: readBoolEnv("RAG_REBUILD", false),
  prewarm: readBoolEnv("RAG_PREWARM", defaultPrewarm),
  prewarmBlock: readBoolEnv("RAG_PREWARM_BLOCK", false),
  prebuiltIndexAutoDownload: readBoolEnv("RAG_PREBUILT_INDEX_AUTO_DOWNLOAD", true),
  prebuiltIndexUrl: readEnvValue("RAG_PREBUILT_INDEX_URL", ""),
  // Override for the Gemini asset URL; other providers use RAG_PREBUILT_INDEX_URL.
  prebuiltIndexUrlGemini: readEnvValue("RAG_PREBUILT_INDEX_URL_GEMINI", ""),
  prebuiltIndexTimeoutMs: readIntEnv("RAG_PREBUILT_INDEX_TIMEOUT_MS", 180000),
  geminiApiKey: readEnvValue("GEMINI_API_KEY", ""),
  geminiModel: normalizeGeminiModel(readEnvValue("GEMINI_EMBED_MODEL", "models/gemini-embedding-001")),
  geminiBaseUrl: readEnvValue("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com"),
  geminiBatchSize: readIntEnv("GEMINI_EMBED_BATCH_SIZE", 16),
  // Retry/throttle settings apply to every HTTP embedding provider; the
  // GEMINI_* names predate the other providers.
  geminiRetryMaxAttempts: readIntEnv("GEMINI_RETRY_MAX_ATTEMPTS", 5),
  geminiRetryBaseDelayMs: readIntEnv("GEMINI_RETRY_BASE_DELAY_MS", 500),
  geminiRetryMaxDelayMs: readIntEnv("GEMINI_RETRY_MAX_DELAY_MS", 10000),
  geminiRequestThrottleMs: readIntEnv("GEMINI_REQUEST_THROTTLE_MS", 0),
  openaiApiKey: readEnvValue("OPENAI_API_KEY", ""),
  openaiBaseUrl: readEnvValue("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/+$/, ""),
  openaiModel: readEnvValue("OPENAI_EMBED_MODEL", "text-embedding-3-large"),
  openaiDimensions: readIntEnv("OPENAI_EMBED_DIMENSIONS", 0),
  openaiBatchSize: readIntEnv("OPENAI_EMBED_BATCH_SIZE", 64),
  azureOpenaiApiKey: readEnvValue("AZURE_OPENAI_API_KEY", ""),
  azureOpenaiEndpoint: readEnvValue("AZURE_OPENAI_ENDPOINT", "").replace(/\/+$/, ""),
  azureOpenaiDeployment: readEnvValue("AZURE_OPENAI_EMBED_DEPLOYMENT", ""),
  // A deployment name does not identify its model; this value is part of the
  // cache identity so re-pointing a deployment at another model rebuilds.
  azureOpenaiModel: readEnvValue("AZURE_OPENAI_EMBED_MODEL", "text-embedding-3-large"),
  azureOpenaiApiVersion: readEnvValue("AZURE_OPENAI_API_VERSION", "2024-10-21"),
  azureOpenaiDimensions: readIntEnv("AZURE_OPENAI_EMBED_DIMENSIONS", 0),
  azureOpenaiBatchSize: readIntEnv("AZURE_OPENAI_EMBED_BATCH_SIZE", 64)
};

export {
  pkg,
  ragConfig,
  defaultPrebuiltIndexUrl
};
