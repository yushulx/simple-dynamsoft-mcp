import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureDataScopesHydrated } from "../data/bootstrap.js";
import { createScopeHydrator } from "./helpers/server-helpers.js";
import { registerResourceHandlers } from "./resources/register-resources.js";
import { registerIndexTools } from "./tools/register-index-tools.js";
import { registerSampleTools } from "./tools/register-sample-tools.js";
import { registerVersionTools } from "./tools/register-version-tools.js";
import { registerQuickstartTools } from "./tools/register-quickstart-tools.js";
import { registerProjectTools } from "./tools/register-project-tools.js";

export function createMcpServerInstance({ pkgVersion, resourceIndexApi, ragApi }) {
  const {
    registry,
    LATEST_VERSIONS,
    LATEST_MAJOR,
    discoverDwtSamples,
    discoverMdsSamples,
    discoverDcvMobileSamples,
    discoverDcvWebSamples,
    getMdsSamplePlatform,
    findCodeFilesInSample,
    getMobileSamplePath,
    getDbrServerSamplePath,
    getDcvMobileSamplePath,
    getDcvServerSamplePath,
    getDcvWebSamplePath,
    getDwtSamplePath,
    getMdsSamplePath,
    getDdvSamplePath,
    readCodeFile,
    getMainCodeFile,
    ensureLatestMajor,
    parseResourceUri,
    parseSampleUri,
    getSampleIdFromUri,
    getSampleEntries,
    buildIndexData,
    getDisplayEdition,
    getDisplayPlatform,
    formatScopeLabel,
    getPinnedResources,
    readResourceContent,
    refreshResourceIndex,
    normalizePlatform,
    normalizeApiLevel,
    normalizeSampleName,
    normalizeProduct,
    normalizeEdition,
    resourceIndex,
    getWebSamplePath
  } = resourceIndexApi;

  const {
    searchResources,
    getSampleSuggestions,
    refreshRagIndexes
  } = ragApi;

  const ensureScopeHydrated = createScopeHydrator({
    ensureDataScopesHydrated,
    refreshResourceIndex,
    refreshRagIndexes
  });

const server = new McpServer({
  name: "simple-dynamsoft-mcp",
  version: pkgVersion,
  description: "MCP server for latest major versions of Dynamsoft SDKs: Capture Vision, Barcode Reader, Dynamic Web TWAIN, Mobile Document Scanner, and Document Viewer. Includes first-class MDS guidance plus DBR-vs-DCV scenario selection help."
});

registerIndexTools({
  server,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  buildIndexData,
  getSampleIdFromUri,
  formatScopeLabel,
  searchResources,
  normalizeSampleName,
  getSampleEntries,
  getSampleSuggestions
});

registerSampleTools({
  server,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  getSampleEntries,
  getSampleIdFromUri,
  getDisplayEdition,
  getDisplayPlatform
});

registerVersionTools({
  server,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  LATEST_MAJOR,
  LATEST_VERSIONS
});

registerQuickstartTools({
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
  discoverMdsSamples,
  getMdsSamplePlatform,
  findCodeFilesInSample,
  getMobileSamplePath,
  getDbrServerSamplePath,
  getDcvMobileSamplePath,
  getDcvServerSamplePath,
  getDcvWebSamplePath,
  getDwtSamplePath,
  getMdsSamplePath,
  getDdvSamplePath,
  readCodeFile,
  getMainCodeFile,
  getWebSamplePath
});

registerProjectTools({
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
  getDwtSamplePath,
  getMdsSamplePath,
  getDdvSamplePath,
  getSampleSuggestions
});

registerResourceHandlers({
  server,
  getPinnedResources,
  parseResourceUri,
  ensureLatestMajor,
  readResourceContent
});

return server;
}
