import { readFileSync } from "node:fs";
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
  discoverWebSamples,
  getWebSamplePath,
  discoverDwtSamples,
  discoverDdvSamples,
  mapDdvSampleToFramework,
  getDbrWebFrameworkPlatforms,
  getDdvWebFrameworkPlatforms,
  getWebFrameworkPlatforms,
  findCodeFilesInSample,
  getDbrMobilePlatforms,
  getDbrServerPlatforms,
  getMobileSamplePath,
  getPythonSamplePath,
  getDbrServerSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  readCodeFile,
  getMainCodeFile,
  getMimeTypeForExtension,
  getDbrServerSampleContent
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

function withDbrScope(articles, edition, platformResolver) {
  return (articles || []).map((article) => ({
    ...article,
    edition,
    platform: platformResolver ? platformResolver(article.path) : "web"
  }));
}

const dbrWebDocs = withDbrScope(
  loadMarkdownDocs({
    rootDir: DOC_ROOTS.dbrWeb,
    urlBase: DOCS_CONFIG.dbrWeb.urlBase,
    excludeDirs: DOCS_CONFIG.dbrWeb.excludeDirs,
    excludeFiles: DOCS_CONFIG.dbrWeb.excludeFiles
  }).articles,
  "web",
  () => "web"
);

const dbrMobileDocs = withDbrScope(
  loadMarkdownDocs({
    rootDir: DOC_ROOTS.dbrMobile,
    urlBase: DOCS_CONFIG.dbrMobile.urlBase,
    excludeDirs: DOCS_CONFIG.dbrMobile.excludeDirs,
    excludeFiles: DOCS_CONFIG.dbrMobile.excludeFiles
  }).articles,
  "mobile",
  inferDbrMobilePlatform
);

const dbrServerDocs = withDbrScope(
  loadMarkdownDocs({
    rootDir: DOC_ROOTS.dbrServer,
    urlBase: DOCS_CONFIG.dbrServer.urlBase,
    excludeDirs: DOCS_CONFIG.dbrServer.excludeDirs,
    excludeFiles: DOCS_CONFIG.dbrServer.excludeFiles
  }).articles,
  "server",
  inferDbrServerPlatform
);

const dwtDocs = loadMarkdownDocs({
  rootDir: DOC_ROOTS.dwtArticles,
  urlBase: DOCS_CONFIG.dwt.urlBase,
  includeDirNames: DOCS_CONFIG.dwt.includeDirNames
});

const ddvDocs = loadMarkdownDocs({
  rootDir: DOC_ROOTS.ddv,
  urlBase: DOCS_CONFIG.ddv.urlBase,
  excludeDirs: DOCS_CONFIG.ddv.excludeDirs,
  excludeFiles: DOCS_CONFIG.ddv.excludeFiles
});

const dbrServerSdk = registry.sdks["dbr-server"];

const LATEST_VERSIONS = {
  dbr: {
    mobile: registry.sdks["dbr-mobile"].version,
    web: registry.sdks["dbr-web"].version,
    server: dbrServerSdk.version,
    python: dbrServerSdk.version
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

function addResourceToIndex(entry) {
  resourceIndex.push(entry);
}

function buildIndexData() {
  return buildIndexDataFromBuilders({
    LATEST_VERSIONS,
    LATEST_MAJOR,
    dbrWebDocs,
    dbrMobileDocs,
    dbrServerDocs,
    dwtDocs,
    ddvDocs,
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
    dbrWebDocs,
    dbrMobileDocs,
    dbrServerDocs,
    dwtDocs,
    ddvDocs,
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
  return resourceIndex.filter((entry) => entry.pinned);
}

async function readResourceContent(uri) {
  const resource = resourceIndexByUri.get(uri);
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
  return {
    resourceCount: resourceIndex.length,
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
      dwtSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.dwt),
      ddvSamplesHead: readSubmoduleHead(SAMPLE_ROOTS.ddv),
      dbrWebDocsHead: readSubmoduleHead(DOC_ROOTS.dbrWeb),
      dbrMobileDocsHead: readSubmoduleHead(DOC_ROOTS.dbrMobile),
      dbrServerDocsHead: readSubmoduleHead(DOC_ROOTS.dbrServer),
      dwtDocsHead: readSubmoduleHead(DOC_ROOTS.dwt),
      ddvDocsHead: readSubmoduleHead(DOC_ROOTS.ddv),
      registryPath
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
  discoverWebSamples,
  getWebSamplePath,
  discoverDwtSamples,
  discoverDdvSamples,
  mapDdvSampleToFramework,
  getDbrWebFrameworkPlatforms,
  getDdvWebFrameworkPlatforms,
  getWebFrameworkPlatforms,
  findCodeFilesInSample,
  getDbrServerSamplePath,
  getDbrMobilePlatforms,
  getDbrServerPlatforms,
  getMobileSamplePath,
  getPythonSamplePath,
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
