import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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
    "read_document",
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
      requiredPhrases: ["products", "editions", "versions", "DBR", "MRZ", "MDS", "BBS", "get_index", "search"]
    },
    search: {
      minLines: 10,
      requiredPhrases: ["query", "keyword", "sample", "doc", "resource_link", "bbs", "get_index", "list_samples", "read_document", "get_sample_files"]
    },
    read_document: {
      minLines: 10,
      requiredPhrases: ["doc://", "uri", "search", "url", "sample://", "get_sample_files"]
    },
    list_samples: {
      minLines: 10,
      requiredPhrases: ["sample", "product", "edition", "platform", "bbs", "search", "get_sample_files"]
    },
    resolve_version: {
      minLines: 10,
      requiredPhrases: ["version", "product", "mrz", "mds", "dbr", "dwt", "ddv", "bbs"]
    },
    get_quickstart: {
      minLines: 10,
      requiredPhrases: ["quickstart", "product", "edition", "platform", "scenario", "bbs", "search"]
    },
    get_sample_files: {
      minLines: 10,
      requiredPhrases: ["sample_id", "resource_uri", "list_samples", "search", "inline", "bbs"]
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

test("server and tool descriptions advertise only public offerings", { concurrency: false }, (t) => {
  const registered = withRegisteredToolsSpy(t);

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

  const serverDescription = server.server._serverInfo.description;
  assert.match(serverDescription, /MRZ/i);
  assert.match(serverDescription, /MDS/i);
  assert.match(serverDescription, /BBS/i);
  assert.doesNotMatch(serverDescription, /Capture Vision/i);
  assert.doesNotMatch(serverDescription, /DCV/i);

  const getIndexDescription = registered.get("get_index").def.description;
  assert.match(getIndexDescription, /MRZ/i);
  assert.match(getIndexDescription, /MDS/i);
  assert.doesNotMatch(getIndexDescription, /DBR-vs-DCV/i);

  const resolveVersionDescription = registered.get("resolve_version").def.description;
  assert.match(resolveVersionDescription, /mrz/i);
  assert.match(resolveVersionDescription, /mds/i);
  assert.doesNotMatch(resolveVersionDescription, /dcv/i);

  const getSampleFilesDescription = registered.get("get_sample_files").def.description;
  assert.match(getSampleFilesDescription, /MRZ/i);
  assert.match(getSampleFilesDescription, /MDS/i);
  assert.doesNotMatch(getSampleFilesDescription, /dcv/i);
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

const DOC_URI = "doc://dwt/web/web/19.x/getting-started";
const DOC_TEXT = [
  "# Getting Started with DWT",
  "",
  "**URL:** https://www.dynamsoft.com/web-twain/docs/getting-started.html",
  "",
  "---",
  "",
  "Call Dynamsoft.DWT.Load() to create the WebTwain instance."
].join("\n");

async function connectReadDocumentClient(t, overrides = {}) {
  const calls = { policy: [], reads: [] };
  const server = createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      getPinnedResources: () => [],
      parseResourceUri: (uri) => {
        const match = /^(doc|sample):\/\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\//.exec(uri);
        if (!match) return null;
        return { scheme: match[1], product: match[2], edition: match[3], platform: match[4], version: match[5] };
      },
      ensureLatestMajor: (params) => {
        calls.policy.push(params);
        return { ok: true };
      },
      readResourceContent: async (uri) => {
        calls.reads.push(uri);
        if (uri === DOC_URI) return { uri, mimeType: "text/markdown", text: DOC_TEXT };
        return null;
      },
      ...overrides
    },
    ragApi: {}
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "read-document-test", version: "0.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  return { client, calls };
}

function resultText(result) {
  return result.content.map((item) => item.text || "").join("\n");
}

test("read_document is discoverable with a required uri string and read-only annotations", async (t) => {
  const { client } = await connectReadDocumentClient(t);
  const { tools } = await client.listTools();
  const tool = tools.find((entry) => entry.name === "read_document");
  assert.ok(tool, "read_document should be listed");
  assert.equal(tool.inputSchema.type, "object");
  assert.equal(tool.inputSchema.properties.uri.type, "string");
  assert.deepEqual(tool.inputSchema.required, ["uri"]);
  assert.deepEqual(tool.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  });
});

test("read_document returns the document body with title and public URL as text content", async (t) => {
  const { client, calls } = await connectReadDocumentClient(t);
  const result = await client.callTool({ name: "read_document", arguments: { uri: DOC_URI } });

  assert.notEqual(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: DOC_TEXT }]);
  assert.deepEqual(calls.policy, [{ product: "dwt", edition: "web", platform: "web", version: "19.x" }]);
});

test("read_document returns isError with search guidance for stale or missing URIs", async (t) => {
  const { client } = await connectReadDocumentClient(t);
  const result = await client.callTool({
    name: "read_document",
    arguments: { uri: "doc://dwt/web/web/19.x/removed-page" }
  });

  assert.equal(result.isError, true);
  assert.match(resultText(result), /Resource not found: doc:\/\/dwt\/web\/web\/19\.x\/removed-page/);
  assert.match(resultText(result), /Call search/);
});

test("read_document enforces the version policy before reading", async (t) => {
  const { client, calls } = await connectReadDocumentClient(t, {
    ensureLatestMajor: () => ({ ok: false, message: "Version 8.x is not supported" })
  });
  const result = await client.callTool({
    name: "read_document",
    arguments: { uri: "doc://dbr/server/python/8.x/api-reference" }
  });

  assert.equal(result.isError, true);
  assert.match(resultText(result), /Version 8\.x is not supported/);
  assert.deepEqual(calls.reads, [], "rejected versions must not be read");
});

test("read_document rejects non-doc URI schemes without reading", async (t) => {
  const { client, calls } = await connectReadDocumentClient(t);

  const sample = await client.callTool({
    name: "read_document",
    arguments: { uri: "sample://dwt/web/web/19.x/basic-scan" }
  });
  assert.equal(sample.isError, true);
  assert.match(resultText(sample), /get_sample_files/);

  const external = await client.callTool({
    name: "read_document",
    arguments: { uri: "https://www.dynamsoft.com/web-twain/docs/" }
  });
  assert.equal(external.isError, true);
  assert.match(resultText(external), /accepts only doc:\/\/ URIs/);

  assert.deepEqual(calls.reads, []);
});

test("read_document rejects a blank uri", async (t) => {
  const { client } = await connectReadDocumentClient(t);
  const result = await client.callTool({ name: "read_document", arguments: { uri: "   " } });
  assert.equal(result.isError, true);
  assert.match(resultText(result), /uri is required/);
});

test("read_document returns isError when the reader fails or yields empty text", async (t) => {
  const failing = await connectReadDocumentClient(t, {
    readResourceContent: async () => {
      throw new Error("disk read failed");
    }
  });
  const failed = await failing.client.callTool({ name: "read_document", arguments: { uri: DOC_URI } });
  assert.equal(failed.isError, true);
  assert.match(resultText(failed), /Failed to read document: disk read failed/);

  const empty = await connectReadDocumentClient(t, {
    readResourceContent: async (uri) => ({ uri, mimeType: "text/markdown", text: "  \n" })
  });
  const emptyResult = await empty.client.callTool({ name: "read_document", arguments: { uri: DOC_URI } });
  assert.equal(emptyResult.isError, true);
  assert.match(resultText(emptyResult), /no readable text content/);
});
