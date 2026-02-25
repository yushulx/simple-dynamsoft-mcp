import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { ensureDataScopesHydrated } from "../data/bootstrap.js";
import { createScopeHydrator } from "./helpers/server-helpers.js";
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
  description: "MCP server for latest major versions of Dynamsoft SDKs: Capture Vision, Barcode Reader, Dynamic Web TWAIN, and Document Viewer. Includes guidance for choosing DBR vs DCV by scenario."
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
  searchResources
});

registerSampleTools({
  server,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  normalizeSampleName,
  parseSampleUri,
  resourceIndex,
  getSampleEntries,
  getSampleIdFromUri,
  getDisplayEdition,
  getDisplayPlatform,
  formatScopeLabel,
  searchResources,
  getSampleSuggestions
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
  getDwtSamplePath,
  getDdvSamplePath,
  getSampleSuggestions
});
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
  if (parsed && ["dcv", "dbr", "dwt", "ddv"].includes(parsed.product)) {
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

return server;
}
