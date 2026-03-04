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
    resourceIndexApi: {},
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

test("tool descriptions are comprehensive (10+ lines, required sections)", { concurrency: false }, (t) => {
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
    resourceIndexApi: {},
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
      requiredPhrases: ["sample", "product", "edition", "platform", "search", "get_sample_files"]
    },
    resolve_version: {
      minLines: 10,
      requiredPhrases: ["version", "product", "dcv", "dbr", "dwt", "ddv"]
    },
    get_quickstart: {
      minLines: 10,
      requiredPhrases: ["quickstart", "product", "edition", "platform", "scenario", "search"]
    },
    get_sample_files: {
      minLines: 10,
      requiredPhrases: ["sample_id", "resource_uri", "list_samples", "search", "inline"]
    }
  };

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
  }
});

test("createMcpServerInstance wires resources/list and resources/read handlers", async () => {
  const pinned = [{
    uri: "doc://product-selection",
    title: "Product Selection",
    summary: "Guidance",
    mimeType: "text/markdown"
  }];
  const readResource = {
    uri: "doc://product-selection",
    mimeType: "text/markdown",
    text: "Use DCV for document workflows"
  };

  const server = createMcpServerInstance({
    pkgVersion: "0.0.0-test",
    resourceIndexApi: {
      getPinnedResources: () => pinned,
      parseResourceUri: () => ({ product: "dwt", version: "18", edition: "web", platform: "web" }),
      ensureLatestMajor: () => ({ ok: true }),
      readResourceContent: async () => readResource
    },
    ragApi: {}
  });

  const handlers = server.server._requestHandlers;
  const listHandler = handlers.get("resources/list");
  const readHandler = handlers.get("resources/read");

  const listResult = await listHandler({ method: "resources/list", params: {} });
  assert.deepEqual(listResult, {
    resources: [{
      uri: pinned[0].uri,
      name: pinned[0].title,
      description: pinned[0].summary,
      mimeType: pinned[0].mimeType
    }]
  });

  const readResult = await readHandler({
    method: "resources/read",
    params: { uri: "doc://product-selection" }
  });
  assert.deepEqual(readResult, { contents: [readResource] });
});
