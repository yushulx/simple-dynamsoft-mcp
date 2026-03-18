import assert from "node:assert/strict";
import test from "node:test";
import { buildResourceIndex } from "../../src/server/resource-index/builders.js";

function createBuilderArgs(addResourceToIndex, overrides = {}) {
  return {
    addResourceToIndex,
    buildIndexData: () => ({}),
    buildVersionPolicyText: () => "policy",
    LATEST_VERSIONS: {
      dcv: { core: "3.2.5000", web: "3.2.5000", mobile: "3.4.1000", server: "3.4.1000" },
      dbr: { mobile: "10.4.2000", web: "10.4.2000", server: "10.4.2000" },
      dwt: { web: "19.0.0" },
      ddv: { web: "3.0.0" }
    },
    LATEST_MAJOR: { dcv: 3, dbr: 10, dwt: 19, ddv: 3 },
    dcvCoreDocs: [],
    dcvWebDocs: [],
    dcvMobileDocs: [],
    dcvServerDocs: [],
    dbrWebDocs: [],
    dbrMobileDocs: [],
    dbrServerDocs: [],
    dwtDocs: { articles: [] },
    ddvDocs: { articles: [] },
    discoverDcvMobileSamples: () => [],
    getDcvMobilePlatforms: () => [],
    getDcvMobileSamplePath: () => "",
    getDcvServerPlatforms: () => [],
    discoverDcvServerSamples: () => [],
    getDcvServerSampleContent: async () => ({ text: "", mimeType: "text/plain" }),
    discoverDcvWebSamples: () => [],
    getDcvWebSamplePath: () => "",
    discoverMobileSamples: () => ({ "high-level": [], "low-level": [] }),
    getDbrMobilePlatforms: () => [],
    getMobileSamplePath: () => "",
    getMainCodeFile: () => null,
    readCodeFile: () => "",
    getMimeTypeForExtension: () => "text/plain",
    getDbrServerPlatforms: () => [],
    discoverDbrServerSamples: () => [],
    getDbrServerSampleContent: async () => ({ text: "", mimeType: "text/plain" }),
    discoverWebSamples: () => ({}),
    getWebSamplePath: () => "",
    discoverDwtSamples: () => ({}),
    getDwtSamplePath: () => "",
    discoverDdvSamples: () => [],
    getDdvSamplePath: () => "",
    findCodeFilesInSample: () => [],
    ...overrides
  };
}

test("buildResourceIndex scrubs Capture Vision branding from public MRZ doc titles and summaries", () => {
  const entries = [];

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry), {
    dcvWebDocs: [
      {
        title: "Scan & Parse MRZ - Capture Vision JavaScript Edition",
        breadcrumb: "Capture Vision web documentation",
        content: "MRZ guide",
        platform: "js"
      }
    ]
  }));

  const mrzDoc = entries.find((entry) => entry.product === "mrz" && entry.type === "doc");
  assert.ok(mrzDoc, "Expected a public MRZ doc entry");
  assert.doesNotMatch(mrzDoc.title, /capture vision/i);
  assert.doesNotMatch(mrzDoc.summary, /capture vision/i);
});
