import { formatScoreLabel, formatScoreNote } from "./server-helpers.js";
import { resolveSearchScope } from "../normalizers.js";

// Runs a search in the scope resolveSearchScope picks (see normalizers.js).
// An edition read from the query never hides every result: with no results
// it searches again across all editions. `filters` are already normalized.
async function runScopedSearch(searchResources, { query, product, edition, platform, ...rest }) {
  const scope = resolveSearchScope({ query, product, edition, platform });
  const results = await searchResources({ query, product, edition: scope.edition, platform, ...rest });
  if (!scope.inferredFrom) return { results, scopeNote: "" };
  if (results.length === 0) {
    return { results: await searchResources({ query, product, edition, platform, ...rest }), scopeNote: "" };
  }
  return {
    results,
    scopeNote: `Searched the ${product.toUpperCase()} ${scope.edition} edition because the query names it; pass edition (or platform) explicitly to search another edition.`
  };
}

// Matched passages are inlined for the top doc results, so an agent can answer
// from the relevant section without a read_document round trip. Each passage
// is capped by PASSAGE_MAX_CHARS (src/rag/search-utils.js); full pages stay
// behind read_document. Samples are excluded: their indexed text is generated
// metadata (name, category, scenario tags), not content.
const SEARCH_PASSAGE_COUNT = 3;

function formatSearchPassages(results, count = SEARCH_PASSAGE_COUNT) {
  const blocks = results
    .slice(0, count)
    .map((entry, index) => ({ entry, rank: index + 1 }))
    .filter(({ entry }) => entry.type === "doc" && entry.matchedPassage)
    .map(({ entry, rank }) => {
      const source = entry.url ? `\nSource: ${entry.url}` : "";
      return `[${rank}] ${entry.title} (${entry.uri})${source}\n${entry.matchedPassage}`;
    });
  if (blocks.length === 0) return "";
  return [
    `Matched passages from the top ${count} results (call read_document for the full page):`,
    ...blocks
  ].join("\n\n");
}

// A resource_link description that lets an agent choose WITHOUT a follow-up
// read: type | scope | version | score - summary, then the matched snippet and
// canonical URL when available (issue #146).
function createHitDescriber({ formatScopeLabel, getSampleIdFromUri }) {
  return function describeHit(entry) {
    const versionLabel = entry.version ? `v${entry.version}` : "n/a";
    const scopeLabel = formatScopeLabel(entry);
    const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
    const sampleHint = sampleId ? ` | sample_id: ${sampleId}` : "";
    const scoreLabel = formatScoreLabel(entry);
    const sharedLabel = entry.type === "doc" && Array.isArray(entry.tags) && entry.tags.includes("shared")
      ? ` | shared Capture Vision API used by DBR (DCV v${entry.sourceVersion || "n/a"})`
      : "";
    let desc = `${entry.type.toUpperCase()} | ${scopeLabel} | ${versionLabel}${sharedLabel}${scoreLabel} - ${entry.summary}${sampleHint}`;
    if (entry.matchedSnippet) {
      const snippet = String(entry.matchedSnippet).replace(/\s+/g, " ").slice(0, 220);
      desc += ` — "${snippet}"`;
    }
    if (entry.type === "doc" && entry.url) {
      desc += ` | ${entry.url}`;
    }
    return desc;
  };
}

// The search tool's response for ranked results: lead text, one resource_link
// per hit, matched passages (unless contentMode is "none"), plain URI list.
// `product` is the normalized product filter (empty when none was given);
// `scopeNote` explains a search scope the server chose (empty when none).
function buildSearchResultsResponse({ query, product, scopeNote = "", results, contentMode, describeHit, getSampleIdFromUri }) {
  const passages = contentMode === "none" ? "" : formatSearchPassages(results);
  const linkGuidance = "call read_document with the exact uri of a doc:// result for the full page, or get_sample_files with resource_uri for a sample:// result.";
  const readGuidance = passages
    ? `Matched passages of the top results follow the links; when they do not cover the question, ${linkGuidance}`
    : `To read a result, ${linkGuidance}`;
  const found = `Found ${results.length} result(s) for "${query}".${scopeNote ? ` ${scopeNote}` : ""} ${readGuidance}`;
  // Capture Vision / DCV is the umbrella framework, not a selectable public
  // product; steer the agent to the right offering (issue #150).
  const dcvUmbrella = /\b(capture[\s-]?vision|dcv)\b/i.test(query) && !product;
  const leadText = dcvUmbrella
    ? `"Capture Vision" (DCV) is Dynamsoft's umbrella framework — pick the public product for your task: DBR (barcodes), MRZ (passports/IDs), MDS (document capture), DWT (scanner hardware), DDV (document viewer). Results below span the closest matches.\n${found}`
    : found;

  const content = [{ type: "text", text: leadText }];
  for (const entry of results) {
    content.push({
      type: "resource_link",
      uri: entry.uri,
      name: entry.title,
      description: describeHit(entry),
      mimeType: entry.mimeType,
      annotations: {
        audience: ["assistant"],
        priority: 0.8
      }
    });
  }
  if (passages) {
    content.push({ type: "text", text: passages });
  }

  const plainLines = results.map((entry, index) => {
    const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
    const action = entry.type === "sample" ? "get_sample_files resource_uri" : "read_document uri";
    const sampleNote = sampleId ? ` sample_id=${sampleId}` : "";
    const scoreNote = formatScoreNote(entry);
    return `- ${index + 1}. ${entry.uri}${sampleNote}${scoreNote} (${action})`;
  });
  content.push({
    type: "text",
    text: ["Plain URIs (copy/paste):", ...plainLines].join("\n")
  });

  return { content };
}

// Everything an agent reads from a search response: text items plus each
// link's uri, name, and description.
function searchResponseText(response) {
  return response.content
    .map((item) => (item.type === "resource_link"
      ? [item.uri, item.name, item.description].filter(Boolean).join("\n")
      : item.text || ""))
    .join("\n\n");
}

export {
  SEARCH_PASSAGE_COUNT,
  formatSearchPassages,
  createHitDescriber,
  buildSearchResultsResponse,
  searchResponseText,
  runScopedSearch
};
