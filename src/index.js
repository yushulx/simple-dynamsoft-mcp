#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const registryUrl = new URL("../data/dynamsoft_sdks.json", import.meta.url);
const registry = JSON.parse(readFileSync(registryUrl, "utf8"));

const dwtDocsUrl = new URL("../data/web-twain-api-docs.json", import.meta.url);
const dwtDocs = JSON.parse(readFileSync(dwtDocsUrl, "utf8"));

const codeSnippetRoot = join(projectRoot, "code-snippet");

// ============================================================================
// Aliases for flexible input handling
// ============================================================================

const sdkAliases = {
  // DBR Mobile
  "dbr": "dbr-mobile",
  "dbr-mobile": "dbr-mobile",
  "barcode-reader": "dbr-mobile",
  "barcode reader": "dbr-mobile",
  "barcode reader mobile": "dbr-mobile",
  "mobile barcode": "dbr-mobile",
  // DBR Python
  "dbr-python": "dbr-python",
  "python barcode": "dbr-python",
  "barcode python": "dbr-python",
  "barcode reader python": "dbr-python",
  // DBR Web
  "dbr-web": "dbr-web",
  "web barcode": "dbr-web",
  "barcode web": "dbr-web",
  "javascript barcode": "dbr-web",
  "barcode javascript": "dbr-web",
  "barcode js": "dbr-web",
  // Dynamic Web TWAIN
  "dwt": "dwt",
  "web twain": "dwt",
  "webtwain": "dwt",
  "dynamic web twain": "dwt",
  "document scanner": "dwt",
  "document scanning": "dwt",
  "twain": "dwt",
  "scanner": "dwt"
};

const platformAliases = {
  // Mobile platforms
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
  ".net maui": "maui",
  // Desktop/Server
  python: "python",
  py: "python",
  // Web
  web: "web",
  javascript: "web",
  js: "web",
  typescript: "web",
  ts: "web"
};

const languageAliases = {
  kt: "kotlin",
  kotlin: "kotlin",
  java: "java",
  swift: "swift",
  objc: "objective-c",
  "objective-c": "objective-c",
  py: "python",
  python: "python",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript"
};

const sampleAliases = {
  // Mobile samples
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
  "locate item": "LocateAnItemWithBarcode",
  // Python samples
  "read image": "read_an_image",
  "video decoding": "video_decoding",
  "video": "video_decoding",
  // DWT samples
  "basic scan": "basic-scan",
  "scan": "basic-scan",
  "read barcode": "read-barcode",
  "load local": "load-from-local-drive",
  "save": "save",
  "upload": "upload"
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
  return [".java", ".kt", ".swift", ".m", ".h", ".py", ".js", ".ts", ".html"];
}

function isCodeFile(filename) {
  return getCodeFileExtensions().includes(extname(filename).toLowerCase());
}

function discoverMobileSamples(platform) {
  const samples = { "high-level": [], "low-level": [] };
  const platformPath = join(codeSnippetRoot, "dynamsoft-barcode-reader", platform);

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

function discoverPythonSamples() {
  const samples = [];
  const pythonPath = join(codeSnippetRoot, "dynamsoft-barcode-reader", "python", "Samples");

  if (!existsSync(pythonPath)) return samples;

  for (const entry of readdirSync(pythonPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".py")) {
      samples.push(entry.name.replace(".py", ""));
    }
  }

  return samples;
}

function discoverWebSamples() {
  const categories = {
    "root": [],
    "frameworks": [],
    "scenarios": []
  };
  const webPath = join(codeSnippetRoot, "dynamsoft-barcode-reader", "web");

  if (!existsSync(webPath)) return categories;

  // Find HTML files in root
  for (const entry of readdirSync(webPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      categories["root"].push(entry.name.replace(".html", ""));
    }
  }

  // Find samples in subdirectories
  for (const subdir of ["frameworks", "scenarios"]) {
    const subdirPath = join(webPath, subdir);
    if (existsSync(subdirPath)) {
      for (const entry of readdirSync(subdirPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          categories[subdir].push(entry.name);
        } else if (entry.isFile() && entry.name.endsWith(".html")) {
          categories[subdir].push(entry.name.replace(".html", ""));
        }
      }
    }
  }

  // Remove empty categories
  for (const [key, value] of Object.entries(categories)) {
    if (value.length === 0) delete categories[key];
  }

  return categories;
}

function getWebSamplePath(category, sampleName) {
  const webPath = join(codeSnippetRoot, "dynamsoft-barcode-reader", "web");

  if (category === "root" || !category) {
    // Try root level
    const htmlPath = join(webPath, `${sampleName}.html`);
    if (existsSync(htmlPath)) return htmlPath;
  } else {
    // Try in subdirectory
    const dirPath = join(webPath, category, sampleName);
    if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
      // Look for index.html or main html file
      const indexPath = join(dirPath, "index.html");
      if (existsSync(indexPath)) return indexPath;
      // Look for any html file
      for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".html")) {
          return join(dirPath, entry.name);
        }
      }
    }
    // Try as html file directly
    const htmlPath = join(webPath, category, `${sampleName}.html`);
    if (existsSync(htmlPath)) return htmlPath;
  }

  // Fallback: search all
  const rootPath = join(webPath, `${sampleName}.html`);
  if (existsSync(rootPath)) return rootPath;

  return null;
}

function discoverDwtSamples() {
  const categories = {};
  const dwtPath = join(codeSnippetRoot, "dynamic-web-twain");

  if (!existsSync(dwtPath)) return categories;

  for (const entry of readdirSync(dwtPath, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const categoryPath = join(dwtPath, entry.name);
      const samples = [];

      // Recursively find HTML files
      function findHtmlFiles(dir) {
        for (const item of readdirSync(dir, { withFileTypes: true })) {
          if (item.isFile() && item.name.endsWith(".html")) {
            samples.push(item.name.replace(".html", ""));
          } else if (item.isDirectory() && !item.name.startsWith(".")) {
            findHtmlFiles(join(dir, item.name));
          }
        }
      }

      findHtmlFiles(categoryPath);
      if (samples.length > 0) {
        categories[entry.name] = samples;
      }
    }
  }

  return categories;
}

// Legacy function for backward compatibility
function discoverSamples(platform) {
  return discoverMobileSamples(platform);
}

function findCodeFilesInSample(samplePath, maxDepth = 6) {
  const codeFiles = [];

  function walk(dir, depth) {
    if (depth > maxDepth || !existsSync(dir)) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!["build", "gradle", ".gradle", ".idea", "node_modules", "Pods", "DerivedData", ".git", "__pycache__"].includes(entry.name)) {
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

function getMobileSamplePath(platform, apiLevel, sampleName) {
  const levelFolder = apiLevel === "high-level" ? "BarcodeScannerAPISamples" : "FoundationalAPISamples";
  return join(codeSnippetRoot, "dynamsoft-barcode-reader", platform, levelFolder, sampleName);
}

function getPythonSamplePath(sampleName) {
  const fileName = sampleName.endsWith(".py") ? sampleName : sampleName + ".py";
  return join(codeSnippetRoot, "dynamsoft-barcode-reader", "python", "Samples", fileName);
}

function getDwtSamplePath(category, sampleName) {
  const fileName = sampleName.endsWith(".html") ? sampleName : sampleName + ".html";
  const categoryPath = join(codeSnippetRoot, "dynamic-web-twain", category);

  // Search recursively for the file
  function findFile(dir) {
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name === fileName) {
        return join(dir, entry.name);
      } else if (entry.isDirectory()) {
        const found = findFile(join(dir, entry.name));
        if (found) return found;
      }
    }
    return null;
  }

  return findFile(categoryPath);
}

// Legacy function for backward compatibility
function getSamplePath(platform, apiLevel, sampleName) {
  return getMobileSamplePath(platform, apiLevel, sampleName);
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
  name: "simple-dynamsoft-mcp",
  version: "1.0.3",
  description: "MCP server for Dynamsoft SDKs: Barcode Reader (Mobile/Python/Web) and Dynamic Web TWAIN"
});

// ============================================================================
// TOOL: list_sdks
// ============================================================================

server.registerTool(
  "list_sdks",
  {
    title: "List SDKs",
    description: "List all available Dynamsoft SDKs with versions and platforms",
    inputSchema: {}
  },
  async () => {
    const lines = [
      "# Dynamsoft SDKs",
      "",
      `**Trial License:** \`${registry.trial_license}\``,
      `**License URL:** ${registry.license_request_url}`,
      "",
      "## Available SDKs",
      ""
    ];

    for (const [sdkId, sdk] of Object.entries(registry.sdks)) {
      lines.push(`### ${sdk.name} (${sdkId})`);
      lines.push(`- **Version:** ${sdk.version}`);
      lines.push(`- **Description:** ${sdk.description}`);
      lines.push(`- **Platforms:** ${Object.keys(sdk.platforms).join(", ")}`);
      lines.push("");
    }

    lines.push("## Available Tools");
    lines.push("- `list_sdks` - List all SDKs");
    lines.push("- `get_sdk_info` - Get detailed SDK info for a platform");
    lines.push("- `list_samples` - List code samples (mobile)");
    lines.push("- `list_web_samples` - List web barcode reader samples");
    lines.push("- `get_code_snippet` - Get actual source code");
    lines.push("- `get_web_sample` - Get web barcode reader sample code");
    lines.push("- `get_quick_start` - Get complete working example");
    lines.push("- `get_gradle_config` - Get Android build config");
    lines.push("- `get_license_info` - Get license setup code");
    lines.push("- `get_api_usage` - Get API usage examples");
    lines.push("- `search_samples` - Search samples by keyword");
    lines.push("- `get_python_sample` - Get Python SDK sample code");
    lines.push("- `get_dwt_sample` - Get Dynamic Web TWAIN sample");
    lines.push("- `list_dwt_categories` - List DWT sample categories");
    lines.push("- `search_dwt_docs` - Search DWT API documentation");
    lines.push("- `get_dwt_api_doc` - Get specific DWT documentation article");

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_sdk_info
// ============================================================================

server.registerTool(
  "get_sdk_info",
  {
    title: "Get SDK Info",
    description: "Get SDK information including version, license, dependencies, and docs",
    inputSchema: {
      sdk: z.string().optional().describe("SDK: dbr-mobile, dbr-python, dbr-web, dwt"),
      platform: z.string().optional().describe("Platform: android, ios, flutter, react-native, maui, python, web"),
      api_level: z.string().optional().describe("API level: high-level or low-level (mobile only)")
    }
  },
  async ({ sdk, platform, api_level }) => {
    const sdkId = normalizeSdkId(sdk || "dbr-mobile");
    const sdkEntry = registry.sdks[sdkId];

    if (!sdkEntry) {
      const available = Object.keys(registry.sdks).join(", ");
      return { content: [{ type: "text", text: `Unknown SDK "${sdk}". Available: ${available}` }] };
    }

    const platformKey = normalizePlatform(platform || sdkEntry.default_platform);
    const platformEntry = sdkEntry.platforms[platformKey];

    if (!platformEntry) {
      const available = Object.keys(sdkEntry.platforms).join(", ");
      return { content: [{ type: "text", text: `Unknown platform "${platform}" for ${sdkEntry.name}. Available: ${available}` }] };
    }

    const level = normalizeApiLevel(api_level || "high-level");

    // Get docs - handle different doc structures
    let docs = platformEntry.docs;
    if (sdkId === "dbr-mobile" && platformEntry.docs[level]) {
      docs = platformEntry.docs[level];
    }

    let deps = "";
    if (sdkId === "dbr-mobile") {
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
    } else if (sdkId === "dbr-python" && platformEntry.installation) {
      deps = `
## Installation

\`\`\`bash
${platformEntry.installation.pip}
\`\`\``;
    } else if ((sdkId === "dbr-web" || sdkId === "dwt") && platformEntry.installation) {
      deps = `
## Installation

**NPM:**
\`\`\`bash
${platformEntry.installation.npm}
\`\`\`

**CDN:**
\`\`\`html
<script src="${platformEntry.installation.cdn}"></script>
\`\`\``;
    }

    const lines = [
      `# ${sdkEntry.name}`,
      platformKey !== sdkEntry.default_platform ? `**Platform:** ${platformKey}` : "",
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
      formatDocs(docs)
    ].filter(Boolean);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: list_samples
// ============================================================================

server.registerTool(
  "list_samples",
  {
    title: "List Mobile Samples",
    description: "List available code samples for mobile platforms",
    inputSchema: {
      platform: z.enum(["android", "ios"]).describe("Platform: android or ios"),
      api_level: z.string().optional().describe("API level: high-level or low-level")
    }
  },
  async ({ platform, api_level }) => {
    const samples = discoverMobileSamples(platform);
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
      "",
      "Use `get_code_snippet` with sample_name to get code."
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: list_python_samples
// ============================================================================

server.registerTool(
  "list_python_samples",
  {
    title: "List Python Samples",
    description: "List available Python SDK code samples",
    inputSchema: {}
  },
  async () => {
    const samples = discoverPythonSamples();
    const sdkEntry = registry.sdks["dbr-python"];

    const lines = [
      "# Python SDK Samples",
      "",
      `**SDK Version:** ${sdkEntry.version}`,
      `**Install:** \`pip install dynamsoft-barcode-reader-bundle\``,
      "",
      "## Available Samples",
      samples.map(s => `- ${s}`).join("\n") || "None",
      "",
      "Use `get_python_sample` with sample_name to get code."
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: list_web_samples
// ============================================================================

server.registerTool(
  "list_web_samples",
  {
    title: "List Web Barcode Samples",
    description: "List available JavaScript/Web barcode reader code samples",
    inputSchema: {}
  },
  async () => {
    const categories = discoverWebSamples();
    const sdkEntry = registry.sdks["dbr-web"];

    const lines = [
      "# Web Barcode Reader Samples",
      "",
      `**SDK Version:** ${sdkEntry.version}`,
      `**Install:** \`npm install dynamsoft-barcode-reader-bundle\``,
      `**CDN:** \`${sdkEntry.platforms.web.installation.cdn}\``,
      "",
      "## Available Samples",
      ""
    ];

    for (const [category, samples] of Object.entries(categories)) {
      const categoryTitle = category === "root" ? "Basic Samples" : category.charAt(0).toUpperCase() + category.slice(1);
      lines.push(`### ${categoryTitle}`);
      lines.push(samples.map(s => `- ${s}`).join("\n"));
      lines.push("");
    }

    lines.push("Use `get_web_sample` with sample_name to get code.");

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_web_sample
// ============================================================================

server.registerTool(
  "get_web_sample",
  {
    title: "Get Web Barcode Sample",
    description: "Get JavaScript/Web barcode reader sample code",
    inputSchema: {
      sample_name: z.string().describe("Sample name, e.g. hello-world, read-an-image"),
      category: z.string().optional().describe("Category: root, frameworks, scenarios (optional)")
    }
  },
  async ({ sample_name, category }) => {
    const samplePath = getWebSamplePath(category, sample_name);

    if (!samplePath) {
      const categories = discoverWebSamples();
      const allSamples = Object.entries(categories)
        .map(([cat, samples]) => samples.map(s => `${cat}/${s}`))
        .flat();
      return {
        content: [{
          type: "text",
          text: `Sample "${sample_name}" not found.\n\nAvailable samples:\n${allSamples.map(s => `- ${s}`).join("\n")}\n\nUse \`list_web_samples\` to see all available samples.`
        }]
      };
    }

    const content = readCodeFile(samplePath);
    if (!content) {
      return { content: [{ type: "text", text: `Could not read "${sample_name}".` }] };
    }

    const sdkEntry = registry.sdks["dbr-web"];

    const output = [
      `# Web Barcode Reader: ${sample_name}`,
      "",
      `**SDK Version:** ${sdkEntry.version}`,
      `**Install:** \`npm install dynamsoft-barcode-reader-bundle\``,
      `**CDN:** \`${sdkEntry.platforms.web.installation.cdn}\``,
      `**Trial License:** \`${registry.trial_license}\``,
      "",
      "```html",
      content,
      "```"
    ];

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// ============================================================================
// TOOL: list_dwt_categories
// ============================================================================

server.registerTool(
  "list_dwt_categories",
  {
    title: "List DWT Categories",
    description: "List Dynamic Web TWAIN sample categories",
    inputSchema: {}
  },
  async () => {
    const categories = discoverDwtSamples();
    const sdkEntry = registry.sdks["dwt"];

    const lines = [
      "# Dynamic Web TWAIN Samples",
      "",
      `**SDK Version:** ${sdkEntry.version}`,
      `**Install:** \`npm install dwt\``,
      "",
      "## Sample Categories",
      ""
    ];

    for (const [category, samples] of Object.entries(categories)) {
      const desc = sdkEntry.platforms.web.categories?.[category] || "";
      lines.push(`### ${category}${desc ? ` - ${desc}` : ""}`);
      lines.push(samples.map(s => `- ${s}`).join("\n"));
      lines.push("");
    }

    lines.push("Use `get_dwt_sample` with category and sample_name to get code.");
    lines.push("");
    lines.push("**API Documentation Tools:**");
    lines.push("- `search_dwt_docs` - Search DWT API documentation by keyword");
    lines.push("- `get_dwt_api_doc` - Get specific DWT documentation article");

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: search_dwt_docs
// ============================================================================

server.registerTool(
  "search_dwt_docs",
  {
    title: "Search DWT Documentation",
    description: "Search Dynamic Web TWAIN API documentation by keyword. Returns matching articles with titles, URLs, and content excerpts.",
    inputSchema: {
      query: z.string().describe("Search keyword or phrase (e.g., 'LoadImage', 'PDF', 'scanner', 'OCR')"),
      max_results: z.number().optional().describe("Maximum number of results to return (default: 5)")
    }
  },
  async ({ query, max_results = 5 }) => {
    const searchTerms = query.toLowerCase().split(/\s+/);
    const results = [];

    for (const article of dwtDocs.articles) {
      const titleLower = article.title.toLowerCase();
      const contentLower = article.content.toLowerCase();
      const breadcrumbLower = (article.breadcrumb || "").toLowerCase();

      // Score based on matches in title (higher weight), breadcrumb, and content
      let score = 0;
      for (const term of searchTerms) {
        if (titleLower.includes(term)) score += 10;
        if (breadcrumbLower.includes(term)) score += 5;
        if (contentLower.includes(term)) score += 1;
      }

      if (score > 0) {
        // Extract a relevant excerpt (first 300 chars that contain a search term)
        let excerpt = article.content.substring(0, 300);
        for (const term of searchTerms) {
          const idx = contentLower.indexOf(term);
          if (idx > 50) {
            const start = Math.max(0, idx - 50);
            excerpt = "..." + article.content.substring(start, start + 300) + "...";
            break;
          }
        }

        results.push({
          title: article.title,
          url: article.url,
          breadcrumb: article.breadcrumb,
          score,
          excerpt: excerpt.replace(/\n+/g, " ").trim()
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, max_results);

    if (topResults.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No documentation found for "${query}".\n\nTry different keywords like:\n- API names: LoadImage, SaveAsPDF, AcquireImage\n- Features: scanner, PDF, OCR, barcode\n- Topics: initialization, upload, viewer`
        }]
      };
    }

    const lines = [
      `# DWT Documentation Search: "${query}"`,
      "",
      `Found ${results.length} matches. Showing top ${topResults.length}:`,
      ""
    ];

    for (let i = 0; i < topResults.length; i++) {
      const r = topResults[i];
      lines.push(`## ${i + 1}. ${r.title}`);
      lines.push(`**Category:** ${r.breadcrumb}`);
      lines.push(`**URL:** ${r.url}`);
      lines.push("");
      lines.push(`> ${r.excerpt}`);
      lines.push("");
    }

    lines.push("Use `get_dwt_api_doc` with the article title to get full documentation.");

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_dwt_api_doc
// ============================================================================

server.registerTool(
  "get_dwt_api_doc",
  {
    title: "Get DWT API Documentation",
    description: "Get full Dynamic Web TWAIN documentation article by title or URL. Use search_dwt_docs first to find relevant articles.",
    inputSchema: {
      title: z.string().describe("Article title or partial title to match (e.g., 'Loading Documents', 'OCR', 'PDF')")
    }
  },
  async ({ title }) => {
    const titleLower = title.toLowerCase();

    // Try exact match first, then partial match
    let article = dwtDocs.articles.find(a => a.title.toLowerCase() === titleLower);

    if (!article) {
      // Try partial match on title
      article = dwtDocs.articles.find(a => a.title.toLowerCase().includes(titleLower));
    }

    if (!article) {
      // Try matching URL
      article = dwtDocs.articles.find(a => a.url.toLowerCase().includes(titleLower));
    }

    if (!article) {
      // Suggest similar articles
      const suggestions = dwtDocs.articles
        .filter(a => {
          const words = titleLower.split(/\s+/);
          return words.some(w => a.title.toLowerCase().includes(w) || a.breadcrumb.toLowerCase().includes(w));
        })
        .slice(0, 5)
        .map(a => `- ${a.title}`);

      return {
        content: [{
          type: "text",
          text: `Article "${title}" not found.\n\n${suggestions.length > 0 ? `Similar articles:\n${suggestions.join("\n")}` : "Use search_dwt_docs to find relevant articles."}`
        }]
      };
    }

    const lines = [
      `# ${article.title}`,
      "",
      `**Category:** ${article.breadcrumb}`,
      `**URL:** ${article.url}`,
      "",
      "---",
      "",
      article.content
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_code_snippet
// ============================================================================

server.registerTool(
  "get_code_snippet",
  {
    title: "Get Code Snippet",
    description: "Get actual source code from mobile sample projects",
    inputSchema: {
      platform: z.enum(["android", "ios"]).describe("Platform: android or ios"),
      sample_name: z.string().describe("Sample name, e.g. ScanSingleBarcode, DecodeWithCameraEnhancer"),
      api_level: z.string().optional().describe("API level: high-level or low-level"),
      language: z.string().optional().describe("Language: java, kotlin, swift"),
      file_name: z.string().optional().describe("Specific file to retrieve")
    }
  },
  async ({ platform, sample_name, api_level, language, file_name }) => {
    const level = normalizeApiLevel(api_level);
    const normalizedSample = normalizeSampleName(sample_name);

    let samplePath = getMobileSamplePath(platform, level, normalizedSample);
    let actualLevel = level;

    if (!existsSync(samplePath)) {
      const otherLevel = level === "high-level" ? "low-level" : "high-level";
      samplePath = getMobileSamplePath(platform, otherLevel, normalizedSample);
      actualLevel = otherLevel;

      if (!existsSync(samplePath)) {
        const samples = discoverMobileSamples(platform);
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
// TOOL: get_python_sample
// ============================================================================

server.registerTool(
  "get_python_sample",
  {
    title: "Get Python Sample",
    description: "Get Python SDK sample code",
    inputSchema: {
      sample_name: z.string().describe("Sample name, e.g. read_an_image, video_decoding")
    }
  },
  async ({ sample_name }) => {
    const normalizedSample = normalizeSampleName(sample_name);
    const samplePath = getPythonSamplePath(normalizedSample);

    if (!existsSync(samplePath)) {
      const samples = discoverPythonSamples();
      return { content: [{ type: "text", text: `Sample "${sample_name}" not found.\n\nAvailable:\n${samples.map(s => `- ${s}`).join("\n")}` }] };
    }

    const content = readCodeFile(samplePath);
    if (!content) {
      return { content: [{ type: "text", text: `Could not read "${sample_name}".` }] };
    }

    const sdkEntry = registry.sdks["dbr-python"];

    const output = [
      `# Python Sample: ${normalizedSample}`,
      "",
      `**SDK Version:** ${sdkEntry.version}`,
      `**Install:** \`pip install dynamsoft-barcode-reader-bundle\``,
      `**Trial License:** \`${registry.trial_license}\``,
      "",
      "```python",
      content,
      "```"
    ];

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_dwt_sample
// ============================================================================

server.registerTool(
  "get_dwt_sample",
  {
    title: "Get DWT Sample",
    description: "Get Dynamic Web TWAIN sample code",
    inputSchema: {
      category: z.string().describe("Category: scan, input-options, output-options, classification, UI-customization"),
      sample_name: z.string().describe("Sample name, e.g. basic-scan, read-barcode, save")
    }
  },
  async ({ category, sample_name }) => {
    const normalizedSample = normalizeSampleName(sample_name);
    const samplePath = getDwtSamplePath(category, normalizedSample);

    if (!samplePath || !existsSync(samplePath)) {
      const categories = discoverDwtSamples();
      const catSamples = categories[category];
      if (!catSamples) {
        return { content: [{ type: "text", text: `Category "${category}" not found.\n\nAvailable categories:\n${Object.keys(categories).map(c => `- ${c}`).join("\n")}` }] };
      }
      return { content: [{ type: "text", text: `Sample "${sample_name}" not found in "${category}".\n\nAvailable:\n${catSamples.map(s => `- ${s}`).join("\n")}` }] };
    }

    const content = readCodeFile(samplePath);
    if (!content) {
      return { content: [{ type: "text", text: `Could not read "${sample_name}".` }] };
    }

    const sdkEntry = registry.sdks["dwt"];

    const output = [
      `# Dynamic Web TWAIN: ${normalizedSample}`,
      "",
      `**Category:** ${category}`,
      `**SDK Version:** ${sdkEntry.version}`,
      `**Install:** \`npm install dwt\``,
      `**CDN:** \`${sdkEntry.platforms.web.installation.cdn}\``,
      `**Trial License:** \`${registry.trial_license}\``,
      "",
      "```html",
      content,
      "```"
    ];

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_quick_start
// ============================================================================

server.registerTool(
  "get_quick_start",
  {
    title: "Get Quick Start",
    description: "Get complete quick start guide with working code",
    inputSchema: {
      sdk: z.string().optional().describe("SDK: dbr-mobile, dbr-python, dbr-web, dwt"),
      platform: z.enum(["android", "ios"]).optional().describe("Platform: android or ios (for mobile)"),
      api_level: z.string().optional().describe("API level: high-level or low-level"),
      language: z.string().optional().describe("Language: java, kotlin, swift"),
      use_case: z.string().optional().describe("Use case: single-barcode, multiple-barcodes, image-file")
    }
  },
  async ({ sdk, platform, api_level, language, use_case }) => {
    const sdkId = normalizeSdkId(sdk || "dbr-mobile");

    // Handle Python SDK
    if (sdkId === "dbr-python") {
      const sdkEntry = registry.sdks["dbr-python"];
      const sampleName = use_case?.includes("video") ? "video_decoding" : "read_an_image";
      const samplePath = getPythonSamplePath(sampleName);

      if (!existsSync(samplePath)) {
        return { content: [{ type: "text", text: `Sample not found. Use list_python_samples to see available.` }] };
      }

      const content = readCodeFile(samplePath);

      return {
        content: [{
          type: "text", text: [
            "# Quick Start: Python Barcode Reader",
            "",
            `**SDK Version:** ${sdkEntry.version}`,
            `**Trial License:** \`${registry.trial_license}\``,
            "",
            "## Step 1: Install",
            "```bash",
            "pip install dynamsoft-barcode-reader-bundle",
            "```",
            "",
            `## Step 2: ${sampleName}.py`,
            "```python",
            content,
            "```",
            "",
            "## Notes",
            "- Trial license requires network connection",
            `- User Guide: ${sdkEntry.platforms.python.docs["user-guide"]}`
          ].join("\n")
        }]
      };
    }

    // Handle DWT SDK
    if (sdkId === "dwt") {
      const sdkEntry = registry.sdks["dwt"];
      const samplePath = getDwtSamplePath("scan", "basic-scan");

      if (!samplePath || !existsSync(samplePath)) {
        return { content: [{ type: "text", text: `Sample not found. Use list_dwt_categories to see available.` }] };
      }

      const content = readCodeFile(samplePath);

      return {
        content: [{
          type: "text", text: [
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
            "npm install dwt",
            "```",
            "",
            "## Sample: basic-scan.html",
            "```html",
            content,
            "```",
            "",
            "## Notes",
            "- Trial license requires network connection",
            `- User Guide: ${sdkEntry.platforms.web.docs["user-guide"]}`
          ].join("\n")
        }]
      };
    }

    // Handle Web Barcode Reader SDK
    if (sdkId === "dbr-web") {
      const sdkEntry = registry.sdks["dbr-web"];
      const sampleName = use_case?.includes("image") ? "read-an-image" : "hello-world";
      const samplePath = getWebSamplePath("root", sampleName);

      if (!samplePath || !existsSync(samplePath)) {
        return { content: [{ type: "text", text: `Sample not found. Use list_web_samples to see available.` }] };
      }

      const content = readCodeFile(samplePath);

      return {
        content: [{
          type: "text", text: [
            "# Quick Start: Web Barcode Reader",
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
            "npm install dynamsoft-barcode-reader-bundle",
            "```",
            "",
            `## Sample: ${sampleName}.html`,
            "```html",
            content,
            "```",
            "",
            "## Notes",
            "- Trial license requires network connection",
            `- User Guide: ${sdkEntry.platforms.web.docs["user-guide"]}`
          ].join("\n")
        }]
      };
    }

    // Handle Mobile SDK (original logic)
    const level = normalizeApiLevel(api_level);
    const platformKey = platform || "android";

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

    const samplePath = getMobileSamplePath(platformKey, level, sampleName);
    if (!existsSync(samplePath)) {
      return { content: [{ type: "text", text: `Sample not found. Use list_samples to see available.` }] };
    }

    const mainFile = getMainCodeFile(platformKey, samplePath);
    if (!mainFile) {
      return { content: [{ type: "text", text: `Could not find main code file.` }] };
    }

    const content = readCodeFile(mainFile.path);
    const sdkEntry = registry.sdks["dbr-mobile"];
    const langExt = mainFile.filename.split(".").pop();

    let deps = "";
    if (platformKey === "android") {
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
      `# Quick Start: ${sampleName} - ${platformKey}`,
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
      `- User Guide: ${sdkEntry.platforms[platformKey]?.docs[level]?.["user-guide"] || "N/A"}`
    ];

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_gradle_config
// ============================================================================

server.registerTool(
  "get_gradle_config",
  {
    title: "Get Gradle Config",
    description: "Get Android Gradle configuration",
    inputSchema: {
      sample_name: z.string().optional().describe("Sample to get config from")
    }
  },
  async ({ sample_name }) => {
    const sdkEntry = registry.sdks["dbr-mobile"];
    const sampleName = sample_name || "ScanSingleBarcode";

    const highLevelPath = join(codeSnippetRoot, "dynamsoft-barcode-reader", "android", "BarcodeScannerAPISamples");
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

server.registerTool(
  "get_license_info",
  {
    title: "Get License Info",
    description: "Get license setup code for different platforms",
    inputSchema: {
      platform: z.enum(["android", "ios"]).describe("Platform: android or ios"),
      language: z.string().optional().describe("Language: java, kotlin, swift")
    }
  },
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

server.registerTool(
  "get_api_usage",
  {
    title: "Get API Usage",
    description: "Get usage examples for specific Dynamsoft APIs",
    inputSchema: {
      api_name: z.string().describe("API name: BarcodeScannerConfig, CaptureVisionRouter, etc."),
      platform: z.enum(["android", "ios"]).optional().describe("Platform: android or ios")
    }
  },
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

server.registerTool(
  "search_samples",
  {
    title: "Search Samples",
    description: "Search for code samples by keyword or feature",
    inputSchema: {
      keyword: z.string().describe("Keyword to search: camera, image, settings, etc."),
      platform: z.enum(["android", "ios"]).optional().describe("Platform filter")
    }
  },
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
// TOOL: generate_project
// ============================================================================

server.registerTool(
  "generate_project",
  {
    title: "Generate Project",
    description: "Generate a complete project structure based on a sample",
    inputSchema: {
      platform: z.enum(["android", "ios"]).describe("Platform: android or ios"),
      sample_name: z.string().optional().describe("Sample to use as template (default: ScanSingleBarcode)"),
      api_level: z.string().optional().describe("API level: high-level or low-level")
    }
  },
  async ({ platform, sample_name, api_level }) => {
    const level = normalizeApiLevel(api_level);
    const name = sample_name || "ScanSingleBarcode";
    const samplePath = getMobileSamplePath(platform, level, name);

    if (!existsSync(samplePath)) {
      return { content: [{ type: "text", text: `Sample "${name}" not found.` }] };
    }

    const files = [];
    const textExtensions = [
      ".java", ".kt", ".swift", ".m", ".h", ".xml", ".gradle", ".properties",
      ".pro", ".json", ".plist", ".storyboard", ".xib", ".gitignore", ".md"
    ];

    function walk(dir, root) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry === "build" || entry === ".gradle" || entry === ".idea" || entry === ".git" || entry === "capturedImages") continue;

        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath, root);
        } else {
          const ext = "." + entry.split(".").pop();
          if (textExtensions.includes(ext) || entry === "gradlew" || entry === "Podfile") {
            try {
              const content = readFileSync(fullPath, "utf-8");
              // Normalize newlines
              const normalized = content.replace(/\r\n/g, "\n");
              files.push({
                path: fullPath.replace(root + "\\", "").replace(root + "/", ""),
                content: normalized,
                ext: ext.replace(".", "")
              });
            } catch (e) {
              // Ignore binary read errors if any
            }
          }
        }
      }
    }

    walk(samplePath, samplePath);

    // Filter out huge files if any (limit 50KB per file to avoid context overflow)
    const validFiles = files.filter(f => f.content.length < 50000);

    const output = [
      `# Project Generation: ${name} (${platform})`,
      "",
      `**SDK Version:** ${registry.sdks["dbr-mobile"].version}`,
      `**Level:** ${level}`,
      "",
      "This output contains the complete file structure for the project.",
      "You can use these files to reconstruct the project locally.",
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

// ============================================================================
// MCP Resources
// ============================================================================

// SDK Info resource
server.registerResource(
  "sdk-info",
  "dynamsoft://sdk-info",
  {
    title: "Dynamsoft SDK Information",
    description: "Dynamsoft SDKs information including versions and platforms",
    mimeType: "application/json"
  },
  async (uri) => {
    const info = {
      trial_license: registry.trial_license,
      license_request_url: registry.license_request_url,
      maven_url: registry.maven_url,
      sdks: Object.entries(registry.sdks).map(([id, sdk]) => ({
        id,
        name: sdk.name,
        version: sdk.version,
        platforms: Object.keys(sdk.platforms)
      }))
    };
    return { contents: [{ uri: uri.href, text: JSON.stringify(info, null, 2), mimeType: "application/json" }] };
  }
);

// Register mobile sample resources dynamically
for (const platform of ["android", "ios"]) {
  const samples = discoverMobileSamples(platform);
  for (const level of ["high-level", "low-level"]) {
    for (const sampleName of samples[level]) {
      const resourceUri = `dynamsoft://samples/mobile/${platform}/${level}/${sampleName}`;
      const resourceName = `mobile-${platform}-${level}-${sampleName}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      server.registerResource(
        resourceName,
        resourceUri,
        {
          title: `${sampleName} (${platform})`,
          description: `${sampleName} for ${platform} (${level})`,
          mimeType: "text/plain"
        },
        async (uri) => {
          const samplePath = getMobileSamplePath(platform, level, sampleName);
          const mainFile = getMainCodeFile(platform, samplePath);
          if (!mainFile) {
            return { contents: [{ uri: uri.href, text: "Sample not found", mimeType: "text/plain" }] };
          }
          const content = readCodeFile(mainFile.path);
          const ext = mainFile.filename.split(".").pop();
          const mimeType = ext === "swift" ? "text/x-swift" : ext === "kt" ? "text/x-kotlin" : ext === "java" ? "text/x-java" : "text/plain";
          return { contents: [{ uri: uri.href, text: content, mimeType }] };
        }
      );
    }
  }
}

// Register Python sample resources
const pythonSamples = discoverPythonSamples();
for (const sampleName of pythonSamples) {
  const resourceUri = `dynamsoft://samples/python/${sampleName}`;
  const resourceName = `python-${sampleName}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  server.registerResource(
    resourceName,
    resourceUri,
    {
      title: `Python: ${sampleName}`,
      description: `Python sample: ${sampleName}`,
      mimeType: "text/x-python"
    },
    async (uri) => {
      const samplePath = getPythonSamplePath(sampleName);
      const content = existsSync(samplePath) ? readCodeFile(samplePath) : "Sample not found";
      return { contents: [{ uri: uri.href, text: content, mimeType: "text/x-python" }] };
    }
  );
}

// Register Web barcode reader sample resources
const webCategories = discoverWebSamples();
for (const [category, samples] of Object.entries(webCategories)) {
  for (const sampleName of samples) {
    const resourceUri = `dynamsoft://samples/web/${category}/${sampleName}`;
    const resourceName = `web-${category}-${sampleName}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    server.registerResource(
      resourceName,
      resourceUri,
      {
        title: `Web: ${sampleName}`,
        description: `Web barcode reader ${category}: ${sampleName}`,
        mimeType: "text/html"
      },
      async (uri) => {
        const samplePath = getWebSamplePath(category, sampleName);
        const content = samplePath && existsSync(samplePath) ? readCodeFile(samplePath) : "Sample not found";
        return { contents: [{ uri: uri.href, text: content, mimeType: "text/html" }] };
      }
    );
  }
}

// Register DWT sample resources
const dwtCategories = discoverDwtSamples();
for (const [category, samples] of Object.entries(dwtCategories)) {
  for (const sampleName of samples) {
    const resourceUri = `dynamsoft://samples/dwt/${category}/${sampleName}`;
    const resourceName = `dwt-${category}-${sampleName}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    server.registerResource(
      resourceName,
      resourceUri,
      {
        title: `DWT: ${sampleName}`,
        description: `DWT ${category}: ${sampleName}`,
        mimeType: "text/html"
      },
      async (uri) => {
        const samplePath = getDwtSamplePath(category, sampleName);
        const content = samplePath && existsSync(samplePath) ? readCodeFile(samplePath) : "Sample not found";
        return { contents: [{ uri: uri.href, text: content, mimeType: "text/html" }] };
      }
    );
  }
}

// Register DWT API documentation resources
for (let i = 0; i < dwtDocs.articles.length; i++) {
  const article = dwtDocs.articles[i];
  const resourceName = `dwt-doc-${i}`.toLowerCase();
  const resourceUri = `dynamsoft://docs/dwt/${encodeURIComponent(article.title)}`;
  server.registerResource(
    resourceName,
    resourceUri,
    {
      title: `DWT Doc: ${article.title}`,
      description: `${article.breadcrumb}: ${article.title}`,
      mimeType: "text/markdown"
    },
    async (uri) => {
      const content = [
        `# ${article.title}`,
        "",
        `**Category:** ${article.breadcrumb}`,
        `**URL:** ${article.url}`,
        "",
        "---",
        "",
        article.content
      ].join("\n");
      return { contents: [{ uri: uri.href, text: content, mimeType: "text/markdown" }] };
    }
  );
}

// ============================================================================
// Start Server
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);
