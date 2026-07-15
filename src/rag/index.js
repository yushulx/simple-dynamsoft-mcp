import {
  resourceIndex,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  editionMatches,
  platformMatches,
  getRagSignatureData,
  resourceIndexByUri
} from "../server/resource-index.js";
import { latencyBucket } from "../observability/logging.js";
import { createLexicalProvider } from "./lexical-provider.js";
import { pkg, ragConfig, legacyPrebuiltIndexUrl } from "./config.js";
import {
  ragLogState,
  logRag,
  logRagConfigOnce,
  resetRagProviderLogState
} from "./logger.js";
import {
  createFuseSearch,
  attachScore,
  normalizeSearchFilters,
  entryMatchesScope,
  normalizeText,
  truncateText,
  buildEmbeddingItems,
  buildIndexSignature,
  normalizeVector,
  dotProduct,
  isRateLimitError,
  expandQueryTokens,
  extractSnippet
} from "./search-utils.js";
import { createProviderOrchestrator } from "./providers.js";
import { createVectorCacheHelpers } from "./vector-cache.js";

const searchUtils = {
  createFuseSearch: () => createFuseSearch(resourceIndex),
  attachScore: (entry, score) => attachScore(entry, score, ragConfig.includeScore),
  normalizeText,
  truncateText,
  buildEmbeddingItems,
  buildIndexSignature,
  normalizeVector,
  dotProduct,
  isRateLimitError,
  expandQueryTokens,
  extractSnippet,
  entryMatchesScope: (entry, filters) => entryMatchesScope(entry, filters, {
    editionMatches,
    platformMatches
  })
};

const vectorCache = createVectorCacheHelpers({
  ragConfig,
  pkgVersion: pkg.version,
  legacyPrebuiltIndexUrl,
  logRag
});

const providerOrchestrator = createProviderOrchestrator({
  pkgVersion: pkg.version,
  ragConfig,
  ragLogState,
  logRag,
  resourceIndex,
  resourceIndexByUri,
  createLexicalProvider,
  getRagSignatureData,
  utils: searchUtils,
  vectorCache
});

function classifyGeminiFailureReason(error) {
  const status = Number(error?.status);
  if (status === 401 || status === 403) return "invalid_auth";
  if (status === 400 || status === 404) return "invalid_config";
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("gemini_api_key") || message.includes("api key")) return "missing_api_key";
  if (message.includes("embed model") || message.includes("model")) return "invalid_config";
  return "runtime_error";
}

function logGeminiDegradedOnce({ reason, fallback, error, stage }) {
  const key = `${stage}:${reason}:${fallback}`;
  if (ragLogState.degradedNotices.has(key)) return;
  ragLogState.degradedNotices.add(key);
  logRag("provider_degraded", {
    provider: "gemini",
    fallback,
    reason,
    stage,
    error: error?.message || String(error)
  }, { level: "error" });
}

function refreshRagIndexes() {
  providerOrchestrator.refreshProviders();
  resetRagProviderLogState();
  logRag(`indexes refreshed resources=${resourceIndex.length}`);
}

async function searchResources({ query, product, edition, platform, type, limit }) {
  const startedAt = Date.now();
  const filters = normalizeSearchFilters({ product, edition, platform, type }, {
    normalizeProduct,
    normalizePlatform,
    normalizeEdition
  });
  const searchQuery = query ? String(query).trim() : "";
  const maxResults = limit ? Math.min(limit, 50) : undefined;

  if (!searchQuery) {
    const results = resourceIndex.filter((entry) => searchUtils.entryMatchesScope(entry, filters));
    return maxResults ? results.slice(0, maxResults) : results;
  }

  logRagConfigOnce(ragConfig);
  const providers = providerOrchestrator.resolveProviderChain();
  if (!ragLogState.providerChain) {
    ragLogState.providerChain = true;
    logRag("provider_chain", {
      profile: ragConfig.profile,
      provider: providers[0] || "unknown",
      fallback: ragConfig.fallback,
      chain: providers.join("->")
    });
  }

  let lastError = null;
  for (const name of providers) {
    try {
      const provider = await providerOrchestrator.loadSearchProvider(name);
      const results = await provider.search(searchQuery, filters, maxResults);
      if (!ragLogState.providerFirstUse.has(name)) {
        ragLogState.providerFirstUse.add(name);
        logRag("provider_selected", {
          profile: ragConfig.profile,
          provider: name,
          fallback: ragConfig.fallback
        });
      }
      if (name !== providers[0] && !ragLogState.fallbackUse.has(name)) {
        ragLogState.fallbackUse.add(name);
        logRag("fallback_engaged", {
          selected_provider: name,
          primary_provider: providers[0],
          fallback: ragConfig.fallback
        });
      }
      const elapsedMs = Date.now() - startedAt;
      logRag("search_complete", {
        profile: ragConfig.profile,
        provider: name,
        fallback: ragConfig.fallback,
        product: filters.product || "any",
        edition: filters.edition || "any",
        platform: filters.platform || "any",
        type: filters.type || "any",
        result_count: results.length,
        latency_ms: elapsedMs,
        latency_bucket: latencyBucket(elapsedMs)
      });
      return results;
    } catch (error) {
      lastError = error;
      logRag("provider_failed", {
        provider: name,
        fallback: ragConfig.fallback,
        error: error.message
      }, { level: "error" });
      if (name === "gemini") {
        const reason = classifyGeminiFailureReason(error);
        const hasFallback = providers.includes("lexical") && providers[0] === "gemini";
        if (hasFallback) {
          logGeminiDegradedOnce({ reason, fallback: "lexical", error, stage: "search" });
        }
      }
    }
  }

  if (lastError) {
    const elapsedMs = Date.now() - startedAt;
    logRag("search_failed", {
      profile: ragConfig.profile,
      provider: providers[0] || "unknown",
      fallback: ragConfig.fallback,
      latency_ms: elapsedMs,
      latency_bucket: latencyBucket(elapsedMs),
      error: lastError.message
    }, { level: "error" });
  }
  return [];
}

async function prewarmRagIndex() {
  if (!ragConfig.prewarm) return;
  logRagConfigOnce(ragConfig);
  const providers = providerOrchestrator.resolveProviderChain();
  const primary = providers[0];
  if (!primary || primary === "fuse") return;
  try {
    logRag("prewarm_start", {
      profile: ragConfig.profile,
      provider: primary,
      fallback: ragConfig.fallback
    });
    const provider = await providerOrchestrator.loadSearchProvider(primary);
    if (provider.warm) {
      await provider.warm();
    }
    logRag("prewarm_done", {
      profile: ragConfig.profile,
      provider: primary,
      fallback: ragConfig.fallback
    });
  } catch (error) {
    if (primary === "gemini" && providers.includes("lexical")) {
      const reason = classifyGeminiFailureReason(error);
      logGeminiDegradedOnce({ reason, fallback: "lexical", error, stage: "prewarm" });
    }
    logRag("prewarm_failed", {
      provider: primary,
      error: error.message
    }, { level: "error" });
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
  prewarmRagIndex,
  refreshRagIndexes
};
