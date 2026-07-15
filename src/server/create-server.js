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
  }, {
    instructions: [
      "This server answers questions about five public Dynamsoft offerings: DBR, DWT, DDV, MRZ, MDS.",
      "",
      "How to use it:",
      "- Call get_index first to see valid product/edition/platform combinations before asking the user anything.",
      "- Only ask the user to disambiguate dimensions that actually vary for the chosen product. Do NOT ask about dimensions that don't apply.",
      "",
      "Platform/edition rules (important):",
      "- DBR (Dynamsoft Barcode Reader) is the ONLY product with multiple editions: mobile, web, and server/desktop. Ask which one when it is unclear.",
      "- DWT (Dynamic Web TWAIN), DDV (Document Viewer), MRZ (MRZ Scanner), and MDS (Mobile Document Scanner) are web/JavaScript-only in this MCP. NEVER ask the user which platform or language for these — there is no .NET/Java/C++/mobile option here. Go straight to the web quickstart or samples.",
      "",
      "api_level rule:",
      "- api_level (high-level / low-level) applies ONLY to DBR mobile. Never ask about it, or pass it, for web, server, or any product other than DBR mobile.",
      "",
      "For scopes this MCP does not index (e.g. MRZ/MDS on mobile or server), tools return official documentation and sample links — pass those on rather than inventing code."
    ].join("\n")
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
    getWebSamplePath,
    getMrzWebSamplePath,
    getMdsWebSamplePath,
    getSampleSuggestions,
    getSampleIdFromUri,
    formatScopeLabel
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
