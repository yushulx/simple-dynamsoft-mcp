import Fuse from "fuse.js";
import { buildMatchFields, chunkMarkdown, expandQueryTokens } from "./search-utils.js";

const DEFAULT_FUSE_OPTIONS = {
  keys: [
    { name: "title", weight: 3 },
    { name: "tags", weight: 2 },
    { name: "summary", weight: 1 }
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true
};

// Section size and overlap for body scoring; match the embedding chunking so
// lexical and Gemini see the same units, and so a term cut at a chunk boundary
// still appears whole in the neighbouring chunk.
const SECTION_CHARS = 1200;
const SECTION_OVERLAP_CHARS = 200;

// Field-weighted header: title/tags outrank summary; the URI's last slug
// segment is kept (it is often the most descriptive token) while scheme/version
// noise is dropped (issue #147).
function buildHeaderText(entry) {
  const title = entry.title || "";
  const tags = Array.isArray(entry.tags) ? entry.tags.join(" ") : "";
  const summary = entry.summary || "";
  const uriSlug = String(entry.uri || "").split("/").filter(Boolean).pop() || "";
  return [title, title, title, tags, tags, summary, uriSlug].join(" \n ");
}

// The whole body, split on headings (each section keeps its heading path), so
// content deep in long guides is searchable and a page is ranked by its best
// matching section instead of by one length-diluted blob.
function buildBodySections(entry) {
  if (!entry.embedText) return [];
  return chunkMarkdown(entry.embedText, SECTION_CHARS, SECTION_OVERLAP_CHARS, 0);
}

const MAX_SCOPED_FUSE_INDEXES = 64;

// Fuse matches long natural-language questions only through fragments of the
// pattern, giving a weak, noisy signal at a cost of seconds on large scopes.
// On the golden set (scripts/eval-retrieval.mjs), skipping it above this length
// kept recall, raised MRR, and cut warm p95 from ~2.2s to ~0.2s. BM25 carries
// long queries.
const MAX_FUSE_QUERY_CHARS = 64;

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

function buildBm25Stats(units) {
  const documentFrequency = new Map();
  let totalLength = 0;
  for (const unit of units) {
    unit.termFreq = new Map();
    for (const token of unit.tokens) {
      unit.termFreq.set(token, (unit.termFreq.get(token) || 0) + 1);
    }
    for (const token of unit.termFreq.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
    unit.length = unit.tokens.length;
    totalLength += unit.length;
    delete unit.tokens;
  }
  return {
    documentFrequency,
    totalDocuments: units.length,
    avgLength: units.length > 0 ? totalLength / units.length : 0
  };
}

// Two BM25 indexes: one header unit per entry, one unit per body section.
// A page scores header + best section.
function buildBm25Index(entries) {
  const documents = entries.map((entry, index) => ({
    index,
    entry,
    tokens: tokenize(buildHeaderText(entry)),
    sections: [],
    fallbackSnippet: entry.summary || entry.title || ""
  }));
  const sections = [];
  for (const doc of documents) {
    for (const text of buildBodySections(doc.entry)) {
      const section = { text, tokens: tokenize(text) };
      doc.sections.push(section);
      sections.push(section);
    }
  }
  return {
    documents,
    headerStats: buildBm25Stats(documents),
    sectionStats: buildBm25Stats(sections)
  };
}

function computeBm25Score(stats, unit, terms) {
  if (terms.length === 0) return 0;
  if (!unit.length || !stats.avgLength) return 0;

  let score = 0;
  for (const term of terms) {
    const tf = unit.termFreq.get(term) || 0;
    if (!tf) continue;
    const df = stats.documentFrequency.get(term) || 0;
    const idf = Math.log(1 + (stats.totalDocuments - df + 0.5) / (df + 0.5));
    const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (unit.length / stats.avgLength));
    score += idf * ((tf * (BM25_K1 + 1)) / denom);
  }

  return score;
}

function scoreDocument(index, doc, terms) {
  let best = null;
  let bestScore = 0;
  for (const section of doc.sections) {
    const score = computeBm25Score(index.sectionStats, section, terms);
    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }
  return {
    score: computeBm25Score(index.headerStats, doc, terms) + bestScore,
    passageText: best ? best.text : "",
    fallbackSnippet: doc.fallbackSnippet
  };
}

function createLexicalProvider({
  entries,
  entryMatchesScope,
  attachScore,
  fuseOptions = DEFAULT_FUSE_OPTIONS,
  bm25Weight = 0.7,
  fuseWeight = 0.3
}) {
  const bm25Index = buildBm25Index(entries);
  const entryByUri = new Map(entries.map((entry) => [entry.uri, entry]));
  // Fuse cost grows with the number of entries scanned, and its hits were
  // filtered by scope only afterwards. One Fuse index per scope keeps scoped
  // searches proportional to that scope; the scope set is small and bounded.
  const fuseByScope = new Map();
  const getScopedFuse = (filters) => {
    const key = [filters?.product, filters?.edition, filters?.platform, filters?.type].map((v) => v || "").join("|");
    let scoped = fuseByScope.get(key);
    if (!scoped) {
      scoped = new Fuse(entries.filter((entry) => entryMatchesScope(entry, filters || {})), fuseOptions);
      if (fuseByScope.size >= MAX_SCOPED_FUSE_INDEXES) {
        fuseByScope.delete(fuseByScope.keys().next().value);
      }
      fuseByScope.set(key, scoped);
    }
    return scoped;
  };

  return {
    name: "lexical",
    search: async (query, filters, limit) => {
      // Expand with domain synonyms/stems so vocabulary gaps (webcam/camera,
      // datamatrix/data matrix, scanning/scan) do not zero the BM25 component.
      const terms = expandQueryTokens([...new Set(tokenize(query))]);
      const fuseHits = query.length <= MAX_FUSE_QUERY_CHARS ? getScopedFuse(filters).search(query) : [];
      const fuseScoreByUri = new Map();

      for (const hit of fuseHits) {
        const candidateScore = Number.isFinite(hit.score) ? Math.max(0, 1 - hit.score) : 0;
        const current = fuseScoreByUri.get(hit.item.uri) || 0;
        if (candidateScore > current) {
          fuseScoreByUri.set(hit.item.uri, candidateScore);
        }
      }

      const bm25ScoreByUri = new Map();
      let maxBm25 = 0;
      // Compute maxFuse over IN-SCOPE hits only. Computing it over all hits let an
      // out-of-scope fuzzy match deflate every in-scope fuse contribution (issue #147).
      let maxFuse = 0;

      const matchByUri = new Map();
      for (const doc of bm25Index.documents) {
        if (!entryMatchesScope(doc.entry, filters)) continue;
        const { score, passageText, fallbackSnippet } = scoreDocument(bm25Index, doc, terms);
        matchByUri.set(doc.entry.uri, { passageText, fallbackSnippet });
        if (score > 0) {
          bm25ScoreByUri.set(doc.entry.uri, score);
          if (score > maxBm25) maxBm25 = score;
        }
        const fuseScore = fuseScoreByUri.get(doc.entry.uri) || 0;
        if (fuseScore > maxFuse) maxFuse = fuseScore;
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
      const ranked = merged.map((item) => {
        const match = matchByUri.get(item.entry.uri) || {};
        return {
          ...attachScore(item.entry, item.score),
          ...buildMatchFields(match.passageText, terms, match.fallbackSnippet)
        };
      });
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
