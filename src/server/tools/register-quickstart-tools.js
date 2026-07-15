import { existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { z } from "zod";
import {
  buildUnknownPublicProductResponse,
  isKnownPublicOffering,
  API_LEVEL_NOTE,
  DBR_ONLY_EDITIONS_NOTE,
  WEB_ONLY_OMIT_NOTE
} from "../public-offerings.js";
import { buildUnsupportedPublicScopeResponse } from "./public-routing.js";

export function registerQuickstartTools({
  server,
  registry,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  normalizeApiLevel,
  discoverDcvMobileSamples,
  discoverDcvWebSamples,
  findCodeFilesInSample,
  getMobileSamplePath,
  getDbrServerSamplePath,
  getDcvMobileSamplePath,
  getDcvServerSamplePath,
  getDcvWebSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  readCodeFile,
  getMainCodeFile,
  getWebSamplePath,
  getMrzWebSamplePath,
  getMdsWebSamplePath,
  getSampleSuggestions,
  getSampleIdFromUri,
  formatScopeLabel
}) {
  // Actionable miss response: instead of a bare "Sample not found", surface
  // related samples the agent can fetch next (mirrors get_sample_files). (#151)
  async function buildQuickstartMissResponse({ reason, product, edition, platform, scenario }) {
    const lines = [reason];
    let suggestions = [];
    if (typeof getSampleSuggestions === "function") {
      try {
        suggestions = await getSampleSuggestions({
          query: [scenario, product, edition, platform].filter(Boolean).join(" "),
          product,
          edition,
          platform,
          limit: 5
        });
      } catch {
        suggestions = [];
      }
    }
    const content = [{
      type: "text",
      text: suggestions.length
        ? `${reason}\nRelated samples you can fetch with get_sample_files or open with get_quickstart:`
        : `${reason}\nCall get_index to see valid product/edition/platform combinations, or search for a scenario.`
    }];
    for (const entry of suggestions) {
      const versionLabel = entry.version ? `v${entry.version}` : "n/a";
      const scopeLabel = typeof formatScopeLabel === "function" ? formatScopeLabel(entry) : `${entry.product}/${entry.edition}`;
      const sampleId = entry.type === "sample" && typeof getSampleIdFromUri === "function" ? getSampleIdFromUri(entry.uri) : "";
      const sampleHint = sampleId ? ` | sample_id: ${sampleId}` : "";
      content.push({
        type: "resource_link",
        uri: entry.uri,
        name: entry.title,
        description: `${entry.type.toUpperCase()} | ${scopeLabel} | ${versionLabel} - ${entry.summary}${sampleHint}`,
        mimeType: entry.mimeType,
        annotations: { audience: ["assistant"], priority: 0.6 }
      });
    }
    return { isError: true, content };
  }

  function getPublicWebQuickstartLinks(product) {
    if (product === "mrz") {
      return {
        docsUrl: "https://www.dynamsoft.com/mrz-scanner/docs/web/",
        samplesUrl: "https://github.com/Dynamsoft/mrz-scanner-javascript"
      };
    }

    if (product === "mds") {
      return {
        docsUrl: "https://www.dynamsoft.com/mobile-document-scanner/docs/web/",
        samplesUrl: "https://github.com/Dynamsoft/document-scanner-javascript"
      };
    }

    return { docsUrl: "", samplesUrl: "" };
  }

  function getPublicProductLabel(product) {
    if (product === "mrz") return "MRZ";
    if (product === "mds") return "MDS";
    if (product === "dbr") return "DBR";
    if (product === "dwt") return "DWT";
    if (product === "ddv") return "DDV";
    return String(product || "").toUpperCase();
  }

  function buildPublicReferenceQuickstart({ product, edition, platform, docsUrl, samplesUrl }) {
    const label = getPublicProductLabel(product);
    const scopeParts = [];
    for (const part of [edition, platform]) {
      if (!part || scopeParts.includes(part)) continue;
      scopeParts.push(part);
    }
    const scope = scopeParts.join(" / ") || "general";
    const lines = [
      `# Quick Start Redirect: ${label}`,
      "",
      `${label} is available as a public offering, but this ${scope} quickstart is currently served as reference links instead of an inline starter.`,
      "",
      "Reference links:",
      docsUrl ? `- Docs: ${docsUrl}` : "",
      samplesUrl ? `- Samples: ${samplesUrl}` : ""
    ].filter(Boolean);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  server.registerTool(
    "get_quickstart",
    {
      title: "Get Quickstart",
      description: [
        "Get an opinionated quickstart with installation instructions and working sample code for a target product/edition/platform.",
        "",
        "WHEN TO USE:",
        "- When the user wants to get started quickly with a Dynamsoft SDK.",
        "- To generate a ready-to-run code snippet with install commands, license key, and SDK version.",
        "- For scenario-specific starters: pass scenario='MRZ' for passport reading, 'document scan' for document normalization, or barcode/image hints for DBR.",
        "",
        "WHEN NOT TO USE:",
        "- If the user wants full project files (multiple source files, build configs), use get_sample_files instead.",
        "- If the user wants to browse available samples first, use search or list_samples.",
        "- If the user only needs version info, use resolve_version.",
        "",
        "PARAMETERS:",
        "- product (required): dbr, dwt, ddv, mrz, or mds.",
        `- edition: core, mobile, web, or server. ${DBR_ONLY_EDITIONS_NOTE} Inferred from platform if omitted.`,
        `- platform: only DBR spans multiple platforms (android, ios, js, python, cpp, java, dotnet, nodejs, react, vue, angular, flutter, react-native, maui, etc.). ${WEB_ONLY_OMIT_NOTE}`,
        "- language: kotlin, java, swift, js, ts, python, cpp, csharp, react, vue, angular. Helps select the best sample variant.",
        "- version: Version constraint. Latest major is used by default.",
        `- api_level: ${API_LEVEL_NOTE}`,
        "- scenario: MRZ, document scan, camera, image, single, multiple, react, vue, angular, etc. DBR web defaults to foundational guidance; MRZ and MDS return public workflow guidance where available.",
        "",
        "RETURNS: A formatted text block with SDK version, trial license key, install commands, and sample code. Ready to copy-paste.",
        "",
        "RELATED TOOLS: search (find specific docs or samples), get_sample_files (get full multi-file project), resolve_version (version numbers only)."
      ].join("\n"),
      inputSchema: {
        product: z.string().trim().min(1, "Product is required.").describe("Product: dbr, dwt, ddv, mrz, mds"),
        edition: z.string().optional().describe(`Edition: core, mobile, web, server/desktop. ${DBR_ONLY_EDITIONS_NOTE}`),
        platform: z.string().optional().describe(`Platform (DBR only spans multiple): android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview, spm, core. ${WEB_ONLY_OMIT_NOTE}`),
        language: z.string().optional().describe("Language hint: kotlin, java, swift, js, ts, python, cpp, csharp, react, vue, angular"),
        version: z.string().optional().describe("Version constraint"),
        api_level: z.string().optional().describe(`API level: ${API_LEVEL_NOTE}`),
        scenario: z.string().optional().describe("Scenario: camera, image, single, multiple, MRZ, document scan/normalization, driver license, react, etc.")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ product, edition, platform, language, version, api_level, scenario }) => {
      const normalizedProduct = normalizeProduct(product);
      if (product && !isKnownPublicOffering(normalizedProduct)) {
        return buildUnknownPublicProductResponse(product);
      }

      const normalizedPlatform = normalizePlatform(platform);
      const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
      const unsupportedScopeResponse = buildUnsupportedPublicScopeResponse(normalizedProduct, normalizedEdition, normalizedPlatform);
      if (unsupportedScopeResponse) return unsupportedScopeResponse;

      const isPublicDcvProduct = normalizedProduct === "mrz" || normalizedProduct === "mds";
      const effectiveProduct = isPublicDcvProduct ? "dcv" : normalizedProduct;
      const publicProductLabel = getPublicProductLabel(normalizedProduct);

      await ensureScopeHydrated({
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        type: "any"
      });

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

      if (effectiveProduct === "dcv") {
        const seededScenario = isPublicDcvProduct
          ? `${normalizedProduct === "mrz" ? "mrz" : "document scan"} ${scenario || ""} ${language || ""}`
          : `${scenario || ""} ${language || ""}`;
        const scenarioLower = seededScenario.toLowerCase();
        const effectiveEdition = normalizedEdition || (isPublicDcvProduct ? "web" : (normalizedPlatform ? normalizeEdition("", normalizedPlatform, "dcv") : "server"));

        function selectDcvServerSample(platformHint, hint) {
          const platformName = normalizePlatform(platformHint) || "python";
          if (platformName === "python") {
            if (hint.includes("mrz")) return "mrz_scanner";
            if (hint.includes("driver") || hint.includes("license")) return "driver_license_scanner";
            if (hint.includes("gs1")) return "gs1_ai_scanner";
            return "document_scanner";
          }
          if (platformName === "nodejs") {
            if (hint.includes("lambda")) return "lambda";
            if (hint.includes("pdf")) return "pdf-advanced";
            if (hint.includes("koa")) return "koa";
            return "express";
          }
          if (hint.includes("mrz")) return "MRZScanner";
          if (hint.includes("driver") || hint.includes("license")) return "DriverLicenseScanner";
          if (hint.includes("gs1")) return "GS1AIScanner";
          return "DocumentScanner";
        }

        function selectMobileSample(sampleNames, hint) {
          const lowerToName = new Map(sampleNames.map((name) => [String(name).toLowerCase(), name]));
          const candidates = hint.includes("mrz")
            ? ["scanmrz", "mrzscanner"]
            : (hint.includes("driver") || hint.includes("license"))
              ? ["driverlicensescanner"]
              : ["scandocument", "documentscanner"];
          for (const candidate of candidates) {
            if (lowerToName.has(candidate)) return lowerToName.get(candidate);
          }
          return sampleNames[0] || "";
        }

        function readBestSampleContent(samplePath) {
          if (!samplePath || !existsSync(samplePath)) return { text: "", fence: "text" };
          const sampleStat = statSync(samplePath);
          if (sampleStat.isFile()) {
            return {
              text: readCodeFile(samplePath),
              fence: extname(samplePath).replace(".", "") || "text"
            };
          }
          const readmePath = join(samplePath, "README.md");
          if (existsSync(readmePath)) return { text: readCodeFile(readmePath), fence: "markdown" };

          const codeFiles = findCodeFilesInSample(samplePath);
          if (codeFiles.length > 0) {
            const preferredNames = ["index.html", "index.js", "index.ts", "main.dart", "App.tsx", "MainActivity.kt", "MainActivity.java"];
            const preferred = codeFiles.find((file) => preferredNames.includes(file.filename)) || codeFiles[0];
            return {
              text: readCodeFile(preferred.path),
              fence: preferred.extension ? preferred.extension.replace(".", "") : "text"
            };
          }

          return { text: "Sample found, but no code files detected.", fence: "text" };
        }

        function formatInstallLines(installation) {
          if (!installation || typeof installation !== "object") return [];
          const lines = [];
          for (const value of Object.values(installation)) {
            if (typeof value === "string" && value.trim()) lines.push(value);
          }
          return lines;
        }

        if (effectiveEdition === "server") {
          const sdkEntry = registry.sdks["dcv-server"];
          const targetPlatform = normalizePlatform(normalizedPlatform || sdkEntry.default_platform || "python");

          if (isPublicDcvProduct) {
            return buildPublicReferenceQuickstart({
              product: normalizedProduct,
              edition: effectiveEdition,
              platform: targetPlatform,
              docsUrl: "https://www.dynamsoft.com/capture-vision/docs/server/",
              samplesUrl: sdkEntry.platforms?.[targetPlatform]?.samples?.repo || sdkEntry.platforms?.python?.samples?.repo || ""
            });
          }

          const sampleName = selectDcvServerSample(targetPlatform, scenarioLower);
          const samplePath = getDcvServerSamplePath(targetPlatform, sampleName);

          if (!samplePath || !existsSync(samplePath)) {
            return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName}.` }] };
          }

          const { text: sampleContent, fence } = readBestSampleContent(samplePath);
          const installLines = formatInstallLines(sdkEntry.platforms?.[targetPlatform]?.installation);

          return {
            content: [{
              type: "text",
              text: [
                `# Quick Start: ${isPublicDcvProduct ? publicProductLabel : "DCV Server"} (${targetPlatform})`,
                "",
                `**SDK Version:** ${sdkEntry.version}`,
                `**Trial License:** \`${registry.trial_license}\``,
                "",
                installLines.length ? "## Install" : "",
                installLines.length ? "```bash" : "",
                ...installLines,
                installLines.length ? "```" : "",
                installLines.length ? "" : "",
                `## ${sampleName}`,
                "```" + fence,
                sampleContent,
                "```",
                "",
                `Docs: ${sdkEntry.platforms?.[targetPlatform]?.docs?.["user-guide"] || "N/A"}`
              ].filter(Boolean).join("\n")
            }]
          };
        }

        if (effectiveEdition === "web") {
          const sdkEntry = registry.sdks["dcv-web"];
          if (isPublicDcvProduct) {
            // Serve the hydrated hello-world sample inline instead of link-only.
            // The dedicated web sample repos ship runnable starters (#136).
            const publicLinks = getPublicWebQuickstartLinks(normalizedProduct);
            const getDedicated = normalizedProduct === "mrz" ? getMrzWebSamplePath : getMdsWebSamplePath;
            let dedicatedSample = "hello-world";
            if (normalizedProduct === "mds" && (scenarioLower.includes("pdf"))) dedicatedSample = "scanning-to-pdf";
            else if (scenarioLower.includes("image") || scenarioLower.includes("file")) {
              dedicatedSample = normalizedProduct === "mrz" ? "use-file-input" : "image-file-scanning";
            }
            const dedicatedPath = typeof getDedicated === "function" ? getDedicated("root", dedicatedSample) : "";
            if (dedicatedPath && existsSync(dedicatedPath)) {
              const dedicatedContent = readCodeFile(dedicatedPath);
              const mrzFields = normalizedProduct === "mrz"
                ? "\n**Result fields** (`result.data`): firstName, lastName, documentNumber, dateOfExpiry, dateOfBirth, nationality, sex, issuingState.\n"
                : "";
              return {
                content: [{
                  type: "text",
                  text: [
                    `# Quick Start: ${publicProductLabel} Web`,
                    "",
                    `**SDK Version:** ${sdkEntry.version}`,
                    `**Trial License:** \`${registry.trial_license}\``,
                    mrzFields,
                    `## Sample: ${dedicatedSample}.html`,
                    "```html",
                    dedicatedContent,
                    "```",
                    "",
                    `Docs: ${publicLinks.docsUrl}`,
                    `More samples: ${publicLinks.samplesUrl}`
                  ].filter(Boolean).join("\n")
                }]
              };
            }
            // Fall back to reference links only if the sample is not hydrated.
            return buildPublicReferenceQuickstart({
              product: normalizedProduct,
              edition: effectiveEdition,
              platform: "web",
              docsUrl: publicLinks.docsUrl,
              samplesUrl: publicLinks.samplesUrl
            });
          }
          const available = discoverDcvWebSamples();
          const sampleName = isPublicDcvProduct
            ? (normalizedProduct === "mrz" ? "MRZScanner" : "DocumentScanner")
            : (available[0] || "DocumentScanner");
          const samplePath = getDcvWebSamplePath(sampleName);
          if (!samplePath || !existsSync(samplePath)) {
            return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName}.` }] };
          }
          const { text: sampleContent, fence } = readBestSampleContent(samplePath);
          const installLines = formatInstallLines(sdkEntry.platforms?.web?.installation);

          return {
            content: [{
              type: "text",
              text: [
                `# Quick Start: ${isPublicDcvProduct ? publicProductLabel : "DCV Web"}`,
                "",
                `**SDK Version:** ${sdkEntry.version}`,
                `**Trial License:** \`${registry.trial_license}\``,
                "",
                installLines.length ? "## Install" : "",
                installLines.length ? "```bash" : "",
                ...installLines,
                installLines.length ? "```" : "",
                installLines.length ? "" : "",
                `## ${sampleName}`,
                "```" + fence,
                sampleContent,
                "```",
                "",
                `Docs: ${sdkEntry.platforms?.web?.docs?.["user-guide"] || "N/A"}`
              ].filter(Boolean).join("\n")
            }]
          };
        }

        if (effectiveEdition === "mobile") {
          const sdkEntry = registry.sdks["dcv-mobile"];
          const targetPlatform = normalizePlatform(normalizedPlatform || sdkEntry.default_platform || "android");
          const sampleNames = discoverDcvMobileSamples(targetPlatform);
          const sampleName = selectMobileSample(sampleNames, scenarioLower);
          const samplePath = getDcvMobileSamplePath(targetPlatform, sampleName);

          if (!samplePath || !existsSync(samplePath)) {
            return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName || "N/A"}.` }] };
          }

          const { text: sampleContent, fence } = readBestSampleContent(samplePath);
          const installLines = formatInstallLines(sdkEntry.platforms?.[targetPlatform]?.installation);

          return {
            content: [{
              type: "text",
              text: [
                `# Quick Start: ${isPublicDcvProduct ? publicProductLabel : "DCV Mobile"} (${targetPlatform})`,
                "",
                `**SDK Version:** ${sdkEntry.version}`,
                `**Trial License:** \`${registry.trial_license}\``,
                "",
                installLines.length ? "## Install" : "",
                installLines.length ? "```bash" : "",
                ...installLines,
                installLines.length ? "```" : "",
                installLines.length ? "" : "",
                `## ${sampleName}`,
                "```" + fence,
                sampleContent,
                "```",
                "",
                `Docs: ${sdkEntry.platforms?.[targetPlatform]?.docs?.["user-guide"] || "N/A"}`
              ].filter(Boolean).join("\n")
            }]
          };
        }

        if (effectiveEdition === "core") {
          const sdkEntry = registry.sdks["dcv-core"];
          return {
            content: [{
              type: "text",
              text: [
                `# Quick Start: ${isPublicDcvProduct ? publicProductLabel : "DCV Core"}`,
                "",
                `**SDK Version:** ${sdkEntry.version}`,
                "",
                "DCV core docs aggregate architecture, parameters, and cross-product workflows.",
                `Docs: ${sdkEntry.platforms?.core?.docs?.introduction || "https://www.dynamsoft.com/capture-vision/docs/core/"}`
              ].join("\n")
            }]
          };
        }
      }

      if (normalizedProduct === "dbr" && normalizedEdition === "server") {
        const sdkEntry = registry.sdks["dbr-server"];
        const scenarioLower = (scenario || "").toLowerCase();
        const targetPlatform = normalizePlatform(normalizedPlatform) || "python";

        // Per-platform "hello world" sample names (repos differ in convention).
        const SERVER_DEFAULT_SAMPLE = {
          python: scenarioLower.includes("video") ? "video_decoding" : "read_an_image",
          nodejs: "express",
          java: scenarioLower.includes("video") ? "VideoDecoding" : "HelloWorld",
          cpp: scenarioLower.includes("video") ? "VideoDecoding" : "HelloWorld",
          dotnet: "HelloWorld"
        };
        const sampleName = SERVER_DEFAULT_SAMPLE[targetPlatform];
        if (!sampleName) {
          return await buildQuickstartMissResponse({
            reason: `DBR server quickstart is not available for platform "${targetPlatform}". Supported: python, nodejs, java, cpp, dotnet.`,
            product: "dbr", edition: "server", platform: targetPlatform, scenario
          });
        }

        const samplePath = getDbrServerSamplePath(targetPlatform, sampleName);
        if (!samplePath || !existsSync(samplePath)) {
          return await buildQuickstartMissResponse({
            reason: `DBR server sample "${sampleName}" not found for ${targetPlatform}.`,
            product: "dbr", edition: "server", platform: targetPlatform, scenario
          });
        }

        // java/cpp/dotnet/nodejs samples are project directories; python is a file.
        let contentFileName = sampleName;
        let contentPath = samplePath;
        if (statSync(samplePath).isDirectory()) {
          const codeFiles = findCodeFilesInSample(samplePath);
          const main = codeFiles.find((f) => /^(main|program|hello|read|index|app|server)/i.test(f.filename)) || codeFiles[0];
          if (!main) {
            return await buildQuickstartMissResponse({
              reason: `Found the ${sampleName} project for ${targetPlatform} but no primary source file inside it.`,
              product: "dbr", edition: "server", platform: targetPlatform, scenario
            });
          }
          contentPath = main.path;
          contentFileName = main.relativePath || main.filename;
        }
        const content = readCodeFile(contentPath);
        const platformLabel = { python: "Python", nodejs: "Node.js", java: "Java", cpp: "C++", dotnet: ".NET" }[targetPlatform] || targetPlatform;
        const installLines = [];
        const installObj = sdkEntry.platforms?.[targetPlatform]?.installation;
        if (installObj && typeof installObj === "object") {
          for (const value of Object.values(installObj)) {
            if (typeof value === "string" && value.trim()) installLines.push(value);
          }
        }
        const fence = { python: "python", nodejs: "javascript", java: "java", cpp: "cpp", dotnet: "csharp" }[targetPlatform] || "text";

        return {
          content: [{
            type: "text",
            text: [
              `# Quick Start: DBR Server (${platformLabel})`,
              "",
              `**SDK Version:** ${sdkEntry.version}`,
              `**Trial License:** \`${registry.trial_license}\``,
              "",
              installLines.length ? "## Install" : "",
              installLines.length ? "```bash" : "",
              ...installLines,
              installLines.length ? "```" : "",
              installLines.length ? "" : "",
              `## ${sampleName} — ${contentFileName}`,
              "```" + fence,
              content,
              "```",
              "",
              `Full project files: get_sample_files product=dbr edition=server platform=${targetPlatform} sample_id=${sampleName}`,
              `Docs: ${sdkEntry.platforms?.[targetPlatform]?.docs?.["user-guide"] || "N/A"}`
            ].filter(Boolean).join("\n")
          }]
        };
      }

      if (normalizedProduct === "dbr" && normalizedEdition === "web") {
        const sdkEntry = registry.sdks["dbr-web"];
        const scenarioLower = (scenario || "").toLowerCase();

        // Framework-specific starter: if the caller named a JS framework that ships
        // a project under frameworks/, serve runnable foundational code inline AND
        // point to the full framework project via get_sample_files. Framework
        // samples are multi-file Vite/CLI projects, so a single inlined file is not
        // standalone-runnable — the fetch pointer is how the agent gets the rest
        // (issue #134).
        const DBR_WEB_FRAMEWORKS = new Set(["react", "angular", "vue", "next", "nuxt", "svelte", "electron", "capacitor", "blazor", "es6", "native-ts", "pwa", "requirejs", "webview"]);
        if (normalizedPlatform && DBR_WEB_FRAMEWORKS.has(normalizedPlatform)) {
          const foundationalPath = getWebSamplePath("basics", "scan-a-single-barcode")
            || getWebSamplePath("basics", "hello-world");
          const foundationalCode = foundationalPath && existsSync(foundationalPath) ? readCodeFile(foundationalPath) : "";
          return {
            content: [{
              type: "text",
              text: [
                `# Quick Start: DBR Web (${normalizedPlatform})`,
                "",
                `**SDK Version:** ${sdkEntry.version}`,
                `**Trial License:** \`${registry.trial_license}\``,
                `**Starter profile:** ${normalizedPlatform} framework project available`,
                "",
                "## Install (npm)",
                "```bash",
                sdkEntry.platforms.web.installation.npm,
                "```",
                "",
                `## Full ${normalizedPlatform} project`,
                `A ready-to-run ${normalizedPlatform} sample ships with this MCP. Fetch all its files with:`,
                "```",
                `get_sample_files product=dbr edition=web platform=${normalizedPlatform} sample_id=frameworks/${normalizedPlatform}`,
                "```",
                foundationalCode ? "" : null,
                foundationalCode ? "## Foundational reference (vanilla JS — the same CaptureVisionRouter flow the framework sample wraps)" : null,
                foundationalCode ? "```html" : null,
                foundationalCode || null,
                foundationalCode ? "```" : null,
                "",
                `Docs: ${sdkEntry.platforms.web.docs["user-guide"]}`
              ].filter((line) => line !== null).join("\n")
            }]
          };
        }

        // Map the scenario to a foundational sample under basics/. Web has no
        // high-level vs low-level API split (api_level is a mobile-only concept),
        // so it is intentionally not consulted here.
        let sampleName;
        // The camera scenario fallback below substitutes a differently-named
        // scenarios/* sample, so it is only appropriate for the generic
        // camera/single/default request — not for requests that named a
        // specific starter (hello) or a different intent (image/file, which is
        // camera-based nowhere in scenarios/*). Those hard-error honestly when
        // their sample is absent.
        let allowCameraFallback = false;
        if (scenarioLower.includes("hello")) {
          sampleName = "hello-world";
        } else if (scenarioLower.includes("image") || scenarioLower.includes("file")) {
          sampleName = "read-an-image";
        } else {
          sampleName = "scan-a-single-barcode"; // camera / single / default
          allowCameraFallback = true;
        }

        // Foundational samples now live under basics/ upstream; getWebSamplePath
        // falls back to the repo root when basics/ is absent, so this stays
        // compatible with older sample sets that kept them at the root.
        let samplePath = getWebSamplePath("basics", sampleName);
        let fallbackSample = null;

        // Graceful degradation: a deployment may serve an older sample data set
        // that predates the foundational samples. Rather than hard-erroring,
        // fall back to a reliably-present camera scenario sample — but only when
        // the request is camera-intent (see allowCameraFallback above).
        if ((!samplePath || !existsSync(samplePath)) && allowCameraFallback) {
          for (const candidate of ["scan-common-1D-and-2D", "scan-qr-code"]) {
            const candidatePath = getWebSamplePath("scenarios", candidate);
            if (candidatePath && existsSync(candidatePath)) {
              samplePath = candidatePath;
              fallbackSample = candidate;
              break;
            }
          }
        }

        if (!samplePath || !existsSync(samplePath)) {
          return await buildQuickstartMissResponse({
            reason: `DBR web sample "${sampleName}" not found in the served sample set.`,
            product: "dbr", edition: "web", platform: normalizedPlatform, scenario
          });
        }

        const content = readCodeFile(samplePath);
        const displaySample = fallbackSample || sampleName;
        const sampleHeading = fallbackSample
          ? `## Sample: ${displaySample} (camera scenario fallback)`
          : `## Foundational sample: ${displaySample}`;
        const fallbackNoteLines = fallbackSample
          ? [`> Note: \`${sampleName}\` was not available in the served sample set; showing the \`${fallbackSample}\` camera scenario instead.`, ""]
          : [];

        return {
          content: [{
            type: "text",
            text: [
              "# Quick Start: DBR Web",
              "",
              `**SDK Version:** ${sdkEntry.version}`,
              `**Trial License:** \`${registry.trial_license}\``,
              "**Starter profile:** Foundational-first",
              "",
              "Use the foundational web flow first so capture and decoding remain explicit and easier to adapt.",
              "api_level does not apply to DBR web (it is a mobile-only distinction).",
              "",
              ...fallbackNoteLines,
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
              sampleHeading,
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

        const isCrossPlatform = ["flutter", "react-native", "maui"].includes(targetPlatform);
        const wantsImage = scenarioLower.includes("image") || scenarioLower.includes("file");
        const wantsDriverLicense = scenarioLower.includes("driver") || scenarioLower.includes("license") || scenarioLower.includes("licence");

        let sampleName;
        if (isCrossPlatform) {
          // Cross-platform repos use different sample names than Android/iOS. There
          // is no still-image decode sample in these editions (#132, #159).
          if (wantsImage) {
            return {
              content: [{
                type: "text",
                text: [
                  `# DBR ${targetPlatform}: still-image decoding`,
                  "",
                  `The ${targetPlatform} edition ships camera-stream barcode scanning, not a still-image/gallery decode sample.`,
                  "",
                  "Nearest options:",
                  "- Use the camera-based scanner below (ScanBarcodes_ReadyToUseComponent).",
                  "- For decoding a picked/gallery image, use the native Android/iOS `DecodeFromAnImage` sample (get_quickstart product=dbr edition=mobile platform=android scenario=image) and bridge it, or call the foundational API on a captured frame.",
                  "",
                  `Docs: ${sdkEntry.platforms[targetPlatform]?.docs?.[level]?.["user-guide"] || sdkEntry.platforms[targetPlatform]?.docs?.["high-level"]?.["user-guide"] || "N/A"}`
                ].join("\n")
              }]
            };
          }
          sampleName = wantsDriverLicense
            ? "ScanDriversLicense"
            : (level === "low-level" ? "ScanBarcodes_FoundationalAPI" : "ScanBarcodes_ReadyToUseComponent");
        } else {
          sampleName = "ScanSingleBarcode";
          if (scenarioLower.includes("multiple") || scenarioLower.includes("batch")) sampleName = "ScanMultipleBarcodes";
          else if (wantsImage) sampleName = "DecodeFromAnImage";

          if (level === "low-level") {
            if (sampleName === "ScanSingleBarcode" || sampleName === "ScanMultipleBarcodes") {
              sampleName = "DecodeWithCameraEnhancer";
            }
          }
        }

        // Prefer a Kotlin variant when the caller asked for Kotlin (#135).
        const wantsKotlin = String(language || "").toLowerCase() === "kotlin";
        let samplePath = "";
        let servedVariant = sampleName;
        if (wantsKotlin && targetPlatform === "android") {
          const ktPath = getMobileSamplePath(targetPlatform, level, `${sampleName}Kt`);
          if (existsSync(ktPath)) {
            samplePath = ktPath;
            servedVariant = `${sampleName}Kt`;
          }
        }
        if (!samplePath) samplePath = getMobileSamplePath(targetPlatform, level, sampleName);

        if (!existsSync(samplePath)) {
          return await buildQuickstartMissResponse({
            reason: `DBR mobile sample "${sampleName}" not found for ${targetPlatform}.`,
            product: "dbr", edition: "mobile", platform: targetPlatform, scenario
          });
        }

        const mainFile = getMainCodeFile(targetPlatform, samplePath);
        if (!mainFile) {
          return await buildQuickstartMissResponse({
            reason: `Found the ${servedVariant} sample for ${targetPlatform} but could not locate its main code file.`,
            product: "dbr", edition: "mobile", platform: targetPlatform, scenario
          });
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
        } else if (targetPlatform === "ios") {
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
        } else if (targetPlatform === "flutter") {
          deps = `
## Dependencies

**pubspec.yaml**
\`\`\`yaml
dependencies:
  dynamsoft_barcode_reader_bundle: ^${sdkEntry.version}
\`\`\`
Then run \`flutter pub get\`. Add camera usage permissions to AndroidManifest.xml and Info.plist.`;
        } else if (targetPlatform === "react-native") {
          deps = `
## Dependencies

\`\`\`bash
npm install dynamsoft-capture-vision-react-native
\`\`\`
Add camera permissions to AndroidManifest.xml and Info.plist, then rebuild the app.`;
        } else if (targetPlatform === "maui") {
          deps = `
## Dependencies

\`\`\`xml
<PackageReference Include="Dynamsoft.BarcodeReaderBundle.Maui" Version="${sdkEntry.version}" />
\`\`\`
Add camera permissions in Platforms/Android/AndroidManifest.xml and Platforms/iOS/Info.plist.`;
        }

        const output = [
          "# Quick Start: DBR Mobile",
          "",
          `**Platform:** ${targetPlatform}`,
          `**SDK Version:** ${sdkEntry.version}`,
          `**API Level:** ${level}`,
          servedVariant !== sampleName ? `**Variant:** ${servedVariant} (Kotlin)` : "",
          `**Trial License:** \`${registry.trial_license}\``,
          "",
          deps,
          "",
          `## ${mainFile.filename}`,
          "```" + langExt,
          content,
          "```",
          "",
          `Full project files: get_sample_files product=dbr edition=mobile platform=${targetPlatform} sample_id=${servedVariant}`,
          `Docs: ${sdkEntry.platforms[targetPlatform]?.docs?.[level]?.["user-guide"] || "N/A"}`
        ].filter(Boolean);

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
        content: [{
          type: "text",
          text: [
            `Unsupported product/edition for quickstart: product="${normalizedProduct || product}", edition="${normalizedEdition || edition || "(inferred)"}".`,
            "Supported combinations:",
            "- dbr: web (js + react/angular/vue/next/...), mobile (android/ios/flutter/react-native/maui), server (python/nodejs/java/cpp/dotnet)",
            "- dwt: web",
            "- ddv: web",
            "- mrz: web",
            "- mds: web",
            "Call get_index to see valid product/edition/platform combinations."
          ].join("\n")
        }]
      };
    }
  );
}
