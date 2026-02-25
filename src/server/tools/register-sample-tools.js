import { z } from "zod";
import { formatScoreLabel, formatScoreNote } from "../helpers/server-helpers.js";

export function registerSampleTools({
  server,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  normalizeSampleName,
  parseSampleUri,
  resourceIndex,
  getSampleEntries,
  getSampleIdFromUri,
  getDisplayEdition,
  getDisplayPlatform,
  formatScopeLabel,
  searchResources,
  getSampleSuggestions
}) {
  server.registerTool(
    "list_samples",
    {
      title: "List Samples",
      description: "List available sample IDs and URIs for a given scope. Use DCV scope for MRZ/VIN/document normalization scenarios.",
      inputSchema: {
        product: z.string().optional().describe("Product: dcv, dbr, dwt, ddv"),
        edition: z.string().optional().describe("Edition: core, mobile, web, server/desktop"),
        platform: z.string().optional().describe("Platform: android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview, spm, core"),
        limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50)")
      }
    },
    async ({ product, edition, platform, limit }) => {
      const normalizedProduct = normalizeProduct(product);
      const normalizedPlatform = normalizePlatform(platform);
      const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

      await ensureScopeHydrated({
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        type: "sample"
      });

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

  server.registerTool(
    "resolve_sample",
    {
      title: "Resolve Sample",
      description: "Resolve a sample_id (or sample URI) to matching sample URIs.",
      inputSchema: {
        sample_id: z.string().describe("Sample identifier or sample:// URI"),
        product: z.string().optional().describe("Product: dcv, dbr, dwt, ddv"),
        edition: z.string().optional().describe("Edition: core, mobile, web, server/desktop"),
        platform: z.string().optional().describe("Platform: android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview, spm, core"),
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

      await ensureScopeHydrated({
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        type: "sample"
      });

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
}
