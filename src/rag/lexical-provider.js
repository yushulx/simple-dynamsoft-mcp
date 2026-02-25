import Fuse from "fuse.js";

const DEFAULT_FUSE_OPTIONS = {
  keys: ["title", "summary", "tags", "uri"],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true
};

const BM25_K1 = 1.2;
const BM25_B = 0.75;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeScore(value, max) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return value / max;
}

function compareLexicalResults(a, b) {
  const scoreDelta = b.score - a.score;
  if (scoreDelta !== 0) return scoreDelta;
  const titleA = String(a.entry.title || "");
  const titleB = String(b.entry.title || "");
  const titleDelta = titleA.localeCompare(titleB);
  if (titleDelta !== 0) return titleDelta;
  return String(a.entry.uri || "").localeCompare(String(b.entry.uri || ""));
}

function buildBm25Index(entries) {
  const documents = [];
  const documentFrequency = new Map();
  let totalLength = 0;

  entries.forEach((entry, index) => {
    const haystack = [
      entry.title,
      entry.summary,
      Array.isArray(entry.tags) ? entry.tags.join(" ") : "",
      entry.uri
    ].join(" \n ");

    const tokens = tokenize(haystack);
    const termFreq = new Map();
    tokens.forEach((token) => {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    });

    const seen = new Set();
    for (const token of tokens) {
      if (seen.has(token)) continue;
      seen.add(token);
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }

    totalLength += tokens.length;
    documents.push({
      index,
      entry,
      length: tokens.length,
      termFreq
    });
  });

  const avgLength = documents.length > 0 ? totalLength / documents.length : 0;
  return {
    documents,
    documentFrequency,
    totalDocuments: documents.length,
    avgLength
  };
}

function computeBm25Score(indexState, docState, terms) {
  if (terms.length === 0) return 0;
  if (!docState.length || !indexState.avgLength) return 0;

  let score = 0;
  for (const term of terms) {
    const tf = docState.termFreq.get(term) || 0;
    if (!tf) continue;
    const df = indexState.documentFrequency.get(term) || 0;
    const idf = Math.log(1 + (indexState.totalDocuments - df + 0.5) / (df + 0.5));
    const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docState.length / indexState.avgLength));
    score += idf * ((tf * (BM25_K1 + 1)) / denom);
  }

  return score;
}

function createLexicalProvider({
  entries,
  entryMatchesScope,
  attachScore,
  fuseOptions = DEFAULT_FUSE_OPTIONS,
  bm25Weight = 0.7,
  fuseWeight = 0.3
}) {
  const fuse = new Fuse(entries, fuseOptions);
  const bm25Index = buildBm25Index(entries);
  const entryByUri = new Map(entries.map((entry) => [entry.uri, entry]));

  return {
    name: "lexical",
    search: async (query, filters, limit) => {
      const terms = [...new Set(tokenize(query))];
      const fuseHits = fuse.search(query);
      const fuseScoreByUri = new Map();
      let maxFuse = 0;

      for (const hit of fuseHits) {
        const candidateScore = Number.isFinite(hit.score) ? Math.max(0, 1 - hit.score) : 0;
        const current = fuseScoreByUri.get(hit.item.uri) || 0;
        if (candidateScore > current) {
          fuseScoreByUri.set(hit.item.uri, candidateScore);
          if (candidateScore > maxFuse) maxFuse = candidateScore;
        }
      }

      const bm25ScoreByUri = new Map();
      let maxBm25 = 0;

      for (const doc of bm25Index.documents) {
        if (!entryMatchesScope(doc.entry, filters)) continue;
        const score = computeBm25Score(bm25Index, doc, terms);
        if (score <= 0) continue;
        bm25ScoreByUri.set(doc.entry.uri, score);
        if (score > maxBm25) maxBm25 = score;
      }

      const scopedUris = new Set();
      for (const doc of bm25Index.documents) {
        if (!entryMatchesScope(doc.entry, filters)) continue;
        if (bm25ScoreByUri.has(doc.entry.uri) || fuseScoreByUri.has(doc.entry.uri)) {
          scopedUris.add(doc.entry.uri);
        }
      }

      const merged = [];
      for (const uri of scopedUris) {
        const entry = entryByUri.get(uri);
        if (!entry) continue;
        const bm25Norm = normalizeScore(bm25ScoreByUri.get(uri) || 0, maxBm25);
        const fuseNorm = normalizeScore(fuseScoreByUri.get(uri) || 0, maxFuse);
        const score = (bm25Norm * bm25Weight) + (fuseNorm * fuseWeight);
        merged.push({ entry, score });
      }

      merged.sort(compareLexicalResults);
      const ranked = merged.map((item) => attachScore(item.entry, item.score));
      if (limit) return ranked.slice(0, limit);
      return ranked;
    },
    warm: async () => {}
  };
}

export {
  tokenize,
  compareLexicalResults,
  createLexicalProvider
};
