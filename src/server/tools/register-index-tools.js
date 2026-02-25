import { z } from "zod";
import { formatScoreLabel, formatScoreNote } from "../helpers/server-helpers.js";

export function registerIndexTools({
  server,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  buildIndexData,
  getSampleIdFromUri,
  formatScopeLabel,
  searchResources
}) {
  server.registerTool(
    "get_index",
    {
      title: "Get Index",
      description: "Get a compact index of products, editions, versions, samples/docs, plus DBR-vs-DCV selection guidance.",
      inputSchema: {}
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(buildIndexData(), null, 2) }]
    })
  );

  server.registerTool(
    "search",
    {
      title: "Search",
      description: "Semantic (RAG) search across docs and samples with fuzzy fallback; returns resource links for lazy loading. Prefer DCV for MRZ/VIN/document-normalization/driver-license scenarios; DBR for barcode-only.",
      inputSchema: {
        query: z.string().describe("Keywords to search across docs and samples."),
        product: z.string().optional().describe("Product: dcv, dbr, dwt, ddv"),
        edition: z.string().optional().describe("Edition: core, mobile, web, server/desktop"),
        platform: z.string().optional().describe("Platform: android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview, spm, core"),
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

      await ensureScopeHydrated({
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        type: type || "any"
      });

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
}
