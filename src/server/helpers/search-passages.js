// Matched passages inlined in search results, so an agent can answer from the
// relevant section without a read_document round trip. Only the top hits get
// one (each capped by PASSAGE_MAX_CHARS in src/rag/search-utils.js); full pages
// stay behind read_document.
const SEARCH_PASSAGE_COUNT = 3;

function formatSearchPassages(results, count = SEARCH_PASSAGE_COUNT) {
  const blocks = results
    .slice(0, count)
    .map((entry, index) => ({ entry, rank: index + 1 }))
    .filter(({ entry }) => entry.matchedPassage)
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

export { SEARCH_PASSAGE_COUNT, formatSearchPassages };
