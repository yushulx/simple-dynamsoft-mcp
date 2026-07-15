import test from "node:test";
import assert from "node:assert/strict";
import {
  expandQueryTokens,
  chunkMarkdown,
  extractSnippet
} from "../../src/rag/search-utils.js";
import { createLexicalProvider } from "../../src/rag/lexical-provider.js";

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
