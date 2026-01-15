#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const registryUrl = new URL("../data/dynamsoft_sdks.json", import.meta.url);
const registry = JSON.parse(readFileSync(registryUrl, "utf8"));

const codeSnippetRoot = join(projectRoot, "code-snippet");

// ============================================================================
// Aliases for flexible input handling
// ============================================================================

const sdkAliases = {
  dbr: "dbr-mobile",
  "barcode-reader": "dbr-mobile",
  "barcode reader": "dbr-mobile",
  "barcode reader mobile": "dbr-mobile",
  "dynamsoft barcode reader": "dbr-mobile",
  barcode: "dbr-mobile"
};

const platformAliases = {
  rn: "react-native",
  reactnative: "react-native",
  "react native": "react-native",
  "react-native": "react-native",
  ios: "ios",
  swift: "ios",
  objc: "ios",
  "objective-c": "ios",
  android: "android",
  kotlin: "android",
  java: "android",
  flutter: "flutter",
  dart: "flutter",
  maui: "maui",
  "dotnet maui": "maui",
  ".net maui": "maui"
};

const languageAliases = {
  kt: "kotlin",
  kotlin: "kotlin",
  java: "java",
  swift: "swift",
  objc: "objective-c",
  "objective-c": "objective-c"
};

const sampleAliases = {
  "scan single": "ScanSingleBarcode",
  "single barcode": "ScanSingleBarcode",
  "scan multiple": "ScanMultipleBarcodes",
  "multiple barcodes": "ScanMultipleBarcodes",
  "camera enhancer": "DecodeWithCameraEnhancer",
  "dce": "DecodeWithCameraEnhancer",
  "camerax": "DecodeWithCameraX",
  "decode image": "DecodeFromAnImage",
  "from image": "DecodeFromAnImage",
  "driver license": "DriversLicenseScanner",
  "general settings": "GeneralSettings",
  "tiny barcode": "TinyBarcodeDecoding",
  "gs1": "ReadGS1AI",
  "locate item": "LocateAnItemWithBarcode"
};

// ============================================================================
// Normalization functions
// ============================================================================

function normalizeSdkId(sdk) {
  if (!sdk) return "";
  const normalized = sdk.trim().toLowerCase();
  return sdkAliases[normalized] || normalized;
}

function normalizePlatform(platform) {
  if (!platform) return "";
  const normalized = platform.trim().toLowerCase();
  return platformAliases[normalized] || normalized;
}

function normalizeLanguage(lang) {
  if (!lang) return "";
  const normalized = lang.trim().toLowerCase();
  return languageAliases[normalized] || normalized;
}

function normalizeApiLevel(level) {
  if (!level) return "high-level";
  const normalized = level.trim().toLowerCase();
  if (["low", "foundation", "foundational", "base", "manual", "core", "advanced", "custom", "template", "capturevision", "cvr"].some((word) => normalized.includes(word))) {
    return "low-level";
  }
  return "high-level";
}

function normalizeSampleName(name) {
  if (!name) return "";
  const normalized = name.trim().toLowerCase();
  return sampleAliases[normalized] || name;
}

// ============================================================================
// Code snippet utilities
// ============================================================================

function getCodeFileExtensions() {
  return [".java", ".kt", ".swift", ".m", ".h"];
}

function isCodeFile(filename) {
  return getCodeFileExtensions().includes(extname(filename).toLowerCase());
}

function discoverSamples(platform) {
  const samples = { "high-level": [], "low-level": [] };
  const platformPath = join(codeSnippetRoot, platform);

  if (!existsSync(platformPath)) return samples;

  const highLevelPath = join(platformPath, "BarcodeScannerAPISamples");
  if (existsSync(highLevelPath)) {
    for (const entry of readdirSync(highLevelPath, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("gradle") && !entry.name.startsWith("build")) {
        samples["high-level"].push(entry.name);
      }
    }
  }

  const lowLevelPath = join(platformPath, "FoundationalAPISamples");
  if (existsSync(lowLevelPath)) {
    for (const entry of readdirSync(lowLevelPath, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("gradle") && !entry.name.startsWith("build")) {
        samples["low-level"].push(entry.name);
      }
    }
  }

  return samples;
}

function findCodeFilesInSample(samplePath, maxDepth = 6) {
  const codeFiles = [];

  function walk(dir, depth) {
    if (depth > maxDepth || !existsSync(dir)) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!["build", "gradle", ".gradle", ".idea", "node_modules", "Pods", "DerivedData", ".git"].includes(entry.name)) {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile() && isCodeFile(entry.name)) {
        codeFiles.push({
          path: fullPath,
          relativePath: relative(samplePath, fullPath),
          filename: entry.name,
          extension: extname(entry.name).toLowerCase()
        });
      }
    }
  }

  walk(samplePath, 0);
  return codeFiles;
}

function getSamplePath(platform, apiLevel, sampleName) {
  const levelFolder = apiLevel === "high-level" ? "BarcodeScannerAPISamples" : "FoundationalAPISamples";
  return join(codeSnippetRoot, platform, levelFolder, sampleName);
}

function readCodeFile(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf8");
}

function getMainCodeFile(platform, samplePath) {
  const codeFiles = findCodeFilesInSample(samplePath);

  const mainPatterns = platform === "android"
    ? ["MainActivity.java", "MainActivity.kt", "HomeActivity.java", "CaptureActivity.java"]
    : ["ViewController.swift", "CameraViewController.swift", "ContentView.swift"];

  for (const pattern of mainPatterns) {
    const found = codeFiles.find(f => f.filename === pattern);
    if (found) return found;
  }

  return codeFiles[0];
}

function formatDocs(docs) {
  return Object.entries(docs).map(([key, url]) => `- ${key}: ${url}`).join("\n");
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new McpServer({
  name: "dynamsoft-barcode-reader-mobile",
  version: registry.sdks["dbr-mobile"]?.version || "11.2.5000",
  description: "MCP server for Dynamsoft Barcode Reader Mobile SDK"
});

// ============================================================================
// TOOL: list_sdks
// ============================================================================

server.tool(
  "list_sdks",
  "List available Dynamsoft SDKs with version and license info",
  z.object({}),
  async () => {
    const lines = [
      "# Dynamsoft Barcode Reader Mobile SDK",
      "",
      `**Version:** ${registry.sdks["dbr-mobile"].version}`,
      `**Trial License:** \`${registry.trial_license}\``,
      `**License URL:** ${registry.license_request_url}`,
      "",
      "## Supported Platforms",
      "- Android (Java, Kotlin)",
      "- iOS (Swift, Objective-C)",
      "- Flutter (Dart)",
      "- React Native (TypeScript/JavaScript)",
      "- .NET MAUI (C#)",
      "",
      "## Available Tools",
      "- `get_sdk_info` - Get SDK details for a platform",
      "- `list_samples` - List code samples",
      "- `get_code_snippet` - Get actual source code",
      "- `get_quick_start` - Get complete working example",
      "- `get_gradle_config` - Get Android build config"
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_sdk_info
// ============================================================================

server.tool(
  "get_sdk_info",
  "Get SDK information including version, license, dependencies, and docs",
  z.object({
    platform: z.string().optional().describe("Platform: android, ios, flutter, react-native, maui"),
    api_level: z.string().optional().describe("API level: high-level or low-level")
  }),
  async ({ platform, api_level }) => {
    const sdkEntry = registry.sdks["dbr-mobile"];
    const platformKey = normalizePlatform(platform || sdkEntry.default_platform);
    const platformEntry = sdkEntry.platforms[platformKey];

    if (!platformEntry) {
      const available = Object.keys(sdkEntry.platforms).join(", ");
      return { content: [{ type: "text", text: `Unknown platform. Available: ${available}` }] };
    }

    const level = normalizeApiLevel(api_level || "high-level");
    const docs = platformEntry.docs[level] || platformEntry.docs["high-level"];

    let deps = "";
    if (platformKey === "android") {
      deps = `
## Android Dependencies

\`\`\`groovy
// project build.gradle
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url "${registry.maven_url}" }
    }
}

// app build.gradle
dependencies {
    implementation 'com.dynamsoft:barcodereaderbundle:${sdkEntry.version}'
}
\`\`\``;
    } else if (platformKey === "ios") {
      deps = `
## iOS Dependencies

\`\`\`ruby
# Podfile
pod 'DynamsoftBarcodeReaderBundle'
\`\`\`

Or Swift Package Manager: https://github.com/Dynamsoft/barcode-reader-spm`;
    }

    const lines = [
      `# ${sdkEntry.name} - ${platformKey}`,
      `**Version:** ${sdkEntry.version}`,
      `**Languages:** ${platformEntry.languages.join(", ")}`,
      "",
      "## Trial License",
      "```",
      registry.trial_license,
      "```",
      deps,
      "",
      "## Documentation",
      docs ? formatDocs(docs) : "N/A"
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: list_samples
// ============================================================================

server.tool(
  "list_samples",
  "List available code samples for a platform",
  z.object({
    platform: z.enum(["android", "ios"]).describe("Platform: android or ios"),
    api_level: z.string().optional().describe("API level: high-level or low-level")
  }),
  async ({ platform, api_level }) => {
    const samples = discoverSamples(platform);
    const level = normalizeApiLevel(api_level);

    const lines = [
      `# Code Samples for ${platform}`,
      "",
      "## High-Level API (BarcodeScanner - simpler)",
      samples["high-level"].map(s => `- ${s}`).join("\n") || "None",
      "",
      "## Low-Level API (CaptureVisionRouter - more control)",
      samples["low-level"].map(s => `- ${s}`).join("\n") || "None",
      "",
      "Use `get_code_snippet` with sample_name to get code."
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_code_snippet
// ============================================================================

server.tool(
  "get_code_snippet",
  "Get actual source code from sample projects",
  z.object({
    platform: z.enum(["android", "ios"]).describe("Platform: android or ios"),
    sample_name: z.string().describe("Sample name, e.g. ScanSingleBarcode, DecodeWithCameraEnhancer"),
    api_level: z.string().optional().describe("API level: high-level or low-level"),
    language: z.string().optional().describe("Language: java, kotlin, swift"),
    file_name: z.string().optional().describe("Specific file to retrieve")
  }),
  async ({ platform, sample_name, api_level, language, file_name }) => {
    const level = normalizeApiLevel(api_level);
    const normalizedSample = normalizeSampleName(sample_name);

    let samplePath = getSamplePath(platform, level, normalizedSample);
    let actualLevel = level;

    if (!existsSync(samplePath)) {
      const otherLevel = level === "high-level" ? "low-level" : "high-level";
      samplePath = getSamplePath(platform, otherLevel, normalizedSample);
      actualLevel = otherLevel;

      if (!existsSync(samplePath)) {
        const samples = discoverSamples(platform);
        const allSamples = [...samples["high-level"], ...samples["low-level"]];
        return { content: [{ type: "text", text: `Sample "${sample_name}" not found.\n\nAvailable:\n${allSamples.map(s => `- ${s}`).join("\n")}` }] };
      }
    }

    const codeFiles = findCodeFilesInSample(samplePath);
    if (codeFiles.length === 0) {
      return { content: [{ type: "text", text: `No code files in "${sample_name}".` }] };
    }

    let targetFiles = codeFiles;
    const normalizedLang = normalizeLanguage(language);
    if (normalizedLang) {
      const langExts = { java: [".java"], kotlin: [".kt"], swift: [".swift"], "objective-c": [".m", ".h"] };
      const exts = langExts[normalizedLang] || [];
      if (exts.length > 0) targetFiles = codeFiles.filter(f => exts.includes(f.extension));
    }

    if (file_name) {
      const found = targetFiles.find(f => f.filename === file_name || f.relativePath.endsWith(file_name));
      if (found) targetFiles = [found];
    }

    if (!file_name && targetFiles.length > 1) {
      const mainFile = getMainCodeFile(platform, samplePath);
      if (mainFile) targetFiles = [mainFile];
    }

    const results = [];
    for (const file of targetFiles.slice(0, 3)) {
      const content = readCodeFile(file.path);
      if (content) results.push({ filename: file.filename, relativePath: file.relativePath, content });
    }

    if (results.length === 0) {
      return { content: [{ type: "text", text: `Could not read files from "${sample_name}".` }] };
    }

    const langExt = results[0].filename.split(".").pop();

    let output = [
      `# ${normalizedSample} - ${platform} (${actualLevel})`,
      `**SDK Version:** ${registry.sdks["dbr-mobile"].version}`,
      `**Trial License:** \`${registry.trial_license}\``,
      ""
    ];

    for (const r of results) {
      output.push(`## ${r.relativePath}`);
      output.push("```" + langExt);
      output.push(r.content);
      output.push("```");
      output.push("");
    }

    if (codeFiles.length > results.length) {
      output.push("## Other files:");
      output.push(codeFiles.map(f => `- ${f.relativePath}`).join("\n"));
    }

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_quick_start
// ============================================================================

server.tool(
  "get_quick_start",
  "Get complete quick start guide with working code",
  z.object({
    platform: z.enum(["android", "ios"]).describe("Platform: android or ios"),
    api_level: z.string().optional().describe("API level: high-level or low-level"),
    language: z.string().optional().describe("Language: java, kotlin, swift"),
    use_case: z.string().optional().describe("Use case: single-barcode, multiple-barcodes, image-file")
  }),
  async ({ platform, api_level, language, use_case }) => {
    const level = normalizeApiLevel(api_level);

    let sampleName = "ScanSingleBarcode";
    if (use_case) {
      const uc = use_case.toLowerCase();
      if (uc.includes("multiple") || uc.includes("batch")) sampleName = "ScanMultipleBarcodes";
      else if (uc.includes("image") || uc.includes("file")) sampleName = "DecodeFromAnImage";
    }

    if (level === "low-level") {
      sampleName = sampleName === "ScanSingleBarcode" ? "DecodeWithCameraEnhancer" : sampleName;
      sampleName = sampleName === "ScanMultipleBarcodes" ? "DecodeWithCameraEnhancer" : sampleName;
    }

    const samplePath = getSamplePath(platform, level, sampleName);
    if (!existsSync(samplePath)) {
      return { content: [{ type: "text", text: `Sample not found. Use list_samples to see available.` }] };
    }

    const mainFile = getMainCodeFile(platform, samplePath);
    if (!mainFile) {
      return { content: [{ type: "text", text: `Could not find main code file.` }] };
    }

    const content = readCodeFile(mainFile.path);
    const sdkEntry = registry.sdks["dbr-mobile"];
    const langExt = mainFile.filename.split(".").pop();

    let deps = "";
    if (platform === "android") {
      deps = `
## Step 1: Add Dependencies

**build.gradle (project):**
\`\`\`groovy
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url "${registry.maven_url}" }
    }
}
\`\`\`

**build.gradle (app):**
\`\`\`groovy
dependencies {
    implementation 'com.dynamsoft:barcodereaderbundle:${sdkEntry.version}'
    implementation 'androidx.appcompat:appcompat:1.7.1'
    implementation 'androidx.activity:activity:1.10.1'
}
\`\`\`

**AndroidManifest.xml:**
\`\`\`xml
<uses-permission android:name="android.permission.CAMERA" />
\`\`\``;
    } else {
      deps = `
## Step 1: Add Dependencies

**Podfile:**
\`\`\`ruby
platform :ios, '11.0'
use_frameworks!

target 'YourApp' do
  pod 'DynamsoftBarcodeReaderBundle'
end
\`\`\`

Then run: \`pod install\`

**Info.plist:**
\`\`\`xml
<key>NSCameraUsageDescription</key>
<string>Camera access for barcode scanning</string>
\`\`\``;
    }

    const output = [
      `# Quick Start: ${sampleName} - ${platform}`,
      "",
      `**SDK Version:** ${sdkEntry.version}`,
      `**API Level:** ${level}`,
      `**Trial License:** \`${registry.trial_license}\``,
      "",
      deps,
      "",
      `## Step 2: ${mainFile.filename}`,
      "",
      "```" + langExt,
      content,
      "```",
      "",
      "## Notes",
      "- Trial license requires network connection",
      `- User Guide: ${sdkEntry.platforms[platform]?.docs[level]?.["user-guide"] || "N/A"}`
    ];

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_gradle_config
// ============================================================================

server.tool(
  "get_gradle_config",
  "Get Android Gradle configuration",
  z.object({
    sample_name: z.string().optional().describe("Sample to get config from")
  }),
  async ({ sample_name }) => {
    const sdkEntry = registry.sdks["dbr-mobile"];
    const sampleName = sample_name || "ScanSingleBarcode";

    const highLevelPath = join(codeSnippetRoot, "android", "BarcodeScannerAPISamples");
    const projectGradlePath = join(highLevelPath, "build.gradle");
    const appGradlePath = join(highLevelPath, sampleName, "build.gradle");

    let projectGradle = existsSync(projectGradlePath) ? readCodeFile(projectGradlePath) : "";
    let appGradle = existsSync(appGradlePath) ? readCodeFile(appGradlePath) : "";

    const output = [
      "# Android Gradle Configuration",
      "",
      `**SDK Version:** ${sdkEntry.version}`,
      `**Maven:** ${registry.maven_url}`,
      "",
      "## Project build.gradle",
      "```groovy",
      projectGradle || "// See documentation",
      "```",
      "",
      "## App build.gradle",
      "```groovy",
      appGradle || "// See documentation",
      "```"
    ];

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_license_info
// ============================================================================

server.tool(
  "get_license_info",
  "Get license setup code for different platforms",
  z.object({
    platform: z.enum(["android", "ios"]).describe("Platform: android or ios"),
    language: z.string().optional().describe("Language: java, kotlin, swift")
  }),
  async ({ platform, language }) => {
    const normalizedLang = normalizeLanguage(language);

    let initCode = "";
    if (platform === "android") {
      if (normalizedLang === "kotlin") {
        initCode = `
## Kotlin - High-Level API

\`\`\`kotlin
val config = BarcodeScannerConfig().apply {
    license = "${registry.trial_license}"
}
\`\`\`

## Kotlin - Low-Level API

\`\`\`kotlin
LicenseManager.initLicense("${registry.trial_license}") { isSuccess, error ->
    if (!isSuccess) error?.printStackTrace()
}
\`\`\``;
      } else {
        initCode = `
## Java - High-Level API

\`\`\`java
BarcodeScannerConfig config = new BarcodeScannerConfig();
config.setLicense("${registry.trial_license}");
\`\`\`

## Java - Low-Level API

\`\`\`java
LicenseManager.initLicense("${registry.trial_license}", (isSuccess, error) -> {
    if (!isSuccess) error.printStackTrace();
});
\`\`\``;
      }
    } else {
      initCode = `
## Swift - High-Level API

\`\`\`swift
let config = BarcodeScannerConfig()
config.license = "${registry.trial_license}"
\`\`\`

## Swift - Low-Level API

\`\`\`swift
LicenseManager.initLicense("${registry.trial_license}") { isSuccess, error in
    if !isSuccess, let error = error {
        print("License failed: \\(error.localizedDescription)")
    }
}
\`\`\``;
    }

    return { content: [{ type: "text", text: `# License Setup\n\n**License:** \`${registry.trial_license}\`\n**Request:** ${registry.license_request_url}\n${initCode}` }] };
  }
);

// ============================================================================
// TOOL: get_api_usage
// ============================================================================

server.tool(
  "get_api_usage",
  "Get usage examples for specific Dynamsoft APIs",
  z.object({
    api_name: z.string().describe("API name: BarcodeScannerConfig, CaptureVisionRouter, etc."),
    platform: z.enum(["android", "ios"]).optional().describe("Platform: android or ios")
  }),
  async ({ api_name, platform }) => {
    const apiLower = api_name.toLowerCase();
    const platformKey = platform ? normalizePlatform(platform) : "android";

    const apiMap = {
      "barcodescannerconfig": { sample: "ScanSingleBarcode", level: "high-level" },
      "barcodescanneractivity": { sample: "ScanSingleBarcode", level: "high-level" },
      "barcodescannerviewcontroller": { sample: "ScanSingleBarcode", level: "high-level" },
      "barcodescanresult": { sample: "ScanSingleBarcode", level: "high-level" },
      "capturevisionrouter": { sample: "DecodeWithCameraEnhancer", level: "low-level" },
      "cvr": { sample: "DecodeWithCameraEnhancer", level: "low-level" },
      "cameraenhancer": { sample: "DecodeWithCameraEnhancer", level: "low-level" },
      "dce": { sample: "DecodeWithCameraEnhancer", level: "low-level" },
      "decodedbarcodesresult": { sample: "DecodeWithCameraEnhancer", level: "low-level" },
      "barcoderesultitem": { sample: "ScanMultipleBarcodes", level: "high-level" },
      "licensemanager": { sample: "DecodeWithCameraEnhancer", level: "low-level" },
      "capturedresultreceiver": { sample: "DecodeWithCameraEnhancer", level: "low-level" }
    };

    const mapping = apiMap[apiLower];
    if (!mapping) {
      return { content: [{ type: "text", text: `API "${api_name}" not found.\n\nCommon APIs:\n- BarcodeScannerConfig (high-level)\n- CaptureVisionRouter (low-level)\n- CameraEnhancer (low-level)\n- DecodedBarcodesResult (low-level)\n- LicenseManager (low-level)` }] };
    }

    const samplePath = getSamplePath(platformKey, mapping.level, mapping.sample);
    if (!existsSync(samplePath)) {
      return { content: [{ type: "text", text: `Sample for ${api_name} not found for ${platformKey}.` }] };
    }

    const mainFile = getMainCodeFile(platformKey, samplePath);
    if (!mainFile) {
      return { content: [{ type: "text", text: `Could not find code example for ${api_name}.` }] };
    }

    const content = readCodeFile(mainFile.path);
    const langExt = mainFile.filename.split(".").pop();
    const sdkEntry = registry.sdks["dbr-mobile"];
    const docsUrl = sdkEntry.platforms[platformKey]?.docs[mapping.level]?.["api-reference"] || "";

    return { content: [{ type: "text", text: `# ${api_name} Usage\n\n**Platform:** ${platformKey}\n**API Level:** ${mapping.level}\n**Docs:** ${docsUrl}\n\n## ${mainFile.filename}\n\n\`\`\`${langExt}\n${content}\n\`\`\`` }] };
  }
);

// ============================================================================
// TOOL: search_samples
// ============================================================================

server.tool(
  "search_samples",
  "Search for code samples by keyword or feature",
  z.object({
    keyword: z.string().describe("Keyword to search: camera, image, settings, etc."),
    platform: z.enum(["android", "ios"]).optional().describe("Platform filter")
  }),
  async ({ keyword, platform }) => {
    const platforms = platform ? [platform] : ["android", "ios"];
    const kw = keyword.toLowerCase();
    const results = [];

    for (const plat of platforms) {
      const samples = discoverSamples(plat);
      for (const level of ["high-level", "low-level"]) {
        for (const name of samples[level]) {
          if (name.toLowerCase().includes(kw)) {
            results.push({ platform: plat, level, name });
          }
        }
      }
    }

    if (results.length === 0) {
      return { content: [{ type: "text", text: `No samples found for "${keyword}". Use list_samples to see all.` }] };
    }

    const lines = [
      `# Search Results for "${keyword}"`,
      "",
      ...results.map(r => `- ${r.platform}/${r.level}/${r.name}`),
      "",
      "Use get_code_snippet to get the code."
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// MCP Resources
// ============================================================================

// SDK Info resource
server.resource(
  "dynamsoft://sdk-info",
  "Dynamsoft SDK information",
  async () => {
    const sdkEntry = registry.sdks["dbr-mobile"];
    const info = {
      name: sdkEntry.name,
      version: sdkEntry.version,
      trial_license: registry.trial_license,
      license_request_url: registry.license_request_url,
      maven_url: registry.maven_url,
      platforms: Object.keys(sdkEntry.platforms)
    };
    return { contents: [{ uri: "dynamsoft://sdk-info", text: JSON.stringify(info, null, 2), mimeType: "application/json" }] };
  }
);

// Register sample resources dynamically
for (const platform of ["android", "ios"]) {
  const samples = discoverSamples(platform);
  for (const level of ["high-level", "low-level"]) {
    for (const sampleName of samples[level]) {
      const uri = `dynamsoft://samples/${platform}/${level}/${sampleName}`;
      server.resource(
        uri,
        `${sampleName} for ${platform} (${level})`,
        async () => {
          const samplePath = getSamplePath(platform, level, sampleName);
          const mainFile = getMainCodeFile(platform, samplePath);
          if (!mainFile) {
            return { contents: [{ uri, text: "Sample not found", mimeType: "text/plain" }] };
          }
          const content = readCodeFile(mainFile.path);
          const ext = mainFile.filename.split(".").pop();
          const mimeType = ext === "swift" ? "text/x-swift" : ext === "kt" ? "text/x-kotlin" : ext === "java" ? "text/x-java" : "text/plain";
          return { contents: [{ uri, text: content, mimeType }] };
        }
      );
    }
  }
}

// ============================================================================
// Start Server
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);
