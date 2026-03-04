import { z } from "zod";

export function registerSampleTools({
  server,
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
      description: "List available sample IDs and URIs for a given scope. Use DCV scope for MRZ/VIN/document normalization scenarios.",
      inputSchema: {
        product: z.string().optional().describe("Product: dcv, dbr, dwt, ddv"),
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
}
