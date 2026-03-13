import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServerInstance } from "../../src/server/create-server.js";

function withRegisteredToolsSpy(t) {
  const registered = new Map();
  const originalRegisterTool = McpServer.prototype.registerTool;
  McpServer.prototype.registerTool = function registerToolSpy(name, def, handler) {
    registered.set(name, { def, handler });
    return originalRegisterTool.call(this, name, def, handler);
  };
  t.after(() => {
    McpServer.prototype.registerTool = originalRegisterTool;
  });
  return registered;
}

test("createMcpServerInstance registers expected tool surface", { concurrency: false }, (t) => {
  const registered = withRegisteredToolsSpy(t);

  createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      getPinnedResources: () => [],
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null
    },
    ragApi: {}
  });

  const expectedTools = [
    "get_index",
    "search",
    "list_samples",
    "resolve_version",
    "get_quickstart",
    "get_sample_files"
  ];

  const registeredToolNames = [...registered.keys()];

  assert.deepEqual(
    [...registeredToolNames].sort(),
    [...expectedTools].sort(),
    "create-server should register the expected tool set"
  );

  for (const toolName of expectedTools) {
    const toolDef = registered.get(toolName);
    assert.ok(toolDef, `create-server should expose definition for ${toolName}`);
    assert.equal(typeof toolDef.handler, "function", `${toolName} should have a wired handler`);
    assert.ok(toolDef.def.annotations, `${toolName} should have annotations`);
    assert.equal(toolDef.def.annotations.readOnlyHint, true, `${toolName} should be readOnlyHint`);
    assert.equal(toolDef.def.annotations.destructiveHint, false, `${toolName} should not be destructiveHint`);
    assert.equal(toolDef.def.annotations.idempotentHint, true, `${toolName} should be idempotentHint`);
    assert.equal(toolDef.def.annotations.openWorldHint, false, `${toolName} should not be openWorldHint`);
  }
});

test("tool descriptions are comprehensive (10+ lines, key phrases)", { concurrency: false }, (t) => {
  const registered = withRegisteredToolsSpy(t);

  createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      getPinnedResources: () => [],
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null
    },
    ragApi: {}
  });

  const expectations = {
    get_index: {
      minLines: 10,
      requiredPhrases: ["products", "editions", "versions", "DBR", "DCV", "get_index", "search"]
    },
    search: {
      minLines: 10,
      requiredPhrases: ["query", "keyword", "sample", "doc", "resource_link", "get_index", "list_samples"]
    },
    list_samples: {
      minLines: 10,
      requiredPhrases: ["sample", "product", "edition", "platform", "search", "get_sample_files", "mds"]
    },
    resolve_version: {
      minLines: 10,
      requiredPhrases: ["version", "product", "dcv", "dbr", "dwt", "ddv", "mds"]
    },
    get_quickstart: {
      minLines: 10,
      requiredPhrases: ["quickstart", "product", "edition", "platform", "scenario", "search", "mds"]
    },
    get_sample_files: {
      minLines: 10,
      requiredPhrases: ["sample_id", "resource_uri", "list_samples", "search", "inline", "mds"]
    }
  };
  const requiredSections = ["WHEN TO USE:", "PARAMETERS:", "RETURNS:", "RELATED TOOLS:"];

  for (const [toolName, expected] of Object.entries(expectations)) {
    const toolDef = registered.get(toolName);
    assert.ok(toolDef, `${toolName} must be registered`);

    const desc = toolDef.def.description;
    assert.ok(typeof desc === "string" && desc.length > 0, `${toolName} must have a description`);

    const lines = desc.split("\n");
    assert.ok(
      lines.length >= expected.minLines,
      `${toolName} description should have >= ${expected.minLines} lines, got ${lines.length}`
    );

    for (const phrase of expected.requiredPhrases) {
      assert.ok(
        desc.toLowerCase().includes(phrase.toLowerCase()),
        `${toolName} description should mention "${phrase}"`
      );
    }

    for (const section of requiredSections) {
      assert.ok(desc.includes(section), `${toolName} description should include section "${section}"`);
    }
  }
});

function withRegisteredResourcesSpy(t, run) {
  const registered = [];
  const originalRegisterResource = McpServer.prototype.registerResource;
  McpServer.prototype.registerResource = function registerResourceSpy(name, uri, config, handler) {
    registered.push({ name, uri, config, handler });
    return originalRegisterResource.call(this, name, uri, config, handler);
  };
  t.after(() => {
    McpServer.prototype.registerResource = originalRegisterResource;
  });
  return run(registered);
}

test("createMcpServerInstance registers pinned resources via registerResource", { concurrency: false }, (t) => {
  const pinned = [
    { uri: "doc://index", title: "Index", summary: "Catalog", mimeType: "application/json" },
    { uri: "doc://version-policy", title: "Version Policy", summary: "Policy", mimeType: "text/markdown" },
    { uri: "doc://product-selection", title: "Product Selection", summary: "Guidance", mimeType: "text/markdown" }
  ];

  withRegisteredResourcesSpy(t, (registeredResources) => {
    createMcpServerInstance({
      pkgVersion: "0.0.0-test",
      resourceIndexApi: {
        getPinnedResources: () => pinned,
        parseResourceUri: () => null,
        ensureLatestMajor: () => ({ ok: true }),
        readResourceContent: async () => null
      },
      ragApi: {}
    });

    const pinnedRegistrations = registeredResources.filter((entry) => typeof entry.uri === "string");
    assert.equal(pinnedRegistrations.length, pinned.length);

    for (const p of pinned) {
      const registration = pinnedRegistrations.find((entry) => entry.uri === p.uri);
      assert.ok(registration, `pinned resource ${p.uri} should be registered`);
      assert.equal(registration.name, p.title);
      assert.equal(registration.config.description, p.summary);
      assert.equal(registration.config.mimeType, p.mimeType);
      assert.equal(typeof registration.handler, "function");
    }
  });
});

test("createMcpServerInstance registers doc and sample resource templates", { concurrency: false }, (t) => {
  withRegisteredResourcesSpy(t, (registeredResources) => {
    createMcpServerInstance({
      pkgVersion: "0.0.0-test",
      resourceIndexApi: {
        getPinnedResources: () => [],
        parseResourceUri: () => null,
        ensureLatestMajor: () => ({ ok: true }),
        readResourceContent: async () => null
      },
      ragApi: {}
    });

    const docTemplate = registeredResources.find((entry) => entry.name === "doc-resource");
    const sampleTemplate = registeredResources.find((entry) => entry.name === "sample-resource");

    assert.ok(docTemplate, "should register doc-resource template");
    assert.ok(sampleTemplate, "should register sample-resource template");
    assert.equal(String(docTemplate.uri.uriTemplate), "doc://{product}/{edition}/{platform}/{version}/{+slug}");
    assert.equal(String(sampleTemplate.uri.uriTemplate), "sample://{product}/{edition}/{platform}/{version}/{+rest}");
    assert.equal(docTemplate.uri.listCallback, undefined);
    assert.equal(sampleTemplate.uri.listCallback, undefined);
    assert.equal(typeof docTemplate.handler, "function");
    assert.equal(typeof sampleTemplate.handler, "function");
  });
});

test("createMcpServerInstance does not advertise subscribe capability", () => {
  const server = createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      getPinnedResources: () => [],
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null
    },
    ragApi: {}
  });

  const capabilities = server.server.getCapabilities();
  assert.equal(
    capabilities.resources?.subscribe,
    undefined,
    "resources.subscribe should not be advertised"
  );
});

test("createMcpServerInstance description mentions MDS as a first-class product", () => {
  const server = createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      getPinnedResources: () => [],
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null
    },
    ragApi: {}
  });

  assert.match(server.server._serverInfo.description, /Mobile Document Scanner/);
  assert.match(server.server._serverInfo.description, /first-class|Capture Vision, Barcode Reader, Dynamic Web TWAIN, Mobile Document Scanner, and Document Viewer/i);
});

test("resource read dispatches through template handler and returns content", { concurrency: false }, async (t) => {
  const readResource = {
    uri: "doc://dwt/web/web/18.x/getting-started",
    mimeType: "text/markdown",
    text: "# Getting Started with DWT"
  };

  let policyCalledWith = null;

  await withRegisteredResourcesSpy(t, async (registeredResources) => {
    createMcpServerInstance({
      pkgVersion: "0.0.0-test",
      resourceIndexApi: {
        getPinnedResources: () => [],
        parseResourceUri: (uri) => {
          if (uri === "doc://dwt/web/web/18.x/getting-started") {
            return { product: "dwt", edition: "web", platform: "web", version: "18.x" };
          }
          return null;
        },
        ensureLatestMajor: (params) => {
          policyCalledWith = params;
          return { ok: true };
        },
        readResourceContent: async (uri) => {
          if (uri === "doc://dwt/web/web/18.x/getting-started") return readResource;
          return null;
        }
      },
      ragApi: {}
    });

    const docTemplate = registeredResources.find((entry) => entry.name === "doc-resource");
    assert.ok(docTemplate, "doc-resource should be registered");

    const result = await docTemplate.handler(new URL("doc://dwt/web/web/18.x/getting-started"));

    assert.deepEqual(result, { contents: [readResource] });
    assert.deepEqual(policyCalledWith, {
      product: "dwt",
      edition: "web",
      platform: "web",
      version: "18.x"
    });
  });
});

test("resource read throws for version policy rejection", { concurrency: false }, async (t) => {
  await withRegisteredResourcesSpy(t, async (registeredResources) => {
    createMcpServerInstance({
      pkgVersion: "0.0.0-test",
      resourceIndexApi: {
        getPinnedResources: () => [],
        parseResourceUri: () => ({ product: "dbr", edition: "server", platform: "python", version: "8.x" }),
        ensureLatestMajor: () => ({ ok: false, message: "Version 8.x is not supported" }),
        readResourceContent: async () => null
      },
      ragApi: {}
    });

    const docTemplate = registeredResources.find((entry) => entry.name === "doc-resource");
    assert.ok(docTemplate, "doc-resource should be registered");

    await assert.rejects(
      () => docTemplate.handler(new URL("doc://dbr/server/python/8.x/api-reference")),
      { message: "Version 8.x is not supported" }
    );
  });
});

test("resource read for pinned resource bypasses version policy", { concurrency: false }, async (t) => {
  const pinnedContent = {
    uri: "doc://product-selection",
    mimeType: "text/markdown",
    text: "# Product Selection"
  };

  let policyCalled = false;

  await withRegisteredResourcesSpy(t, async (registeredResources) => {
    createMcpServerInstance({
      pkgVersion: "0.0.0-test",
      resourceIndexApi: {
        getPinnedResources: () => [{
          uri: "doc://product-selection",
          title: "Product Selection",
          summary: "Guidance",
          mimeType: "text/markdown"
        }],
        parseResourceUri: () => {
          policyCalled = true;
          return null;
        },
        ensureLatestMajor: () => ({ ok: true }),
        readResourceContent: async (uri) => {
          if (uri === "doc://product-selection") return pinnedContent;
          return null;
        }
      },
      ragApi: {}
    });

    const pinnedRegistration = registeredResources.find((entry) => entry.uri === "doc://product-selection");
    assert.ok(pinnedRegistration, "pinned product-selection resource should be registered");

    const result = await pinnedRegistration.handler(new URL("doc://product-selection"));

    assert.deepEqual(result, { contents: [pinnedContent] });
    assert.equal(policyCalled, false, "version policy should not be invoked for pinned resources");
  });
});

test("get_quickstart supports MDS via create-server wiring", { concurrency: false }, async (t) => {
  const registered = withRegisteredToolsSpy(t);
  const tempDir = mkdtempSync(join(tmpdir(), "mds-quickstart-"));
  const samplePath = join(tempDir, "hello-world.html");
  writeFileSync(samplePath, "<html>MDS sample</html>");
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      registry: {
        trial_license: "DLS2eyJoYW...",
        sdks: {
          mds: {
            version: "1.4.2",
            platforms: {
              web: {
                installation: {
                  npm: "npm install mobile-document-scanner"
                },
                docs: {
                  "user-guide": "https://www.dynamsoft.com/mobile-document-scanner/docs/web/guide/index.html"
                }
              }
            }
          }
        }
      },
      getPinnedResources: () => [],
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null,
      refreshResourceIndex: () => {},
      normalizePlatform: (value) => value || "",
      normalizeApiLevel: (value) => value || "high-level",
      normalizeSampleName: (value) => value || "",
      normalizeProduct: (value) => value || "",
      normalizeEdition: (edition) => edition || "web",
      resourceIndex: [],
      getSampleIdFromUri: () => "",
      getSampleEntries: () => [],
      buildIndexData: () => ({}),
      getDisplayEdition: (value) => value,
      getDisplayPlatform: (value) => value,
      formatScopeLabel: () => "mds/web/web",
      LATEST_MAJOR: { mds: 1 },
      LATEST_VERSIONS: { mds: { web: "1.4.2" } },
      discoverDwtSamples: () => ({}),
      discoverDcvMobileSamples: () => [],
      discoverDcvWebSamples: () => [],
      discoverMdsSamples: () => ["hello-world"],
      getMdsSamplePlatform: () => "web",
      findCodeFilesInSample: () => [],
      getMobileSamplePath: () => "",
      getDbrServerSamplePath: () => "",
      getDcvMobileSamplePath: () => "",
      getDcvServerSamplePath: () => "",
      getDcvWebSamplePath: () => "",
      getDwtSamplePath: () => "",
      getMdsSamplePath: () => samplePath,
      getDdvSamplePath: () => "",
      readCodeFile: (filePath) => filePath === samplePath ? "<html>MDS sample</html>" : "",
      getMainCodeFile: () => null,
      getWebSamplePath: () => "",
      parseSampleUri: () => null
    },
    ragApi: {
      searchResources: async () => [],
      getSampleSuggestions: async () => [],
      refreshRagIndexes: () => {}
    }
  });

  const toolDef = registered.get("get_quickstart");
  assert.ok(toolDef, "get_quickstart must be registered");

  const result = await toolDef.handler({ product: "mds" });
  const text = result.content[0].text;

  assert.match(text, /Quick Start: Dynamsoft Mobile Document Scanner/);
  assert.match(text, /SDK Version:\*\* 1\.4\.2/);
  assert.match(text, /hello-world/);
});

test("get_quickstart rejects unsupported MDS scopes", { concurrency: false }, async (t) => {
  const registered = withRegisteredToolsSpy(t);

  createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      registry: {
        trial_license: "DLS2eyJoYW...",
        sdks: {
          mds: {
            version: "1.4.2",
            platforms: { web: { installation: {}, docs: { "user-guide": "https://example.com/mds" } } }
          }
        }
      },
      getPinnedResources: () => [],
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null,
      refreshResourceIndex: () => {},
      normalizePlatform: (value) => value || "",
      normalizeApiLevel: (value) => value || "high-level",
      normalizeSampleName: (value) => value || "",
      normalizeProduct: (value) => value || "",
      normalizeEdition: (edition) => edition || "",
      resourceIndex: [],
      getSampleIdFromUri: () => "",
      getSampleEntries: () => [],
      buildIndexData: () => ({}),
      getDisplayEdition: (value) => value,
      getDisplayPlatform: (value) => value,
      formatScopeLabel: () => "mds/web/web",
      LATEST_MAJOR: { mds: 1 },
      LATEST_VERSIONS: { mds: { web: "1.4.2" } },
      discoverDwtSamples: () => ({}),
      discoverDcvMobileSamples: () => [],
      discoverDcvWebSamples: () => [],
      discoverMdsSamples: () => ["hello-world"],
      getMdsSamplePlatform: () => "web",
      findCodeFilesInSample: () => [],
      getMobileSamplePath: () => "",
      getDbrServerSamplePath: () => "",
      getDcvMobileSamplePath: () => "",
      getDcvServerSamplePath: () => "",
      getDcvWebSamplePath: () => "",
      getDwtSamplePath: () => "",
      getMdsSamplePath: () => "",
      getDdvSamplePath: () => "",
      readCodeFile: () => "",
      getMainCodeFile: () => null,
      getWebSamplePath: () => "",
      parseSampleUri: () => null
    },
    ragApi: {
      searchResources: async () => [],
      getSampleSuggestions: async () => [],
      refreshRagIndexes: () => {}
    }
  });

  const toolDef = registered.get("get_quickstart");
  assert.ok(toolDef, "get_quickstart must be registered");

  const result = await toolDef.handler({ product: "mds", edition: "mobile" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /MDS/i);
  assert.match(result.content[0].text, /web/i);
});

test("get_quickstart keeps mobile-preferred entry file selection for DCV mobile", { concurrency: false }, async (t) => {
  const registered = withRegisteredToolsSpy(t);
  const tempDir = mkdtempSync(join(tmpdir(), "dcv-mobile-quickstart-"));
  const samplePath = join(tempDir, "ScanDocument");
  const mainFilePath = join(samplePath, "MainActivity.kt");
  const htmlFilePath = join(samplePath, "index.html");
  mkdirSync(samplePath, { recursive: true });
  writeFileSync(mainFilePath, "fun main() = println(\"android\")");
  writeFileSync(htmlFilePath, "<html>web fallback</html>");
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      registry: {
        trial_license: "DLS2eyJoYW...",
        sdks: {
          "dcv-mobile": {
            version: "3.0.0",
            default_platform: "android",
            platforms: {
              android: {
                installation: { gradle: "implementation 'com.example:dcv-mobile:3.0.0'" },
                docs: { "user-guide": "https://example.com/dcv-mobile" }
              }
            }
          }
        }
      },
      getPinnedResources: () => [],
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null,
      refreshResourceIndex: () => {},
      normalizePlatform: (value) => value || "",
      normalizeApiLevel: (value) => value || "high-level",
      normalizeSampleName: (value) => value || "",
      normalizeProduct: (value) => value || "",
      normalizeEdition: (edition) => edition || "mobile",
      resourceIndex: [],
      getSampleIdFromUri: () => "",
      getSampleEntries: () => [],
      buildIndexData: () => ({}),
      getDisplayEdition: (value) => value,
      getDisplayPlatform: (value) => value,
      formatScopeLabel: () => "dcv/mobile/android",
      LATEST_MAJOR: { dcv: 3 },
      LATEST_VERSIONS: { dcv: { mobile: "3.0.0" } },
      discoverDwtSamples: () => ({}),
      discoverDcvMobileSamples: () => ["ScanDocument"],
      discoverDcvWebSamples: () => [],
      discoverMdsSamples: () => [],
      getMdsSamplePlatform: () => "web",
      findCodeFilesInSample: () => [
        { path: htmlFilePath, filename: "index.html", extension: ".html" },
        { path: mainFilePath, filename: "MainActivity.kt", extension: ".kt" }
      ],
      getMobileSamplePath: () => "",
      getDbrServerSamplePath: () => "",
      getDcvMobileSamplePath: () => samplePath,
      getDcvServerSamplePath: () => "",
      getDcvWebSamplePath: () => "",
      getDwtSamplePath: () => "",
      getMdsSamplePath: () => "",
      getDdvSamplePath: () => "",
      readCodeFile: (filePath) => {
        if (filePath === mainFilePath) return "fun main() = println(\"android\")";
        if (filePath === htmlFilePath) return "<html>web fallback</html>";
        return "";
      },
      getMainCodeFile: (platform, inputSamplePath) => {
        assert.equal(platform, "android");
        assert.equal(inputSamplePath, samplePath);
        return { path: mainFilePath, filename: "MainActivity.kt" };
      },
      getWebSamplePath: () => "",
      parseSampleUri: () => null
    },
    ragApi: {
      searchResources: async () => [],
      getSampleSuggestions: async () => [],
      refreshRagIndexes: () => {}
    }
  });

  const toolDef = registered.get("get_quickstart");
  assert.ok(toolDef, "get_quickstart must be registered");

  const result = await toolDef.handler({ product: "dcv", edition: "mobile", platform: "android" });
  const text = result.content[0].text;
  assert.match(text, /```kt/);
  assert.match(text, /fun main\(\)/);
  assert.doesNotMatch(text, /web fallback/);
});

test("get_sample_files supports MDS via create-server wiring", { concurrency: false }, async (t) => {
  const registered = withRegisteredToolsSpy(t);
  const tempDir = mkdtempSync(join(tmpdir(), "mds-sample-files-"));
  const samplePath = join(tempDir, "hello-world.html");
  writeFileSync(samplePath, "<html>MDS sample</html>");
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      registry: { sdks: {} },
      getPinnedResources: () => [],
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null,
      refreshResourceIndex: () => {},
      normalizePlatform: (value) => value || "",
      normalizeApiLevel: (value) => value || "high-level",
      normalizeSampleName: (value) => value || "",
      normalizeProduct: (value) => value || "",
      normalizeEdition: (edition) => edition || "web",
      resourceIndex: [],
      getSampleIdFromUri: () => "",
      getSampleEntries: () => [],
      buildIndexData: () => ({}),
      getDisplayEdition: (value) => value,
      getDisplayPlatform: (value) => value,
      formatScopeLabel: () => "mds/web/web",
      LATEST_MAJOR: { mds: 1 },
      LATEST_VERSIONS: { mds: { web: "1.4.2" } },
      discoverDwtSamples: () => ({}),
      discoverDcvMobileSamples: () => [],
      discoverDcvWebSamples: () => [],
      discoverMdsSamples: () => ["hello-world"],
      getMdsSamplePlatform: () => "web",
      findCodeFilesInSample: () => [],
      getMobileSamplePath: () => "",
      getWebSamplePath: () => "",
      getDbrServerSamplePath: () => "",
      getDcvMobileSamplePath: () => "",
      getDcvServerSamplePath: () => "",
      getDcvWebSamplePath: () => "",
      getDwtSamplePath: () => "",
      getMdsSamplePath: () => samplePath,
      getDdvSamplePath: () => "",
      readCodeFile: (filePath) => filePath === samplePath ? "<html>MDS sample</html>" : "",
      getMainCodeFile: () => null,
      parseSampleUri: () => null
    },
    ragApi: {
      searchResources: async () => [],
      getSampleSuggestions: async () => [],
      refreshRagIndexes: () => {}
    }
  });

  const toolDef = registered.get("get_sample_files");
  assert.ok(toolDef, "get_sample_files must be registered");

  const result = await toolDef.handler({ product: "mds", edition: "web", sample_id: "hello-world" });
  const text = result.content[0].text;

  assert.match(text, /# Sample Files: hello-world/);
  assert.match(text, /<html>MDS sample<\/html>/);
});

test("get_sample_files supports resource_uri-only flow and validates URI-derived scope", { concurrency: false }, async (t) => {
  const registered = withRegisteredToolsSpy(t);
  const tempDir = mkdtempSync(join(tmpdir(), "uri-sample-files-"));
  const samplePath = join(tempDir, "ScanSingleBarcode.html");
  writeFileSync(samplePath, "<html>DBR sample</html>");
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  let policyScope = null;

  createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      registry: { sdks: {} },
      getPinnedResources: () => [],
      parseResourceUri: (uri) => uri === "sample://dbr/mobile/android/10.0.0/high-level/ScanSingleBarcode"
        ? { scheme: "sample", product: "dbr", edition: "mobile", platform: "android", version: "10.0.0" }
        : null,
      ensureLatestMajor: (params) => {
        policyScope = params;
        return { ok: true };
      },
      readResourceContent: async () => null,
      refreshResourceIndex: () => {},
      normalizePlatform: (value) => value || "",
      normalizeApiLevel: (value) => value || "high-level",
      normalizeSampleName: (value) => value || "",
      normalizeProduct: (value) => value || "",
      normalizeEdition: (edition) => edition || "",
      resourceIndex: [],
      getSampleIdFromUri: () => "ScanSingleBarcode",
      getSampleEntries: () => [],
      buildIndexData: () => ({}),
      getDisplayEdition: (value) => value,
      getDisplayPlatform: (value) => value,
      formatScopeLabel: () => "dbr/mobile/android",
      LATEST_MAJOR: { dbr: 10 },
      LATEST_VERSIONS: { dbr: { mobile: "10.0.0" } },
      discoverDwtSamples: () => ({}),
      discoverDcvMobileSamples: () => [],
      discoverDcvWebSamples: () => [],
      discoverMdsSamples: () => [],
      getMdsSamplePlatform: () => "web",
      findCodeFilesInSample: () => [],
      getMobileSamplePath: (platform, level, sampleName) => {
        assert.equal(platform, "android");
        assert.equal(level, "high-level");
        assert.equal(sampleName, "ScanSingleBarcode");
        return samplePath;
      },
      getWebSamplePath: () => "",
      getDbrServerSamplePath: () => "",
      getDcvMobileSamplePath: () => "",
      getDcvServerSamplePath: () => "",
      getDcvWebSamplePath: () => "",
      getDwtSamplePath: () => "",
      getMdsSamplePath: () => "",
      getDdvSamplePath: () => "",
      readCodeFile: (filePath) => filePath === samplePath ? "<html>DBR sample</html>" : "",
      getMainCodeFile: () => null,
      parseSampleUri: (uri) => uri === "sample://dbr/mobile/android/10.0.0/high-level/ScanSingleBarcode"
        ? { product: "dbr", edition: "mobile", platform: "android", version: "10.0.0", level: "high-level", sampleName: "ScanSingleBarcode" }
        : null
    },
    ragApi: {
      searchResources: async () => [],
      getSampleSuggestions: async () => [],
      refreshRagIndexes: () => {}
    }
  });

  const toolDef = registered.get("get_sample_files");
  assert.ok(toolDef, "get_sample_files must be registered");
  assert.equal(toolDef.def.inputSchema.product.safeParse(undefined).success, true, "product should be optional for resource_uri flow");

  const result = await toolDef.handler({
    product: "dwt",
    edition: "web",
    platform: "web",
    resource_uri: "sample://dbr/mobile/android/10.0.0/high-level/ScanSingleBarcode"
  });
  const text = result.content[0].text;

  assert.match(text, /# Sample Files: ScanSingleBarcode/);
  assert.match(text, /<html>DBR sample<\/html>/);
  assert.deepEqual(policyScope, {
    product: "dbr",
    version: "10.0.0",
    query: "ScanSingleBarcode",
    edition: "mobile",
    platform: "android"
  });
});

test("get_sample_files suggestion fallback uses URI-derived scope", { concurrency: false }, async (t) => {
  const registered = withRegisteredToolsSpy(t);

  let suggestionScope = null;

  createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      registry: { sdks: {} },
      getPinnedResources: () => [],
      parseResourceUri: (uri) => uri === "sample://dbr/mobile/android/10.0.0/high-level/MissingSample"
        ? { scheme: "sample", product: "dbr", edition: "mobile", platform: "android", version: "10.0.0" }
        : null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null,
      refreshResourceIndex: () => {},
      normalizePlatform: (value) => value || "",
      normalizeApiLevel: (value) => value || "high-level",
      normalizeSampleName: (value) => value || "",
      normalizeProduct: (value) => value || "",
      normalizeEdition: (edition) => edition || "",
      resourceIndex: [],
      getSampleIdFromUri: () => "SuggestedSample",
      getSampleEntries: () => [],
      buildIndexData: () => ({}),
      getDisplayEdition: (value) => value,
      getDisplayPlatform: (value) => value,
      formatScopeLabel: () => "dbr/mobile/android",
      LATEST_MAJOR: { dbr: 10 },
      LATEST_VERSIONS: { dbr: { mobile: "10.0.0" } },
      discoverDwtSamples: () => ({}),
      discoverDcvMobileSamples: () => [],
      discoverDcvWebSamples: () => [],
      discoverMdsSamples: () => [],
      getMdsSamplePlatform: () => "web",
      findCodeFilesInSample: () => [],
      getMobileSamplePath: () => "",
      getWebSamplePath: () => "",
      getDbrServerSamplePath: () => "",
      getDcvMobileSamplePath: () => "",
      getDcvServerSamplePath: () => "",
      getDcvWebSamplePath: () => "",
      getDwtSamplePath: () => "",
      getMdsSamplePath: () => "",
      getDdvSamplePath: () => "",
      readCodeFile: () => "",
      getMainCodeFile: () => null,
      parseSampleUri: (uri) => uri === "sample://dbr/mobile/android/10.0.0/high-level/MissingSample"
        ? { product: "dbr", edition: "mobile", platform: "android", version: "10.0.0", level: "high-level", sampleName: "MissingSample" }
        : null
    },
    ragApi: {
      searchResources: async () => [],
      getSampleSuggestions: async (params) => {
        suggestionScope = params;
        return [];
      },
      refreshRagIndexes: () => {}
    }
  });

  const toolDef = registered.get("get_sample_files");
  assert.ok(toolDef, "get_sample_files must be registered");

  const result = await toolDef.handler({
    product: "dwt",
    edition: "web",
    platform: "web",
    resource_uri: "sample://dbr/mobile/android/10.0.0/high-level/MissingSample"
  });

  assert.equal(result.isError, true);
  assert.deepEqual(suggestionScope, {
    query: "MissingSample",
    product: "dbr",
    edition: "mobile",
    platform: "android",
    limit: 5
  });
});
