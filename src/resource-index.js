import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeSdkId,
  normalizePlatform,
  normalizeLanguage,
  normalizeApiLevel,
  normalizeSampleName,
  normalizeProduct,
  normalizeEdition,
  isServerPlatform,
  isWebFrameworkPlatform,
  isWebPlatform,
  inferProductFromQuery,
  WEB_FRAMEWORK_TAG_ALIASES,
  setWebFrameworkPlatformsGetter
} from "./normalizers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const registryUrl = new URL("../data/dynamsoft_sdks.json", import.meta.url);
const registry = JSON.parse(readFileSync(registryUrl, "utf8"));

const dwtDocsUrl = new URL("../data/web-twain-api-docs.json", import.meta.url);
const dwtDocs = JSON.parse(readFileSync(dwtDocsUrl, "utf8"));

const ddvDocsUrl = new URL("../data/ddv-api-docs.json", import.meta.url);
const ddvDocs = JSON.parse(readFileSync(ddvDocsUrl, "utf8"));

const codeSnippetRoot = join(projectRoot, "code-snippet");

let cachedWebFrameworkPlatforms = null;
let cachedDbrWebFrameworkPlatforms = null;
let cachedDdvWebFrameworkPlatforms = null;

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

setWebFrameworkPlatformsGetter(getWebFrameworkPlatforms);

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
  if (!parsed) return "";
  return parsed.sampleName || "";
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

  const lines = [
    "# Version Policy",
    "",
    "This MCP server only serves the latest major versions of each product.",
    "",
    `- DBR latest major: v${dbrMajor}`,
    `- DWT latest major: v${dwtMajor}`,
    `- DDV latest major: v${ddvMajor}`,
    "",
    "Legacy support:",
    "- DBR v9 and v10 docs are linked when requested.",
    `- DWT archived docs available: ${dwtLegacyVersions || "none"}.`,
    "",
    "Requests for older major versions are refused with a helpful message."
  ];

  return lines.join("\n");
}

function buildIndexData() {
  const dbrMobileVersion = LATEST_VERSIONS.dbr.mobile;
  const dbrWebVersion = LATEST_VERSIONS.dbr.web;
  const dbrServerVersion = LATEST_VERSIONS.dbr.server;
  const dwtVersion = LATEST_VERSIONS.dwt.web;
  const ddvVersion = LATEST_VERSIONS.ddv.web;

  const dbrWebSamples = discoverWebSamples();
  const dbrWebFrameworks = getDbrWebFrameworkPlatforms();
  const ddvSamples = discoverDdvSamples();
  const ddvWebFrameworks = getDdvWebFrameworkPlatforms();

  return {
    products: {
      dbr: {
        latestMajor: LATEST_MAJOR.dbr,
        editions: {
          mobile: {
            version: dbrMobileVersion,
            platforms: ["android", "ios"],
            samples: {
              android: discoverMobileSamples("android"),
              ios: discoverMobileSamples("ios")
            }
          },
          web: {
            version: dbrWebVersion,
            platforms: ["js", ...dbrWebFrameworks],
            samples: dbrWebSamples
          },
          server: {
            version: dbrServerVersion,
            platforms: ["python", "cpp", "java", "dotnet"],
            samples: {
              python: discoverPythonSamples()
            }
          }
        }
      },
      dwt: {
        latestMajor: LATEST_MAJOR.dwt,
        editions: {
          web: {
            version: dwtVersion,
            platforms: ["js"],
            sampleCategories: discoverDwtSamples(),
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

function getPinnedResources() {
  return resourceIndex.filter((entry) => entry.pinned);
}

async function readResourceContent(uri) {
  const resource = resourceIndexByUri.get(uri);
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

function getRagSignatureData() {
  return {
    resourceCount: resourceIndex.length,
    dwtDocCount: dwtDocs.articles.length,
    ddvDocCount: ddvDocs.articles.length,
    versions: LATEST_VERSIONS
  };
}

export {
  registry,
  dwtDocs,
  ddvDocs,
  codeSnippetRoot,
  LATEST_VERSIONS,
  LATEST_MAJOR,
  resourceIndex,
  resourceIndexByUri,
  getRagSignatureData,
  getCodeFileExtensions,
  isCodeFile,
  discoverMobileSamples,
  discoverPythonSamples,
  discoverWebSamples,
  getWebSamplePath,
  discoverDwtSamples,
  discoverDdvSamples,
  mapDdvSampleToFramework,
  getDbrWebFrameworkPlatforms,
  getDdvWebFrameworkPlatforms,
  getWebFrameworkPlatforms,
  discoverSamples,
  findCodeFilesInSample,
  getMobileSamplePath,
  getPythonSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  getSamplePath,
  readCodeFile,
  getMainCodeFile,
  formatDocs,
  parseMajorVersion,
  getMimeTypeForExtension,
  addResourceToIndex,
  formatLegacyLinksForDBR,
  getLegacyLink,
  detectMajorFromQuery,
  ensureLatestMajor,
  parseResourceUri,
  parseSampleUri,
  getSampleIdFromUri,
  getSampleEntries,
  buildVersionPolicyText,
  buildIndexData,
  buildResourceIndex,
  editionMatches,
  platformMatches,
  getDisplayEdition,
  getDisplayPlatform,
  formatScopeLabel,
  getPinnedResources,
  readResourceContent,
  normalizeSdkId,
  normalizePlatform,
  normalizeLanguage,
  normalizeApiLevel,
  normalizeSampleName,
  normalizeProduct,
  normalizeEdition,
  isServerPlatform,
  isWebFrameworkPlatform,
  isWebPlatform,
  inferProductFromQuery
};
