import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertStructuredDataStartupMode,
  cleanupDir,
  createPackagedRuntimeClient,
  packProjectToTempDir
} from "./helpers.js";

test("[lazy] packaged runtime boots in lazy hydration mode with isolated cache", async () => {
  const packed = packProjectToTempDir();
  const workspaceDir = mkdtempSync(join(tmpdir(), "simple-dynamsoft-mcp-lazy-workspace-"));
  const cacheDir = mkdtempSync(join(tmpdir(), "simple-dynamsoft-mcp-lazy-cache-"));

  const env = {
    ...process.env,
    MCP_DATA_AUTO_DOWNLOAD: "true",
    MCP_DATA_HYDRATION_MODE: "lazy",
    MCP_DATA_CACHE_DIR: cacheDir,
    MCP_DATA_REFRESH_ON_START: "false",
    RAG_PROVIDER: "lexical",
    RAG_FALLBACK: "none"
  };

  delete env.MCP_DATA_DIR;

  let bundle = null;
  try {
    bundle = await createPackagedRuntimeClient({
      tgzPath: packed.tgzPath,
      workspaceDir,
      env,
      name: "integration-package-lazy-hydration",
      retries: 3,
      retryDelayMs: 1200
    });
  } catch (error) {
    cleanupDir(cacheDir);
    cleanupDir(workspaceDir);
    cleanupDir(packed.tempDir);
    throw error;
  }

  const { client, transport, getStderr } = bundle;

  try {
    const tools = await client.listTools();
    assert.ok(tools.tools.length > 0, "Expected server to expose MCP tools");
    assertStructuredDataStartupMode(getStderr(), "downloaded-lazy");

    const search = await client.callTool(
      {
        name: "search",
        arguments: {
          query: "basic-scan",
          product: "dwt",
          edition: "web",
          type: "any",
          limit: 3
        }
      },
      undefined,
      { timeout: 180000 }
    );

    assert.equal(search.isError, undefined, "Lazy search should not return isError");
    const link = search.content.find((item) => item.type === "resource_link");
    assert.ok(link, "Lazy search should return at least one resource_link");

    const hydratedDocsPath = join(cacheDir, "documentation", "web-twain-docs");
    assert.ok(
      existsSync(hydratedDocsPath),
      `Expected lazy hydration to materialize repo at ${hydratedDocsPath}`
    );
  } finally {
    await transport.close();
    cleanupDir(cacheDir);
    cleanupDir(workspaceDir);
    cleanupDir(packed.tempDir);
  }
});
