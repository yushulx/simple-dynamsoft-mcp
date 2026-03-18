import { z } from "zod";
import { buildUnknownPublicProductResponse, isKnownPublicOffering } from "../public-offerings.js";
import { buildUnsupportedPublicScopeResponse } from "./public-routing.js";

export function registerSampleTools({
  server,
  registry,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  getSampleEntries,
  getSampleIdFromUri,
  getDisplayEdition,
  getDisplayPlatform
}) {
  server.registerTool(
    "list_samples",
    {
      title: "List Samples",
      description: [
        "List all available sample IDs and URIs for a given product/edition/platform scope.",
        "",
        "WHEN TO USE:",
        "- To browse the full catalog of samples available for a product/edition/platform.",
        "- To discover sample IDs before calling get_sample_files.",
        "- When the user wants to see what samples exist without a specific keyword.",
        "- Use MRZ for passport and machine-readable-zone workflows, and MDS for document scan and normalization workflows.",
        "",
        "WHEN NOT TO USE:",
        "- If you have a specific keyword or topic, use search instead (it ranks results by relevance).",
        "- If you already have a sample ID or URI, go directly to get_sample_files.",
        "",
        "PARAMETERS:",
        "- product: dbr, dwt, ddv, mrz, or mds. Omit to list across all public offerings.",
        "- edition: core, mobile, web, or server. Omit to list across all editions.",
        "- platform: android, ios, js, python, cpp, java, dotnet, nodejs, react, vue, angular, flutter, react-native, maui, etc.",
        "- limit: 1-200 (default 50). Max number of results.",
        "",
        "RETURNS: A single text content item that starts with totals and plain URIs, then appends 'JSON:' followed by a JSON object with total count and sample entries. Each entry includes sample_id, uri (sample:// URI), product, edition, platform, version, title, and summary. Use sample_id or uri with get_sample_files to retrieve full project files.",
        "",
        "EXAMPLE: Call list_samples with product='dbr', edition='mobile', platform='android' to see all Android barcode reader samples.",
        "",
        "RELATED TOOLS: search (keyword-based discovery), get_sample_files (retrieve full project files for a sample), get_index (discover valid product/edition/platform combinations)."
      ].join("\n"),
      inputSchema: {
        product: z.string().optional().describe("Product: dbr, dwt, ddv, mrz, mds"),
        edition: z.string().optional().describe("Edition: core, mobile, web, server/desktop"),
        platform: z.string().optional().describe("Platform: android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview, spm, core"),
        limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50)")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ product, edition, platform, limit }) => {
      const normalizedProduct = normalizeProduct(product);
      if (product && !isKnownPublicOffering(normalizedProduct)) {
        return buildUnknownPublicProductResponse(product);
      }

      const normalizedPlatform = normalizePlatform(platform);
      const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
      const unsupportedScopeResponse = buildUnsupportedPublicScopeResponse(normalizedProduct, normalizedEdition, normalizedPlatform);
      if (unsupportedScopeResponse) return unsupportedScopeResponse;

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
}
