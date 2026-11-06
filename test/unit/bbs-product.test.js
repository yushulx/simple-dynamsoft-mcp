import assert from "node:assert/strict";
import test from "node:test";
import {
  LATEST_MAJOR,
  LATEST_VERSIONS,
  ensureLatestMajor,
  ensureResourceIndexReady,
  normalizeApiLevel,
  normalizeEdition,
  normalizePlatform,
  normalizeProduct,
  normalizeSampleName,
  parseResourceUri,
  parseSampleUri,
  platformMatches,
  readResourceContent,
  registry,
  resourceIndex
} from "../../src/server/resource-index.js";
import { resolveRepoPathsForScopes } from "../../src/data/repo-map.js";
import { createIndexedResourceReader } from "../../src/server/resources/read-indexed-resource.js";
import { registerProjectTools } from "../../src/server/tools/register-project-tools.js";
import { registerQuickstartTools } from "../../src/server/tools/register-quickstart-tools.js";
import { registerSampleTools } from "../../src/server/tools/register-sample-tools.js";
import { registerVersionTools } from "../../src/server/tools/register-version-tools.js";

const BBS_DOCS_URL = "https://www.dynamsoft.com/batch-barcode-scanner/docs/";
const BBS_SAMPLES_URL = "https://github.com/Dynamsoft/batch-barcode-scanner-samples/";

function registerTools(versions = LATEST_VERSIONS) {
  const handlers = new Map();
  const hydrated = [];
  const server = { registerTool: (name, _definition, handler) => handlers.set(name, handler) };
  const common = {
    server,
    ensureScopeHydrated: async (scope) => { hydrated.push(scope); },
    ensureLatestMajor,
    normalizeProduct,
    normalizePlatform,
    normalizeEdition
  };

  registerSampleTools({
    ...common,
    registry,
    getSampleEntries: () => { throw new Error("BBS has no samples to list"); },
    getSampleIdFromUri: () => "",
    getDisplayEdition: (edition) => edition,
    getDisplayPlatform: (platform) => platform
  });
  registerVersionTools({ ...common, LATEST_MAJOR, LATEST_VERSIONS: versions });
  registerQuickstartTools({ ...common, registry, normalizeApiLevel });
  registerProjectTools({ ...common, normalizeApiLevel, normalizeSampleName, parseResourceUri, parseSampleUri });
  return { handlers, hydrated };
}

test("resolve_version resolves each BBS app's own version, never DDV's", async () => {
  // Android and iOS release independently, so their versions differ here.
  const versions = { ...LATEST_VERSIONS, bbs: { mobile: "3.1.1", android: "3.1.1", ios: "3.1.0" } };
  const { handlers } = registerTools(versions);
  const resolve = (args) => handlers.get("resolve_version")({ product: "bbs", ...args });

  const both = await resolve({});
  const bothText = both.content[0].text;
  assert.equal(both.isError, undefined);
  assert.ok(bothText.includes("3.1.1") && bothText.includes("3.1.0"), bothText);
  assert.ok(!/DDV/.test(bothText), bothText);

  for (const [platform, expected, other] of [["android", "3.1.1", "3.1.0"], ["ios", "3.1.0", "3.1.1"], ["swift", "3.1.0", "3.1.1"]]) {
    const result = await resolve({ platform, edition: "web" });
    const text = result.content[0].text;
    assert.equal(result.isError, undefined, platform);
    assert.ok(text.includes(`Resolved version: ${expected}`), `${platform}: ${text}`);
    assert.ok(!text.includes(other), `${platform}: ${text}`);
  }

  const unsupported = await resolve({ platform: "python" });
  assert.equal(unsupported.isError, true);
  assert.ok(!unsupported.content[0].text.includes("Resolved version"), unsupported.content[0].text);
});

test("BBS requests for an older major are refused with the latest BBS major", async () => {
  const { handlers } = registerTools();

  const version = await handlers.get("resolve_version")({ product: "bbs", constraint: "2" });
  assert.equal(version.isError, true);
  assert.ok(/\bBBS\b/.test(version.content[0].text) && version.content[0].text.includes(`v${LATEST_MAJOR.bbs}`), version.content[0].text);

  const quickstart = await handlers.get("get_quickstart")({ product: "bbs", version: "2" });
  assert.equal(quickstart.isError, true);
  assert.match(quickstart.content[0].text, /\bBBS\b/);
});

test("BBS quickstart, sample listing, and sample files return reference links instead of code", async () => {
  const { handlers, hydrated } = registerTools();
  const calls = [
    ["get_quickstart", { product: "bbs", platform: "android" }],
    ["list_samples", { product: "bbs" }],
    ["get_sample_files", { product: "bbs", sample_id: "share-receiver" }]
  ];

  for (const [tool, args] of calls) {
    const result = await handlers.get(tool)(args);
    assert.equal(result.isError, undefined, tool);
    const text = result.content[0].text;
    assert.ok(text.includes(BBS_DOCS_URL), `${tool}: ${text}`);
    assert.ok(text.includes(BBS_SAMPLES_URL), `${tool}: ${text}`);
    assert.ok(!text.includes("```") && !text.includes("JSON:"), `${tool}: ${text}`);
  }

  // Whatever the tools hydrate for BBS is its docs repo only.
  assert.deepEqual(resolveRepoPathsForScopes(hydrated), ["documentation/batch-barcode-scanner-docs"]);
});

test("BBS pages that apply to both apps match either platform filter; release notes only their own", () => {
  const bothApps = { platform: "mobile", platforms: ["android", "ios"] };
  assert.ok(platformMatches("android", bothApps));
  assert.ok(platformMatches("ios", bothApps));

  const iosNotes = { platform: "ios" };
  assert.ok(platformMatches("ios", iosNotes));
  assert.ok(!platformMatches("android", iosNotes));
});

test("BBS release notes carry their own app's version; other pages the docs-set version", async () => {
  ensureResourceIndexReady();
  const bbsEntries = resourceIndex.filter((entry) => entry.product === "bbs");
  const docsVersion = LATEST_VERSIONS.bbs.mobile;

  assert.ok(bbsEntries.length > 0, "Expected BBS docs to be indexed");
  assert.ok(bbsEntries.every((entry) => entry.type === "doc" && entry.edition === "mobile"));
  assert.ok(bbsEntries.every((entry) => entry.majorVersion === LATEST_MAJOR.bbs));
  assert.ok(bbsEntries.every((entry) => entry.uri.startsWith("doc://bbs/mobile/")));
  assert.ok(bbsEntries.every((entry) => entry.url.startsWith(BBS_DOCS_URL)));

  const notesFor = (platform) => bbsEntries.filter((entry) => entry.uri.endsWith(`/app/release-notes/${platform}`));
  for (const platform of ["android", "ios"]) {
    const [entry, ...rest] = notesFor(platform);
    assert.ok(entry && rest.length === 0, `Expected exactly one ${platform} release-notes page`);
    assert.equal(entry.platform, platform);
    assert.equal(entry.version, LATEST_VERSIONS.bbs[platform]);
    assert.equal(entry.uri, `doc://bbs/mobile/${platform}/${LATEST_VERSIONS.bbs[platform]}/app/release-notes/${platform}`);
  }

  const everythingElse = bbsEntries.filter((entry) => !entry.uri.includes("/app/release-notes/"));
  assert.ok(everythingElse.length > 0);
  assert.ok(everythingElse.every((entry) => entry.platform === "mobile" && entry.platforms.join() === "android,ios"));
  assert.ok(everythingElse.every((entry) => entry.version === docsVersion));

  // Platform-specific URIs stay readable under the latest-major policy.
  const readDocument = createIndexedResourceReader({ parseResourceUri, ensureLatestMajor, readResourceContent });
  for (const platform of ["android", "ios"]) {
    const result = await readDocument(notesFor(platform)[0].uri);
    assert.ok(result.text.includes(BBS_DOCS_URL), platform);
  }
});
