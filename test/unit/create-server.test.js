import assert from "node:assert/strict";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServerInstance } from "../../src/server/create-server.js";

test("createMcpServerInstance registers expected tool surface", { concurrency: false }, (t) => {
  const registered = new Map();
  const originalRegisterTool = McpServer.prototype.registerTool;
  McpServer.prototype.registerTool = function registerToolSpy(name, def, handler) {
    registered.set(name, { def, handler });
    return originalRegisterTool.call(this, name, def, handler);
  };
  t.after(() => {
    McpServer.prototype.registerTool = originalRegisterTool;
  });

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
  }
});

test("createMcpServerInstance registers pinned resources via registerResource", () => {
  const pinned = [
    { uri: "doc://index", title: "Index", summary: "Catalog", mimeType: "application/json" },
    { uri: "doc://version-policy", title: "Version Policy", summary: "Policy", mimeType: "text/markdown" },
    { uri: "doc://product-selection", title: "Product Selection", summary: "Guidance", mimeType: "text/markdown" }
  ];

  const server = createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      getPinnedResources: () => pinned,
      parseResourceUri: () => null,
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => null
    },
    ragApi: {}
  });

  for (const p of pinned) {
    const registered = server._registeredResources[p.uri];
    assert.ok(registered, `pinned resource ${p.uri} should be registered`);
    assert.equal(registered.name, p.title);
    assert.equal(registered.metadata.description, p.summary);
    assert.equal(registered.metadata.mimeType, p.mimeType);
  }
});

test("createMcpServerInstance registers doc and sample resource templates", () => {
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

  const templates = server._registeredResourceTemplates;
  assert.ok(templates["doc-resource"], "should register doc-resource template");
  assert.ok(templates["sample-resource"], "should register sample-resource template");

  const docMatch = templates["doc-resource"].resourceTemplate.uriTemplate.match(
    "doc://dbr/server/python/10.x/some-doc"
  );
  assert.ok(docMatch, "doc template should match doc:// URIs with 5 segments");
  assert.equal(docMatch.product, "dbr");

  const sampleMatch = templates["sample-resource"].resourceTemplate.uriTemplate.match(
    "sample://dbr/server/python/10.x/hello-world"
  );
  assert.ok(sampleMatch, "sample template should match sample:// URIs");
  assert.equal(sampleMatch.product, "dbr");

  assert.equal(templates["doc-resource"].resourceTemplate.listCallback, undefined);
  assert.equal(templates["sample-resource"].resourceTemplate.listCallback, undefined);
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

test("resource read dispatches through version policy and returns content", async () => {
  const readResource = {
    uri: "doc://dwt/web/web/18.x/getting-started",
    mimeType: "text/markdown",
    text: "# Getting Started with DWT"
  };

  let policyCalledWith = null;

  const server = createMcpServerInstance({
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

  const handler = server.server._requestHandlers.get("resources/read");
  assert.ok(handler, "read handler should be installed by SDK");

  const result = await handler({
    method: "resources/read",
    params: { uri: "doc://dwt/web/web/18.x/getting-started" }
  });

  assert.deepEqual(result, { contents: [readResource] });
  assert.deepEqual(policyCalledWith, {
    product: "dwt",
    edition: "web",
    platform: "web",
    version: "18.x"
  });
});

test("resource read throws for version policy rejection", async () => {
  const server = createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      getPinnedResources: () => [],
      parseResourceUri: () => ({ product: "dbr", edition: "server", platform: "python", version: "8.x" }),
      ensureLatestMajor: () => ({ ok: false, message: "Version 8.x is not supported" }),
      readResourceContent: async () => null
    },
    ragApi: {}
  });

  const handler = server.server._requestHandlers.get("resources/read");
  await assert.rejects(
    () => handler({
      method: "resources/read",
      params: { uri: "doc://dbr/server/python/8.x/api-reference" }
    }),
    { message: "Version 8.x is not supported" }
  );
});

test("resource read for pinned resource bypasses version policy", async () => {
  const pinnedContent = {
    uri: "doc://product-selection",
    mimeType: "text/markdown",
    text: "# Product Selection"
  };

  let policyCalled = false;

  const server = createMcpServerInstance({
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

  const handler = server.server._requestHandlers.get("resources/read");
  const result = await handler({
    method: "resources/read",
    params: { uri: "doc://product-selection" }
  });

  assert.deepEqual(result, { contents: [pinnedContent] });
  assert.equal(policyCalled, false, "version policy should not be invoked for pinned resources");
});
