import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureDataScopesHydrated } from "../data/bootstrap.js";
import { createScopeHydrator } from "./helpers/server-helpers.js";
import { registerResourceHandlers } from "./resources/register-resources.js";
import { createIndexedResourceReader } from "./resources/read-indexed-resource.js";
import { registerIndexTools } from "./tools/register-index-tools.js";
import { registerDocumentTools } from "./tools/register-document-tools.js";
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
    description: "MCP server for the public Dynamsoft offerings: Barcode Reader, Dynamic Web TWAIN, Document Viewer, MRZ, MDS, and Batch Barcode Scanner (BBS). Includes guidance for choosing the right public product by workflow."
  }, {
    instructions: [
      "This server answers questions about six public Dynamsoft offerings: DBR, DWT, DDV, MRZ, MDS, BBS.",
      "",
      "How to use it:",
      "- Call get_index first to see valid product/edition/platform combinations before asking the user anything. Its productSelection.capabilities lists known facts (OCR, VIN, ID documents, batch scanning) that take precedence over inference; for other capabilities, search before saying something is not offered.",
      "- To recommend products for a described workflow, call read_document with productSelection.guideUri from get_index and follow that guide.",
      "- To answer from documentation: call search. When a matched passage in the search response covers the question, answer from it and cite its Source URL. Otherwise call read_document with the exact doc:// uri it returned, base the answer on that text, and cite the public documentation URL it contains. Do not answer from search summaries alone or hand doc:// links to the user.",
      "- For sample:// results, call get_sample_files with resource_uri to get the complete sample project.",
      "- Only ask the user to disambiguate dimensions that actually vary for the chosen product. Do NOT ask about dimensions that don't apply.",
      "",
      "Platform/edition rules (important):",
      "- DBR (Dynamsoft Barcode Reader) is the ONLY product with multiple editions: mobile, web, and server/desktop. Ask which one when it is unclear.",
      "- DWT (Dynamic Web TWAIN), DDV (Document Viewer), MRZ (MRZ Scanner), and MDS (Mobile Document Scanner) are web/JavaScript-only in this MCP. NEVER ask the user which platform or language for these — there is no .NET/Java/C++/mobile option here. Go straight to the web quickstart or samples.",
      "- BBS (Batch Barcode Scanner) is a ready-made Android/iOS app, not an SDK: it has only documentation, no quickstart or code samples. NEVER ask the user which platform or language for it. Answer from search and read_document; for integration, point to its result export (CSV/images, sharing, cloud), or to DBR when the user wants multi-barcode scanning inside their own app.",
      "",
      "api_level rule:",
      "- api_level (high-level / low-level) applies ONLY to DBR mobile. Never ask about it, or pass it, for web, server, or any product other than DBR mobile.",
      "",
      "For scopes this MCP does not index (e.g. MRZ/MDS on mobile or server), tools return official documentation and sample links — pass those on rather than inventing code. For BBS, the quickstart and sample tools return its documentation and integration links."
    ].join("\n")
  });

  const readIndexedResource = createIndexedResourceReader({
    parseResourceUri,
    ensureLatestMajor,
    readResourceContent
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

  registerDocumentTools({
    server,
    readIndexedResource
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
    readResourceContent,
    readIndexedResource
  });

  return server;
}
