import assert from "node:assert/strict";
import test from "node:test";
import { buildIndexData, buildResourceIndex } from "../../src/server/resource-index/builders.js";
import { CAPABILITY_FACTS } from "../../src/server/public-offerings.js";
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
  mds: { web: "1.4.2" },
  bbs: { mobile: "3.1.1", android: "3.1.1", ios: "3.1.0" }
};

const TEST_LATEST_MAJOR = { dcv: 3, dbr: 10, dwt: 19, ddv: 3, mrz: 3, mds: 1, bbs: 3 };

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
    bbsMobileDocs: [],
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

test("buildResourceIndex publishes richer public product-selection guidance", async () => {
  const entries = [];

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry)));

  const guidance = entries.find((entry) => entry.uri === "doc://product-selection");
  assert.ok(guidance, "Expected pinned product-selection guidance resource");
  assert.match(guidance.summary, /Dynamic Web TWAIN/i);
  assert.match(guidance.summary, /MRZ/i);
  assert.match(guidance.summary, /MDS/i);
  assert.match(guidance.summary, /BBS/i);

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
  assert.match(content.text, /\bBBS\b/);
  assert.ok(content.text.includes(CAPABILITY_FACTS.batchScanning), "Known Capability Facts should render the batch scanning fact");
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
      { type: "doc", product: "mds", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.dcv.web },
      { type: "doc", product: "bbs", edition: "mobile", platform: "mobile", platforms: ["android", "ios"], version: TEST_LATEST_VERSIONS.bbs.mobile }
    ]
  });

  assert.deepEqual(indexData.productSelection.publicOfferings, ["dwt", "ddv", "dbr", "mrz", "mds", "bbs"]);
  assert.ok(!("dcvBackedOfferings" in indexData.productSelection), "Should not expose dcvBackedOfferings");
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

test("buildIndexData lists only android and ios for BBS with each app's own version", () => {
  const { mobile: docsVersion, android, ios } = TEST_LATEST_VERSIONS.bbs;
  const indexData = buildIndexData({
    LATEST_VERSIONS: TEST_LATEST_VERSIONS,
    LATEST_MAJOR: TEST_LATEST_MAJOR,
    // The iOS notes come first: the edition version must not follow whichever entry is seen first.
    resourceIndex: [
      { type: "doc", product: "bbs", edition: "mobile", platform: "ios", version: ios },
      { type: "doc", product: "bbs", edition: "mobile", platform: "android", version: android },
      { type: "doc", product: "bbs", edition: "mobile", platform: "mobile", platforms: ["android", "ios"], version: docsVersion },
      { type: "doc", product: "dbr", edition: "web", platform: "web", version: TEST_LATEST_VERSIONS.dbr.web }
    ]
  });

  const mobile = indexData.products.bbs.editions.mobile;
  assert.deepEqual(Object.keys(indexData.products.bbs.editions), ["mobile"]);
  assert.deepEqual(mobile.platforms, ["android", "ios"]);
  assert.equal(mobile.version, docsVersion);
  assert.deepEqual(mobile.platformVersions, { android, ios });
  assert.notEqual(mobile.platformVersions.ios, mobile.platformVersions.android);
  assert.equal(mobile.docCount, 3);
  assert.equal(mobile.sampleCount, 0);
  assert.equal(indexData.products.bbs.latestMajor, TEST_LATEST_MAJOR.bbs);
  assert.equal("platformVersions" in indexData.products.dbr.editions.web, false, "Only BBS exposes per-platform versions");
  assert.deepEqual(indexData.productSelection.offerings.bbs.editions, ["mobile"]);
  assert.equal(indexData.productSelection.capabilities.batchScanning, CAPABILITY_FACTS.batchScanning);
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

test("buildResourceIndex indexes bbs docs per platform and never adds samples", () => {
  const { mobile: docsVersion, ios } = TEST_LATEST_VERSIONS.bbs;
  const entries = [];

  buildResourceIndex(createBuilderArgs((entry) => entries.push(entry), {
    bbsMobileDocs: [
      {
        title: "Three Scanning Modes",
        breadcrumb: "Three Scanning Modes",
        content: "Field of View, Snap & Scan, and Panorama",
        path: "app/guide/three-scanning-modes.md",
        platform: "mobile",
        platforms: ["android", "ios"],
        url: "https://www.dynamsoft.com/batch-barcode-scanner/docs/app/guide/three-scanning-modes.html"
      },
      {
        title: "Release Notes of iOS App",
        breadcrumb: "Release Notes of iOS App",
        content: "3.1.0",
        path: "app/release-notes/ios.md",
        platform: "ios",
        url: "https://www.dynamsoft.com/batch-barcode-scanner/docs/app/release-notes/ios.html"
      }
    ]
  }));

  const bbsEntries = entries.filter((entry) => entry.product === "bbs");
  assert.equal(bbsEntries.length, 2);
  assert.ok(bbsEntries.every((entry) => entry.type === "doc" && entry.edition === "mobile"));
  assert.ok(bbsEntries.every((entry) => entry.majorVersion === TEST_LATEST_MAJOR.bbs));

  const modes = bbsEntries.find((entry) => entry.title === "Three Scanning Modes");
  const iosNotes = bbsEntries.find((entry) => entry.title === "Release Notes of iOS App");
  // Platform release notes carry their own app version; other pages the docs-set version.
  assert.equal(modes.uri, `doc://bbs/mobile/mobile/${docsVersion}/app/guide/three-scanning-modes`);
  assert.equal(modes.version, docsVersion);
  assert.equal(iosNotes.uri, `doc://bbs/mobile/ios/${ios}/app/release-notes/ios`);
  assert.equal(iosNotes.version, "3.1.0");
  assert.notEqual(iosNotes.version, modes.version);

  assert.deepEqual(modes.platforms, ["android", "ios"]);
  assert.ok(modes.tags.includes("android") && modes.tags.includes("ios"));
  assert.equal(iosNotes.platforms, undefined);
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
