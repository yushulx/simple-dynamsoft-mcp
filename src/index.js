#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import Fuse from "fuse.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
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

function normalizeProduct(product) {
  if (!product) return "";
  const normalized = product.trim().toLowerCase();
  if (["dbr", "barcode reader", "barcode-reader", "dynamsoft barcode reader"].includes(normalized)) {
    return "dbr";
  }
  if (["dwt", "dynamic web twain", "web twain", "webtwain"].includes(normalized)) {
    return "dwt";
  }
  return normalized;
}

function normalizeEdition(edition, platform, product) {
  if (product === "dwt") return "web";
  const normalizedPlatform = normalizePlatform(platform);

  if (!edition) {
    if (["android", "ios"].includes(normalizedPlatform)) return "mobile";
    if (normalizedPlatform === "web") return "web";
    if (normalizedPlatform === "python") return "python";
    return "";
  }

  const normalized = edition.trim().toLowerCase();
  if (["mobile", "android", "ios"].includes(normalized)) return "mobile";
  if (["web", "javascript", "js", "typescript", "ts"].includes(normalized)) return "web";
  if (["python", "py"].includes(normalized)) return "python";
  if (["java"].includes(normalized)) return "java";
  if (["c++", "cpp"].includes(normalized)) return "cpp";
  if ([".net", "dotnet", "c#", "csharp"].includes(normalized)) return "dotnet";
  return normalized;
}

function inferProductFromQuery(query) {
  if (!query) return "";
  const normalized = query.toLowerCase();
  if (normalized.includes("dwt") || normalized.includes("web twain") || normalized.includes("webtwain")) {
    return "dwt";
  }
  if (normalized.includes("dbr") || normalized.includes("barcode reader") || normalized.includes("barcode")) {
    return "dbr";
  }
  return "";
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

function findCodeFilesInSample(samplePath, maxDepth = 15) {
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
// Resource index + version policy
// ============================================================================

/**
 * @typedef {{
 *   id: string;
 *   uri: string;
 *   type: "doc" | "sample" | "index" | "policy";
 *   product?: "dbr" | "dwt";
 *   edition?: string;
 *   platform?: string;
 *   version?: string;
 *   majorVersion?: number;
 *   title: string;
 *   summary: string;
 *   mimeType: string;
 *   tags: string[];
 *   pinned?: boolean;
 *   loadContent: () => Promise<{ text?: string; blob?: string; mimeType?: string }>;
 * }} ResourceEntry
 */

const resourceIndex = [];

const LEGACY_DBR_LINKS = {
  "10": {
    web: { web: "https://www.dynamsoft.com/barcode-reader/docs/v10/web/programming/javascript/" },
    cpp: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v10/server/programming/cplusplus/" },
    java: { desktop: null },
    dotnet: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v10/server/programming/dotnet/" },
    python: { desktop: "http://dynamsoft.com/barcode-reader/docs/v10/server/programming/python/" },
    mobile: { android: null, ios: null }
  },
  "9": {
    web: { web: "https://www.dynamsoft.com/barcode-reader/docs/v9/web/programming/javascript/" },
    cpp: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v9/server/programming/cplusplus/" },
    java: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v9/server/programming/java/" },
    dotnet: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v9/server/programming/dotnet/" },
    python: { desktop: "https://www.dynamsoft.com/barcode-reader/docs/v9/server/programming/python/" },
    mobile: {
      android: "https://www.dynamsoft.com/barcode-reader/docs/v9/mobile/programming/android/",
      ios: "https://www.dynamsoft.com/barcode-reader/docs/v9/mobile/programming/objectivec-swift/"
    }
  }
};

const LEGACY_DWT_LINKS = {
  "18.5.1": "https://www.dynamsoft.com/web-twain/docs-archive/v18.5.1/info/api/",
  "18.4": "https://www.dynamsoft.com/web-twain/docs-archive/v18.4/info/api/",
  "18.3": "https://www.dynamsoft.com/web-twain/docs-archive/v18.3/info/api/",
  "18.1": "https://www.dynamsoft.com/web-twain/docs-archive/v18.1/info/api/",
  "18.0": "https://www.dynamsoft.com/web-twain/docs-archive/v18.0/info/api/",
  "17.3": "https://www.dynamsoft.com/web-twain/docs-archive/v17.3/info/api/",
  "17.2.1": "https://www.dynamsoft.com/web-twain/docs-archive/v17.2.1/info/api/",
  "17.1.1": "https://www.dynamsoft.com/web-twain/docs-archive/v17.1.1/info/api/",
  "17.0": "https://www.dynamsoft.com/web-twain/docs-archive/v17.0/info/api/",
  "16.2": "https://www.dynamsoft.com/web-twain/docs-archive/v16.2/info/api/",
  "16.1.1": "https://www.dynamsoft.com/web-twain/docs-archive/v16.1.1/info/api/"
};

const LATEST_VERSIONS = {
  dbr: {
    mobile: registry.sdks["dbr-mobile"].version,
    web: registry.sdks["dbr-web"].version,
    python: registry.sdks["dbr-python"].version
  },
  dwt: {
    web: registry.sdks["dwt"].version
  }
};

const LATEST_MAJOR = {
  dbr: parseMajorVersion(registry.sdks["dbr-mobile"].version),
  dwt: parseMajorVersion(registry.sdks["dwt"].version)
};

function parseMajorVersion(version) {
  if (!version) return null;
  const match = String(version).match(/(\d+)/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function getMimeTypeForExtension(ext) {
  const normalized = ext.replace(/^\./, "").toLowerCase();
  if (normalized === "swift") return "text/x-swift";
  if (normalized === "kt") return "text/x-kotlin";
  if (normalized === "java") return "text/x-java";
  if (normalized === "py") return "text/x-python";
  if (normalized === "html") return "text/html";
  if (normalized === "md" || normalized === "markdown") return "text/markdown";
  if (normalized === "json") return "application/json";
  if (normalized === "png") return "image/png";
  return "text/plain";
}

function addResourceToIndex(entry) {
  resourceIndex.push(entry);
}

function formatLegacyLinksForDBR(major) {
  const byMajor = LEGACY_DBR_LINKS[String(major)];
  if (!byMajor) {
    return `No legacy docs are available for DBR v${major}.`;
  }

  const lines = [
    `Legacy docs for DBR v${major}:`,
    `- Web JS: ${byMajor.web.web || "Not available"}`,
    `- C++: ${byMajor.cpp.desktop || "Not available"}`,
    `- Java: ${byMajor.java.desktop || "Not available"}`,
    `- .NET: ${byMajor.dotnet.desktop || "Not available"}`,
    `- Python: ${byMajor.python.desktop || "Not available"}`,
    `- Android: ${byMajor.mobile.android || "Not available"}`,
    `- iOS: ${byMajor.mobile.ios || "Not available"}`
  ];

  return lines.join("\n");
}

function getLegacyLink(product, version, edition, platform) {
  if (product === "dwt") {
    if (!version) return null;
    return LEGACY_DWT_LINKS[version] || null;
  }

  if (product !== "dbr") return null;
  const major = parseMajorVersion(version);
  if (!major) return null;

  const byMajor = LEGACY_DBR_LINKS[String(major)];
  if (!byMajor) return null;

  const normalizedEdition = edition || "web";
  if (normalizedEdition === "mobile") {
    if (platform === "android") return byMajor.mobile.android;
    if (platform === "ios") return byMajor.mobile.ios;
    return null;
  }
  if (normalizedEdition === "web") return byMajor.web.web;
  if (normalizedEdition === "python") return byMajor.python.desktop;
  if (normalizedEdition === "cpp") return byMajor.cpp.desktop;
  if (normalizedEdition === "java") return byMajor.java.desktop;
  if (normalizedEdition === "dotnet") return byMajor.dotnet.desktop;
  return null;
}

function detectMajorFromQuery(query) {
  if (!query) return null;
  const text = String(query);
  const explicit = text.match(/(?:\bv|\bversion\s*)(\d{1,2})(?:\.\d+)?/i);
  const productScoped = text.match(/(?:dbr|dwt)[^0-9]*(\d{1,2})(?:\.\d+)?/i);
  const match = explicit || productScoped;
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  return Number.isNaN(major) ? null : major;
}

function ensureLatestMajor({ product, version, query, edition, platform }) {
  const inferredProduct = product || inferProductFromQuery(query);
  if (!inferredProduct) return { ok: true };

  const latestMajor = LATEST_MAJOR[inferredProduct];
  const requestedMajor = parseMajorVersion(version) ?? detectMajorFromQuery(query);

  if (!requestedMajor || requestedMajor === latestMajor) {
    return { ok: true, latestMajor };
  }

  if (inferredProduct === "dbr" && requestedMajor < 9) {
    return {
      ok: false,
      message: `This MCP server only serves the latest major version of DBR (v${latestMajor}). DBR versions prior to v9 are not available.`
    };
  }

  if (inferredProduct === "dwt" && requestedMajor < 16) {
    return {
      ok: false,
      message: `This MCP server only serves the latest major version of DWT (v${latestMajor}). DWT versions prior to v16 are not available.`
    };
  }

  if (inferredProduct === "dbr") {
    const link = getLegacyLink("dbr", String(requestedMajor), edition, platform);
    const fallback = formatLegacyLinksForDBR(requestedMajor);
    return {
      ok: false,
      message: [
        `This MCP server only serves the latest major version of DBR (v${latestMajor}).`,
        link ? `Legacy docs: ${link}` : fallback
      ].join("\n")
    };
  }

  if (inferredProduct === "dwt") {
    const available = Object.keys(LEGACY_DWT_LINKS).sort();
    const link = getLegacyLink("dwt", String(version), edition, platform);
    const legacyNote = link
      ? `Legacy docs: ${link}`
      : `Available archived DWT versions: ${available.join(", ")}`;
    return {
      ok: false,
      message: [
        `This MCP server only serves the latest major version of DWT (v${latestMajor}).`,
        legacyNote
      ].join("\n")
    };
  }

  return { ok: false, message: "Unsupported version request." };
}

function parseResourceUri(uri) {
  if (!uri || !uri.includes("://")) return null;
  const [scheme, rest] = uri.split("://");
  const parts = rest.split("/").filter(Boolean);
  if (parts.length < 4) return { scheme, parts };
  return {
    scheme,
    product: parts[0],
    edition: parts[1],
    platform: parts[2],
    version: parts[3],
    parts
  };
}

function parseSampleUri(uri) {
  const parsed = parseResourceUri(uri);
  if (!parsed || parsed.scheme !== "sample" || !parsed.product) return null;

  if (parsed.product === "dbr" && parsed.edition === "mobile") {
    return {
      product: "dbr",
      edition: "mobile",
      platform: parsed.platform,
      version: parsed.version,
      level: parsed.parts[4],
      sampleName: parsed.parts[5]
    };
  }

  if (parsed.product === "dbr" && parsed.edition === "web") {
    return {
      product: "dbr",
      edition: "web",
      platform: parsed.platform,
      version: parsed.version,
      category: parsed.parts[4],
      sampleName: parsed.parts[5]
    };
  }

  if (parsed.product === "dbr" && parsed.edition === "python") {
    return {
      product: "dbr",
      edition: "python",
      platform: parsed.platform,
      version: parsed.version,
      sampleName: parsed.parts[4]
    };
  }

  if (parsed.product === "dwt") {
    return {
      product: "dwt",
      edition: parsed.edition,
      platform: parsed.platform,
      version: parsed.version,
      category: parsed.parts[4],
      sampleName: parsed.parts[5]
    };
  }

  return null;
}

function buildVersionPolicyText() {
  const dbrMajor = LATEST_MAJOR.dbr;
  const dwtMajor = LATEST_MAJOR.dwt;
  const dwtLegacyVersions = Object.keys(LEGACY_DWT_LINKS).sort().join(", ");

  return [
    "# Version Policy",
    "",
    `- This MCP server serves the latest major versions only (DBR v${dbrMajor}, DWT v${dwtMajor}).`,
    "- Requests for older major versions are refused.",
    "- DBR legacy docs are only available for v9 and v10 (no docs prior to v9).",
    "- DWT archived docs are available for versions: " + dwtLegacyVersions,
    "",
    "Use the official Dynamsoft documentation if you must target older versions."
  ].join("\n");
}

function buildIndexData() {
  const dbrMobileVersion = LATEST_VERSIONS.dbr.mobile;
  const dbrWebVersion = LATEST_VERSIONS.dbr.web;
  const dbrPythonVersion = LATEST_VERSIONS.dbr.python;
  const dwtVersion = LATEST_VERSIONS.dwt.web;

  const mobileAndroid = discoverMobileSamples("android");
  const mobileIos = discoverMobileSamples("ios");
  const webSamples = discoverWebSamples();
  const pythonSamples = discoverPythonSamples();
  const dwtSamples = discoverDwtSamples();

  return {
    products: {
      dbr: {
        latestMajor: LATEST_MAJOR.dbr,
        editions: {
          mobile: {
            version: dbrMobileVersion,
            platforms: ["android", "ios"],
            apiLevels: ["high-level", "low-level"],
            samples: {
              android: mobileAndroid,
              ios: mobileIos
            }
          },
          web: {
            version: dbrWebVersion,
            platforms: ["web"],
            samples: webSamples
          },
          python: {
            version: dbrPythonVersion,
            platforms: ["python"],
            samples: pythonSamples
          }
        }
      },
      dwt: {
        latestMajor: LATEST_MAJOR.dwt,
        editions: {
          web: {
            version: dwtVersion,
            platforms: ["web"],
            sampleCategories: dwtSamples,
            docCount: dwtDocs.articles.length,
            docTitles: dwtDocs.articles.map((article) => ({
              title: article.title,
              category: article.breadcrumb || ""
            }))
          }
        }
      }
    }
  };
}

function buildResourceIndex() {
  addResourceToIndex({
    id: "index",
    uri: "doc://index",
    type: "index",
    title: "Dynamsoft MCP Index",
    summary: "Compact index of products, editions, versions, samples, and docs.",
    mimeType: "application/json",
    tags: ["index", "overview", "catalog"],
    pinned: true,
    loadContent: async () => ({
      text: JSON.stringify(buildIndexData(), null, 2),
      mimeType: "application/json"
    })
  });

  addResourceToIndex({
    id: "version-policy",
    uri: "doc://version-policy",
    type: "policy",
    title: "Version Policy",
    summary: "Latest major versions only; legacy docs are linked for select versions.",
    mimeType: "text/markdown",
    tags: ["policy", "version", "support"],
    pinned: true,
    loadContent: async () => ({
      text: buildVersionPolicyText(),
      mimeType: "text/markdown"
    })
  });

  const dbrMobileVersion = LATEST_VERSIONS.dbr.mobile;
  const dbrWebVersion = LATEST_VERSIONS.dbr.web;
  const dbrPythonVersion = LATEST_VERSIONS.dbr.python;
  const dwtVersion = LATEST_VERSIONS.dwt.web;

  // DBR mobile samples (main file only)
  for (const platform of ["android", "ios"]) {
    const samples = discoverMobileSamples(platform);
    for (const level of ["high-level", "low-level"]) {
      for (const sampleName of samples[level]) {
        addResourceToIndex({
          id: `dbr-mobile-${platform}-${level}-${sampleName}`,
          uri: `sample://dbr/mobile/${platform}/${dbrMobileVersion}/${level}/${sampleName}`,
          type: "sample",
          product: "dbr",
          edition: "mobile",
          platform,
          version: dbrMobileVersion,
          majorVersion: LATEST_MAJOR.dbr,
          title: `${sampleName} (${platform}, ${level})`,
          summary: `DBR mobile ${platform} ${level} sample ${sampleName}.`,
          mimeType: "text/plain",
          tags: ["sample", "dbr", "mobile", platform, level, sampleName],
          loadContent: async () => {
            const samplePath = getMobileSamplePath(platform, level, sampleName);
            const mainFile = getMainCodeFile(platform, samplePath);
            if (!mainFile) {
              return { text: "Sample not found", mimeType: "text/plain" };
            }
            const content = readCodeFile(mainFile.path);
            const ext = mainFile.filename.split(".").pop() || "";
            return { text: content, mimeType: getMimeTypeForExtension(ext) };
          }
        });
      }
    }
  }

  // DBR Python samples
  for (const sampleName of discoverPythonSamples()) {
    addResourceToIndex({
      id: `dbr-python-${sampleName}`,
      uri: `sample://dbr/python/python/${dbrPythonVersion}/${sampleName}`,
      type: "sample",
      product: "dbr",
      edition: "python",
      platform: "python",
      version: dbrPythonVersion,
      majorVersion: LATEST_MAJOR.dbr,
      title: `Python sample: ${sampleName}`,
      summary: `DBR Python sample ${sampleName}.`,
      mimeType: "text/x-python",
      tags: ["sample", "dbr", "python", sampleName],
      loadContent: async () => {
        const samplePath = getPythonSamplePath(sampleName);
        const content = existsSync(samplePath) ? readCodeFile(samplePath) : "Sample not found";
        return { text: content, mimeType: "text/x-python" };
      }
    });
  }

  // DBR web samples
  const webCategories = discoverWebSamples();
  for (const [category, samples] of Object.entries(webCategories)) {
    for (const sampleName of samples) {
      addResourceToIndex({
        id: `dbr-web-${category}-${sampleName}`,
        uri: `sample://dbr/web/web/${dbrWebVersion}/${category}/${sampleName}`,
        type: "sample",
        product: "dbr",
        edition: "web",
        platform: "web",
        version: dbrWebVersion,
        majorVersion: LATEST_MAJOR.dbr,
        title: `Web sample: ${sampleName} (${category})`,
        summary: `DBR web sample ${category}/${sampleName}.`,
        mimeType: "text/html",
        tags: ["sample", "dbr", "web", category, sampleName],
        loadContent: async () => {
          const samplePath = getWebSamplePath(category, sampleName);
          const content = samplePath && existsSync(samplePath) ? readCodeFile(samplePath) : "Sample not found";
          return { text: content, mimeType: "text/html" };
        }
      });
    }
  }

  // DWT samples
  const dwtCategories = discoverDwtSamples();
  for (const [category, samples] of Object.entries(dwtCategories)) {
    for (const sampleName of samples) {
      addResourceToIndex({
        id: `dwt-${category}-${sampleName}`,
        uri: `sample://dwt/web/web/${dwtVersion}/${category}/${sampleName}`,
        type: "sample",
        product: "dwt",
        edition: "web",
        platform: "web",
        version: dwtVersion,
        majorVersion: LATEST_MAJOR.dwt,
        title: `DWT sample: ${sampleName} (${category})`,
        summary: `Dynamic Web TWAIN sample ${category}/${sampleName}.`,
        mimeType: "text/html",
        tags: ["sample", "dwt", category, sampleName],
        loadContent: async () => {
          const samplePath = getDwtSamplePath(category, sampleName);
          const content = samplePath && existsSync(samplePath) ? readCodeFile(samplePath) : "Sample not found";
          return { text: content, mimeType: "text/html" };
        }
      });
    }
  }

  // DWT documentation articles
  for (let i = 0; i < dwtDocs.articles.length; i++) {
    const article = dwtDocs.articles[i];
    const slug = `${encodeURIComponent(article.title)}-${i}`;
    const tags = ["doc", "dwt"];
    if (article.breadcrumb) {
      tags.push(...article.breadcrumb.toLowerCase().split(/\s*>\s*/));
    }
    addResourceToIndex({
      id: `dwt-doc-${i}`,
      uri: `doc://dwt/web/web/${dwtVersion}/${slug}`,
      type: "doc",
      product: "dwt",
      edition: "web",
      platform: "web",
      version: dwtVersion,
      majorVersion: LATEST_MAJOR.dwt,
      title: article.title,
      summary: article.breadcrumb || "Dynamic Web TWAIN documentation",
      mimeType: "text/markdown",
      tags,
      loadContent: async () => {
        const content = [
          `# ${article.title}`,
          "",
          article.breadcrumb ? `**Category:** ${article.breadcrumb}` : "",
          article.url ? `**URL:** ${article.url}` : "",
          "",
          "---",
          "",
          article.content
        ].filter(Boolean).join("\n");
        return { text: content, mimeType: "text/markdown" };
      }
    });
  }
}

buildResourceIndex();

const resourceSearch = new Fuse(resourceIndex, {
  keys: ["title", "summary", "tags", "uri"],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true
});

function getPinnedResources() {
  return resourceIndex.filter((entry) => entry.pinned);
}

async function readResourceContent(uri) {
  const resource = resourceIndex.find((entry) => entry.uri === uri);
  if (!resource) {
    return null;
  }
  const content = await resource.loadContent();
  return {
    uri,
    mimeType: content.mimeType || resource.mimeType || "text/plain",
    text: content.text,
    blob: content.blob
  };
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new McpServer({
  name: "simple-dynamsoft-mcp",
  version: "1.0.3",
  description: "MCP server for latest major versions of Dynamsoft SDKs: Barcode Reader (Mobile/Python/Web) and Dynamic Web TWAIN"
});

// ============================================================================
// TOOL: get_index
// ============================================================================

server.registerTool(
  "get_index",
  {
    title: "Get Index",
    description: "Get a compact index of products, editions, versions, and available samples/docs.",
    inputSchema: {}
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(buildIndexData(), null, 2) }]
  })
);

// ============================================================================
// TOOL: search
// ============================================================================

server.registerTool(
  "search",
  {
    title: "Search",
    description: "Unified search across docs and samples; returns resource links for lazy loading.",
    inputSchema: {
      query: z.string().describe("Keywords to search across docs and samples."),
      product: z.string().optional().describe("Product: dbr or dwt"),
      edition: z.string().optional().describe("Edition: mobile, web, python, java, cpp, dotnet"),
      platform: z.string().optional().describe("Platform: android, ios, web, python"),
      version: z.string().optional().describe("Version constraint (major or full version)"),
      type: z.enum(["doc", "sample", "index", "policy", "any"]).optional(),
      limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)")
    }
  },
  async ({ query, product, edition, platform, version, type, limit }) => {
    if (!query || !query.trim()) {
      return { isError: true, content: [{ type: "text", text: "Query is required." }] };
    }

    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

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

    const results = resourceSearch.search(query).map((result) => result.item).filter((entry) => {
      if (normalizedProduct && entry.product !== normalizedProduct) return false;
      if (normalizedEdition && entry.edition !== normalizedEdition) return false;
      if (normalizedPlatform && entry.platform !== normalizedPlatform) return false;
      if (type && type !== "any" && entry.type !== type) return false;
      return true;
    });

    const maxResults = Math.min(limit || 5, 10);
    const topResults = results.slice(0, maxResults);

    if (topResults.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No results for "${query}". Try get_index for available products or adjust filters.`
        }]
      };
    }

    const content = [
      {
        type: "text",
        text: `Found ${topResults.length} result(s) for "${query}". Read the links you need with resources/read.`
      }
    ];

    for (const entry of topResults) {
      const versionLabel = entry.version ? `v${entry.version}` : "n/a";
      const scopeLabel = [
        entry.product || "general",
        entry.edition || "",
        entry.platform || ""
      ].filter(Boolean).join("/");
      content.push({
        type: "resource_link",
        uri: entry.uri,
        name: entry.title,
        description: `${entry.type.toUpperCase()} | ${scopeLabel} | ${versionLabel} - ${entry.summary}`,
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

// ============================================================================
// TOOL: resolve_version
// ============================================================================

server.registerTool(
  "resolve_version",
  {
    title: "Resolve Version",
    description: "Resolve a concrete latest-major version for a product/edition/platform.",
    inputSchema: {
      product: z.string().describe("Product: dbr or dwt"),
      edition: z.string().optional().describe("Edition: mobile, web, python, java, cpp, dotnet"),
      platform: z.string().optional().describe("Platform: android, ios, web, python"),
      constraint: z.string().optional().describe("Version constraint, e.g., latest, 11.x, 10"),
      feature: z.string().optional().describe("Optional feature hint")
    }
  },
  async ({ product, edition, platform, constraint, feature }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

    if (!["dbr", "dwt"].includes(normalizedProduct)) {
      return { isError: true, content: [{ type: "text", text: `Unknown product "${product}". Use dbr or dwt.` }] };
    }

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

    if (normalizedProduct === "dbr") {
      if (!normalizedEdition) {
        const lines = [
          "# DBR Version Resolution",
          `- Latest major: v${LATEST_MAJOR.dbr}`,
          `- Mobile: ${LATEST_VERSIONS.dbr.mobile}`,
          `- Web: ${LATEST_VERSIONS.dbr.web}`,
          `- Python: ${LATEST_VERSIONS.dbr.python}`,
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

      const lines = [
        "# DBR Version Resolution",
        `- Edition: ${normalizedEdition}`,
        normalizedPlatform ? `- Platform: ${normalizedPlatform}` : "",
        `- Latest major: v${LATEST_MAJOR.dbr}`,
        `- Resolved version: ${resolved}`
      ].filter(Boolean);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    const lines = [
      "# DWT Version Resolution",
      `- Latest major: v${LATEST_MAJOR.dwt}`,
      `- Resolved version: ${LATEST_VERSIONS.dwt.web}`
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ============================================================================
// TOOL: get_quickstart
// ============================================================================

server.registerTool(
  "get_quickstart",
  {
    title: "Get Quickstart",
    description: "Opinionated quickstart for a target product/edition/platform.",
    inputSchema: {
      product: z.string().describe("Product: dbr or dwt"),
      edition: z.string().optional().describe("Edition: mobile, web, python"),
      platform: z.string().optional().describe("Platform: android, ios, web, python"),
      language: z.string().optional().describe("Language hint: kotlin, java, swift, js, ts, python"),
      version: z.string().optional().describe("Version constraint"),
      api_level: z.string().optional().describe("API level: high-level or low-level (mobile only)"),
      scenario: z.string().optional().describe("Scenario: camera, image, single, multiple, etc.")
    }
  },
  async ({ product, edition, platform, language, version, api_level, scenario }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
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

    if (normalizedProduct === "dbr" && normalizedEdition === "python") {
      const sdkEntry = registry.sdks["dbr-python"];
      const scenarioLower = (scenario || "").toLowerCase();
      const sampleName = scenarioLower.includes("video") ? "video_decoding" : "read_an_image";
      const samplePath = getPythonSamplePath(sampleName);

      if (!existsSync(samplePath)) {
        return { isError: true, content: [{ type: "text", text: `Sample not found: ${sampleName}.` }] };
      }

      const content = readCodeFile(samplePath);

      return {
        content: [{
          type: "text",
          text: [
            "# Quick Start: DBR Python",
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
        `# Quick Start: DBR Mobile (${targetPlatform})`,
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

    return {
      isError: true,
      content: [{ type: "text", text: "Unsupported product/edition for quickstart." }]
    };
  }
);

// ============================================================================
// TOOL: generate_project
// ============================================================================

server.registerTool(
  "generate_project",
  {
    title: "Generate Project",
    description: "Generate a project structure from a sample (no AI generation).",
    inputSchema: {
      product: z.string().describe("Product: dbr or dwt"),
      edition: z.string().optional().describe("Edition: mobile, web, python"),
      platform: z.string().optional().describe("Platform: android, ios, web, python"),
      version: z.string().optional().describe("Version constraint"),
      sample_id: z.string().optional().describe("Sample identifier (name or path)"),
      resource_uri: z.string().optional().describe("Resource URI returned by search"),
      api_level: z.string().optional().describe("API level: high-level or low-level (mobile only)")
    }
  },
  async ({ product, edition, platform, version, sample_id, resource_uri, api_level }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

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

    let sampleInfo = null;
    if (resource_uri) {
      sampleInfo = parseSampleUri(resource_uri);
      if (!sampleInfo) {
        return { isError: true, content: [{ type: "text", text: "Invalid or non-sample resource_uri." }] };
      }
    }

    let samplePath = null;
    let sampleLabel = "";

    if (sampleInfo) {
      sampleLabel = sampleInfo.sampleName || resource_uri;
      if (sampleInfo.product === "dbr" && sampleInfo.edition === "mobile") {
        samplePath = getMobileSamplePath(sampleInfo.platform, sampleInfo.level, sampleInfo.sampleName);
      } else if (sampleInfo.product === "dbr" && sampleInfo.edition === "web") {
        samplePath = getWebSamplePath(sampleInfo.category, sampleInfo.sampleName);
      } else if (sampleInfo.product === "dbr" && sampleInfo.edition === "python") {
        samplePath = getPythonSamplePath(sampleInfo.sampleName);
      } else if (sampleInfo.product === "dwt") {
        samplePath = getDwtSamplePath(sampleInfo.category, sampleInfo.sampleName);
      }
    } else if (sample_id) {
      if (!normalizedProduct || !normalizedEdition) {
        return { isError: true, content: [{ type: "text", text: "Specify product/edition or provide resource_uri." }] };
      }

      const level = normalizeApiLevel(api_level);
      const sampleName = normalizeSampleName(sample_id);
      sampleLabel = sampleName;

      if (normalizedProduct === "dbr" && normalizedEdition === "mobile") {
        const targetPlatform = normalizedPlatform || "android";
        const primaryPath = getMobileSamplePath(targetPlatform, level, sampleName);
        const altLevel = level === "high-level" ? "low-level" : "high-level";
        const alternatePath = getMobileSamplePath(targetPlatform, altLevel, sampleName);
        samplePath = existsSync(primaryPath) ? primaryPath : (existsSync(alternatePath) ? alternatePath : null);
      } else if (normalizedProduct === "dbr" && normalizedEdition === "web") {
        samplePath = getWebSamplePath(undefined, sampleName);
      } else if (normalizedProduct === "dbr" && normalizedEdition === "python") {
        samplePath = getPythonSamplePath(sampleName);
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
      }
    } else {
      return { isError: true, content: [{ type: "text", text: "Provide sample_id or resource_uri." }] };
    }

    if (!samplePath || !existsSync(samplePath)) {
      return { isError: true, content: [{ type: "text", text: `Sample not found for "${sampleLabel}".` }] };
    }

    const textExtensions = [
      ".java", ".kt", ".swift", ".m", ".h", ".xml", ".gradle", ".properties",
      ".pro", ".json", ".plist", ".storyboard", ".xib", ".gitignore", ".md",
      ".js", ".ts", ".html", ".css"
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
      `# Project Generation: ${sampleLabel}`,
      "",
      "This output contains the file structure for the project.",
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
// MCP Resources (tool-discovered, lazy-read)
// ============================================================================

server.server.registerCapabilities({
  resources: {
    listChanged: false,
    subscribe: true
  }
});

server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // Only surface a small, pinned set to avoid bloating the context window.
  const resources = getPinnedResources().map((r) => ({
    uri: r.uri,
    name: r.title,
    description: r.summary,
    mimeType: r.mimeType
  }));
  return { resources };
});

server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const parsed = parseResourceUri(request.params.uri);
  if (parsed && ["dbr", "dwt"].includes(parsed.product)) {
    const policy = ensureLatestMajor({
      product: parsed.product,
      version: parsed.version,
      edition: parsed.edition,
      platform: parsed.platform
    });
    if (!policy.ok) {
      throw new Error(policy.message);
    }
  }
  const resource = await readResourceContent(request.params.uri);
  if (!resource) {
    throw new Error(`Resource not found: ${request.params.uri}`);
  }
  return { contents: [resource] };
});

server.server.setRequestHandler(SubscribeRequestSchema, async () => ({}));
server.server.setRequestHandler(UnsubscribeRequestSchema, async () => ({}));

// ============================================================================
// Start Server
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);
