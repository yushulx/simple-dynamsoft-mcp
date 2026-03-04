import { existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { z } from "zod";

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
  getWebSamplePath
}) {
  server.registerTool(
    "get_quickstart",
    {
      title: "Get Quickstart",
      description: "Opinionated quickstart for a target product/edition/platform. DCV supports MRZ/VIN/document-normalization/driver-license workflows.",
      inputSchema: {
        product: z.string().trim().min(1, "Product is required.").describe("Product: dcv, dbr, dwt, or ddv"),
        edition: z.string().optional().describe("Edition: core, mobile, web, server/desktop"),
        platform: z.string().optional().describe("Platform: android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview, spm, core"),
        language: z.string().optional().describe("Language hint: kotlin, java, swift, js, ts, python, cpp, csharp, react, vue, angular"),
        version: z.string().optional().describe("Version constraint"),
        api_level: z.string().optional().describe("API level: high-level or low-level (mobile only)"),
        scenario: z.string().optional().describe("Scenario: camera, image, single, multiple, MRZ, VIN, document scan/normalization, driver license, react, etc.")
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
      const normalizedPlatform = normalizePlatform(platform);
      const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

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

      if (normalizedProduct === "dcv") {
        const scenarioLower = `${scenario || ""} ${language || ""}`.toLowerCase();
        const effectiveEdition = normalizedEdition || (normalizedPlatform ? normalizeEdition("", normalizedPlatform, "dcv") : "server");

        function selectDcvServerSample(platformHint, hint) {
          const platformName = normalizePlatform(platformHint) || "python";
          if (platformName === "python") {
            if (hint.includes("mrz")) return "mrz_scanner";
            if (hint.includes("vin")) return "vin_scanner";
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
          if (hint.includes("vin")) return "VINScanner";
          if (hint.includes("driver") || hint.includes("license")) return "DriverLicenseScanner";
          if (hint.includes("gs1")) return "GS1AIScanner";
          return "DocumentScanner";
        }

        function selectMobileSample(sampleNames, hint) {
          const lowerToName = new Map(sampleNames.map((name) => [String(name).toLowerCase(), name]));
          const candidates = hint.includes("mrz")
            ? ["scanmrz", "mrzscanner"]
            : hint.includes("vin")
              ? ["scanvin", "vinscanner"]
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
                `# Quick Start: DCV Server (${targetPlatform})`,
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
          const available = discoverDcvWebSamples();
          const sampleName = scenarioLower.includes("vin") ? "VINScanner" : (available[0] || "VINScanner");
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
                "# Quick Start: DCV Web",
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
                `# Quick Start: DCV Mobile (${targetPlatform})`,
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
                "# Quick Start: DCV Core",
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
        const sampleName = scenarioLower.includes("video") ? "video_decoding" : "read_an_image";
        const samplePath = getDbrServerSamplePath("python", sampleName);

        if (!existsSync(samplePath)) {
          return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName}.` }] };
        }

        const content = readCodeFile(samplePath);

        return {
          content: [{
            type: "text",
            text: [
              "# Quick Start: DBR Server (Python)",
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
}
