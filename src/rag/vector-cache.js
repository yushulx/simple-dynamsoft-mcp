import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import * as tar from "tar";

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

function saveVectorIndexCache(cacheDir, cacheFile, payload) {
  ensureDirectory(cacheDir);
  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch (error) {
    // JSON.stringify throws "Invalid string length" once the serialized cache
    // exceeds V8's ~512MB max string length (reached with a large index of
    // high-dimensional vectors). Fail with an actionable message instead.
    if (error instanceof RangeError) {
      const itemCount = Array.isArray(payload?.items) ? payload.items.length : "unknown";
      throw new Error(
        `Vector cache too large to serialize (${itemCount} items) — exceeds the JSON string limit. ` +
        "Lower RAG_MAX_CHUNKS_PER_DOC or adopt a ceiling-proof cache format."
      );
    }
    throw error;
  }
  writeFileSync(cacheFile, serialized);
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

function saveVectorIndexCheckpoint(cacheDir, checkpointFile, payload) {
  ensureDirectory(cacheDir);
  writeFileSync(checkpointFile, JSON.stringify(payload));
}

function clearVectorIndexCheckpoint(checkpointFile) {
  if (existsSync(checkpointFile)) {
    rmSync(checkpointFile, { force: true });
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

function resolvePrebuiltIndexUrlCandidates(provider, ragConfig, legacyPrebuiltIndexUrl) {
  const override = String(ragConfig.prebuiltIndexUrl || "").trim();
  if (override) return [override];

  const candidates = [];
  if (provider === "gemini") {
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

function createVectorCacheHelpers({ ragConfig, pkgVersion, legacyPrebuiltIndexUrl, logRag }) {
  const prebuiltDownloadAttempts = new Map();

  async function maybeDownloadPrebuiltVectorIndex({ provider, model, cacheKey, signature, cacheFile }) {
    if (provider !== "gemini") {
      return { downloaded: false, reason: "provider_not_supported" };
    }
    if (!ragConfig.prebuiltIndexAutoDownload) {
      return { downloaded: false, reason: "auto_download_disabled" };
    }

    const sourceUrls = resolvePrebuiltIndexUrlCandidates(provider, ragConfig, legacyPrebuiltIndexUrl);
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
            if (!cachePackageVersion || cachePackageVersion !== pkgVersion) {
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
            saveVectorIndexCache(ragConfig.cacheDir, cacheFile, migratedPayload);
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

  return {
    makeCacheFileName,
    makeCheckpointFileName,
    loadVectorIndexCache,
    saveVectorIndexCache: (cacheFile, payload) => saveVectorIndexCache(ragConfig.cacheDir, cacheFile, payload),
    loadVectorIndexCheckpoint,
    saveVectorIndexCheckpoint: (checkpointFile, payload) => saveVectorIndexCheckpoint(ragConfig.cacheDir, checkpointFile, payload),
    clearVectorIndexCheckpoint,
    maybeDownloadPrebuiltVectorIndex
  };
}

export {
  createVectorCacheHelpers
};
