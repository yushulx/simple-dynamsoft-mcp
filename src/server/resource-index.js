import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
import { DOCS_CONFIG } from "./resource-index/config.js";
import { loadMarkdownDocs } from "./resource-index/docs-loader.js";
import { registryPath, DOC_ROOTS, SAMPLE_ROOTS, readSubmoduleHead } from "./resource-index/paths.js";
import {
  getCodeFileExtensions,
  isCodeFile,
  discoverMobileSamples,
  discoverDbrServerSamples,
  discoverPythonSamples,
  discoverDcvMobileSamples,
  discoverDcvServerSamples,
  discoverDcvWebSamples,
  discoverWebSamples,
  getWebSamplePath,
  discoverDwtSamples,
  discoverDdvSamples,
  mapDdvSampleToFramework,
  getDbrWebFrameworkPlatforms,
  getDcvWebFrameworkPlatforms,
  getDdvWebFrameworkPlatforms,
  getWebFrameworkPlatforms,
  findCodeFilesInSample,
  getDbrMobilePlatforms,
  getDbrServerPlatforms,
  getDcvMobilePlatforms,
  getDcvServerPlatforms,
  getMobileSamplePath,
  getPythonSamplePath,
  getDbrServerSamplePath,
  getDcvMobileSamplePath,
  getDcvServerSamplePath,
  getDcvWebSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  readCodeFile,
  getMainCodeFile,
  getMimeTypeForExtension,
  getDbrServerSampleContent,
  getDcvServerSampleContent,
  resetSampleDiscoveryCaches
} from "./resource-index/samples.js";
import { parseResourceUri, parseSampleUri, getSampleIdFromUri } from "./resource-index/uri.js";
import {
  parseMajorVersion,
  detectMajorFromQuery,
  formatLegacyLinksForDBR,
  getLegacyLink,
  ensureLatestMajor as ensureLatestMajorWithPolicy,
  buildVersionPolicyText as buildVersionPolicyTextWithPolicy
} from "./resource-index/version-policy.js";
import {
  buildIndexData as buildIndexDataFromBuilders,
  buildResourceIndex as buildResourceIndexFromBuilders
} from "./resource-index/builders.js";

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const registrySha256 = createHash("sha256").update(readFileSync(registryPath)).digest("hex");

function inferDbrMobilePlatform(articlePath) {
  const normalized = String(articlePath || "").replace(/\\/g, "/").toLowerCase();
  const match = normalized.match(/^programming\/([^/]+)\//);
  if (!match) return "mobile";
  const segment = match[1];
  if (segment === "objectivec-swift") return "ios";
  if (segment === "android" || segment === "ios" || segment === "maui" || segment === "react-native" || segment === "flutter") {
    return segment;
  }
  return "mobile";
}

function inferDbrServerPlatform(articlePath) {
  const normalized = String(articlePath || "").replace(/\\/g, "/").toLowerCase();
  const match = normalized.match(/^programming\/([^/]+)\//);
  if (!match) return "server";
  const segment = match[1];
  if (segment === "cplusplus") return "cpp";
  if (segment === "python" || segment === "java" || segment === "dotnet" || segment === "cpp") return segment;
  return "server";
}

function withEditionScope(articles, edition, platformResolver) {
  return (articles || []).map((article) => ({
    ...article,
    edition,
    platform: platformResolver ? platformResolver(article.path) : "web"
  }));
}

function inferDcvMobilePlatform(articlePath) {
  const normalized = String(articlePath || "").replace(/\\/g, "/").toLowerCase();
  const match = normalized.match(/^programming\/([^/]+)\//);
  if (!match) return "mobile";
  const segment = match[1];
  if (segment === "objectivec-swift") return "ios";
  if (segment === "android" || segment === "ios" || segment === "maui" || segment === "react-native" || segment === "flutter") {
    return segment;
  }
  return "mobile";
}

function inferDcvServerPlatform(articlePath) {
  const normalized = String(articlePath || "").replace(/\\/g, "/").toLowerCase();
  const match = normalized.match(/^programming\/([^/]+)\//);
  if (!match) return "server";
  const segment = match[1];
  if (segment === "cplusplus") return "cpp";
  if (segment === "python" || segment === "java" || segment === "dotnet" || segment === "cpp" || segment === "nodejs") {
    return segment;
  }
  return "server";
}

let dbrWebDocs = [];
let dbrMobileDocs = [];
let dbrServerDocs = [];
let dcvCoreDocs = [];
let dcvWebDocs = [];
let dcvMobileDocs = [];
let dcvServerDocs = [];
let dwtDocs = { articles: [] };
let ddvDocs = { articles: [] };

function loadDocumentationSets() {
  dbrWebDocs = withEditionScope(
    loadMarkdownDocs({
      rootDir: DOC_ROOTS.dbrWeb,
      urlBase: DOCS_CONFIG.dbrWeb.urlBase,
      excludeDirs: DOCS_CONFIG.dbrWeb.excludeDirs,
      excludeFiles: DOCS_CONFIG.dbrWeb.excludeFiles
    }).articles,
    "web",
    () => "web"
  );

  dbrMobileDocs = withEditionScope(
    loadMarkdownDocs({
      rootDir: DOC_ROOTS.dbrMobile,
      urlBase: DOCS_CONFIG.dbrMobile.urlBase,
      excludeDirs: DOCS_CONFIG.dbrMobile.excludeDirs,
      excludeFiles: DOCS_CONFIG.dbrMobile.excludeFiles
    }).articles,
    "mobile",
    inferDbrMobilePlatform
  );

  dbrServerDocs = withEditionScope(
    loadMarkdownDocs({
      rootDir: DOC_ROOTS.dbrServer,
      urlBase: DOCS_CONFIG.dbrServer.urlBase,
      excludeDirs: DOCS_CONFIG.dbrServer.excludeDirs,
      excludeFiles: DOCS_CONFIG.dbrServer.excludeFiles
    }).articles,
    "server",
    inferDbrServerPlatform
  );

  dcvCoreDocs = withEditionScope(
    loadMarkdownDocs({
      rootDir: DOC_ROOTS.dcvCore,
      urlBase: DOCS_CONFIG.dcvCore.urlBase,
      excludeDirs: DOCS_CONFIG.dcvCore.excludeDirs,
      excludeFiles: DOCS_CONFIG.dcvCore.excludeFiles
    }).articles,
    "core",
    () => "core"
  );

  dcvWebDocs = withEditionScope(
    loadMarkdownDocs({
      rootDir: DOC_ROOTS.dcvWeb,
      urlBase: DOCS_CONFIG.dcvWeb.urlBase,
      excludeDirs: DOCS_CONFIG.dcvWeb.excludeDirs,
      excludeFiles: DOCS_CONFIG.dcvWeb.excludeFiles
    }).articles,
    "web",
    () => "web"
  );

  dcvMobileDocs = withEditionScope(
    loadMarkdownDocs({
      rootDir: DOC_ROOTS.dcvMobile,
      urlBase: DOCS_CONFIG.dcvMobile.urlBase,
      excludeDirs: DOCS_CONFIG.dcvMobile.excludeDirs,
      excludeFiles: DOCS_CONFIG.dcvMobile.excludeFiles
    }).articles,
    "mobile",
    inferDcvMobilePlatform
  );

  dcvServerDocs = withEditionScope(
    loadMarkdownDocs({
      rootDir: DOC_ROOTS.dcvServer,
      urlBase: DOCS_CONFIG.dcvServer.urlBase,
      excludeDirs: DOCS_CONFIG.dcvServer.excludeDirs,
      excludeFiles: DOCS_CONFIG.dcvServer.excludeFiles
    }).articles,
    "server",
    inferDcvServerPlatform
  );

  dwtDocs = loadMarkdownDocs({
    rootDir: DOC_ROOTS.dwtArticles,
    urlBase: DOCS_CONFIG.dwt.urlBase,
    includeDirNames: DOCS_CONFIG.dwt.includeDirNames
  });

  ddvDocs = loadMarkdownDocs({
    rootDir: DOC_ROOTS.ddv,
    urlBase: DOCS_CONFIG.ddv.urlBase,
    excludeDirs: DOCS_CONFIG.ddv.excludeDirs,
    excludeFiles: DOCS_CONFIG.ddv.excludeFiles
  });
}

const dbrServerSdk = registry.sdks["dbr-server"];
const dcvMobileSdk = registry.sdks["dcv-mobile"];
const dcvWebSdk = registry.sdks["dcv-web"];
const dcvServerSdk = registry.sdks["dcv-server"];
const dcvCoreSdk = registry.sdks["dcv-core"];

const LATEST_VERSIONS = {
  dbr: {
    mobile: registry.sdks["dbr-mobile"].version,
    web: registry.sdks["dbr-web"].version,
    server: dbrServerSdk.version,
    python: dbrServerSdk.version
  },
  dcv: {
    core: dcvCoreSdk.version,
    web: dcvWebSdk.version,
    mobile: dcvMobileSdk.version,
    server: dcvServerSdk.version
  },
  dwt: {
    web: registry.sdks.dwt.version
  },
  ddv: {
    web: registry.sdks.ddv.version
  }
};

const LATEST_MAJOR = {
  dbr: parseMajorVersion(registry.sdks["dbr-mobile"].version),
  dcv: parseMajorVersion(dcvMobileSdk.version),
  dwt: parseMajorVersion(registry.sdks.dwt.version),
  ddv: parseMajorVersion(registry.sdks.ddv.version)
};

setWebFrameworkPlatformsGetter(getWebFrameworkPlatforms);

function ensureLatestMajor(args) {
  return ensureLatestMajorWithPolicy({ ...args, latestMajor: LATEST_MAJOR });
}

function buildVersionPolicyText() {
  return buildVersionPolicyTextWithPolicy(LATEST_MAJOR);
}

const resourceIndex = [];
const resourceIndexByUri = new Map();
let resourceIndexReady = false;

function addResourceToIndex(entry) {
  resourceIndex.push(entry);
}

function buildIndexData() {
  return buildIndexDataFromBuilders({
    LATEST_VERSIONS,
    LATEST_MAJOR,
    dcvCoreDocs,
    dcvWebDocs,
    dcvMobileDocs,
    dcvServerDocs,
    dbrWebDocs,
    dbrMobileDocs,
    dbrServerDocs,
    dwtDocs,
    ddvDocs,
    discoverDcvWebSamples,
    getDcvWebFrameworkPlatforms,
    getDcvMobilePlatforms,
    getDcvServerPlatforms,
    discoverDcvMobileSamples,
    discoverDcvServerSamples,
    discoverWebSamples,
    getDbrWebFrameworkPlatforms,
    getDbrMobilePlatforms,
    getDbrServerPlatforms,
    discoverMobileSamples,
    discoverDbrServerSamples,
    discoverDwtSamples,
    discoverDdvSamples,
    getDdvWebFrameworkPlatforms
  });
}

function buildResourceIndex() {
  buildResourceIndexFromBuilders({
    addResourceToIndex,
    buildIndexData,
    buildVersionPolicyText,
    LATEST_VERSIONS,
    LATEST_MAJOR,
    dcvCoreDocs,
    dcvWebDocs,
    dcvMobileDocs,
    dcvServerDocs,
    dbrWebDocs,
    dbrMobileDocs,
    dbrServerDocs,
    dwtDocs,
    ddvDocs,
    discoverDcvMobileSamples,
    getDcvMobilePlatforms,
    getDcvMobileSamplePath,
    getDcvServerPlatforms,
    discoverDcvServerSamples,
    getDcvServerSampleContent,
    discoverDcvWebSamples,
    getDcvWebSamplePath,
    discoverMobileSamples,
    getDbrMobilePlatforms,
    getMobileSamplePath,
    getMainCodeFile,
    readCodeFile,
    getMimeTypeForExtension,
    getDbrServerPlatforms,
    discoverDbrServerSamples,
    getDbrServerSampleContent,
    discoverWebSamples,
    getWebSamplePath,
    discoverDwtSamples,
    getDwtSamplePath,
    discoverDdvSamples,
    getDdvSamplePath,
    findCodeFilesInSample
  });
}

function refreshResourceIndex() {
  resetSampleDiscoveryCaches();
  loadDocumentationSets();
  resourceIndex.length = 0;
  buildResourceIndex();
  resourceIndexByUri.clear();
  for (const entry of resourceIndex) {
    resourceIndexByUri.set(entry.uri, entry);
  }
  resourceIndexReady = true;
  return { resourceCount: resourceIndex.length };
}

function ensureResourceIndexReady() {
  if (!resourceIndexReady) {
    return refreshResourceIndex();
  }
  return { resourceCount: resourceIndex.length };
}

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

function getSampleEntries({ product, edition, platform }) {
  ensureResourceIndexReady();

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

function getDisplayEdition(entryEdition) {
  return entryEdition === "python" ? "server" : entryEdition;
}

function getDisplayPlatform(entryPlatform) {
  return entryPlatform === "web" ? "js" : entryPlatform;
}

function formatScopeLabel(entry) {
  const displayEdition = getDisplayEdition(entry.edition);
  const displayPlatform = getDisplayPlatform(entry.platform);
  return [entry.product || "general", displayEdition || "", displayPlatform || ""].filter(Boolean).join("/");
}

function getPinnedResources() {
  ensureResourceIndexReady();
  return resourceIndex.filter((entry) => entry.pinned);
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildResourceLookupCandidates(uri) {
  const candidates = [];
  if (typeof uri !== "string" || uri.length === 0) return candidates;
  candidates.push(uri);

  if (!uri.includes("://")) return candidates;
  const [scheme, rest] = uri.split("://");
  if (scheme !== "doc") return candidates;

  const parts = String(rest || "").split("/").filter(Boolean);
  if (parts.length < 5) return candidates;

  const head = parts.slice(0, 4);
  const slugRaw = parts.slice(4).join("/");
  const decodedOnce = safeDecodeURIComponent(slugRaw);
  const decodedTwice = safeDecodeURIComponent(decodedOnce);

  for (const slug of [decodedOnce, decodedTwice]) {
    const canonical = `${scheme}://${head.join("/")}/${encodeURIComponent(slug)}`;
    if (!candidates.includes(canonical)) {
      candidates.push(canonical);
    }
  }

  return candidates;
}

async function readResourceContent(uri) {
  ensureResourceIndexReady();

  let resource = null;
  for (const candidate of buildResourceLookupCandidates(uri)) {
    resource = resourceIndexByUri.get(candidate);
    if (resource) break;
  }
  if (!resource) return null;

  const content = await resource.loadContent();
  return {
    uri,
    mimeType: content.mimeType || resource.mimeType || "text/plain",
    text: content.text,
    blob: content.blob
  };
}

function getRagSignatureData() {
  ensureResourceIndexReady();

  return {
    resourceCount: resourceIndex.length,
    dcvCoreDocCount: dcvCoreDocs.length,
    dcvWebDocCount: dcvWebDocs.length,
    dcvMobileDocCount: dcvMobileDocs.length,
    dcvServerDocCount: dcvServerDocs.length,
    dbrWebDocCount: dbrWebDocs.length,
    dbrMobileDocCount: dbrMobileDocs.length,
    dbrServerDocCount: dbrServerDocs.length,
    dwtDocCount: dwtDocs.articles.length,
    ddvDocCount: ddvDocs.articles.length,
    versions: LATEST_VERSIONS,
    dataSources: {
      dbrWebSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrWeb),
      dbrMobileSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrMobile),
      dbrPythonSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrPython),
      dbrDotnetSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrDotnet),
      dbrJavaSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrJava),
      dbrCppSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrCpp),
      dbrMauiSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrMaui),
      dbrReactNativeSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrReactNative),
      dbrFlutterSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrFlutter),
      dbrNodejsSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dbrNodejs),
      dcvWebSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvWeb),
      dcvMobileSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvMobile),
      dcvPythonSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvPython),
      dcvDotnetSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvDotnet),
      dcvJavaSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvJava),
      dcvCppSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvCpp),
      dcvMauiSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvMaui),
      dcvReactNativeSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvReactNative),
      dcvFlutterSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvFlutter),
      dcvNodejsSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvNodejs),
      dcvSpmSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dcvSpm),
      dwtSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dwt),
      ddvSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.ddv),
      dbrWebDocsHead: readSubmoduleHead(DOC_ROOTS.dbrWeb),
      dbrMobileDocsHead: readSubmoduleHead(DOC_ROOTS.dbrMobile),
      dbrServerDocsHead: readSubmoduleHead(DOC_ROOTS.dbrServer),
      dcvCoreDocsHead: readSubmoduleHead(DOC_ROOTS.dcvCore),
      dcvWebDocsHead: readSubmoduleHead(DOC_ROOTS.dcvWeb),
      dcvMobileDocsHead: readSubmoduleHead(DOC_ROOTS.dcvMobile),
      dcvServerDocsHead: readSubmoduleHead(DOC_ROOTS.dcvServer),
      dwtDocsHead: readSubmoduleHead(DOC_ROOTS.dwt),
      ddvDocsHead: readSubmoduleHead(DOC_ROOTS.ddv),
      registrySha256
    }
  };
}

export {
  registry,
  LATEST_VERSIONS,
  LATEST_MAJOR,
  resourceIndex,
  resourceIndexByUri,
  getRagSignatureData,
  getCodeFileExtensions,
  isCodeFile,
  discoverMobileSamples,
  discoverDbrServerSamples,
  discoverPythonSamples,
  discoverDcvMobileSamples,
  discoverDcvServerSamples,
  discoverDcvWebSamples,
  discoverWebSamples,
  getWebSamplePath,
  discoverDwtSamples,
  discoverDdvSamples,
  mapDdvSampleToFramework,
  getDbrWebFrameworkPlatforms,
  getDcvWebFrameworkPlatforms,
  getDdvWebFrameworkPlatforms,
  getWebFrameworkPlatforms,
  findCodeFilesInSample,
  getDbrServerSamplePath,
  getDbrMobilePlatforms,
  getDbrServerPlatforms,
  getDcvMobilePlatforms,
  getDcvServerPlatforms,
  getMobileSamplePath,
  getPythonSamplePath,
  getDcvMobileSamplePath,
  getDcvServerSamplePath,
  getDcvWebSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  readCodeFile,
  getMainCodeFile,
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
  refreshResourceIndex,
  ensureResourceIndexReady,
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
