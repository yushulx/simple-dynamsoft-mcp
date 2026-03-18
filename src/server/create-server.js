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
    discoverDcvMobileSamples,
    discoverDcvWebSamples,
    findCodeFilesInSample,
    getMobileSamplePath,
    getDbrServerSamplePath,
    getDcvMobileSamplePath,
    getDcvServerSamplePath,
    getDcvWebSamplePath,
    getMrzWebSamplePath,
    getMdsWebSamplePath,
    getDwtSamplePath,
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
  description: "MCP server for the public Dynamsoft offerings: Barcode Reader, Dynamic Web TWAIN, Document Viewer, MRZ, and MDS. Includes guidance for choosing the right public product by workflow."
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
  registry,
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
  getMrzWebSamplePath,
  getMdsWebSamplePath,
  getDwtSamplePath,
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
