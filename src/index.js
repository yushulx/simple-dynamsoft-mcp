#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  registry,
  LATEST_VERSIONS,
  LATEST_MAJOR,
  discoverDwtSamples,
  findCodeFilesInSample,
  getMobileSamplePath,
  getPythonSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  readCodeFile,
  getMainCodeFile,
  ensureLatestMajor,
  parseResourceUri,
  parseSampleUri,
  getSampleIdFromUri,
  getSampleEntries,
  buildIndexData,
  getDisplayEdition,
  getDisplayPlatform,
  formatScopeLabel,
  getPinnedResources,
  readResourceContent,
  normalizePlatform,
  normalizeApiLevel,
  normalizeSampleName,
  normalizeProduct,
  normalizeEdition,
  resourceIndex,
  getWebSamplePath
} from "./resource-index.js";
import { searchResources, getSampleSuggestions, prewarmRagIndex, ragConfig } from "./rag.js";

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));

// ============================================================================
// MCP Server
// ============================================================================

const server = new McpServer({
  name: "simple-dynamsoft-mcp",
  version: pkg.version,
  description: "MCP server for latest major versions of Dynamsoft SDKs: Barcode Reader (Mobile/Server/Web), Dynamic Web TWAIN, and Document Viewer"
});

function formatScoreLabel(entry) {
  if (!Number.isFinite(entry?.score)) return "";
  return ` | score: ${entry.score.toFixed(3)}`;
}

function formatScoreNote(entry) {
  if (!Number.isFinite(entry?.score)) return "";
  return ` score=${entry.score.toFixed(3)}`;
}

// ============================================================================
// TOOL: get_index
// ============================================================================

server.registerTool(
  "get_index",
  {
    title: "Get Index",
    description: "Get a compact index of products, editions, versions, and available samples/docs.",
    inputSchema: {}
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(buildIndexData(), null, 2) }]
  })
);

// ============================================================================
// TOOL: search
// ============================================================================

server.registerTool(
  "search",
  {
    title: "Search",
    description: "Semantic (RAG) search across docs and samples with fuzzy fallback; returns resource links for lazy loading.",
    inputSchema: {
      query: z.string().describe("Keywords to search across docs and samples."),
      product: z.string().optional().describe("Product: dbr, dwt, ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      version: z.string().optional().describe("Version constraint (major or full version)"),
      type: z.enum(["doc", "sample", "index", "policy", "any"]).optional(),
      limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)")
    }
  },
  async ({ query, product, edition, platform, version, type, limit }) => {
    if (!query || !query.trim()) {
      return { isError: true, content: [{ type: "text", text: "Query is required." }] };
    }
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

    const policy = ensureLatestMajor({
      product: normalizedProduct,
      version,
      query,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    if (!policy.ok) {
      return { isError: true, content: [{ type: "text", text: policy.message }] };
    }

    const maxResults = Math.min(limit || 5, 10);
    const topResults = await searchResources({
      query,
      product: normalizedProduct,
      edition: normalizedEdition,
      platform: normalizedPlatform,
      type: type || "any",
      limit: maxResults
    });

    if (topResults.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No results for "${query}". Try get_index for available products or adjust filters.`
        }]
      };
    }

    const content = [
      {
        type: "text",
        text: `Found ${topResults.length} result(s) for "${query}". Read the links you need with resources/read.`
      }
    ];

    for (const entry of topResults) {
      const versionLabel = entry.version ? `v${entry.version}` : "n/a";
      const scopeLabel = formatScopeLabel(entry);
      const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
      const sampleHint = sampleId ? ` | sample_id: ${sampleId}` : "";
      const scoreLabel = formatScoreLabel(entry);
      content.push({
        type: "resource_link",
        uri: entry.uri,
        name: entry.title,
        description: `${entry.type.toUpperCase()} | ${scopeLabel} | ${versionLabel}${scoreLabel} - ${entry.summary}${sampleHint}`,
        mimeType: entry.mimeType,
        annotations: {
          audience: ["assistant"],
          priority: 0.8
        }
      });
    }

    const plainLines = topResults.map((entry, index) => {
      const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
      const action = entry.type === "sample" ? "generate_project resource_uri" : "resources/read uri";
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
);

// ============================================================================
// TOOL: list_samples
// ============================================================================

server.registerTool(
  "list_samples",
  {
    title: "List Samples",
    description: "List available sample IDs and URIs for a given scope.",
    inputSchema: {
      product: z.string().optional().describe("Product: dbr, dwt, ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50)")
    }
  },
  async ({ product, edition, platform, limit }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

    const policy = ensureLatestMajor({
      product: normalizedProduct,
      version: undefined,
      query: "",
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    if (!policy.ok) {
      return { isError: true, content: [{ type: "text", text: policy.message }] };
    }

    const samples = getSampleEntries({
      product: normalizedProduct,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    const maxResults = Math.min(limit || 50, 200);
    const selected = samples.slice(0, maxResults);

    const payload = selected.map((entry) => ({
      sample_id: getSampleIdFromUri(entry.uri),
      uri: entry.uri,
      product: entry.product,
      edition: getDisplayEdition(entry.edition),
      platform: getDisplayPlatform(entry.platform),
      version: entry.version,
      title: entry.title,
      summary: entry.summary
    }));

    const lines = [
      `Total matches: ${samples.length}`,
      `Returned: ${payload.length}`,
      "",
      "Plain URIs (copy/paste):",
      ...payload.map((item, index) => {
        const sampleNote = item.sample_id ? ` (sample_id: ${item.sample_id})` : "";
        return `- ${index + 1}. ${item.uri}${sampleNote}`;
      })
    ];

    const output = {
      total: samples.length,
      returned: payload.length,
      samples: payload
    };

    return {
      content: [{
        type: "text",
        text: `${lines.join("\n")}\n\nJSON:\n${JSON.stringify(output, null, 2)}`
      }]
    };
  }
);

// ============================================================================
// TOOL: resolve_sample
// ============================================================================

server.registerTool(
  "resolve_sample",
  {
    title: "Resolve Sample",
    description: "Resolve a sample_id (or sample URI) to matching sample URIs.",
    inputSchema: {
      sample_id: z.string().describe("Sample identifier or sample:// URI"),
      product: z.string().optional().describe("Product: dbr, dwt, ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)")
    }
  },
  async ({ sample_id, product, edition, platform, limit }) => {
    if (!sample_id || !sample_id.trim()) {
      return { isError: true, content: [{ type: "text", text: "sample_id is required." }] };
    }

    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

    const policy = ensureLatestMajor({
      product: normalizedProduct,
      version: undefined,
      query: sample_id,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    if (!policy.ok) {
      return { isError: true, content: [{ type: "text", text: policy.message }] };
    }

    if (sample_id.includes("://")) {
      const parsed = parseSampleUri(sample_id);
      if (!parsed) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: "sample_id looks like a URI but is not a valid sample:// URI. For doc:// URIs, use resources/read."
          }]
        };
      }
      const entry = resourceIndex.find((item) => item.uri === sample_id && item.type === "sample");
      if (!entry) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Sample URI not found in index: ${sample_id}. Use list_samples or search.`
          }]
        };
      }

      const payload = [{
        sample_id: getSampleIdFromUri(entry.uri),
        uri: entry.uri,
        product: entry.product,
        edition: getDisplayEdition(entry.edition),
        platform: getDisplayPlatform(entry.platform),
        version: entry.version,
        title: entry.title,
        summary: entry.summary
      }];

      const output = {
        query: sample_id,
        returned: payload.length,
        samples: payload
      };

      return {
        content: [{
          type: "text",
          text: [
            `Found ${payload.length} match(es) for "${sample_id}".`,
            "Plain URIs (copy/paste):",
            `- 1. ${entry.uri} (sample_id: ${payload[0].sample_id})`,
            "",
            "JSON:",
            JSON.stringify(output, null, 2)
          ].join("\n")
        }, {
          type: "resource_link",
          uri: entry.uri,
          name: entry.title,
          description: `SAMPLE | ${formatScopeLabel(entry)} | v${entry.version}${formatScoreLabel(entry)} | sample_id: ${payload[0].sample_id}`,
          mimeType: entry.mimeType,
          annotations: {
            audience: ["assistant"],
            priority: 0.8
          }
        }]
      };
    }

    const sampleQuery = normalizeSampleName(sample_id);
    const maxResults = Math.min(limit || 5, 10);

    const scopedSamples = getSampleEntries({
      product: normalizedProduct,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    let matches = scopedSamples.filter((entry) => {
      const entryId = getSampleIdFromUri(entry.uri);
      return entryId && entryId.toLowerCase() === sampleQuery.toLowerCase();
    });

    if (matches.length === 0) {
      matches = await searchResources({
        query: sample_id,
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        type: "sample",
        limit: maxResults
      });
    }

    const selected = matches.slice(0, maxResults);
    if (selected.length === 0) {
      const suggestions = await getSampleSuggestions({
        query: sample_id,
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        limit: maxResults
      });

      const content = [{
        type: "text",
        text: suggestions.length
          ? `No exact sample match for "${sample_id}". Related samples:`
          : `No samples found for "${sample_id}". Try list_samples or search.`
      }];

      for (const entry of suggestions) {
        const sampleId = getSampleIdFromUri(entry.uri);
        content.push({
          type: "resource_link",
          uri: entry.uri,
          name: entry.title,
          description: `${entry.type.toUpperCase()} | ${formatScopeLabel(entry)} | v${entry.version}${formatScoreLabel(entry)} | sample_id: ${sampleId || "n/a"}`,
          mimeType: entry.mimeType,
          annotations: {
            audience: ["assistant"],
            priority: 0.6
          }
        });
      }

      if (suggestions.length) {
        const plainLines = suggestions.map((entry, index) => {
          const sampleId = getSampleIdFromUri(entry.uri);
          const sampleNote = sampleId ? ` (sample_id: ${sampleId})` : "";
          const scoreNote = formatScoreNote(entry);
          return `- ${index + 1}. ${entry.uri}${sampleNote}${scoreNote}`;
        });
        content.push({
          type: "text",
          text: ["Plain URIs (copy/paste):", ...plainLines].join("\n")
        });
      }

      return { isError: true, content };
    }

    const payload = selected.map((entry) => ({
      sample_id: getSampleIdFromUri(entry.uri),
      uri: entry.uri,
      product: entry.product,
      edition: getDisplayEdition(entry.edition),
      platform: getDisplayPlatform(entry.platform),
      version: entry.version,
      title: entry.title,
      summary: entry.summary
    }));

    const lines = [
      `Found ${selected.length} match(es) for "${sample_id}".`,
      "Plain URIs (copy/paste):",
      ...selected.map((entry, index) => {
        const sampleId = getSampleIdFromUri(entry.uri);
        const sampleNote = sampleId ? ` (sample_id: ${sampleId})` : "";
        const scoreNote = formatScoreNote(entry);
        return `- ${index + 1}. ${entry.uri}${sampleNote}${scoreNote}`;
      })
    ];

    const output = {
      query: sample_id,
      returned: payload.length,
      samples: payload
    };

    const content = [{
      type: "text",
      text: `${lines.join("\n")}\n\nJSON:\n${JSON.stringify(output, null, 2)}`
    }];

    for (const entry of selected) {
      const sampleId = getSampleIdFromUri(entry.uri);
      content.push({
        type: "resource_link",
        uri: entry.uri,
        name: entry.title,
        description: `${entry.type.toUpperCase()} | ${formatScopeLabel(entry)} | v${entry.version}${formatScoreLabel(entry)} | sample_id: ${sampleId || "n/a"}`,
        mimeType: entry.mimeType,
        annotations: {
          audience: ["assistant"],
          priority: 0.8
        }
      });
    }

    return { content };
  }
);

// ============================================================================
// TOOL: resolve_version
// ============================================================================

server.registerTool(
  "resolve_version",
  {
    title: "Resolve Version",
    description: "Resolve a concrete latest-major version for a product/edition/platform.",
    inputSchema: {
      product: z.string().describe("Product: dbr, dwt, or ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      constraint: z.string().optional().describe("Version constraint, e.g., latest, 11.x, 10"),
      feature: z.string().optional().describe("Optional feature hint")
    }
  },
  async ({ product, edition, platform, constraint, feature }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

    if (!["dbr", "dwt", "ddv"].includes(normalizedProduct)) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown product "${product}". Use dbr, dwt, or ddv.` }]
      };
    }

    const policy = ensureLatestMajor({
      product: normalizedProduct,
      version: constraint,
      query: feature,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    if (!policy.ok) {
      return { isError: true, content: [{ type: "text", text: policy.message }] };
    }

    if (normalizedProduct === "dbr") {
      if (!normalizedEdition) {
        const lines = [
          "# DBR Version Resolution",
          `- Latest major: v${LATEST_MAJOR.dbr}`,
          `- Mobile: ${LATEST_VERSIONS.dbr.mobile}`,
          `- Web: ${LATEST_VERSIONS.dbr.web}`,
          `- Server/Desktop: ${LATEST_VERSIONS.dbr.server}`,
          "",
          "Specify edition/platform to resolve a single version."
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      const resolved = LATEST_VERSIONS.dbr[normalizedEdition];
      if (!resolved) {
        return {
          isError: true,
          content: [{ type: "text", text: `Edition "${normalizedEdition}" is not hosted by this MCP server.` }]
        };
      }

      const displayPlatform = normalizedPlatform === "web" ? "js" : normalizedPlatform;
      const lines = [
        "# DBR Version Resolution",
        `- Edition: ${normalizedEdition}`,
        displayPlatform ? `- Platform: ${displayPlatform}` : "",
        `- Latest major: v${LATEST_MAJOR.dbr}`,
        `- Resolved version: ${resolved}`
      ].filter(Boolean);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (normalizedProduct === "dwt") {
      const lines = [
        "# DWT Version Resolution",
        `- Latest major: v${LATEST_MAJOR.dwt}`,
        `- Resolved version: ${LATEST_VERSIONS.dwt.web}`
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    const lines = [
      "# DDV Version Resolution",
      `- Latest major: v${LATEST_MAJOR.ddv}`,
      `- Resolved version: ${LATEST_VERSIONS.ddv.web}`
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_quickstart
// ============================================================================

server.registerTool(
  "get_quickstart",
  {
    title: "Get Quickstart",
    description: "Opinionated quickstart for a target product/edition/platform.",
    inputSchema: {
      product: z.string().describe("Product: dbr, dwt, or ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      language: z.string().optional().describe("Language hint: kotlin, java, swift, js, ts, python, cpp, csharp, react, vue, angular"),
      version: z.string().optional().describe("Version constraint"),
      api_level: z.string().optional().describe("API level: high-level or low-level (mobile only)"),
      scenario: z.string().optional().describe("Scenario: camera, image, single, multiple, react, etc.")
    }
  },
  async ({ product, edition, platform, language, version, api_level, scenario }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
    const policy = ensureLatestMajor({
      product: normalizedProduct,
      version,
      query: scenario,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    if (!policy.ok) {
      return { isError: true, content: [{ type: "text", text: policy.message }] };
    }

    if (normalizedProduct === "dbr" && normalizedEdition === "server") {
      const sdkEntry = registry.sdks["dbr-python"];
      const scenarioLower = (scenario || "").toLowerCase();
      const sampleName = scenarioLower.includes("video") ? "video_decoding" : "read_an_image";
      const samplePath = getPythonSamplePath(sampleName);

      if (!existsSync(samplePath)) {
        return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName}.` }] };
      }

      const content = readCodeFile(samplePath);

      return {
        content: [{
          type: "text",
          text: [
            "# Quick Start: DBR Python",
            "",
            `**SDK Version:** ${sdkEntry.version}`,
            `**Trial License:** \`${registry.trial_license}\``,
            "",
            "## Install",
            "```bash",
            sdkEntry.platforms.python.installation.pip,
            "```",
            "",
            `## ${sampleName}.py`,
            "```python",
            content,
            "```",
            "",
            `Docs: ${sdkEntry.platforms.python.docs["user-guide"]}`
          ].join("\n")
        }]
      };
    }

    if (normalizedProduct === "dbr" && normalizedEdition === "web") {
      const sdkEntry = registry.sdks["dbr-web"];
      const scenarioLower = (scenario || "").toLowerCase();
      const sampleName = scenarioLower.includes("image") ? "read-an-image" : "hello-world";
      const samplePath = getWebSamplePath("root", sampleName);

      if (!samplePath || !existsSync(samplePath)) {
        return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName}.` }] };
      }

      const content = readCodeFile(samplePath);

      return {
        content: [{
          type: "text",
          text: [
            "# Quick Start: DBR Web",
            "",
            `**SDK Version:** ${sdkEntry.version}`,
            `**Trial License:** \`${registry.trial_license}\``,
            "",
            "## Option 1: CDN",
            "```html",
            `<script src="${sdkEntry.platforms.web.installation.cdn}"></script>`,
            "```",
            "",
            "## Option 2: NPM",
            "```bash",
            sdkEntry.platforms.web.installation.npm,
            "```",
            "",
            `## ${sampleName}.html`,
            "```html",
            content,
            "```",
            "",
            `Docs: ${sdkEntry.platforms.web.docs["user-guide"]}`
          ].join("\n")
        }]
      };
    }

    if (normalizedProduct === "dbr" && normalizedEdition === "mobile") {
      const sdkEntry = registry.sdks["dbr-mobile"];
      const targetPlatform = normalizedPlatform || "android";
      const level = normalizeApiLevel(api_level || scenario);
      const scenarioLower = (scenario || "").toLowerCase();

      let sampleName = "ScanSingleBarcode";
      if (scenarioLower.includes("multiple") || scenarioLower.includes("batch")) sampleName = "ScanMultipleBarcodes";
      else if (scenarioLower.includes("image") || scenarioLower.includes("file")) sampleName = "DecodeFromAnImage";

      if (level === "low-level") {
        if (sampleName === "ScanSingleBarcode" || sampleName === "ScanMultipleBarcodes") {
          sampleName = "DecodeWithCameraEnhancer";
        }
      }

      const samplePath = getMobileSamplePath(targetPlatform, level, sampleName);
      if (!existsSync(samplePath)) {
        return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName}.` }] };
      }

      const mainFile = getMainCodeFile(targetPlatform, samplePath);
      if (!mainFile) {
        return { isError: true, content: [{ type: "text", text: "Could not find main code file." }] };
      }

      const content = readCodeFile(mainFile.path);
      const langExt = mainFile.filename.split(".").pop();

      let deps = "";
      if (targetPlatform === "android") {
        deps = `
## Dependencies

**Project build.gradle**
\`\`\`groovy
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url "${registry.maven_url}" }
    }
}
\`\`\`

**App build.gradle**
\`\`\`groovy
dependencies {
    implementation 'com.dynamsoft:barcodereaderbundle:${sdkEntry.version}'
}
\`\`\`

**AndroidManifest.xml**
\`\`\`xml
<uses-permission android:name="android.permission.CAMERA" />
\`\`\``;
      } else {
        deps = `
## Dependencies

**Podfile**
\`\`\`ruby
platform :ios, '11.0'
use_frameworks!

target 'YourApp' do
  pod 'DynamsoftBarcodeReaderBundle'
end
\`\`\`

**Info.plist**
\`\`\`xml
<key>NSCameraUsageDescription</key>
<string>Camera access for barcode scanning</string>
\`\`\``;
      }

      const output = [
        "# Quick Start: DBR Mobile",
        "",
        `**SDK Version:** ${sdkEntry.version}`,
        `**API Level:** ${level}`,
        `**Trial License:** \`${registry.trial_license}\``,
        "",
        deps,
        "",
        `## ${mainFile.filename}`,
        "```" + langExt,
        content,
        "```",
        "",
        `Docs: ${sdkEntry.platforms[targetPlatform]?.docs[level]?.["user-guide"] || "N/A"}`
      ];

      return { content: [{ type: "text", text: output.join("\n") }] };
    }

    if (normalizedProduct === "dwt") {
      const sdkEntry = registry.sdks["dwt"];
      const samplePath = getDwtSamplePath("scan", "basic-scan");

      if (!samplePath || !existsSync(samplePath)) {
        return { isError: true, content: [{ type: "text", text: "Sample not found: basic-scan." }] };
      }

      const content = readCodeFile(samplePath);

      return {
        content: [{
          type: "text",
          text: [
            "# Quick Start: Dynamic Web TWAIN",
            "",
            `**SDK Version:** ${sdkEntry.version}`,
            `**Trial License:** \`${registry.trial_license}\``,
            "",
            "## Option 1: CDN",
            "```html",
            `<script src="${sdkEntry.platforms.web.installation.cdn}"></script>`,
            "```",
            "",
            "## Option 2: NPM",
            "```bash",
            sdkEntry.platforms.web.installation.npm,
            "```",
            "",
            "## basic-scan.html",
            "```html",
            content,
            "```",
            "",
            `Docs: ${sdkEntry.platforms.web.docs["user-guide"]}`
          ].join("\n")
        }]
      };
    }

    if (normalizedProduct === "ddv") {
      const sdkEntry = registry.sdks["ddv"];
      const hint = `${scenario || ""} ${language || ""}`.toLowerCase();
      let sampleName = "hello-world";

      if (hint.includes("react")) sampleName = "react-vite";
      else if (hint.includes("vue")) sampleName = "vue";
      else if (hint.includes("angular")) sampleName = "angular";
      else if (hint.includes("next")) sampleName = "next";

      const samplePath = getDdvSamplePath(sampleName);
      if (!samplePath || !existsSync(samplePath)) {
        return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName}.` }] };
      }

      let sampleContent = "";
      let fence = "text";
      const stat = statSync(samplePath);
      if (stat.isDirectory()) {
        const readmePath = join(samplePath, "README.md");
        if (existsSync(readmePath)) {
          sampleContent = readCodeFile(readmePath);
          fence = "markdown";
        } else {
          const codeFiles = findCodeFilesInSample(samplePath);
          if (codeFiles.length > 0) {
            const preferredNames = [
              "main.tsx",
              "main.jsx",
              "main.ts",
              "main.js",
              "App.tsx",
              "App.jsx",
              "App.vue"
            ];
            const preferred = codeFiles.find((file) => preferredNames.includes(file.filename)) || codeFiles[0];
            sampleContent = readCodeFile(preferred.path);
            fence = preferred.extension ? preferred.extension.replace(".", "") : "text";
          } else {
            sampleContent = "Sample found, but no code files detected.";
          }
        }
      } else {
        sampleContent = readCodeFile(samplePath);
        fence = extname(samplePath).replace(".", "") || "text";
      }

      return {
        content: [{
          type: "text",
          text: [
            "# Quick Start: Dynamsoft Document Viewer",
            "",
            `**SDK Version:** ${sdkEntry.version}`,
            `**Trial License:** \`${registry.trial_license}\``,
            "",
            "## Option 1: CDN",
            "```html",
            `<script src="${sdkEntry.platforms.web.installation.cdn}"></script>`,
            "```",
            "",
            "## Option 2: NPM",
            "```bash",
            sdkEntry.platforms.web.installation.npm,
            "```",
            "",
            `## ${sampleName}`,
            "```" + fence,
            sampleContent,
            "```",
            "",
            `Docs: ${sdkEntry.platforms.web.docs["user-guide"]}`
          ].join("\n")
        }]
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: "Unsupported product/edition for quickstart." }]
    };
  }
);

// ============================================================================
// TOOL: generate_project
// ============================================================================

server.registerTool(
  "generate_project",
  {
    title: "Generate Project",
    description: "Generate a project structure from a sample and return files inline (no zip/download).",
    inputSchema: {
      product: z.string().describe("Product: dbr, dwt, or ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      version: z.string().optional().describe("Version constraint"),
      sample_id: z.string().optional().describe("Sample identifier (name or path)"),
      resource_uri: z.string().optional().describe("Resource URI returned by search"),
      api_level: z.string().optional().describe("API level: high-level or low-level (mobile only)")
    }
  },
  async ({ product, edition, platform, version, sample_id, resource_uri, api_level }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

    const policy = ensureLatestMajor({
      product: normalizedProduct,
      version,
      query: sample_id,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    if (!policy.ok) {
      return { isError: true, content: [{ type: "text", text: policy.message }] };
    }

    let sampleInfo = null;
    if (resource_uri) {
      const parsed = parseResourceUri(resource_uri);
      if (!parsed) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: "resource_uri must be a sample://... URI. Use search or list_samples to get a valid sample URI."
          }]
        };
      }
      if (parsed.scheme !== "sample") {
        return {
          isError: true,
          content: [{
            type: "text",
            text: "resource_uri must use the sample:// scheme. For doc:// URIs, use resources/read instead."
          }]
        };
      }
      sampleInfo = parseSampleUri(resource_uri);
      if (!sampleInfo) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: "Invalid sample URI format. Use search or list_samples to obtain a valid sample:// URI."
          }]
        };
      }
    }

    let samplePath = null;
    let sampleLabel = "";
    let sampleQuery = "";

    if (sampleInfo) {
      sampleLabel = sampleInfo.sampleName || resource_uri;
      sampleQuery = sampleInfo.sampleName || sample_id || "";
      if (sampleInfo.product === "dbr" && sampleInfo.edition === "mobile") {
        samplePath = getMobileSamplePath(sampleInfo.platform, sampleInfo.level, sampleInfo.sampleName);
      } else if (sampleInfo.product === "dbr" && sampleInfo.edition === "web") {
        samplePath = getWebSamplePath(sampleInfo.category, sampleInfo.sampleName);
      } else if (sampleInfo.product === "dbr" && (sampleInfo.edition === "python" || sampleInfo.edition === "server")) {
        samplePath = getPythonSamplePath(sampleInfo.sampleName);
      } else if (sampleInfo.product === "dwt") {
        samplePath = getDwtSamplePath(sampleInfo.category, sampleInfo.sampleName);
      } else if (sampleInfo.product === "ddv") {
        samplePath = getDdvSamplePath(sampleInfo.sampleName);
      }
    } else if (sample_id) {
      if (!normalizedProduct || !normalizedEdition) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: "Specify product/edition or provide resource_uri. Use list_samples or get_index to discover valid scopes."
          }]
        };
      }

      const level = normalizeApiLevel(api_level);
      const sampleName = normalizeSampleName(sample_id);
      sampleLabel = sampleName;
      sampleQuery = sampleName;

      if (normalizedProduct === "dbr" && normalizedEdition === "mobile") {
        const targetPlatform = normalizedPlatform || "android";
        const primaryPath = getMobileSamplePath(targetPlatform, level, sampleName);
        const altLevel = level === "high-level" ? "low-level" : "high-level";
        const alternatePath = getMobileSamplePath(targetPlatform, altLevel, sampleName);
        samplePath = existsSync(primaryPath) ? primaryPath : (existsSync(alternatePath) ? alternatePath : null);
      } else if (normalizedProduct === "dbr" && normalizedEdition === "web") {
        samplePath = getWebSamplePath(undefined, sampleName);
      } else if (normalizedProduct === "dbr" && normalizedEdition === "server") {
        samplePath = getPythonSamplePath(sampleName);
      } else if (normalizedProduct === "dwt") {
        const categories = discoverDwtSamples();
        let foundCategory = "";
        for (const [category, samples] of Object.entries(categories)) {
          if (samples.includes(sampleName)) {
            foundCategory = category;
            break;
          }
        }
        samplePath = foundCategory ? getDwtSamplePath(foundCategory, sampleName) : null;
      } else if (normalizedProduct === "ddv") {
        samplePath = getDdvSamplePath(sampleName);
      }
    } else {
      return { isError: true, content: [{ type: "text", text: "Provide sample_id or resource_uri." }] };
    }

    if (!samplePath || !existsSync(samplePath)) {
      const suggestions = await getSampleSuggestions({
        query: sampleQuery,
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        limit: 5
      });

      const content = [{
        type: "text",
        text: [
          `Sample not found for "${sampleLabel}".`,
          suggestions.length ? "Related samples:" : "No related samples found. Try search or get_index."
        ].join("\n")
      }];

      for (const entry of suggestions) {
        const versionLabel = entry.version ? `v${entry.version}` : "n/a";
        const scopeLabel = formatScopeLabel(entry);
        const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
        const sampleHint = sampleId ? ` | sample_id: ${sampleId}` : "";
        content.push({
          type: "resource_link",
          uri: entry.uri,
          name: entry.title,
          description: `${entry.type.toUpperCase()} | ${scopeLabel} | ${versionLabel} - ${entry.summary}${sampleHint}`,
          mimeType: entry.mimeType,
          annotations: {
            audience: ["assistant"],
            priority: 0.6
          }
        });
      }

      if (suggestions.length) {
        const plainLines = suggestions.map((entry, index) => {
          const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
          const sampleNote = sampleId ? ` sample_id=${sampleId}` : "";
          return `- ${index + 1}. ${entry.uri}${sampleNote}`;
        });
        content.push({
          type: "text",
          text: ["Plain URIs (copy/paste):", ...plainLines].join("\n")
        });
      }

      return { isError: true, content };
    }

    const textExtensions = [
      ".java", ".kt", ".swift", ".m", ".h", ".xml", ".gradle", ".properties",
      ".pro", ".json", ".plist", ".storyboard", ".xib", ".gitignore", ".md",
      ".js", ".jsx", ".ts", ".tsx", ".vue", ".cjs", ".html", ".css"
    ];

    const files = [];
    const stat = statSync(samplePath);
    const rootDir = stat.isDirectory() ? samplePath : dirname(samplePath);

    function addFile(fullPath) {
      const ext = "." + fullPath.split(".").pop();
      const baseName = fullPath.split(/[\\/]/).pop();
      if (!textExtensions.includes(ext) && !["gradlew", "Podfile"].includes(baseName)) {
        return;
      }
      try {
        const content = readFileSync(fullPath, "utf-8");
        const normalized = content.replace(/\r\n/g, "\n");
        files.push({
          path: relative(rootDir, fullPath),
          content: normalized,
          ext: ext.replace(".", "")
        });
      } catch (e) {
        // Ignore binary or unreadable files
      }
    }

    function walk(dir) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (["build", ".gradle", ".idea", ".git", "node_modules", "Pods", "DerivedData", "__pycache__"].includes(entry)) {
          continue;
        }
        const fullPath = join(dir, entry);
        const entryStat = statSync(fullPath);
        if (entryStat.isDirectory()) {
          walk(fullPath);
        } else {
          addFile(fullPath);
        }
      }
    }

    if (stat.isDirectory()) {
      walk(samplePath);
    } else {
      addFile(samplePath);
    }

    const validFiles = files.filter((f) => f.content.length < 50000);

    const output = [
      `# Project Generation: ${sampleLabel}`,
      "",
      "This output contains the file structure for the project.",
      "Note: This tool returns files inline and does not create a downloadable zip.",
      ""
    ];

    for (const file of validFiles) {
      output.push(`## ${file.path}`);
      output.push("```" + (file.ext || "text"));
      output.push(file.content);
      output.push("```");
      output.push("");
    }

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);
// ============================================================================
// MCP Resources (tool-discovered, lazy-read)
// ============================================================================

server.server.registerCapabilities({
  resources: {
    listChanged: false,
    subscribe: true
  }
});

server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // Only surface a small, pinned set to avoid bloating the context window.
  const resources = getPinnedResources().map((r) => ({
    uri: r.uri,
    name: r.title,
    description: r.summary,
    mimeType: r.mimeType
  }));
  return { resources };
});

server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const parsed = parseResourceUri(request.params.uri);
  if (parsed && ["dbr", "dwt", "ddv"].includes(parsed.product)) {
    const policy = ensureLatestMajor({
      product: parsed.product,
      version: parsed.version,
      edition: parsed.edition,
      platform: parsed.platform
    });
    if (!policy.ok) {
      throw new Error(policy.message);
    }
  }
  const resource = await readResourceContent(request.params.uri);
  if (!resource) {
    throw new Error(`Resource not found: ${request.params.uri}`);
  }
  return { contents: [resource] };
});

server.server.setRequestHandler(SubscribeRequestSchema, async () => ({}));
server.server.setRequestHandler(UnsubscribeRequestSchema, async () => ({}));

// ============================================================================
// Start Server
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);

if (ragConfig.prewarm) {
  if (ragConfig.prewarmBlock) {
    await prewarmRagIndex();
  } else {
    void prewarmRagIndex();
  }
}
