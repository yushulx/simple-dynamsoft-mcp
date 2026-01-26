import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import Fuse from "fuse.js";
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
} from "./resource-index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));

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

const ragConfig = {
  provider: readEnvValue("RAG_PROVIDER", "auto").toLowerCase(),
  fallback: readEnvValue("RAG_FALLBACK", "fuse").toLowerCase(),
  cacheDir: readEnvValue("RAG_CACHE_DIR", join(projectRoot, "data", ".rag-cache")),
  modelCacheDir: readEnvValue("RAG_MODEL_CACHE_DIR", join(projectRoot, "data", ".rag-cache", "models")),
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
  geminiApiKey: readEnvValue("GEMINI_API_KEY", ""),
  geminiModel: normalizeGeminiModel(readEnvValue("GEMINI_EMBED_MODEL", "models/gemini-embedding-001")),
  geminiBaseUrl: readEnvValue("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com"),
  geminiBatchSize: readIntEnv("GEMINI_EMBED_BATCH_SIZE", 16)
};

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
    dwtDocCount: signatureData.dwtDocCount,
    ddvDocCount: signatureData.ddvDocCount,
    versions: signatureData.versions,
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

function loadVectorIndexCache(cacheFile, expectedKey) {
  if (!existsSync(cacheFile)) return null;
  try {
    const parsed = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (!parsed || parsed.cacheKey !== expectedKey) return null;
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.vectors)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveVectorIndexCache(cacheFile, payload) {
  ensureDirectory(ragConfig.cacheDir);
  writeFileSync(cacheFile, JSON.stringify(payload));
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

async function embedTexts(texts, embedder, batchSize = 1) {
  const results = [];
  if (embedder.embedBatch && batchSize > 1) {
    try {
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const vectors = await embedder.embedBatch(batch);
        results.push(...vectors);
      }
      return results;
    } catch (error) {
      console.error(`[rag] batch embedding failed, falling back to single requests: ${error.message}`);
      results.length = 0;
    }
  }
  for (const text of texts) {
    results.push(await embedder.embed(text));
  }
  return results;
}

let localEmbedderPromise = null;
async function getLocalEmbedder() {
  if (localEmbedderPromise) return localEmbedderPromise;
  localEmbedderPromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    ensureDirectory(ragConfig.modelCacheDir);
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
  geminiEmbedderPromise = Promise.resolve({
    embed: async (text) => {
      const response = await fetch(
        `${ragConfig.geminiBaseUrl}/v1beta/${ragConfig.geminiModel}:embedContent?key=${ragConfig.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: {
              parts: [{ text }]
            }
          })
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini embedContent failed (${response.status}): ${detail}`);
      }
      const payload = await response.json();
      const embedding = payload.embedding?.values || payload.embedding || payload.embeddings?.[0]?.values;
      if (!embedding) {
        throw new Error("Gemini embedding response missing embedding values.");
      }
      return embedding;
    },
    embedBatch: async (texts) => {
      const response = await fetch(
        `${ragConfig.geminiBaseUrl}/v1beta/${ragConfig.geminiModel}:batchEmbedContents?key=${ragConfig.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: texts.map((text) => ({
              model: ragConfig.geminiModel,
              content: {
                parts: [{ text }]
              }
            }))
          })
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini batchEmbedContents failed (${response.status}): ${detail}`);
      }
      const payload = await response.json();
      const embeddings = payload.embeddings || payload.responses;
      if (!Array.isArray(embeddings)) {
        throw new Error("Gemini batch response missing embeddings.");
      }
      return embeddings.map((item) => item.values || item.embedding?.values || item.embedding);
    }
  });
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

  let indexPromise = null;
  const loadIndex = async () => {
    if (indexPromise) return indexPromise;
    indexPromise = (async () => {
      if (!ragConfig.rebuild) {
        const cached = loadVectorIndexCache(cacheFile, cacheKey);
        if (cached) {
          return {
            items: cached.items,
            vectors: cached.vectors
          };
        }
      }

      const items = buildEmbeddingItems();
      const texts = items.map((item) => item.text);
      const vectors = await embedTexts(texts, embedder, batchSize);
      const normalized = vectors.map(normalizeVector);

      const payload = {
        cacheKey,
        meta: cacheMeta,
        items: items.map((item) => ({ id: item.id, uri: item.uri })),
        vectors: normalized
      };
      saveVectorIndexCache(cacheFile, payload);
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

const providerCache = new Map();

async function loadSearchProvider(name) {
  if (providerCache.has(name)) return providerCache.get(name);
  let providerPromise;
  if (name === "fuse") {
    providerPromise = Promise.resolve(createFuseProvider());
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

  const providers = resolveProviderChain();
  let lastError = null;
  for (const name of providers) {
    try {
      const provider = await loadSearchProvider(name);
      const results = await provider.search(searchQuery, filters, maxResults);
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
  const providers = resolveProviderChain();
  const primary = providers[0];
  if (!primary || primary === "fuse") return;
  try {
    const provider = await loadSearchProvider(primary);
    if (provider.warm) {
      await provider.warm();
    }
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
