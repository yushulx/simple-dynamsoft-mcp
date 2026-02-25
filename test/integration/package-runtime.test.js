import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertStructuredDataStartupMode,
  cleanupDir,
  createPackagedRuntimeClient,
  dataRoot,
  packProjectToTempDir,
  runCoreAssertions
} from "./helpers.js";

test("[lite] packaged tgz runs via npx --package with custom MCP_DATA_DIR", async () => {
  const packed = packProjectToTempDir();
  const workspaceDir = mkdtempSync(join(tmpdir(), "simple-dynamsoft-mcp-project-"));

  const env = {
    ...process.env,
    MCP_DATA_DIR: dataRoot,
    MCP_DATA_AUTO_DOWNLOAD: "false",
    MCP_DATA_REFRESH_ON_START: "false",
    RAG_PROVIDER: "lexical",
    RAG_FALLBACK: "none"
  };

  let bundle = null;
  try {
    bundle = await createPackagedRuntimeClient({
      tgzPath: packed.tgzPath,
      workspaceDir,
      env,
      name: "integration-package-lite",
      retries: 3,
      retryDelayMs: 1200
    });
  } catch (error) {
    cleanupDir(workspaceDir);
    cleanupDir(packed.tempDir);
    throw error;
  }

  const { client, transport, getStderr } = bundle;

  try {
    await runCoreAssertions(client);
    assertStructuredDataStartupMode(getStderr(), "custom");
  } finally {
    await transport.close();
    cleanupDir(workspaceDir);
    cleanupDir(packed.tempDir);
  }
});
