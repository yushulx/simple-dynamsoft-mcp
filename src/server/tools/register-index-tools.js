import { z } from "zod";
import { formatScoreLabel, formatScoreNote } from "../helpers/server-helpers.js";
import {
  buildUnknownPublicProductResponse,
  isKnownPublicOffering,
  DBR_ONLY_EDITIONS_NOTE,
  PRODUCT_SELECTION_GUIDANCE,
  WEB_ONLY_OMIT_NOTE
} from "../public-offerings.js";
import { buildUnsupportedPublicScopeResponse } from "./public-routing.js";
import { validatePlatform, validateEdition } from "../normalizers.js";

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
  searchResources,
  normalizeSampleName,
  getSampleEntries,
  getSampleSuggestions
}) {
  // Build a resource_link description that lets an agent choose WITHOUT a
  // follow-up read: type | scope | version | score - summary, then the matched
  // snippet and canonical URL when available (issue #146).
  function buildHitDescription(entry) {
    const versionLabel = entry.version ? `v${entry.version}` : "n/a";
    const scopeLabel = formatScopeLabel(entry);
    const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
    const sampleHint = sampleId ? ` | sample_id: ${sampleId}` : "";
    const scoreLabel = formatScoreLabel(entry);
    let desc = `${entry.type.toUpperCase()} | ${scopeLabel} | ${versionLabel}${scoreLabel} - ${entry.summary}${sampleHint}`;
    if (entry.matchedSnippet) {
      const snippet = String(entry.matchedSnippet).replace(/\s+/g, " ").slice(0, 220);
      desc += ` — "${snippet}"`;
    }
    if (entry.type === "doc" && entry.url) {
      desc += ` | ${entry.url}`;
    }
    return desc;
  }

  function looksLikeSampleIdQuery(value) {
    const normalized = String(value || "").trim();
    if (!normalized) return false;
    return /[-_/]/.test(normalized);
  }

  server.registerTool(
    "get_index",
    {
      title: "Get Index",
      description: [
        "Get a compact index of the public Dynamsoft offerings, editions, platforms, versions, and available docs/samples.",
        "",
        "WHEN TO USE:",
        "- As the first call in any conversation to discover what is available.",
        `- To determine valid product/edition/platform combinations before calling other tools. Note: ${PRODUCT_SELECTION_GUIDANCE}`,
        "- To get public product-selection guidance (DBR for barcode-only; MRZ for machine-readable-zone workflows; MDS for document scan and normalization workflows).",
        "",
        "WHEN NOT TO USE:",
        "- Do not call get_index repeatedly; the index is static within a session.",
        "- If you already know the product/edition/platform, skip directly to search or get_quickstart.",
        "",
        "RETURNS: A JSON object with top-level keys: productSelection and products. productSelection contains guidance for choosing between public offerings, and products contains per-product entries (dbr, dwt, ddv, mrz, mds) with editions, platforms, latest versions, and counts of available docs and samples.",
        "",
        "PARAMETERS: None.",
        "",
        "EXAMPLE WORKFLOW:",
        "1. Call get_index to discover available products.",
        "2. Use the returned product/edition/platform values in search, list_samples, or get_quickstart.",
        "",
        "RELATED TOOLS: search (find specific resources), list_samples (browse samples), resolve_version (get exact version numbers)."
      ].join("\n"),
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(buildIndexData(), null, 2) }]
    })
  );

  server.registerTool(
    "search",
    {
      title: "Search",
      description: [
        "Search across documentation and samples using semantic (RAG) search with fuzzy fallback.",
        "",
        "WHEN TO USE:",
        "- To find docs or samples by keyword, topic, or exact sample ID.",
        "- To look up specific scenarios: MRZ scanning, barcode decoding, document normalization, document scanning, and viewer workflows.",
        "- When you have a natural-language question about a Dynamsoft SDK.",
        "- For sample lookup by exact ID (e.g. query='hello-world', type='sample').",
        "",
        "WHEN NOT TO USE:",
        "- To browse all samples in a scope, use list_samples instead.",
        "- To get starter code quickly, use get_quickstart instead.",
        "- If you do not know valid products/editions, call get_index first.",
        "",
        "PARAMETERS:",
        "- query (required): Keywords or exact sample ID. Examples: 'barcode scanning from camera', 'MRZ passport reader', 'hello-world'.",
        "- product: dbr, dwt, ddv, mrz, or mds. Use DBR for barcode-only, MRZ for passport/machine-readable-zone workflows, and MDS for document scan or normalization workflows.",
        `- edition: core, mobile, web, or server. ${DBR_ONLY_EDITIONS_NOTE}`,
        `- platform: only DBR spans multiple platforms (android, ios, js, python, cpp, java, dotnet, nodejs, react, vue, angular, flutter, react-native, maui, etc.). ${WEB_ONLY_OMIT_NOTE}`,
        "- version: Version constraint (e.g. '10', '11.x'). Only latest major is served by default.",
        "- type: 'doc', 'sample', 'index', 'policy', or 'any' (default). Use 'sample' to restrict to sample results.",
        "- limit: 1-10 (default 5). Max number of results.",
        "",
        "RETURNS: An MCP response whose content array includes a leading text summary item followed by zero or more resource_link items with URIs. Use resources/read to fetch full content of doc:// URIs. Use get_sample_files to fetch full project files for sample:// URIs.",
        "",
        "RELATED TOOLS: get_index (discover products first), list_samples (browse all samples), get_sample_files (retrieve full sample project files), resources/read (read a doc resource)."
      ].join("\n"),
      inputSchema: {
        query: z.string().trim().min(1, "Query is required.").describe("Keywords to search across docs and samples."),
        product: z.string().optional().describe("Product: dbr, dwt, ddv, mrz, mds"),
        edition: z.string().optional().describe(`Edition: core, mobile, web, server/desktop. ${DBR_ONLY_EDITIONS_NOTE}`),
        platform: z.string().optional().describe(`Platform (DBR only spans multiple): android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview, spm, core. ${WEB_ONLY_OMIT_NOTE}`),
        version: z.string().optional().describe("Version constraint (major or full version)"),
        type: z.enum(["doc", "sample", "index", "policy", "any"]).optional(),
        limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ query, product, edition, platform, version, type, limit }) => {
      const normalizedProduct = normalizeProduct(product);
      if (product && !isKnownPublicOffering(normalizedProduct)) {
        return buildUnknownPublicProductResponse(product);
      }

      // Validate filter values so a typo names the failing dimension instead of
      // silently filtering every result to zero (issue #152).
      const platformCheck = validatePlatform(platform);
      if (!platformCheck.ok) {
        return { isError: true, content: [{ type: "text", text: platformCheck.message }] };
      }
      const editionCheck = validateEdition(edition);
      if (!editionCheck.ok) {
        return { isError: true, content: [{ type: "text", text: editionCheck.message }] };
      }

      const normalizedPlatform = normalizePlatform(platform);
      const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
      const unsupportedScopeResponse = buildUnsupportedPublicScopeResponse(normalizedProduct, normalizedEdition, normalizedPlatform);
      if (unsupportedScopeResponse) return unsupportedScopeResponse;

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

      // Exact sample-ID fast path (when searching for samples)
      const effectiveType = type || "any";
      if (effectiveType === "sample" || effectiveType === "any") {
        const normalizedQuery = normalizeSampleName(query);
        const scopedSamples = getSampleEntries({
          product: normalizedProduct,
          edition: normalizedEdition,
          platform: normalizedPlatform
        });
        const exactMatches = scopedSamples.filter((entry) => {
          const entryId = getSampleIdFromUri(entry.uri);
          return entryId && entryId.toLowerCase() === normalizedQuery.toLowerCase();
        });
        if (exactMatches.length > 0) {
          const selected = exactMatches.slice(0, maxResults);
          const content = [
            {
              type: "text",
              text: `Found ${selected.length} exact match(es) for "${query}". Read the links you need with resources/read.`
            }
          ];

          for (const entry of selected) {
            const versionLabel = entry.version ? `v${entry.version}` : "n/a";
            const scopeLabel = formatScopeLabel(entry);
            const sampleId = getSampleIdFromUri(entry.uri);
            const sampleHint = sampleId ? ` | sample_id: ${sampleId}` : "";
            const scoreLabel = formatScoreLabel(entry);
            content.push({
              type: "resource_link",
              uri: entry.uri,
              name: entry.title,
              description: buildHitDescription(entry),
              mimeType: entry.mimeType,
              annotations: {
                audience: ["assistant"],
                priority: 0.8
              }
            });
          }

          const plainLines = selected.map((entry, index) => {
            const sampleId = getSampleIdFromUri(entry.uri);
            const action = "get_sample_files resource_uri";
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
      }

      const preferSampleSuggestionFallback =
        effectiveType === "sample" && looksLikeSampleIdQuery(query);

      const topResults = preferSampleSuggestionFallback
        ? []
        : await searchResources({
            query,
            product: normalizedProduct,
            edition: normalizedEdition,
            platform: normalizedPlatform,
            type: effectiveType,
            limit: maxResults
          });

      if (topResults.length === 0) {
        // Only try sample suggestions when searching samples or any type
        if (effectiveType === "sample" || effectiveType === "any") {
          const suggestions = await getSampleSuggestions({
            query,
            product: normalizedProduct,
            edition: normalizedEdition,
            platform: normalizedPlatform,
            limit: maxResults
          });

          if (suggestions.length > 0) {
            const content = [
              {
                type: "text",
                text: `No exact results for "${query}". Related samples:`
              }
            ];

            for (const entry of suggestions) {
              const versionLabel = entry.version ? `v${entry.version}` : "n/a";
              const scopeLabel = formatScopeLabel(entry);
              const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
              const sampleHint = sampleId ? ` | sample_id: ${sampleId}` : "";
              const scoreLabel = formatScoreLabel(entry);
              content.push({
                type: "resource_link",
                uri: entry.uri,
                name: entry.title,
                description: buildHitDescription(entry),
                mimeType: entry.mimeType,
                annotations: {
                  audience: ["assistant"],
                  priority: 0.6
                }
              });
            }

            const plainLines = suggestions.map((entry, index) => {
              const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
              const sampleNote = sampleId ? ` sample_id=${sampleId}` : "";
              const scoreNote = formatScoreNote(entry);
              return `- ${index + 1}. ${entry.uri}${sampleNote}${scoreNote}`;
            });
            content.push({
              type: "text",
              text: ["Plain URIs (copy/paste):", ...plainLines].join("\n")
            });

            return { content };
          }
        }

        return {
          content: [{
            type: "text",
            text: `No results for "${query}". Try get_index for available products or adjust filters.`
          }]
        };
      }

      // Capture Vision / DCV is the umbrella framework, not a selectable public
      // product — steer the agent to the right offering (issue #150).
      const dcvUmbrella = /\b(capture[\s-]?vision|dcv)\b/i.test(query) && !normalizedProduct;
      const leadText = dcvUmbrella
        ? `"Capture Vision" (DCV) is Dynamsoft's umbrella framework — pick the public product for your task: DBR (barcodes), MRZ (passports/IDs), MDS (document capture), DWT (scanner hardware), DDV (document viewer). Results below span the closest matches.\nFound ${topResults.length} result(s) for "${query}".`
        : `Found ${topResults.length} result(s) for "${query}". Read the links you need with resources/read.`;
      const content = [
        {
          type: "text",
          text: leadText
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
          description: buildHitDescription(entry),
          mimeType: entry.mimeType,
          annotations: {
            audience: ["assistant"],
            priority: 0.8
          }
        });
      }

      const plainLines = topResults.map((entry, index) => {
        const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
        const action = entry.type === "sample" ? "get_sample_files resource_uri" : "resources/read uri";
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
