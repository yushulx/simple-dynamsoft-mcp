#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import "dotenv/config";
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

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const registryUrl = new URL("../data/dynamsoft_sdks.json", import.meta.url);
const registry = JSON.parse(readFileSync(registryUrl, "utf8"));

const dwtDocsUrl = new URL("../data/web-twain-api-docs.json", import.meta.url);
const dwtDocs = JSON.parse(readFileSync(dwtDocsUrl, "utf8"));

const ddvDocsUrl = new URL("../data/ddv-api-docs.json", import.meta.url);
const ddvDocs = JSON.parse(readFileSync(ddvDocsUrl, "utf8"));

const codeSnippetRoot = join(projectRoot, "code-snippet");

// ============================================================================
// RAG configuration
// ============================================================================

function readEnvValue(key, fallback) {
  const value = process.env[key];
  if (value === undefined || value === "") return fallback;
  return value;
}

function readBoolEnv(key, fallback) {
  const value = readEnvValue(key, "");
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function readIntEnv(key, fallback) {
  const raw = readEnvValue(key, "");
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? fallback : value;
}

function readFloatEnv(key, fallback) {
  const raw = readEnvValue(key, "");
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isNaN(value) ? fallback : value;
}

function normalizeGeminiModel(model) {
  if (!model) return "models/embedding-001";
  if (model.startsWith("models/")) return model;
  return `models/${model}`;
}

const ragConfig = {
  provider: readEnvValue("RAG_PROVIDER", "auto").toLowerCase(),
  fallback: readEnvValue("RAG_FALLBACK", "fuse").toLowerCase(),
  cacheDir: readEnvValue("RAG_CACHE_DIR", join(projectRoot, "data", ".rag-cache")),
  modelCacheDir: readEnvValue("RAG_MODEL_CACHE_DIR", join(projectRoot, "data", ".rag-cache", "models")),
  localModel: readEnvValue("RAG_LOCAL_MODEL", "Xenova/all-MiniLM-L6-v2"),
  localQuantized: readBoolEnv("RAG_LOCAL_QUANTIZED", true),
  chunkSize: readIntEnv("RAG_CHUNK_SIZE", 1200),
  chunkOverlap: readIntEnv("RAG_CHUNK_OVERLAP", 200),
  maxChunksPerDoc: readIntEnv("RAG_MAX_CHUNKS_PER_DOC", 6),
  maxTextChars: readIntEnv("RAG_MAX_TEXT_CHARS", 4000),
  minScore: readFloatEnv("RAG_MIN_SCORE", 0),
  rebuild: readBoolEnv("RAG_REBUILD", false),
  prewarm: readBoolEnv("RAG_PREWARM", false),
  prewarmBlock: readBoolEnv("RAG_PREWARM_BLOCK", false),
  geminiApiKey: readEnvValue("GEMINI_API_KEY", ""),
  geminiModel: normalizeGeminiModel(readEnvValue("GEMINI_EMBED_MODEL", "models/gemini-embedding-001")),
  geminiBaseUrl: readEnvValue("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com"),
  geminiBatchSize: readIntEnv("GEMINI_EMBED_BATCH_SIZE", 16)
};

// ============================================================================
// Aliases for flexible input handling
// ============================================================================

const sdkAliases = {
  // DDV
  "ddv": "ddv",
  "document-viewer": "ddv",
  "document viewer": "ddv",
  "pdf viewer": "ddv",
  "edit viewer": "ddv",
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
  flutter: "flutter",
  dart: "flutter",
  maui: "maui",
  "dotnet maui": "maui",
  ".net maui": "maui",
  // Desktop/Server
  python: "python",
  py: "python",
  cpp: "cpp",
  "c++": "cpp",
  cplusplus: "cpp",
  java: "java",
  dotnet: "dotnet",
  ".net": "dotnet",
  "c#": "dotnet",
  csharp: "dotnet",
  // Web
  web: "web",
  javascript: "web",
  js: "web",
  typescript: "web",
  ts: "web",
  // Web frameworks (from code-snippet)
  angular: "angular",
  angularjs: "angular",
  react: "react",
  reactjs: "react",
  "react.js": "react",
  "react-vite": "react",
  vue: "vue",
  vuejs: "vue",
  next: "next",
  nextjs: "next",
  nuxt: "nuxt",
  nuxtjs: "nuxt",
  svelte: "svelte",
  blazor: "blazor",
  capacitor: "capacitor",
  electron: "electron",
  es6: "es6",
  "native-ts": "native-ts",
  pwa: "pwa",
  requirejs: "requirejs",
  webview: "webview"
};

const SERVER_PLATFORMS = new Set(["python", "cpp", "java", "dotnet"]);
const WEB_FRAMEWORK_TAG_ALIASES = {
  react: ["react", "react-vite"]
};
let cachedWebFrameworkPlatforms = null;
let cachedDbrWebFrameworkPlatforms = null;
let cachedDdvWebFrameworkPlatforms = null;

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
  if (["ddv", "document viewer", "document-viewer", "dynamsoft document viewer", "doc viewer", "pdf viewer"].includes(normalized)) {
    return "ddv";
  }
  if (["dbr", "barcode reader", "barcode-reader", "dynamsoft barcode reader"].includes(normalized)) {
    return "dbr";
  }
  if (["dwt", "dynamic web twain", "web twain", "webtwain"].includes(normalized)) {
    return "dwt";
  }
  return normalized;
}

function normalizeEdition(edition, platform, product) {
  if (product === "dwt" || product === "ddv") return "web";
  const normalizedPlatform = normalizePlatform(platform);

  if (!edition) {
    if (["android", "ios"].includes(normalizedPlatform)) return "mobile";
    if (isWebPlatform(normalizedPlatform)) return "web";
    if (isServerPlatform(normalizedPlatform)) return "server";
    return "";
  }

  const normalized = edition.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  if (["mobile", "android", "ios"].includes(normalized)) return "mobile";
  if (["web", "javascript", "js", "typescript", "ts"].includes(normalized)) return "web";
  if (["server", "desktop", "server/desktop", "server-desktop", "serverdesktop"].includes(normalized) || compact === "serverdesktop") return "server";
  if (["python", "py", "java", "c++", "cpp", "dotnet", ".net", "c#", "csharp"].includes(normalized)) return "server";
  return normalized;
}

function isServerPlatform(platform) {
  return SERVER_PLATFORMS.has(platform);
}

function isWebFrameworkPlatform(platform) {
  return getWebFrameworkPlatforms().has(platform);
}

function isWebPlatform(platform) {
  return platform === "web" || isWebFrameworkPlatform(platform);
}

function inferProductFromQuery(query) {
  if (!query) return "";
  const normalized = query.toLowerCase();
  if (normalized.includes("ddv") || normalized.includes("document viewer") || normalized.includes("pdf viewer") || normalized.includes("edit viewer")) {
    return "ddv";
  }
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
  return [".java", ".kt", ".swift", ".m", ".h", ".py", ".js", ".jsx", ".ts", ".tsx", ".vue", ".html"];
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

function discoverDdvSamples() {
  const samples = [];
  const ddvPath = join(codeSnippetRoot, "dynamsoft-document-viewer");

  if (!existsSync(ddvPath)) return samples;

  for (const entry of readdirSync(ddvPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      samples.push(entry.name.replace(".html", ""));
    } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
      samples.push(entry.name);
    }
  }
  return samples;
}

function mapDdvSampleToFramework(sampleName) {
  if (!sampleName) return "";
  const normalized = sampleName.trim().toLowerCase();
  if (normalized === "react-vite" || normalized === "react") return "react";
  if (normalized === "vue") return "vue";
  if (normalized === "angular") return "angular";
  if (normalized === "next") return "next";
  return "";
}

function getDbrWebFrameworkPlatforms() {
  if (cachedDbrWebFrameworkPlatforms) return cachedDbrWebFrameworkPlatforms;
  const webSamples = discoverWebSamples();
  const frameworks = new Set();
  if (webSamples.frameworks) {
    for (const name of webSamples.frameworks) {
      const normalized = normalizePlatform(name);
      if (normalized && normalized !== "web") {
        frameworks.add(normalized);
      }
    }
  }
  cachedDbrWebFrameworkPlatforms = Array.from(frameworks).sort();
  return cachedDbrWebFrameworkPlatforms;
}

function getDdvWebFrameworkPlatforms() {
  if (cachedDdvWebFrameworkPlatforms) return cachedDdvWebFrameworkPlatforms;
  const frameworks = new Set();
  for (const sampleName of discoverDdvSamples()) {
    const framework = mapDdvSampleToFramework(sampleName);
    if (framework) frameworks.add(framework);
  }
  cachedDdvWebFrameworkPlatforms = Array.from(frameworks).sort();
  return cachedDdvWebFrameworkPlatforms;
}

function getWebFrameworkPlatforms() {
  if (cachedWebFrameworkPlatforms) return cachedWebFrameworkPlatforms;
  const frameworks = new Set([
    ...getDbrWebFrameworkPlatforms(),
    ...getDdvWebFrameworkPlatforms()
  ]);
  cachedWebFrameworkPlatforms = frameworks;
  return cachedWebFrameworkPlatforms;
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

function getDdvSamplePath(sampleName) {
  const ddvPath = join(codeSnippetRoot, "dynamsoft-document-viewer");
  
  // check for html file
  let path = join(ddvPath, `${sampleName}.html`);
  if (existsSync(path)) return path;

  // check for directory
  path = join(ddvPath, sampleName);
  if (existsSync(path) && statSync(path).isDirectory()) {
    // Look for README.md or src/index.js/ts or just return the dir
    // Returning the dir allows findCodeFilesInSample to work on it
    return path;
  }
  return null;
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
 *   product?: "dbr" | "dwt" | "ddv";
 *   edition?: string;
 *   platform?: string;
 *   version?: string;
 *   majorVersion?: number;
 *   title: string;
 *   summary: string;
 *   embedText?: string;
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
    mobile: { 
      android: "https://www.dynamsoft.com/barcode-reader/docs/v10/mobile/programming/android/", 
      ios: "https://www.dynamsoft.com/barcode-reader/docs/v10/mobile/programming/objectivec-swift/" 
    }
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
    server: registry.sdks["dbr-python"].version,
    python: registry.sdks["dbr-python"].version
  },
  dwt: {
    web: registry.sdks["dwt"].version
  },
  ddv: {
    web: registry.sdks["ddv"].version
  }
};

const LATEST_MAJOR = {
  dbr: parseMajorVersion(registry.sdks["dbr-mobile"].version),
  dwt: parseMajorVersion(registry.sdks["dwt"].version),
  ddv: parseMajorVersion(registry.sdks["ddv"].version)
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
  if (normalized === "jsx") return "text/jsx";
  if (normalized === "tsx") return "text/tsx";
  if (normalized === "vue") return "text/x-vue";
  if (normalized === "cjs") return "text/javascript";
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
    `- Web (JS): ${byMajor.web.web || "Not available"}`,
    `- Server/Desktop (C++): ${byMajor.cpp.desktop || "Not available"}`,
    `- Server/Desktop (Java): ${byMajor.java.desktop || "Not available"}`,
    `- Server/Desktop (.NET): ${byMajor.dotnet.desktop || "Not available"}`,
    `- Server/Desktop (Python): ${byMajor.python.desktop || "Not available"}`,
    `- Mobile (Android): ${byMajor.mobile.android || "Not available"}`,
    `- Mobile (iOS): ${byMajor.mobile.ios || "Not available"}`
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

  const normalizedEdition = normalizeEdition(edition, platform, product) || "web";
  const normalizedPlatform = normalizePlatform(platform);
  if (normalizedEdition === "mobile") {
    if (normalizedPlatform === "android") return byMajor.mobile.android;
    if (normalizedPlatform === "ios") return byMajor.mobile.ios;
    return null;
  }
  if (normalizedEdition === "web") return byMajor.web.web;
  if (normalizedEdition === "server") {
    if (normalizedPlatform === "python") return byMajor.python.desktop;
    if (normalizedPlatform === "cpp") return byMajor.cpp.desktop;
    if (normalizedPlatform === "java") return byMajor.java.desktop;
    if (normalizedPlatform === "dotnet") return byMajor.dotnet.desktop;
  }
  return null;
}

function detectMajorFromQuery(query) {
  if (!query) return null;
  const text = String(query);
  const explicit = text.match(/(?:\bv|\bversion\s*)(\d{1,2})(?:\.\d+)?/i);
  const productScoped = text.match(/(?:dbr|dwt|ddv)[^0-9]*(\d{1,2})(?:\.\d+)?/i);
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

  if (inferredProduct === "ddv") {
    return {
      ok: false,
      message: `This MCP server only serves the latest major version of DDV (v${latestMajor}).`
    };
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

  if (parsed.product === "dbr" && (parsed.edition === "python" || parsed.edition === "server")) {
    return {
      product: "dbr",
      edition: parsed.edition,
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

  if (parsed.product === "ddv") {
    return {
      product: "ddv",
      edition: parsed.edition,
      platform: parsed.platform,
      version: parsed.version,
      sampleName: parsed.parts[4]
    };
  }

  return null;
}

function getSampleIdFromUri(uri) {
  const parsed = parseSampleUri(uri);
  return parsed?.sampleName || "";
}

function getSampleEntries({ product, edition, platform }) {
  const normalizedProduct = normalizeProduct(product);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

  return resourceIndex.filter((entry) => {
    if (entry.type !== "sample") return false;
    if (normalizedProduct && entry.product !== normalizedProduct) return false;
    if (!editionMatches(normalizedEdition, entry.edition)) return false;
    if (!platformMatches(normalizedPlatform, entry)) return false;
    return true;
  });
}

function buildVersionPolicyText() {
  const dbrMajor = LATEST_MAJOR.dbr;
  const dwtMajor = LATEST_MAJOR.dwt;
  const ddvMajor = LATEST_MAJOR.ddv;
  const dwtLegacyVersions = Object.keys(LEGACY_DWT_LINKS).sort().join(", ");

  return [
    "# Version Policy",
    "",
    `- This MCP server serves the latest major versions only (DBR v${dbrMajor}, DWT v${dwtMajor}, DDV v${ddvMajor}).`,
    "- Requests for older major versions are refused.",
    "- DBR legacy docs are only available for v9 and v10 (no docs prior to v9).",
    "- DWT archived docs are available for versions: " + dwtLegacyVersions,
    "- DDV archived docs are not provided by this MCP server.",
    "",
    "Use the official Dynamsoft documentation if you must target older versions."
  ].join("\n");
}

function buildIndexData() {
  const dbrMobileVersion = LATEST_VERSIONS.dbr.mobile;
  const dbrWebVersion = LATEST_VERSIONS.dbr.web;
  const dbrServerVersion = LATEST_VERSIONS.dbr.server;
  const dwtVersion = LATEST_VERSIONS.dwt.web;
  const ddvVersion = LATEST_VERSIONS.ddv.web;

  const mobileAndroid = discoverMobileSamples("android");
  const mobileIos = discoverMobileSamples("ios");
  const webSamples = discoverWebSamples();
  const pythonSamples = discoverPythonSamples();
  const dbrWebFrameworks = getDbrWebFrameworkPlatforms();
  const ddvWebFrameworks = getDdvWebFrameworkPlatforms();
  const dwtSamples = discoverDwtSamples();
  const ddvSamples = discoverDdvSamples();

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
            platforms: ["js", ...dbrWebFrameworks],
            samples: webSamples
          },
          server: {
            version: dbrServerVersion,
            platforms: ["python", "cpp", "java", "dotnet"],
            samples: pythonSamples
          }
        }
      },
      dwt: {
        latestMajor: LATEST_MAJOR.dwt,
        editions: {
          web: {
            version: dwtVersion,
            platforms: ["js"],
            sampleCategories: dwtSamples,
            docCount: dwtDocs.articles.length,
            docTitles: dwtDocs.articles.map((article) => ({
              title: article.title,
              category: article.breadcrumb || ""
            }))
          }
        }
      },
      ddv: {
        latestMajor: LATEST_MAJOR.ddv,
        editions: {
          web: {
            version: ddvVersion,
            platforms: ["js", ...ddvWebFrameworks],
            samples: ddvSamples,
            docCount: ddvDocs.articles.length,
            docTitles: ddvDocs.articles.map((article) => ({
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
  const dbrServerVersion = LATEST_VERSIONS.dbr.server;
  const dwtVersion = LATEST_VERSIONS.dwt.web;
  const ddvVersion = LATEST_VERSIONS.ddv.web;

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
      uri: `sample://dbr/python/python/${dbrServerVersion}/${sampleName}`,
      type: "sample",
      product: "dbr",
      edition: "python",
      platform: "python",
      version: dbrServerVersion,
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
      embedText: article.content,
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

  // DDV samples
  for (const sampleName of discoverDdvSamples()) {
    addResourceToIndex({
      id: `ddv-${sampleName}`,
      uri: `sample://ddv/web/web/${ddvVersion}/${sampleName}`,
      type: "sample",
      product: "ddv",
      edition: "web",
      platform: "web",
      version: ddvVersion,
      majorVersion: LATEST_MAJOR.ddv,
      title: `DDV sample: ${sampleName}`,
      summary: `Dynamsoft Document Viewer sample ${sampleName}.`,
      mimeType: "text/plain",
      tags: ["sample", "ddv", "document-viewer", "web", sampleName],
      loadContent: async () => {
        const samplePath = getDdvSamplePath(sampleName);
        if (!samplePath || !existsSync(samplePath)) {
          return { text: "Sample not found", mimeType: "text/plain" };
        }

        const stat = statSync(samplePath);
        if (stat.isDirectory()) {
          const readmePath = join(samplePath, "README.md");
          if (existsSync(readmePath)) {
            return { text: readCodeFile(readmePath), mimeType: "text/markdown" };
          }

          const codeFiles = findCodeFilesInSample(samplePath);
          if (codeFiles.length === 0) {
            const entries = readdirSync(samplePath, { withFileTypes: true })
              .filter((entry) => entry.isFile())
              .map((entry) => entry.name);
            return {
              text: entries.length ? entries.join("\n") : "Sample found, but no code files detected.",
              mimeType: "text/plain"
            };
          }

          const preferredNames = [
            "main.tsx",
            "main.jsx",
            "main.ts",
            "main.js",
            "App.tsx",
            "App.jsx",
            "App.vue",
            "Viewer.tsx",
            "Viewer.jsx",
            "Viewer.vue"
          ];
          const preferred = codeFiles.find((file) => preferredNames.includes(file.filename)) || codeFiles[0];
          const content = readCodeFile(preferred.path);
          return { text: content, mimeType: getMimeTypeForExtension(preferred.extension) };
        }

        const ext = extname(samplePath).replace(".", "");
        return { text: readCodeFile(samplePath), mimeType: getMimeTypeForExtension(ext) };
      }
    });
  }

  // DDV documentation articles
  for (let i = 0; i < ddvDocs.articles.length; i++) {
    const article = ddvDocs.articles[i];
    if (!article.title) continue;
    const slug = `${encodeURIComponent(article.title)}-${i}`;
    const tags = ["doc", "ddv"];
    if (article.breadcrumb) {
      tags.push(...article.breadcrumb.toLowerCase().split(/\s*>\s*/));
    }
    addResourceToIndex({
      id: `ddv-doc-${i}`,
      uri: `doc://ddv/web/web/${ddvVersion}/${slug}`,
      type: "doc",
      product: "ddv",
      edition: "web",
      platform: "web",
      version: ddvVersion,
      majorVersion: LATEST_MAJOR.ddv,
      title: article.title,
      summary: article.breadcrumb || "Dynamsoft Document Viewer documentation",
      embedText: article.content,
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

const resourceIndexByUri = new Map(resourceIndex.map((entry) => [entry.uri, entry]));

function editionMatches(normalizedEdition, entryEdition) {
  if (!normalizedEdition) return true;
  if (normalizedEdition === entryEdition) return true;
  if (normalizedEdition === "server" && entryEdition === "python") return true;
  if (normalizedEdition === "python" && entryEdition === "server") return true;
  return false;
}

function platformMatches(normalizedPlatform, entry) {
  if (!normalizedPlatform) return true;
  if (normalizedPlatform === entry.platform) return true;
  if (normalizedPlatform === "web") return entry.platform === "web";
  if (isWebFrameworkPlatform(normalizedPlatform)) {
    if (entry.platform === "web" && Array.isArray(entry.tags)) {
      const tags = entry.tags.map((tag) => String(tag).toLowerCase());
      const aliases = WEB_FRAMEWORK_TAG_ALIASES[normalizedPlatform] || [normalizedPlatform];
      return aliases.some((alias) => tags.includes(alias));
    }
    return entry.platform === normalizedPlatform;
  }
  return false;
}

function getDisplayEdition(entryEdition) {
  return entryEdition === "python" ? "server" : entryEdition;
}

function getDisplayPlatform(entryPlatform) {
  return entryPlatform === "web" ? "js" : entryPlatform;
}

function formatScopeLabel(entry) {
  const displayEdition = getDisplayEdition(entry.edition);
  const displayPlatform = getDisplayPlatform(entry.platform);
  return [
    entry.product || "general",
    displayEdition || "",
    displayPlatform || ""
  ].filter(Boolean).join("/");
}

const fuseSearch = new Fuse(resourceIndex, {
  keys: ["title", "summary", "tags", "uri"],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true
});

function normalizeSearchFilters({ product, edition, platform, type }) {
  const normalizedProduct = normalizeProduct(product);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
  return {
    product: normalizedProduct,
    edition: normalizedEdition,
    platform: normalizedPlatform,
    type: type || "any"
  };
}

function entryMatchesScope(entry, filters) {
  if (filters.product && entry.product !== filters.product) return false;
  if (filters.edition && !editionMatches(filters.edition, entry.edition)) return false;
  if (filters.platform && !platformMatches(filters.platform, entry)) return false;
  if (filters.type && filters.type !== "any" && entry.type !== filters.type) return false;
  return true;
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function truncateText(text, maxChars) {
  if (!maxChars || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars));
}

function chunkText(text, chunkSize, chunkOverlap, maxChunks) {
  const cleaned = normalizeText(text);
  if (!cleaned) return [];
  if (!chunkSize || chunkSize <= 0) return [cleaned];
  const overlap = Math.min(Math.max(0, chunkOverlap), Math.max(0, chunkSize - 1));
  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= cleaned.length) break;
    start = Math.max(0, end - overlap);
    if (maxChunks && chunks.length >= maxChunks) break;
  }
  return chunks;
}

function buildEntryBaseText(entry) {
  const parts = [entry.title, entry.summary];
  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    parts.push(entry.tags.join(", "));
  }
  return normalizeText(parts.filter(Boolean).join("\n"));
}

function buildEmbeddingItems() {
  const items = [];
  for (const entry of resourceIndex) {
    const baseText = buildEntryBaseText(entry);
    if (!baseText) continue;
    if (entry.type === "doc" && entry.embedText) {
      const chunks = chunkText(entry.embedText, ragConfig.chunkSize, ragConfig.chunkOverlap, ragConfig.maxChunksPerDoc);
      if (chunks.length === 0) {
        items.push({
          id: entry.id,
          uri: entry.uri,
          text: truncateText(baseText, ragConfig.maxTextChars)
        });
        continue;
      }
      chunks.forEach((chunk, index) => {
        const combined = [baseText, chunk].filter(Boolean).join("\n\n");
        items.push({
          id: `${entry.id}#${index}`,
          uri: entry.uri,
          text: truncateText(combined, ragConfig.maxTextChars)
        });
      });
      continue;
    }
    items.push({
      id: entry.id,
      uri: entry.uri,
      text: truncateText(baseText, ragConfig.maxTextChars)
    });
  }
  return items;
}

function buildIndexSignature() {
  return JSON.stringify({
    packageVersion: pkg.version,
    resourceCount: resourceIndex.length,
    dwtDocCount: dwtDocs.articles.length,
    ddvDocCount: ddvDocs.articles.length,
    versions: LATEST_VERSIONS,
    chunkSize: ragConfig.chunkSize,
    chunkOverlap: ragConfig.chunkOverlap,
    maxChunksPerDoc: ragConfig.maxChunksPerDoc,
    maxTextChars: ragConfig.maxTextChars
  });
}

function ensureDirectory(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function makeCacheFileName(provider, model, cacheKey) {
  const safeModel = String(model || "default").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 32);
  return `rag-${provider}-${safeModel}-${cacheKey.slice(0, 12)}.json`;
}

function loadVectorIndexCache(cacheFile, expectedKey) {
  if (!existsSync(cacheFile)) return null;
  try {
    const parsed = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (!parsed || parsed.cacheKey !== expectedKey) return null;
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.vectors)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveVectorIndexCache(cacheFile, payload) {
  ensureDirectory(ragConfig.cacheDir);
  writeFileSync(cacheFile, JSON.stringify(payload));
}

function normalizeVector(vector) {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  const norm = Math.sqrt(sum);
  if (!norm) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

function dotProduct(a, b) {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

async function embedTexts(texts, embedder, batchSize = 1) {
  const results = [];
  if (embedder.embedBatch && batchSize > 1) {
    try {
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const vectors = await embedder.embedBatch(batch);
        results.push(...vectors);
      }
      return results;
    } catch (error) {
      console.error(`[rag] batch embedding failed, falling back to single requests: ${error.message}`);
      results.length = 0;
    }
  }
  for (const text of texts) {
    results.push(await embedder.embed(text));
  }
  return results;
}

let localEmbedderPromise = null;
async function getLocalEmbedder() {
  if (localEmbedderPromise) return localEmbedderPromise;
  localEmbedderPromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    ensureDirectory(ragConfig.modelCacheDir);
    env.cacheDir = ragConfig.modelCacheDir;
    env.allowLocalModels = true;
    const extractor = await pipeline("feature-extraction", ragConfig.localModel, {
      quantized: ragConfig.localQuantized
    });
    return {
      embed: async (text) => {
        const output = await extractor(text, { pooling: "mean", normalize: true });
        return Array.from(output.data);
      }
    };
  })();
  return localEmbedderPromise;
}

let geminiEmbedderPromise = null;
async function getGeminiEmbedder() {
  if (!ragConfig.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is required for gemini embeddings.");
  }
  if (geminiEmbedderPromise) return geminiEmbedderPromise;
  geminiEmbedderPromise = Promise.resolve({
    embed: async (text) => {
      const response = await fetch(
        `${ragConfig.geminiBaseUrl}/v1beta/${ragConfig.geminiModel}:embedContent?key=${ragConfig.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: {
              parts: [{ text }]
            }
          })
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini embedContent failed (${response.status}): ${detail}`);
      }
      const payload = await response.json();
      const embedding = payload.embedding?.values || payload.embedding || payload.embeddings?.[0]?.values;
      if (!embedding) {
        throw new Error("Gemini embedding response missing embedding values.");
      }
      return embedding;
    },
    embedBatch: async (texts) => {
      const response = await fetch(
        `${ragConfig.geminiBaseUrl}/v1beta/${ragConfig.geminiModel}:batchEmbedContents?key=${ragConfig.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: texts.map((text) => ({
              model: ragConfig.geminiModel,
              content: {
                parts: [{ text }]
              }
            }))
          })
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini batchEmbedContents failed (${response.status}): ${detail}`);
      }
      const payload = await response.json();
      const embeddings = payload.embeddings || payload.responses;
      if (!Array.isArray(embeddings)) {
        throw new Error("Gemini batch response missing embeddings.");
      }
      return embeddings.map((item) => item.values || item.embedding?.values || item.embedding);
    }
  });
  return geminiEmbedderPromise;
}

async function createVectorProvider({ name, model, embedder, batchSize }) {
  const signature = buildIndexSignature();
  const cacheMeta = {
    provider: name,
    model,
    signature
  };
  const cacheKey = createHash("sha256").update(JSON.stringify(cacheMeta)).digest("hex");
  const cacheFile = join(ragConfig.cacheDir, makeCacheFileName(name, model, cacheKey));

  let indexPromise = null;
  const loadIndex = async () => {
    if (indexPromise) return indexPromise;
    indexPromise = (async () => {
      if (!ragConfig.rebuild) {
        const cached = loadVectorIndexCache(cacheFile, cacheKey);
        if (cached) {
          return {
            items: cached.items,
            vectors: cached.vectors
          };
        }
      }

      const items = buildEmbeddingItems();
      const texts = items.map((item) => item.text);
      const vectors = await embedTexts(texts, embedder, batchSize);
      const normalized = vectors.map(normalizeVector);

      const payload = {
        cacheKey,
        meta: cacheMeta,
        items: items.map((item) => ({ id: item.id, uri: item.uri })),
        vectors: normalized
      };
      saveVectorIndexCache(cacheFile, payload);
      return {
        items: payload.items,
        vectors: payload.vectors
      };
    })();
    return indexPromise;
  };

  return {
    name,
    search: async (query, filters, limit) => {
      const prepared = truncateText(normalizeText(query), ragConfig.maxTextChars);
      if (!prepared) return [];
      const index = await loadIndex();
      const queryVector = normalizeVector(await embedder.embed(prepared));
      const bestByUri = new Map();

      for (let i = 0; i < index.vectors.length; i++) {
        const score = dotProduct(queryVector, index.vectors[i]);
        if (ragConfig.minScore && score < ragConfig.minScore) continue;
        const item = index.items[i];
        const entry = resourceIndexByUri.get(item.uri);
        if (!entry || !entryMatchesScope(entry, filters)) continue;
        const existing = bestByUri.get(item.uri);
        if (!existing || score > existing.score) {
          bestByUri.set(item.uri, { entry, score });
        }
      }

      const results = Array.from(bestByUri.values())
        .sort((a, b) => b.score - a.score)
        .map((item) => item.entry);

      if (limit) return results.slice(0, limit);
      return results;
    },
    warm: async () => {
      await loadIndex();
    }
  };
}

function createFuseProvider() {
  return {
    name: "fuse",
    search: async (query, filters, limit) => {
      const results = fuseSearch
        .search(query)
        .map((result) => result.item)
        .filter((entry) => entryMatchesScope(entry, filters));
      if (limit) return results.slice(0, limit);
      return results;
    },
    warm: async () => {}
  };
}

function resolveProviderChain() {
  let primary = ragConfig.provider;
  if (primary === "auto") {
    primary = ragConfig.geminiApiKey ? "gemini" : "local";
  }
  const chain = [primary];
  if (ragConfig.fallback && ragConfig.fallback !== "none" && ragConfig.fallback !== primary) {
    chain.push(ragConfig.fallback);
  }
  return Array.from(new Set(chain));
}

const providerCache = new Map();

async function loadSearchProvider(name) {
  if (providerCache.has(name)) return providerCache.get(name);
  let providerPromise;
  if (name === "fuse") {
    providerPromise = Promise.resolve(createFuseProvider());
  } else if (name === "local") {
    providerPromise = (async () => {
      const embedder = await getLocalEmbedder();
      return createVectorProvider({
        name: "local",
        model: ragConfig.localModel,
        embedder,
        batchSize: 1
      });
    })();
  } else if (name === "gemini") {
    providerPromise = (async () => {
      const embedder = await getGeminiEmbedder();
      return createVectorProvider({
        name: "gemini",
        model: ragConfig.geminiModel,
        embedder,
        batchSize: Math.max(1, ragConfig.geminiBatchSize)
      });
    })();
  } else {
    providerPromise = Promise.reject(new Error(`Unknown search provider: ${name}`));
  }
  providerCache.set(name, providerPromise);
  return providerPromise;
}

async function searchResources({ query, product, edition, platform, type, limit }) {
  const filters = normalizeSearchFilters({ product, edition, platform, type });
  const searchQuery = query ? String(query).trim() : "";
  const maxResults = limit ? Math.min(limit, 50) : undefined;

  if (!searchQuery) {
    const results = resourceIndex.filter((entry) => entryMatchesScope(entry, filters));
    return maxResults ? results.slice(0, maxResults) : results;
  }

  const providers = resolveProviderChain();
  let lastError = null;
  for (const name of providers) {
    try {
      const provider = await loadSearchProvider(name);
      const results = await provider.search(searchQuery, filters, maxResults);
      return results;
    } catch (error) {
      lastError = error;
      console.error(`[rag] provider "${name}" failed: ${error.message}`);
    }
  }

  if (lastError) {
    console.error(`[rag] all providers failed: ${lastError.message}`);
  }
  return [];
}

async function prewarmRagIndex() {
  if (!ragConfig.prewarm) return;
  const providers = resolveProviderChain();
  const primary = providers[0];
  if (!primary || primary === "fuse") return;
  try {
    const provider = await loadSearchProvider(primary);
    if (provider.warm) {
      await provider.warm();
    }
  } catch (error) {
    console.error(`[rag] prewarm failed: ${error.message}`);
  }
}

async function getSampleSuggestions({ query, product, edition, platform, limit = 5 }) {
  const normalizedProduct = normalizeProduct(product);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);
  const searchQuery = query ? String(query).trim() : "";
  const maxResults = Math.min(limit || 5, 10);

  if (searchQuery) {
    const results = await searchResources({
      query: searchQuery,
      product: normalizedProduct,
      edition: normalizedEdition,
      platform: normalizedPlatform,
      type: "sample",
      limit: maxResults
    });
    if (results.length) return results;
  }

  const matchesScope = (entry) => {
    if (normalizedProduct && entry.product !== normalizedProduct) return false;
    if (!editionMatches(normalizedEdition, entry.edition)) return false;
    if (!platformMatches(normalizedPlatform, entry)) return false;
    return entry.type === "sample";
  };

  let candidates = resourceIndex.filter(matchesScope);
  if (candidates.length === 0 && normalizedProduct) {
    candidates = resourceIndex.filter((entry) => entry.type === "sample" && entry.product === normalizedProduct);
  }

  const seen = new Set();
  const results = [];
  for (const entry of candidates) {
    if (seen.has(entry.uri)) continue;
    seen.add(entry.uri);
    results.push(entry);
    if (results.length >= maxResults) break;
  }

  return results;
}

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
  version: pkg.version,
  description: "MCP server for latest major versions of Dynamsoft SDKs: Barcode Reader (Mobile/Server/Web), Dynamic Web TWAIN, and Document Viewer"
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
    description: "Semantic (RAG) search across docs and samples with fuzzy fallback; returns resource links for lazy loading.",
    inputSchema: {
      query: z.string().describe("Keywords to search across docs and samples."),
      product: z.string().optional().describe("Product: dbr, dwt, ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
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

    const maxResults = Math.min(limit || 5, 10);
    const topResults = await searchResources({
      query,
      product: normalizedProduct,
      edition: normalizedEdition,
      platform: normalizedPlatform,
      type: type || "any",
      limit: maxResults
    });

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
          priority: 0.8
        }
      });
    }

    const plainLines = topResults.map((entry, index) => {
      const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
      const action = entry.type === "sample" ? "generate_project resource_uri" : "resources/read uri";
      const sampleNote = sampleId ? ` sample_id=${sampleId}` : "";
      return `- ${index + 1}. ${entry.uri}${sampleNote} (${action})`;
    });
    content.push({
      type: "text",
      text: ["Plain URIs (copy/paste):", ...plainLines].join("\n")
    });

    return { content };
  }
);

// ============================================================================
// TOOL: list_samples
// ============================================================================

server.registerTool(
  "list_samples",
  {
    title: "List Samples",
    description: "List available sample IDs and URIs for a given scope.",
    inputSchema: {
      product: z.string().optional().describe("Product: dbr, dwt, ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50)")
    }
  },
  async ({ product, edition, platform, limit }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

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

// ============================================================================
// TOOL: resolve_sample
// ============================================================================

server.registerTool(
  "resolve_sample",
  {
    title: "Resolve Sample",
    description: "Resolve a sample_id (or sample URI) to matching sample URIs.",
    inputSchema: {
      sample_id: z.string().describe("Sample identifier or sample:// URI"),
      product: z.string().optional().describe("Product: dbr, dwt, ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)")
    }
  },
  async ({ sample_id, product, edition, platform, limit }) => {
    if (!sample_id || !sample_id.trim()) {
      return { isError: true, content: [{ type: "text", text: "sample_id is required." }] };
    }

    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

    const policy = ensureLatestMajor({
      product: normalizedProduct,
      version: undefined,
      query: sample_id,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    if (!policy.ok) {
      return { isError: true, content: [{ type: "text", text: policy.message }] };
    }

    if (sample_id.includes("://")) {
      const parsed = parseSampleUri(sample_id);
      if (!parsed) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: "sample_id looks like a URI but is not a valid sample:// URI. For doc:// URIs, use resources/read."
          }]
        };
      }
      const entry = resourceIndex.find((item) => item.uri === sample_id && item.type === "sample");
      if (!entry) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Sample URI not found in index: ${sample_id}. Use list_samples or search.`
          }]
        };
      }

      const payload = [{
        sample_id: getSampleIdFromUri(entry.uri),
        uri: entry.uri,
        product: entry.product,
        edition: getDisplayEdition(entry.edition),
        platform: getDisplayPlatform(entry.platform),
        version: entry.version,
        title: entry.title,
        summary: entry.summary
      }];

      const output = {
        query: sample_id,
        returned: payload.length,
        samples: payload
      };

      return {
        content: [{
          type: "text",
          text: [
            `Found ${payload.length} match(es) for "${sample_id}".`,
            "Plain URIs (copy/paste):",
            `- 1. ${entry.uri} (sample_id: ${payload[0].sample_id})`,
            "",
            "JSON:",
            JSON.stringify(output, null, 2)
          ].join("\n")
        }, {
          type: "resource_link",
          uri: entry.uri,
          name: entry.title,
          description: `SAMPLE | ${formatScopeLabel(entry)} | v${entry.version} | sample_id: ${payload[0].sample_id}`,
          mimeType: entry.mimeType,
          annotations: {
            audience: ["assistant"],
            priority: 0.8
          }
        }]
      };
    }

    const sampleQuery = normalizeSampleName(sample_id);
    const maxResults = Math.min(limit || 5, 10);

    const scopedSamples = getSampleEntries({
      product: normalizedProduct,
      edition: normalizedEdition,
      platform: normalizedPlatform
    });

    let matches = scopedSamples.filter((entry) => {
      const entryId = getSampleIdFromUri(entry.uri);
      return entryId && entryId.toLowerCase() === sampleQuery.toLowerCase();
    });

    if (matches.length === 0) {
      matches = await searchResources({
        query: sample_id,
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        type: "sample",
        limit: maxResults
      });
    }

    const selected = matches.slice(0, maxResults);
    if (selected.length === 0) {
      const suggestions = await getSampleSuggestions({
        query: sample_id,
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        limit: maxResults
      });

      const content = [{
        type: "text",
        text: suggestions.length
          ? `No exact sample match for "${sample_id}". Related samples:`
          : `No samples found for "${sample_id}". Try list_samples or search.`
      }];

      for (const entry of suggestions) {
        const sampleId = getSampleIdFromUri(entry.uri);
        content.push({
          type: "resource_link",
          uri: entry.uri,
          name: entry.title,
          description: `${entry.type.toUpperCase()} | ${formatScopeLabel(entry)} | v${entry.version} | sample_id: ${sampleId || "n/a"}`,
          mimeType: entry.mimeType,
          annotations: {
            audience: ["assistant"],
            priority: 0.6
          }
        });
      }

      if (suggestions.length) {
        const plainLines = suggestions.map((entry, index) => {
          const sampleId = getSampleIdFromUri(entry.uri);
          const sampleNote = sampleId ? ` (sample_id: ${sampleId})` : "";
          return `- ${index + 1}. ${entry.uri}${sampleNote}`;
        });
        content.push({
          type: "text",
          text: ["Plain URIs (copy/paste):", ...plainLines].join("\n")
        });
      }

      return { isError: true, content };
    }

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
      `Found ${selected.length} match(es) for "${sample_id}".`,
      "Plain URIs (copy/paste):",
      ...payload.map((item, index) => {
        const sampleNote = item.sample_id ? ` (sample_id: ${item.sample_id})` : "";
        return `- ${index + 1}. ${item.uri}${sampleNote}`;
      })
    ];

    const output = {
      query: sample_id,
      returned: payload.length,
      samples: payload
    };

    const content = [{
      type: "text",
      text: `${lines.join("\n")}\n\nJSON:\n${JSON.stringify(output, null, 2)}`
    }];

    for (const entry of selected) {
      const sampleId = getSampleIdFromUri(entry.uri);
      content.push({
        type: "resource_link",
        uri: entry.uri,
        name: entry.title,
        description: `${entry.type.toUpperCase()} | ${formatScopeLabel(entry)} | v${entry.version} | sample_id: ${sampleId || "n/a"}`,
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
      product: z.string().describe("Product: dbr, dwt, or ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      constraint: z.string().optional().describe("Version constraint, e.g., latest, 11.x, 10"),
      feature: z.string().optional().describe("Optional feature hint")
    }
  },
  async ({ product, edition, platform, constraint, feature }) => {
    const normalizedProduct = normalizeProduct(product);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedEdition = normalizeEdition(edition, normalizedPlatform, normalizedProduct);

    if (!["dbr", "dwt", "ddv"].includes(normalizedProduct)) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown product "${product}". Use dbr, dwt, or ddv.` }]
      };
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

// ============================================================================
// TOOL: get_quickstart
// ============================================================================

server.registerTool(
  "get_quickstart",
  {
    title: "Get Quickstart",
    description: "Opinionated quickstart for a target product/edition/platform.",
    inputSchema: {
      product: z.string().describe("Product: dbr, dwt, or ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
      language: z.string().optional().describe("Language hint: kotlin, java, swift, js, ts, python, cpp, csharp, react, vue, angular"),
      version: z.string().optional().describe("Version constraint"),
      api_level: z.string().optional().describe("API level: high-level or low-level (mobile only)"),
      scenario: z.string().optional().describe("Scenario: camera, image, single, multiple, react, etc.")
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

    if (normalizedProduct === "dbr" && normalizedEdition === "server") {
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

// ============================================================================
// TOOL: generate_project
// ============================================================================

server.registerTool(
  "generate_project",
  {
    title: "Generate Project",
    description: "Generate a project structure from a sample (no AI generation).",
    inputSchema: {
      product: z.string().describe("Product: dbr, dwt, or ddv"),
      edition: z.string().optional().describe("Edition: mobile, web, server/desktop"),
      platform: z.string().optional().describe("Platform: android, ios, js, python, cpp, java, dotnet, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview"),
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
        samplePath = getPythonSamplePath(sampleInfo.sampleName);
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
      } else if (normalizedProduct === "dbr" && normalizedEdition === "web") {
        samplePath = getWebSamplePath(undefined, sampleName);
      } else if (normalizedProduct === "dbr" && normalizedEdition === "server") {
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
      ".js", ".jsx", ".ts", ".tsx", ".vue", ".cjs", ".html", ".css"
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
  if (parsed && ["dbr", "dwt", "ddv"].includes(parsed.product)) {
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

if (ragConfig.prewarm) {
  if (ragConfig.prewarmBlock) {
    await prewarmRagIndex();
  } else {
    void prewarmRagIndex();
  }
}
