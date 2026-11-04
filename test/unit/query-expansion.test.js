import test from "node:test";
import assert from "node:assert/strict";
import {
  expandQueryTokens,
  chunkMarkdown,
  extractSnippet,
  buildMatchFields
} from "../../src/rag/search-utils.js";
import { createLexicalProvider } from "../../src/rag/lexical-provider.js";
import { buildSearchResultsResponse, createHitDescriber, formatSearchPassages, searchResponseText } from "../../src/server/helpers/search-response.js";

test("#148: expandQueryTokens adds domain synonyms and stems", () => {
  const out = expandQueryTokens(["webcam"]);
  assert.ok(out.includes("camera"), "webcam should expand to camera");

  const scanExpanded = expandQueryTokens(["scanning"]);
  assert.ok(scanExpanded.includes("scan"), "scanning should stem to scan");
  assert.ok(scanExpanded.includes("decode") || scanExpanded.includes("read"), "scan should map to decode/read");

  const dm = expandQueryTokens(["datamatrix"]);
  assert.ok(dm.includes("data") && dm.includes("matrix"), "datamatrix should split into data + matrix");
});

test("#149: chunkMarkdown splits on headings and prepends heading path", () => {
  const doc = [
    "# Guide",
    "intro text here",
    "## Configure Scan Settings",
    "set the barcode formats and scan region for faster decoding",
    "## Camera",
    "use the webcam preview"
  ].join("\n");
  const chunks = chunkMarkdown(doc, 1200, 200, 24);
  assert.ok(chunks.length >= 2, "should produce multiple section chunks");
  const settingsChunk = chunks.find((c) => c.includes("scan region"));
  assert.ok(settingsChunk, "content past the first heading must be chunked");
  assert.match(settingsChunk, /Configure Scan Settings/, "chunk should carry its heading path");
});

test("#149: chunkMarkdown does not treat '#' comments inside code fences as headings", () => {
  const doc = [
    "# Install",
    "Run the installer.",
    "```bash",
    "# set your license key here",
    "export KEY=abc",
    "```",
    "Now initialize the SDK."
  ].join("\n");
  const chunks = chunkMarkdown(doc, 1200, 200, 24);
  // The prose after the fence must stay under 'Install', not the code comment.
  const proseChunk = chunks.find((c) => c.includes("initialize the SDK"));
  assert.ok(proseChunk, "post-fence prose should be chunked");
  // The heading-path prefix is the chunk's first line. It must be the real
  // heading, never the code comment.
  const headingPath = proseChunk.split("\n")[0];
  assert.equal(headingPath, "Install", "heading path must be the real heading");
  assert.doesNotMatch(headingPath, /set your license key/, "code comment must not become the heading path");
});

test("#147: doc body text is searchable via the lexical BM25 index", async () => {
  const entries = [
    {
      uri: "doc://a", type: "doc", product: "dbr", edition: "web", platform: "web",
      title: "Web API Reference", summary: "Programming > Javascript", tags: ["dbr"],
      embedText: "# Performance\nUse minImageCaptureInterval and setScanRegion to speed up decoding."
    },
    {
      uri: "doc://b", type: "doc", product: "dbr", edition: "web", platform: "web",
      title: "Getting Started", summary: "Intro", tags: ["dbr"],
      embedText: "Install the SDK and read your first barcode."
    }
  ];
  const provider = createLexicalProvider({
    entries,
    entryMatchesScope: () => true,
    attachScore: (entry) => entry
  });
  // 'minImageCaptureInterval' appears only in doc://a's BODY, not its title/summary.
  const results = await provider.search("minImageCaptureInterval", {}, 5);
  assert.equal(results[0].uri, "doc://a", "body-only term must retrieve the right doc");
});

test("#147b: out-of-scope fuzzy hit does not deflate in-scope ranking", async () => {
  const entries = [
    {
      uri: "doc://in", type: "doc", product: "mrz", edition: "web", platform: "web",
      title: "MRZ passport scanning", summary: "scan passport mrz", tags: ["mrz", "passport"]
    },
    {
      uri: "doc://out", type: "doc", product: "dbr", edition: "web", platform: "web",
      title: "passport-like barcode", summary: "passport barcode", tags: ["passport"]
    }
  ];
  const provider = createLexicalProvider({
    entries,
    entryMatchesScope: (entry, filters) => !filters.product || entry.product === filters.product,
    attachScore: (entry, score) => ({ ...entry, score })
  });
  const results = await provider.search("passport", { product: "mrz" }, 5);
  assert.equal(results.length, 1, "scope filter should keep only mrz");
  assert.equal(results[0].uri, "doc://in");
  assert.ok(results[0].score > 0, "in-scope score must not be deflated to zero");
});

test("#146: lexical results carry a matchedSnippet", async () => {
  const entries = [
    {
      uri: "doc://a", type: "doc", product: "dbr", edition: "web", platform: "web",
      title: "Scan region guide", summary: "how to set scan region", tags: ["dbr"],
      embedText: "To improve speed, call setScanRegion with the crop rectangle."
    }
  ];
  const provider = createLexicalProvider({
    entries,
    entryMatchesScope: () => true,
    attachScore: (entry) => entry
  });
  const results = await provider.search("setScanRegion", {}, 5);
  assert.ok(results[0].matchedSnippet, "result should include a matched snippet");
  assert.match(results[0].matchedSnippet, /setScanRegion/);
});

test("extractSnippet windows around the first term", () => {
  const text = "alpha beta gamma delta epsilon zeta eta theta";
  const snip = extractSnippet(text, ["gamma"], 20);
  assert.match(snip, /gamma/);
});

test("extractSnippet keeps text that fits whole, even when the first match is late", () => {
  const text = `Heading > Setup ${"filler ".repeat(100)}call init() here.`;
  assert.ok(text.length < 1500 && text.indexOf("init") > 500);
  assert.equal(extractSnippet(text, ["init"], 1500), text);
});

test("a passage sharing only function words with the query is not shown anywhere in the response", () => {
  const query = "how to set the license key";
  const terms = query.split(" ");
  const junk = "Security > How to configure the firewall";
  const doc = { type: "doc", title: "D", uri: "doc://d", summary: "Page summary", ...buildMatchFields(junk, terms) };
  assert.equal(doc.matchedPassage, undefined);
  assert.equal(doc.matchedSnippet, undefined);

  const text = searchResponseText(buildSearchResultsResponse({
    query,
    product: "dbr",
    results: [doc],
    contentMode: "passage",
    describeHit: createHitDescriber({ formatScopeLabel: () => "dbr", getSampleIdFromUri: () => "" }),
    getSampleIdFromUri: () => ""
  }));
  assert.doesNotMatch(text, /firewall/);

  // Lexical passes the page summary as the fallback snippet.
  assert.equal(buildMatchFields(junk, terms, "Page summary").matchedSnippet, "Page summary");
});

test("a passage naming the API in camelCase matches plain query words", () => {
  const fields = buildMatchFields("Acquire > DWTObject.SelectSourceAsync().then(() => DWTObject.AcquireImageAsync())", ["pick", "source"]);
  assert.match(fields.matchedPassage, /SelectSourceAsync/);
});

test("a passage matching a query word by stem is shown", () => {
  const fields = buildMatchFields("Scan > Call scan() on the router.", ["scanning", "barcodes"]);
  assert.match(fields.matchedPassage, /Call scan\(\)/);
});

test("matched passages are shown for docs only, not for samples", () => {
  const text = formatSearchPassages([
    { type: "sample", title: "S", uri: "sample://s", matchedPassage: "DBR web sample s" },
    { type: "doc", title: "D", uri: "doc://d", url: "https://www.dynamsoft.com/d", matchedPassage: "Doc body" }
  ]);
  assert.doesNotMatch(text, /sample:\/\/s/);
  assert.match(text, /\[2\] D \(doc:\/\/d\)\nSource: https:\/\/www\.dynamsoft\.com\/d\nDoc body/);
});
