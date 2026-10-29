import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import * as tar from "tar";
import { isVectorProvider } from "./embedding-providers.js";

function ensureDirectory(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function cacheFilePrefix(provider, model) {
  const safeModel = String(model || "default").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 32);
  return `rag-${provider}-${safeModel}-`;
}

function makeCacheFileName(provider, model, cacheKey) {
  return `${cacheFilePrefix(provider, model)}${cacheKey.slice(0, 12)}.json`;
}

function makeCheckpointFileName(provider, model, cacheKey) {
  return `${cacheFilePrefix(provider, model)}${cacheKey.slice(0, 12)}.checkpoint.json`;
}

function listProviderCacheHeaders(cacheDir, provider, model) {
  if (!existsSync(cacheDir)) return [];
  const prefix = cacheFilePrefix(provider, model);
  return readdirSync(cacheDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => join(cacheDir, name));
}

function signatureWithoutPackageVersion(signature) {
  try {
    const parsed = JSON.parse(signature || "");
    delete parsed.packageVersion;
    return JSON.stringify(parsed);
  } catch {
    return "";
  }
}

// Vectors already computed for identical chunk text, keyed by item `hash`
// (see providers.js). Sources are every cache and checkpoint for the same
// provider/model in cacheDir: a previous version's cache, a CI-restored cache,
// an extracted previous release, or a partial checkpoint. Caches written
// before hashes existed are adopted only when their signature matches apart
// from packageVersion and their items are the same sequence, which means the
// chunk texts are identical.
function collectReusableVectors({ cacheDir, provider, model, items, signature, allowLegacyAdoption = false }) {
  const reusable = new Map();
  const currentSignature = signatureWithoutPackageVersion(signature);
  for (const headerFile of listProviderCacheHeaders(cacheDir, provider, model)) {
    let payload;
    try {
      const result = readVectorFiles(headerFile);
      if (result.error) continue;
      payload = result.payload;
    } catch {
      continue;
    }
    if (payload.meta?.model && payload.meta.model !== model) continue;
    const hashed = payload.items.length > 0 && payload.items.every((item) => item.hash);
    if (hashed) {
      payload.items.forEach((item, i) => {
        if (payload.vectors[i] && !reusable.has(item.hash)) reusable.set(item.hash, payload.vectors[i]);
      });
      continue;
    }
    // Same content signature and the same set of chunk ids/uris means the same
    // chunk texts; match by id/uri rather than position, because directory
    // listing order differs between platforms (e.g. sample folders).
    // The signature names pinned data commits, not what is checked out, so
    // legacy adoption also needs the caller to confirm local data matches them.
    if (!allowLegacyAdoption) continue;
    if (!currentSignature || signatureWithoutPackageVersion(payload.meta?.signature) !== currentSignature) continue;
    if (payload.items.length !== items.length || payload.vectors.length !== items.length) continue;
    const vectorByKey = new Map(payload.items.map((item, i) => [`${item.id}\n${item.uri}`, payload.vectors[i]]));
    if (vectorByKey.size !== items.length || !items.every((item) => vectorByKey.has(`${item.id}\n${item.uri}`))) continue;
    for (const item of items) {
      if (!reusable.has(item.hash)) reusable.set(item.hash, vectorByKey.get(`${item.id}\n${item.uri}`));
    }
  }
  return reusable;
}

// Keep only `keepFile` (and its vectors) among this provider/model's caches,
// so restored/seeded caches do not accumulate in CI caches or release assets.
function pruneOtherCaches({ cacheDir, provider, model, keepFile }) {
  for (const headerFile of listProviderCacheHeaders(cacheDir, provider, model)) {
    if (resolve(headerFile) !== resolve(keepFile)) removeVectorFiles(headerFile);
  }
}

// Cache layout: a JSON header (`<name>.json`: cacheKey, meta, items, vector
// count/dimensions) plus a sibling `<name>.f32` file holding all vectors as
// packed little-endian float32. Serializing vectors into JSON overflowed V8's
// ~512MB max string length once the index grew; neither file here is built as
// one large string.
const VECTOR_FORMAT = "float32-le-v1";

function vectorFileFor(headerFile) {
  return headerFile.replace(/\.json$/i, ".f32");
}

function writeVectorFiles(headerFile, payload) {
  const { vectors, ...header } = payload;
  const list = Array.isArray(vectors) ? vectors : [];
  const dimensions = list.length > 0 ? list[0].length : 0;
  const packed = new Float32Array(list.length * dimensions);
  list.forEach((vector, index) => {
    if (vector.length !== dimensions) {
      throw new Error(`Vector ${index} has ${vector.length} dimensions; expected ${dimensions}`);
    }
    packed.set(vector, index * dimensions);
  });
  // Vectors first: a header always describes a complete vector file, and a
  // stale header next to a newer vector file fails the size check on load.
  writeFileSync(vectorFileFor(headerFile), Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength));
  writeFileSync(headerFile, JSON.stringify({
    ...header,
    vectorFormat: VECTOR_FORMAT,
    vectorCount: list.length,
    dimensions
  }));
}

// Returns the parsed header with `vectors` as Float32Array views over one
// buffer, or { error } describing why the files cannot be used.
function readVectorFiles(headerFile) {
  const header = JSON.parse(readFileSync(headerFile, "utf8"));
  if (!header || header.vectorFormat !== VECTOR_FORMAT || !Array.isArray(header.items)) {
    return { error: "invalid_payload" };
  }
  const vectorFile = vectorFileFor(headerFile);
  if (!existsSync(vectorFile)) {
    return { error: "vectors_missing" };
  }
  const count = Number(header.vectorCount) || 0;
  const dimensions = Number(header.dimensions) || 0;
  const raw = readFileSync(vectorFile);
  if (raw.byteLength !== count * dimensions * Float32Array.BYTES_PER_ELEMENT) {
    return { error: "vectors_size_mismatch" };
  }
  // Copy into an aligned buffer; Buffer offsets are not guaranteed 4-byte aligned.
  const all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const vectors = new Array(count);
  for (let i = 0; i < count; i += 1) {
    vectors[i] = all.subarray(i * dimensions, (i + 1) * dimensions);
  }
  return { payload: { ...header, vectors } };
}

function removeVectorFiles(headerFile) {
  rmSync(headerFile, { force: true });
  rmSync(vectorFileFor(headerFile), { force: true });
}

function loadVectorIndexCache(
  cacheFile,
  { cacheKey, signature, provider, model, requireSignature = false } = {}
) {
  if (!existsSync(cacheFile)) {
    return { hit: false, reason: "missing", payload: null };
  }
  try {
    const { payload: parsed, error } = readVectorFiles(cacheFile);
    if (error) {
      return { hit: false, reason: error, payload: null };
    }
    if (cacheKey && parsed.cacheKey !== cacheKey) {
      return { hit: false, reason: "cache_key_mismatch", payload: null };
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
  writeVectorFiles(cacheFile, payload);
}

// Checkpoints hold only the items embedded so far (each with its `hash`);
// collectReusableVectors picks them up on the next attempt.
function saveVectorIndexCheckpoint(cacheDir, checkpointFile, payload) {
  ensureDirectory(cacheDir);
  writeVectorFiles(checkpointFile, payload);
}

function clearVectorIndexCheckpoint(checkpointFile) {
  removeVectorFiles(checkpointFile);
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

// The release asset for the active provider (`prebuiltIndexUrlFor`), unless
// RAG_PREBUILT_INDEX_URL or, for Gemini, RAG_PREBUILT_INDEX_URL_GEMINI overrides it.
function resolvePrebuiltIndexUrl(provider, ragConfig, prebuiltIndexUrlFor) {
  const override = String(ragConfig.prebuiltIndexUrl || "").trim();
  if (override) return override;
  const geminiOverride = String(ragConfig.prebuiltIndexUrlGemini || "").trim();
  if (provider === "gemini" && geminiOverride) return geminiOverride;
  return prebuiltIndexUrlFor ? String(prebuiltIndexUrlFor(provider) || "").trim() : "";
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

function createVectorCacheHelpers({ ragConfig, pkgVersion, prebuiltIndexUrlFor, logRag }) {
  const prebuiltDownloadAttempts = new Map();

  async function maybeDownloadPrebuiltVectorIndex({ provider, model, cacheKey, signature, cacheFile }) {
    if (!isVectorProvider(provider)) {
      return { downloaded: false, reason: "provider_not_supported" };
    }
    if (!ragConfig.prebuiltIndexAutoDownload) {
      return { downloaded: false, reason: "auto_download_disabled" };
    }

    const sourceUrl = resolvePrebuiltIndexUrl(provider, ragConfig, prebuiltIndexUrlFor);
    const sourceUrls = sourceUrl ? [sourceUrl] : [];
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
    saveVectorIndexCheckpoint: (checkpointFile, payload) => saveVectorIndexCheckpoint(ragConfig.cacheDir, checkpointFile, payload),
    clearVectorIndexCheckpoint,
    collectReusableVectors: (options) => collectReusableVectors({ cacheDir: ragConfig.cacheDir, ...options }),
    pruneOtherCaches: (options) => pruneOtherCaches({ cacheDir: ragConfig.cacheDir, ...options }),
    maybeDownloadPrebuiltVectorIndex
  };
}

export {
  createVectorCacheHelpers
};
