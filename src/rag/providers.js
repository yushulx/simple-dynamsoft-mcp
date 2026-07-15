import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  sleepMs,
  parseRetryAfterMs,
  normalizeGeminiRetryConfig,
  isRateLimitGeminiStatus,
  GeminiHttpError,
  executeWithGeminiRetry
} from "./gemini-retry.js";

function resolveProviderChain(ragConfig) {
  let primary = ragConfig.provider;
  if (primary === "auto") {
    primary = ragConfig.geminiApiKey ? "gemini" : "lexical";
  }
  const chain = [primary];
  if (ragConfig.fallback && ragConfig.fallback !== "none" && ragConfig.fallback !== primary) {
    chain.push(ragConfig.fallback);
  }
  return Array.from(new Set(chain));
}

async function embedTextsWithProgress(
  texts,
  embedder,
  batchSize = 1,
  {
    offset = 0,
    total = texts.length,
    onChunk = null,
    providerName = "",
    logRag,
    isRateLimitError
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

function createProviderOrchestrator({
  pkgVersion,
  ragConfig,
  ragLogState,
  logRag,
  resourceIndex,
  resourceIndexByUri,
  createLexicalProvider,
  getRagSignatureData,
  utils,
  vectorCache
}) {
  let fuseSearch = utils.createFuseSearch(resourceIndex);
  const providerCache = new Map();
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
    const signature = utils.buildIndexSignature({
      pkgVersion,
      signatureData: getRagSignatureData(),
      ragConfig
    });
    const cacheMeta = {
      provider: name,
      model,
      signature
    };
    const cacheKey = createHash("sha256").update(JSON.stringify(cacheMeta)).digest("hex");
    const cacheFile = join(ragConfig.cacheDir, vectorCache.makeCacheFileName(name, model, cacheKey));
    const checkpointFile = join(ragConfig.cacheDir, vectorCache.makeCheckpointFileName(name, model, cacheKey));
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
          let cacheState = vectorCache.loadVectorIndexCache(cacheFile, expectedCacheState);
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

          const downloadResult = await vectorCache.maybeDownloadPrebuiltVectorIndex({
            provider: name,
            model,
            cacheKey,
            signature,
            cacheFile
          });
          if (downloadResult.downloaded) {
            cacheState = vectorCache.loadVectorIndexCache(cacheFile, expectedCacheState);
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
          vectorCache.clearVectorIndexCheckpoint(checkpointFile);
        }

        const items = utils.buildEmbeddingItems(resourceIndex, ragConfig);
        const texts = items.map((item) => item.text);
        const indexedItems = items.map((item) => ({ id: item.id, uri: item.uri }));
        let normalized = [];
        let resumeFrom = 0;
        if (!ragConfig.rebuild) {
          const checkpointState = vectorCache.loadVectorIndexCheckpoint(checkpointFile, cacheKey, indexedItems);
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
          vectorCache.saveVectorIndexCheckpoint(checkpointFile, payload);
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
                logRag,
                isRateLimitError: (error) => utils.isRateLimitError(error, isRateLimitGeminiStatus),
                onChunk: ({ vectors, completed, total }) => {
                  normalized.push(...vectors.map(utils.normalizeVector));
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
        vectorCache.saveVectorIndexCache(cacheFile, payload);
        vectorCache.clearVectorIndexCheckpoint(checkpointFile);
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
        const baseQuery = utils.normalizeText(query);
        if (!baseQuery) return [];
        // Lightly append domain synonyms/stems so jargon-heavy queries embed with
        // the vocabulary the docs use, without letting expansion dominate the
        // original query (which stays first). (#148)
        const expanded = utils.expandQueryTokens ? utils.expandQueryTokens(baseQuery.toLowerCase().split(/\s+/)) : [];
        const baseTokens = new Set(baseQuery.toLowerCase().split(/\s+/));
        const extraTerms = expanded.filter((t) => !baseTokens.has(t)).slice(0, 8);
        const enriched = extraTerms.length ? `${baseQuery} ${extraTerms.join(" ")}` : baseQuery;
        const prepared = utils.truncateText(enriched, ragConfig.maxTextChars);
        const index = await loadIndex();
        const queryVector = utils.normalizeVector(await embedder.embed(prepared));
        const bestByUri = new Map();

        for (let i = 0; i < index.vectors.length; i++) {
          const score = utils.dotProduct(queryVector, index.vectors[i]);
          if (ragConfig.minScore && score < ragConfig.minScore) continue;
          const item = index.items[i];
          const entry = resourceIndexByUri.get(item.uri);
          if (!entry || !utils.entryMatchesScope(entry, filters)) continue;
          const existing = bestByUri.get(item.uri);
          if (!existing || score > existing.score) {
            bestByUri.set(item.uri, { entry, score, chunkText: item.text });
          }
        }

        const ordered = Array.from(bestByUri.values()).sort((a, b) => b.score - a.score);
        // Relative cutoff: once we have a confident top hit, drop tail results
        // scoring far below it (the fixed absolute floor above is a near no-op for
        // normalized Gemini embeddings). (#149)
        const topScore = ordered.length ? ordered[0].score : 0;
        // When the top score is non-positive (only reachable with RAG_MIN_SCORE=0
        // and unrelated content), keep everything rather than dropping the top hit.
        const relativeFloor = topScore > 0 ? topScore * 0.85 : -Infinity;
        const kept = ordered.filter((item) => item.score >= relativeFloor);

        const snippetTerms = baseQuery.toLowerCase().split(/\s+/).filter(Boolean);
        const results = kept.map((item) => {
          const scored = utils.attachScore(item.entry, item.score);
          const snippet = utils.extractSnippet ? utils.extractSnippet(item.chunkText || "", snippetTerms, 240) : "";
          return snippet ? { ...scored, matchedSnippet: snippet } : scored;
        });

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
          if (!utils.entryMatchesScope(entry, filters)) continue;
          const score = Number.isFinite(result.score) ? Math.max(0, 1 - result.score) : undefined;
          results.push(utils.attachScore(entry, score));
        }
        if (limit) return results.slice(0, limit);
        return results;
      },
      warm: async () => {}
    };
  }

  function refreshProviders() {
    fuseSearch = utils.createFuseSearch(resourceIndex);
    providerCache.clear();
  }

  async function loadSearchProvider(name) {
    if (providerCache.has(name)) return providerCache.get(name);
    let providerPromise;
    if (name === "fuse") {
      providerPromise = Promise.resolve(createFuseProvider());
    } else if (name === "lexical") {
      providerPromise = Promise.resolve(createLexicalProvider({
        entries: resourceIndex,
        entryMatchesScope: utils.entryMatchesScope,
        attachScore: utils.attachScore
      }));
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
      logRag("provider_ready", {
        profile: ragConfig.profile,
        provider: name,
        fallback: ragConfig.fallback
      });
    }
    providerCache.set(name, providerPromise);
    return providerPromise;
  }

  return {
    resolveProviderChain: () => resolveProviderChain(ragConfig),
    loadSearchProvider,
    refreshProviders
  };
}

export {
  createProviderOrchestrator,
  resolveProviderChain
};
