import { z } from "zod";
import {
  buildUnknownPublicProductResponse,
  isKnownPublicOffering,
  DBR_ONLY_EDITIONS_NOTE,
  WEB_ONLY_OMIT_NOTE
} from "../public-offerings.js";

export function registerVersionTools({
  server,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  LATEST_MAJOR,
  LATEST_VERSIONS
}) {
  function buildPublicWebVersionResponse(product, edition, platform) {
    const label = product === "mrz" ? "MRZ" : "MDS";
    const supportedEditions = [{ key: "web", name: "Web", version: LATEST_VERSIONS[product].web }];
    const supportedEditionKeys = supportedEditions.map((entry) => entry.key).join(", ");

    if (!edition) {
      const lines = [
        `# ${label} Version Resolution`,
        `- Latest major: v${LATEST_MAJOR[product]}`,
        ...supportedEditions.map((entry) => `- ${entry.name}: ${entry.version}`),
        "",
        "Specify edition/platform to resolve a single version."
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    const supportedEdition = supportedEditions.find((entry) => entry.key === edition);
    if (!supportedEdition) {
      return {
        isError: true,
        content: [{ type: "text", text: `Edition "${edition}" is not hosted by this MCP server. Supported editions: ${supportedEditionKeys}.` }]
      };
    }

    const displayPlatform = platform === "web" ? "js" : platform;
    const lines = [
      `# ${label} Version Resolution`,
      `- Edition: ${edition}`,
      displayPlatform ? `- Platform: ${displayPlatform}` : "",
      `- Latest major: v${LATEST_MAJOR[product]}`,
      `- Resolved version: ${supportedEdition.version}`
    ].filter(Boolean);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  server.registerTool(
    "resolve_version",
    {
      title: "Resolve Version",
      description: [
        "Resolve a concrete latest-major version number for a Dynamsoft product/edition/platform.",
        "",
        "WHEN TO USE:",
        "- To get the exact current version string (e.g. '10.4.2001') for use in package installation or dependency pinning.",
        "- When the user asks 'what is the latest version of DBR?'.",
        "- To verify version compatibility before generating project scaffolding.",
        "",
        "WHEN NOT TO USE:",
        "- If you just need sample code, use get_quickstart (it already includes the correct version).",
        "- For browsing docs or samples, use search or list_samples (they already scope to latest major).",
        "",
        "PARAMETERS:",
        "- product (required): dbr, dwt, ddv, mrz, or mds.",
        `- edition: core, mobile, web, or server. ${DBR_ONLY_EDITIONS_NOTE} Omit to see all editions for the product.`,
        `- platform: only DBR spans multiple platforms (android, ios, js, python, cpp, java, dotnet, nodejs, etc.). ${WEB_ONLY_OMIT_NOTE} Helps narrow edition when ambiguous.`,
        "- constraint: Version constraint like 'latest', '11.x', '10'. Only latest major version is served; legacy versions (e.g. DBR v9) return an error with migration guidance.",
        "- feature: Optional feature hint for version policy checks.",
        "",
        "RETURNS: A text block showing the resolved version. For MRZ/MDS without an edition, returns the backed public version matrix. For DBR without an edition, returns all edition versions. For DWT/DDV, returns the single web version.",
        "",
        "EXAMPLE: resolve_version with product='dbr', edition='web' returns the latest DBR web SDK version string.",
        "",
        "RELATED TOOLS: get_quickstart (includes version in starter code), get_index (shows version overview)."
      ].join("\n"),
      inputSchema: {
        product: z.string().trim().min(1, "Product is required.").describe("Product: dbr, dwt, ddv, mrz, mds"),
        edition: z.string().optional().describe(`Edition: core, mobile, web, server/desktop. ${DBR_ONLY_EDITIONS_NOTE}`),
        platform: z.string().optional().describe(`Platform (DBR only spans multiple): android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview, spm, core. ${WEB_ONLY_OMIT_NOTE}`),
        constraint: z.string().optional().describe("Version constraint, e.g., latest, 11.x, 10"),
        feature: z.string().optional().describe("Optional feature hint")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ product, edition, platform, constraint, feature }) => {
      const normalizedProduct = normalizeProduct(product);
      if (product && !isKnownPublicOffering(normalizedProduct)) {
        return buildUnknownPublicProductResponse(product);
      }

      const normalizedPlatform = normalizePlatform(platform);
      const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

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

      if (normalizedProduct === "mrz" || normalizedProduct === "mds") {
        return buildPublicWebVersionResponse(normalizedProduct, normalizedEdition, normalizedPlatform);
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
}
