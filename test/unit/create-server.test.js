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
    assert.ok(toolDef.def.annotations, `${toolName} should have annotations`);
    assert.equal(toolDef.def.annotations.readOnlyHint, true, `${toolName} should be readOnlyHint`);
    assert.equal(toolDef.def.annotations.destructiveHint, false, `${toolName} should not be destructiveHint`);
    assert.equal(toolDef.def.annotations.idempotentHint, true, `${toolName} should be idempotentHint`);
    assert.equal(toolDef.def.annotations.openWorldHint, false, `${toolName} should not be openWorldHint`);
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
