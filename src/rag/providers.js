import { createHash } from "node:crypto";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";

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
  _batchSize = 1,
  {
    offset = 0,
    total = texts.length,
    onChunk = null,
    providerName = "",
    logRag
  } = {}
) {
  const results = [];
  let completed = offset;

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

  for (const text of texts) {
    const vector = await embedder.embed(text);
    results.push(vector);
    await reportChunk([vector], "single", 1);
  }

  if (providerName) {
    logRag(`embedding complete provider=${providerName} mode=single count=${results.length}`);
  }

  return {
    vectors: results,
    stats: {
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
    geminiEmbedderPromise = Promise.resolve((() => {
      const client = new GoogleGenAI({ apiKey: ragConfig.geminiApiKey });
      return {
        embed: async (text) => {
          const payload = await client.models.embedContent({
            model: ragConfig.geminiModel,
            contents: text
          });
          const embedding = payload?.embeddings?.[0]?.values || payload?.embedding?.values;
          if (!Array.isArray(embedding) || embedding.length === 0) {
            throw new Error("Gemini embedding response missing embedding values.");
          }
          return embedding;
        }
      };
    })());
    return geminiEmbedderPromise;
  }

  async function createVectorProvider({ name, model, embedder }) {
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
              1,
              {
                offset: resumeFrom,
                total: texts.length,
                providerName: name,
                logRag,
                onChunk: ({ vectors, completed, total }) => {
                  normalized.push(...vectors.map(utils.normalizeVector));
                  persistCheckpoint(completed >= total);
                }
              }
            );
          } catch (error) {
            persistCheckpoint(true);
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
        const prepared = utils.truncateText(utils.normalizeText(query), ragConfig.maxTextChars);
        if (!prepared) return [];
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
            bestByUri.set(item.uri, { entry, score });
          }
        }

        const results = Array.from(bestByUri.values())
          .sort((a, b) => b.score - a.score)
          .map((item) => utils.attachScore(item.entry, item.score));

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
          embedder
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
