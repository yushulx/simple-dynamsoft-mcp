import Fuse from "fuse.js";

function createFuseSearch(resourceIndex) {
  return new Fuse(resourceIndex, {
    keys: [
      { name: "title", weight: 3 },
      { name: "tags", weight: 2 },
      { name: "summary", weight: 1 }
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true
  });
}

function attachScore(entry, score, includeScore) {
  if (!includeScore || !Number.isFinite(score)) return entry;
  return { ...entry, score };
}

function normalizeSearchFilters({ product, edition, platform, type }, normalizers) {
  const normalizedProduct = normalizers.normalizeProduct(product);
  const normalizedPlatform = normalizers.normalizePlatform(platform);
  const normalizedEdition = normalizers.normalizeEdition(edition, normalizedPlatform, normalizedProduct);
  return {
    product: normalizedProduct,
    edition: normalizedEdition,
    platform: normalizedPlatform,
    type: type || "any"
  };
}

function entryMatchesScope(entry, filters, matchers) {
  if (filters.product && entry.product !== filters.product) return false;
  if (filters.edition && !matchers.editionMatches(filters.edition, entry.edition)) return false;
  if (filters.platform && !matchers.platformMatches(filters.platform, entry)) return false;
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

// Heading-aware chunking: split a markdown doc on ATX headings, prepend the
// nearest heading path to each section, then size-bound sections into chunks so
// the whole document is covered (not just its first ~6k chars) and each chunk
// keeps section context (issue #149).
function chunkMarkdown(text, chunkSize, chunkOverlap, maxChunks) {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/);
  const headingStack = [];
  const sections = [];
  let current = { path: "", lines: [] };

  // Heading-only sections (e.g. index pages whose headings are links) are
  // kept: their heading path is the only text that makes them findable.
  const flush = () => {
    const body = current.lines.join(" ").replace(/\s+/g, " ").trim();
    if (body || current.path) sections.push({ path: current.path, body });
  };

  let inFence = false;
  for (const line of lines) {
    // Track fenced code blocks so a `# ` comment inside Python/bash/YAML is not
    // mistaken for a markdown heading (which would fragment the code and hijack
    // the heading breadcrumb for following prose).
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      current.lines.push(line);
      continue;
    }
    const heading = inFence ? null : line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const title = heading[2].replace(/\s+/g, " ").trim();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, title });
      current = { path: headingStack.map((h) => h.title).join(" > "), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();

  if (sections.length === 0) {
    return chunkText(raw, chunkSize, chunkOverlap, maxChunks);
  }

  const chunks = [];
  for (const section of sections) {
    const prefix = section.path ? `${section.path}\n` : "";
    if (!section.body) {
      chunks.push(section.path);
      if (maxChunks && chunks.length >= maxChunks) return chunks;
      continue;
    }
    const pieces = chunkText(section.body, chunkSize, chunkOverlap, maxChunks);
    for (const piece of pieces) {
      chunks.push(`${prefix}${piece}`.trim());
      if (maxChunks && chunks.length >= maxChunks) return chunks;
    }
  }
  return chunks;
}

// Domain synonym / jargon expansion so lexical scoring survives the vocabulary
// gap between how developers phrase questions and how docs/samples are titled
// (issue #148). Kept deliberately small and high-precision.
const TOKEN_SYNONYMS = {
  datamatrix: ["data", "matrix"],
  pdf417: ["pdf417"],
  qr: ["qrcode"],
  qrcode: ["qr"],
  webcam: ["camera", "video"],
  camera: ["webcam", "video"],
  video: ["camera"],
  scan: ["decode", "read"],
  scanning: ["scan", "decode", "read"],
  decode: ["scan", "read"],
  read: ["scan", "decode"],
  reading: ["read", "scan"],
  deskew: ["normalize", "rectify"],
  normalize: ["deskew"],
  normalization: ["deskew", "normalize"],
  licence: ["license"],
  passport: ["mrz"],
  mrz: ["passport"],
  gs1: ["gs1", "ai"],
  barcode: ["barcode"]
};

// Very light suffix folding to a stem, so "scanning"/"readers" reach "scan"/"reader".
function stemToken(token) {
  if (token.length <= 4) return token;
  for (const suffix of ["ing", "ers", "er", "es", "s"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

function expandQueryTokens(tokens) {
  const out = new Set();
  for (const token of tokens) {
    if (!token) continue;
    out.add(token);
    const stem = stemToken(token);
    if (stem !== token) out.add(stem);
    const synonyms = TOKEN_SYNONYMS[token] || TOKEN_SYNONYMS[stem];
    if (synonyms) {
      for (const syn of synonyms) out.add(syn);
    }
  }
  return [...out];
}

// Cap for matched passages returned by search: one chunk (RAG_CHUNK_SIZE 1200)
// plus its heading path. The same cap applies to semantic and lexical results.
const PASSAGE_MAX_CHARS = 1500;

// A ~maxLen window around the first query term found in text — used to give the
// agent a matched snippet in search results (issues #146/#149).
function extractSnippet(text, terms, maxLen = 240) {
  const cleaned = normalizeText(text);
  if (!cleaned) return "";
  // Text that fits is returned whole, so its heading and leading context stay.
  if (cleaned.length <= maxLen) return cleaned;
  const lower = cleaned.toLowerCase();
  let hitAt = -1;
  for (const term of terms) {
    if (!term) continue;
    const at = lower.indexOf(term.toLowerCase());
    if (at !== -1 && (hitAt === -1 || at < hitAt)) hitAt = at;
  }
  if (hitAt === -1) return truncateText(cleaned, maxLen);
  const start = Math.max(0, hitAt - Math.floor(maxLen / 3));
  const snippet = cleaned.slice(start, start + maxLen).trim();
  return (start > 0 ? "…" : "") + snippet + (start + maxLen < cleaned.length ? "…" : "");
}

// Function words that match almost any passage; a passage must share a word
// other than these with the query to count as matched.
const PASSAGE_STOPWORDS = new Set(
  "a an and are as at be by can do does for from how i if in into is it its me my of on or so the this that to use using via what when where which with without you your".split(" ")
);

// Each word is kept whole and, when camelCase, also split into its parts
// ("SelectSource" -> "selectsource", "select", "source"), so API names match
// plain query words and lowercased identifiers alike.
function wordTokens(text) {
  const tokens = [];
  for (const word of String(text || "").split(/[^A-Za-z0-9]+/)) {
    if (!word) continue;
    tokens.push(word.toLowerCase());
    const parts = word.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(" ");
    if (parts.length > 1) tokens.push(...parts);
  }
  return tokens;
}

// True when the passage contains a query content word (compared by stem, with
// the query's synonym expansion). Semantic scores include the page title,
// summary, and tags, so the best chunk of a header-driven hit can be an
// unrelated or near-empty section; such chunks are not shown as passages.
function passageMatchesQuery(passage, terms) {
  const queryWords = expandQueryTokens(wordTokens(terms.join(" ")).filter((word) => !PASSAGE_STOPWORDS.has(word)));
  if (queryWords.length === 0) return false;
  const wanted = new Set(queryWords.map(stemToken));
  return wordTokens(passage).some((word) => wanted.has(stemToken(word)));
}

// Short snippet plus the full matched passage (capped) for one search hit.
// Both come from the passage only when it contains a query content word;
// otherwise the snippet comes from `fallbackSnippet` (e.g. the page summary)
// or is omitted, so an unrelated section is never shown as evidence.
function buildMatchFields(passage, terms, fallbackSnippet = "") {
  const fields = {};
  const matched = Boolean(passage) && passageMatchesQuery(passage, terms);
  const snippet = extractSnippet(matched ? passage : fallbackSnippet, terms);
  if (snippet) fields.matchedSnippet = snippet;
  if (matched) fields.matchedPassage = extractSnippet(passage, terms, PASSAGE_MAX_CHARS);
  return fields;
}

function buildEntryBaseText(entry) {
  const parts = [entry.title, entry.summary];
  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    parts.push(entry.tags.join(", "));
  }
  return normalizeText(parts.filter(Boolean).join("\n"));
}

function buildEmbeddingItems(resourceIndex, ragConfig) {
  const items = [];
  for (const entry of resourceIndex) {
    const baseText = buildEntryBaseText(entry);
    if (!baseText) continue;
    if (entry.embedText) {
      const chunks = chunkMarkdown(entry.embedText, ragConfig.chunkSize, ragConfig.chunkOverlap, ragConfig.maxChunksPerDoc);
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
          text: truncateText(combined, ragConfig.maxTextChars),
          // The chunk alone (heading path + body), without the page header that
          // is embedded with it; search returns this as the matched passage.
          passage: chunk
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

function buildIndexSignature({ pkgVersion, signatureData, ragConfig }) {
  return JSON.stringify({
    packageVersion: pkgVersion,
    resourceCount: signatureData.resourceCount,
    dcvCoreDocCount: signatureData.dcvCoreDocCount,
    dcvWebDocCount: signatureData.dcvWebDocCount,
    dcvMobileDocCount: signatureData.dcvMobileDocCount,
    dcvServerDocCount: signatureData.dcvServerDocCount,
    dbrWebDocCount: signatureData.dbrWebDocCount,
    dbrMobileDocCount: signatureData.dbrMobileDocCount,
    dbrServerDocCount: signatureData.dbrServerDocCount,
    dbrSharedDocCount: signatureData.dbrSharedDocCount,
    dwtDocCount: signatureData.dwtDocCount,
    ddvDocCount: signatureData.ddvDocCount,
    versions: signatureData.versions,
    dataSources: signatureData.dataSources,
    chunkSize: ragConfig.chunkSize,
    chunkOverlap: ragConfig.chunkOverlap,
    maxChunksPerDoc: ragConfig.maxChunksPerDoc,
    maxTextChars: ragConfig.maxTextChars,
    // Bump when the chunking strategy changes so cached vector indexes rebuild.
    chunkStrategy: "heading-aware-v2",
    // Bump when doc:// URIs change shape; cached vectors are keyed by URI.
    docUriScheme: "source-path-v1"
  });
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

function isRateLimitError(error, isRateLimitGeminiStatus) {
  if (error?.rateLimited) return true;
  const status = Number(error?.status);
  return isRateLimitGeminiStatus(status);
}

export {
  createFuseSearch,
  attachScore,
  normalizeSearchFilters,
  entryMatchesScope,
  normalizeText,
  truncateText,
  chunkText,
  chunkMarkdown,
  expandQueryTokens,
  stemToken,
  extractSnippet,
  buildMatchFields,
  PASSAGE_MAX_CHARS,
  buildEmbeddingItems,
  buildIndexSignature,
  normalizeVector,
  dotProduct,
  isRateLimitError
};
