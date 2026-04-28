import assert from "node:assert/strict";
import test from "node:test";
import { buildIndexData, buildResourceIndex } from "../../src/server/resource-index/builders.js";
import {
  discoverMdsWebSamples,
  discoverMrzWebSamples
} from "../../src/server/resource-index/samples.js";

const TEST_LATEST_VERSIONS = {
  dcv: { core: "3.2.5000", web: "3.2.5000", mobile: "3.4.1000", server: "3.4.1000" },
  dbr: { mobile: "10.4.2000", web: "10.4.2000", server: "10.4.2000" },
  dwt: { web: "19.0.0" },
  ddv: { web: "3.0.0" },
  mrz: { web: "3.1.0" },
  mds: { web: "1.4.2" }
};

const TEST_LATEST_MAJOR = { dcv: 3, dbr: 10, dwt: 19, ddv: 3, mrz: 3, mds: 1 };

function buildExpectedSampleUri(product, version, group, name) {
  return `sample://${product}/web/web/${version}/${group}/${name}`;
}

function createBuilderArgs(addResourceToIndex, overrides = {}) {
  return {
    addResourceToIndex,
    buildIndexData: () => ({}),
    buildVersionPolicyText: () => "policy",
    LATEST_VERSIONS: TEST_LATEST_VERSIONS,
    LATEST_MAJOR: TEST_LATEST_MAJOR,
    dcvCoreDocs: [],
    dcvWebDocs: [],
    mrzWebDocs: [],
    mdsWebDocs: [],
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
    discoverMrzWebSamples: () => ({}),
    getMrzWebSamplePath: () => "",
    getMrzWebFrameworkPlatforms: () => [],
    discoverMdsWebSamples: () => ({}),
    getMdsWebSamplePath: () => "",
    getMdsWebFrameworkPlatforms: () => [],
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
    mrzWebDocs: [
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

test("buildResourceIndex does not expose MRZ server docs from DCV resources", () => {
  const entries = [];

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry), {
    dcvServerDocs: [
      {
        title: "MRZ Scanner Server Guide",
        breadcrumb: "Server documentation",
        content: "Server-side MRZ guide",
        path: "programming/python/user-guide/mrz-scanner.md",
        platform: "python"
      }
    ]
  }));

  const mrzServerDoc = entries.find((entry) => entry.product === "mrz" && entry.edition === "server");
  assert.equal(mrzServerDoc, undefined);
});

test("buildResourceIndex excludes removed scenario resources from source content", () => {
  const entries = [];
  const removedScenario = ["v", "i", "n"].join("");

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry), {
    dcvMobileDocs: [
      {
        title: "Mobile SDK guide",
        breadcrumb: "Mobile documentation",
        content: `Guide for ${removedScenario.toUpperCase()} workflows`,
        path: `programming/android/${removedScenario}-guide.md`,
        platform: "android"
      }
    ],
    getDcvMobilePlatforms: () => ["android"],
    discoverDcvMobileSamples: () => [`Scan${removedScenario.toUpperCase()}`],
    discoverWebSamples: () => ({ scenarios: [`read-${removedScenario}`] })
  }));

  assert.equal(entries.some((entry) => JSON.stringify(entry).toLowerCase().includes(removedScenario)), false);
});

test("buildResourceIndex publishes richer public product-selection guidance without DCV wording", async () => {
  const entries = [];

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry)));

  const guidance = entries.find((entry) => entry.uri === "doc://product-selection");
  assert.ok(guidance, "Expected pinned product-selection guidance resource");
  assert.match(guidance.summary, /Dynamic Web TWAIN/i);
  assert.match(guidance.summary, /MRZ/i);
  assert.match(guidance.summary, /MDS/i);
  assert.doesNotMatch(guidance.summary, /DCV/i);
  assert.doesNotMatch(guidance.summary, /Capture Vision/i);

  const content = await guidance.loadContent();
  assert.match(content.text, /Dynamic Web TWAIN \(DWT\)/i);
  assert.match(content.text, /Dynamsoft Document Viewer \(DDV\)/i);
  assert.match(content.text, /Dynamsoft Barcode Reader \(DBR\)/i);
  assert.match(content.text, /MRZ Scanner \(MRZ\)/i);
  assert.match(content.text, /Mobile Document Scanner \(MDS\)/i);
  assert.match(content.text, /browser-based document acquisition/i);
  assert.match(content.text, /standalone viewer/i);
  assert.match(content.text, /multi-page support/i);
  assert.match(content.text, /PDF output/i);
  assert.match(content.text, /foundational subset/i);
  assert.match(content.text, /BarcodeScanner RTU/i);
  assert.match(content.text, /web\/mobile solution\/RTU only/i);
  assert.doesNotMatch(content.text, /\bDCV\b/i);
  assert.doesNotMatch(content.text, /Capture Vision/i);
});

test("buildIndexData public product selection omits deprecated DCV metadata", () => {
  const indexData = buildIndexData({
    LATEST_VERSIONS: TEST_LATEST_VERSIONS,
    LATEST_MAJOR: TEST_LATEST_MAJOR,
    resourceIndex: [
      { type: "doc", product: "dbr", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.dbr.web },
      { type: "doc", product: "dwt", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.dwt.web },
      { type: "doc", product: "ddv", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.ddv.web },
      { type: "doc", product: "mrz", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.dcv.web },
      { type: "doc", product: "mds", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.dcv.web }
    ]
  });

  assert.deepEqual(indexData.productSelection.publicOfferings, ["dwt", "ddv", "dbr", "mrz", "mds"]);
  assert.ok(!("dcvBackedOfferings" in indexData.productSelection), "Should not expose dcvBackedOfferings");
  assert.equal(JSON.stringify(indexData.productSelection).includes("DCV"), false, "Should not expose DCV wording");
  assert.equal(JSON.stringify(indexData.productSelection).includes("Capture Vision"), false, "Should not expose Capture Vision wording");
});

test("buildIndexData uses public MRZ and MDS web versions and hides MRZ mobile from the compact index", () => {
  const indexData = buildIndexData({
    LATEST_VERSIONS: TEST_LATEST_VERSIONS,
    LATEST_MAJOR: TEST_LATEST_MAJOR,
    resourceIndex: [
      { type: "doc", product: "mrz", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.mrz.web },
      { type: "sample", product: "mrz", edition: "mobile", platform: "android", version: TEST_LATEST_VERSIONS.dcv.mobile },
      { type: "doc", product: "mds", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.mds.web }
    ]
  });

  assert.equal(indexData.products.mrz.editions.web.version, TEST_LATEST_VERSIONS.mrz.web);
  assert.equal(indexData.products.mds.editions.web.version, TEST_LATEST_VERSIONS.mds.web);
  assert.equal(indexData.products.mrz.editions.mobile, undefined, "Should not expose MRZ mobile in the compact index");
  assert.equal(indexData.products.mrz.latestMajor, TEST_LATEST_MAJOR.mrz, "Should derive MRZ latestMajor from the public web version");
  assert.equal(indexData.products.mds.latestMajor, TEST_LATEST_MAJOR.mds, "Should derive MDS latestMajor from the public web version");
});

test("buildIndexData folds DBR python entries into server and preserves web frameworks", () => {
  const indexData = buildIndexData({
    LATEST_VERSIONS: TEST_LATEST_VERSIONS,
    LATEST_MAJOR: TEST_LATEST_MAJOR,
    resourceIndex: [
      {
        type: "sample",
        product: "dbr",
        edition: "python",
        platform: "python",
        version: TEST_LATEST_VERSIONS.dbr.server,
        tags: ["sample", "dbr", "server", "python", "read_an_image"]
      },
      {
        type: "sample",
        product: "dbr",
        edition: "web",
        platform: "web",
        version: TEST_LATEST_VERSIONS.dbr.web,
        tags: ["sample", "dbr", "web", "frameworks", "react"]
      },
      {
        type: "sample",
        product: "dbr",
        edition: "web",
        platform: "web",
        version: TEST_LATEST_VERSIONS.dbr.web,
        tags: ["sample", "dbr", "web", "frameworks", "vue"]
      }
    ]
  });

  assert.equal(indexData.products.dbr.editions.python, undefined, "Should not expose a separate python edition");
  assert.ok(indexData.products.dbr.editions.server, "Should keep DBR python samples under server");
  assert.deepEqual(indexData.products.dbr.editions.server.platforms, ["python"]);
  assert.deepEqual(indexData.products.dbr.editions.web.platforms, ["js", "react", "vue", "web"]);
});

test("discoverMrzWebSamples ignores nested asset folders and route index pages", () => {
  const samples = discoverMrzWebSamples();

  assert.deepEqual(samples.root, ["demo", "hello-world"]);
  assert.deepEqual(samples.frameworks, ["angular", "react-hooks", "vue"]);
  assert.deepEqual(samples.scenarios, ["use-file-input"]);
  assert.ok(!Object.values(samples).flat().includes("assets"));
  assert.ok(!Object.values(samples).flat().includes("css"));
  assert.ok(!Object.values(samples).flat().includes("font"));
  assert.ok(!Object.values(samples).flat().includes("index"));
});

test("discoverMdsWebSamples ignores nested asset folders and route index pages", () => {
  const samples = discoverMdsWebSamples();

  assert.deepEqual(samples.root, ["demo", "hello-world"]);
  assert.deepEqual(samples.frameworks, ["angular", "react-hooks", "vue"]);
  assert.deepEqual(samples.scenarios, ["image-file-scanning", "multi-page-scanning", "scanning-to-pdf"]);
  assert.ok(!Object.values(samples).flat().includes("assets"));
  assert.ok(!Object.values(samples).flat().includes("css"));
  assert.ok(!Object.values(samples).flat().includes("font"));
  assert.ok(!Object.values(samples).flat().includes("index"));
});

test("buildResourceIndex indexes mrz web docs and samples from dedicated MRZ roots", () => {
  const entries = [];

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry), {
    mrzWebDocs: [
      {
        title: "MRZ scanner guide",
        breadcrumb: "MRZ web documentation",
        content: "MRZ guide content",
        platform: "web",
        url: "https://www.dynamsoft.com/mrz-scanner/docs/web/guides/mrz-scanner.html"
      }
    ],
    discoverMrzWebSamples: () => ({
      frameworks: ["angular"],
      root: ["hello-world"]
    })
  }));

  const mrzDocs = entries.filter((entry) => entry.product === "mrz" && entry.edition === "web" && entry.type === "doc");
  const mrzSamples = entries.filter((entry) => entry.product === "mrz" && entry.edition === "web" && entry.type === "sample");

  assert.equal(mrzDocs.length, 1);
  assert.equal(mrzSamples.length, 2);
  assert.equal(mrzDocs[0].uri.startsWith("doc://mrz/web/"), true);
  assert.equal(mrzDocs[0].version, TEST_LATEST_VERSIONS.mrz.web);
  assert.deepEqual(mrzSamples.map((entry) => entry.uri).sort(), [
    buildExpectedSampleUri("mrz", TEST_LATEST_VERSIONS.mrz.web, "frameworks", "angular"),
    buildExpectedSampleUri("mrz", TEST_LATEST_VERSIONS.mrz.web, "root", "hello-world")
  ]);
  assert.ok(mrzSamples.every((entry) => entry.version === TEST_LATEST_VERSIONS.mrz.web));
  assert.ok(mrzSamples.every((entry) => entry.majorVersion === TEST_LATEST_MAJOR.mrz));
});

test("buildResourceIndex indexes mds web docs and samples from dedicated MDS roots", () => {
  const entries = [];

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry), {
    mdsWebDocs: [
      {
        title: "Document scanner guide",
        breadcrumb: "MDS web documentation",
        content: "MDS guide content",
        platform: "web",
        url: "https://www.dynamsoft.com/mobile-document-scanner/docs/web/guide/index.html"
      }
    ],
    discoverMdsWebSamples: () => ({
      frameworks: ["react-hooks"],
      scenarios: ["scanning-to-pdf"]
    })
  }));

  const mdsDocs = entries.filter((entry) => entry.product === "mds" && entry.edition === "web" && entry.type === "doc");
  const mdsSamples = entries.filter((entry) => entry.product === "mds" && entry.edition === "web" && entry.type === "sample");

  assert.equal(mdsDocs.length, 1);
  assert.equal(mdsSamples.length, 2);
  assert.equal(mdsDocs[0].uri.startsWith("doc://mds/web/"), true);
  assert.equal(mdsDocs[0].version, TEST_LATEST_VERSIONS.mds.web);
  assert.deepEqual(mdsSamples.map((entry) => entry.uri).sort(), [
    buildExpectedSampleUri("mds", TEST_LATEST_VERSIONS.mds.web, "frameworks", "react-hooks"),
    buildExpectedSampleUri("mds", TEST_LATEST_VERSIONS.mds.web, "scenarios", "scanning-to-pdf")
  ]);
  assert.ok(mdsSamples.every((entry) => entry.version === TEST_LATEST_VERSIONS.mds.web));
  assert.ok(mdsSamples.every((entry) => entry.majorVersion === TEST_LATEST_MAJOR.mds));
});

test("buildResourceIndex does not reclassify dcv web docs into public mrz or mds web entries", () => {
  const entries = [];

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry), {
    dcvWebDocs: [
      {
        title: "Scan & Parse MRZ - Capture Vision JavaScript Edition",
        breadcrumb: "Capture Vision web documentation",
        content: "MRZ guide",
        platform: "web"
      },
      {
        title: "Document scanner workflow - Capture Vision JavaScript Edition",
        breadcrumb: "Capture Vision web documentation",
        content: "Document guide",
        platform: "web"
      }
    ]
  }));

  const publicWebDocs = entries.filter((entry) =>
    entry.type === "doc"
    && entry.edition === "web"
    && (entry.product === "mrz" || entry.product === "mds")
  );

  assert.deepEqual(publicWebDocs, []);
});
