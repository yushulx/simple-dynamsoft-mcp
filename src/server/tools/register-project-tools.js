import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { buildUnknownPublicProductResponse, isKnownPublicOffering } from "../public-offerings.js";
import { buildUnsupportedPublicScopeResponse } from "./public-routing.js";

export function registerProjectTools({
  server,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  normalizeApiLevel,
  normalizeSampleName,
  parseResourceUri,
  parseSampleUri,
  formatScopeLabel,
  getSampleIdFromUri,
  discoverDwtSamples,
  getMobileSamplePath,
  getWebSamplePath,
  getDbrServerSamplePath,
  getDcvMobileSamplePath,
  getDcvServerSamplePath,
  getDcvWebSamplePath,
  getMrzWebSamplePath,
  getMdsWebSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  getSampleSuggestions
}) {
  async function resolveDedicatedPublicWebSamplePath({
    product,
    platform,
    sampleName,
    getSamplePath,
    getSuggestions
  }) {
    const directPath = getSamplePath(undefined, sampleName);
    if (directPath && existsSync(directPath)) {
      return directPath;
    }

    const suggestions = await getSuggestions({
      query: sampleName,
      product,
      edition: "web",
      platform,
      limit: 10
    });

    const matchingEntry = suggestions.find((entry) => {
      if (entry.type !== "sample") return false;
      const parsed = parseSampleUri(entry.uri);
      return parsed?.product === product && parsed?.edition === "web" && parsed?.sampleName === sampleName;
    });

    if (!matchingEntry) {
      return directPath;
    }

    const parsed = parseSampleUri(matchingEntry.uri);
    return getSamplePath(parsed?.category, sampleName);
  }

  server.registerTool(
    "get_sample_files",
    {
      title: "Get Sample Files",
      description: [
        "Get the full project files for a known sample and return them inline as text.",
        "",
        "WHEN TO USE:",
        "- When you have a sample_id (from list_samples) or a sample:// resource_uri (from search) and need the complete source code.",
        "- When the user wants to see or scaffold a full sample project (multiple files, build configs, manifests).",
        "",
        "WHEN NOT TO USE:",
        "- If you do not have a sample_id or resource_uri yet, call list_samples or search first to discover one.",
        "- For doc:// URIs, use resources/read instead (this tool only handles sample:// URIs).",
        "- If the user just wants a quick code snippet, use get_quickstart instead.",
        "",
        "PARAMETERS:",
        "- product (required): dbr, dwt, ddv, mrz, or mds.",
        "- edition: mobile, web, or server.",
        "- platform: android, ios, js, python, cpp, java, dotnet, nodejs, react, vue, angular, flutter, react-native, maui, etc.",
        "- version: Version constraint. Latest major is used by default.",
        "- sample_id: Sample identifier as returned by list_samples (e.g. 'hello-world', 'ScanSingleBarcode'). Requires product/edition.",
        "- resource_uri: A sample:// URI as returned by search (e.g. 'sample://dbr/mobile/android/10/high-level/ScanSingleBarcode' or 'sample://mrz/server/python/3/mrz_scanner'). Preferred over sample_id when available.",
        "- api_level: 'high-level' or 'low-level' (DBR mobile only).",
        "",
        "RETURNS: A text block containing all project files inline, each under a heading with its relative path and wrapped in a fenced code block. Files larger than 50KB are excluded. No zip file is created.",
        "",
        "EXAMPLE: get_sample_files with resource_uri='sample://dbr/mobile/android/10/high-level/ScanSingleBarcode' returns all source files for the Android barcode scanning sample.",
        "",
        "RELATED TOOLS: list_samples (discover sample IDs), search (find samples by keyword), get_quickstart (quick single-file snippet)."
      ].join("\n"),
      inputSchema: {
        product: z.string().trim().min(1, "Product is required.").describe("Product: dbr, dwt, ddv, mrz, mds"),
        edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
        platform: z.string().optional().describe("Platform: android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
        version: z.string().optional().describe("Version constraint"),
        sample_id: z.string().optional().describe("Sample identifier (name or path)"),
        resource_uri: z.string().optional().describe("Resource URI returned by search"),
        api_level: z.string().optional().describe("API level: high-level or low-level (mobile only)")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ product, edition, platform, version, sample_id, resource_uri, api_level }) => {
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

      const normalizedProduct = normalizeProduct(sampleInfo?.product || product);
      if ((sampleInfo?.product || product) && !isKnownPublicOffering(normalizedProduct)) {
        return buildUnknownPublicProductResponse(sampleInfo?.product || product);
      }

      const normalizedPlatform = normalizePlatform(sampleInfo?.platform || platform);
      const normalizedEdition = normalizeEdition(sampleInfo?.edition || edition, normalizedPlatform, normalizedProduct);
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
        version,
        query: sample_id,
        edition: normalizedEdition,
        platform: normalizedPlatform
      });

      if (!policy.ok) {
        return { isError: true, content: [{ type: "text", text: policy.message }] };
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
          samplePath = getDbrServerSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if ((sampleInfo.product === "mrz" || sampleInfo.product === "mds") && sampleInfo.edition === "mobile") {
          samplePath = getDcvMobileSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if ((sampleInfo.product === "mrz" || sampleInfo.product === "mds") && sampleInfo.edition === "server") {
          samplePath = getDcvServerSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if ((sampleInfo.product === "mrz" || sampleInfo.product === "mds") && sampleInfo.edition === "web") {
          samplePath = sampleInfo.product === "mrz"
            ? getMrzWebSamplePath(sampleInfo.category, sampleInfo.sampleName)
            : getMdsWebSamplePath(sampleInfo.category, sampleInfo.sampleName);
        } else if (sampleInfo.product === "dcv" && sampleInfo.edition === "mobile") {
          samplePath = getDcvMobileSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if (sampleInfo.product === "dcv" && sampleInfo.edition === "server") {
          samplePath = getDcvServerSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if (sampleInfo.product === "dcv" && sampleInfo.edition === "web") {
          samplePath = getDcvWebSamplePath(sampleInfo.sampleName);
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
        } else if ((normalizedProduct === "mrz" || normalizedProduct === "mds") && normalizedEdition === "mobile") {
          const platformCandidates = normalizedPlatform
            ? [normalizedPlatform]
            : ["android", "ios", "react-native", "flutter", "maui", "spm"];
          for (const platformCandidate of platformCandidates) {
            const candidate = getDcvMobileSamplePath(platformCandidate, sampleName);
            if (candidate && existsSync(candidate)) {
              samplePath = candidate;
              break;
            }
          }
        } else if ((normalizedProduct === "mrz" || normalizedProduct === "mds") && normalizedEdition === "web") {
          samplePath = await resolveDedicatedPublicWebSamplePath({
            product: normalizedProduct,
            platform: normalizedPlatform,
            sampleName,
            getSamplePath: normalizedProduct === "mrz" ? getMrzWebSamplePath : getMdsWebSamplePath,
            getSuggestions: getSampleSuggestions
          });
        } else if ((normalizedProduct === "mrz" || normalizedProduct === "mds") && normalizedEdition === "server") {
          samplePath = getDcvServerSamplePath(normalizedPlatform || "python", sampleName);
        } else if (normalizedProduct === "dcv" && normalizedEdition === "mobile") {
          const platformCandidates = normalizedPlatform
            ? [normalizedPlatform]
            : ["android", "ios", "react-native", "flutter", "maui", "spm"];
          for (const platformCandidate of platformCandidates) {
            const candidate = getDcvMobileSamplePath(platformCandidate, sampleName);
            if (candidate && existsSync(candidate)) {
              samplePath = candidate;
              break;
            }
          }
        } else if (normalizedProduct === "dcv" && normalizedEdition === "web") {
          samplePath = getDcvWebSamplePath(sampleName);
        } else if (normalizedProduct === "dcv" && normalizedEdition === "server") {
          samplePath = getDcvServerSamplePath(normalizedPlatform || "python", sampleName);
        } else if (normalizedProduct === "dbr" && normalizedEdition === "web") {
          samplePath = getWebSamplePath(undefined, sampleName);
        } else if (normalizedProduct === "dbr" && normalizedEdition === "server") {
          samplePath = getDbrServerSamplePath(normalizedPlatform || "python", sampleName);
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
        ".js", ".jsx", ".ts", ".tsx", ".vue", ".cjs", ".html", ".css", ".py"
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
        `# Sample Files: ${sampleLabel}`,
        "",
        "Below are the retrieved sample project files.",
        "Note: Files are returned inline and no downloadable zip is created.",
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
}
