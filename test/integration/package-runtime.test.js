import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  cleanupDir,
  createStdioClient,
  dataRoot,
  npxCommand,
  npmCommand,
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

  const commandCandidates = [
    {
      command: npmCommand(),
      args: ["exec", "--yes", "--package", packed.tgzPath, "--", "simple-dynamsoft-mcp"]
    },
    {
      command: npxCommand(),
      args: ["-y", "--package", packed.tgzPath, "simple-dynamsoft-mcp"]
    }
  ];

  let bundle = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3 && !bundle; attempt += 1) {
    for (const candidate of commandCandidates) {
      try {
        bundle = await createStdioClient({
          command: candidate.command,
          args: candidate.args,
          cwd: workspaceDir,
          env,
          name: `integration-package-lite-${attempt}`
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!bundle) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1200));
    }
  }

  if (!bundle) {
    cleanupDir(workspaceDir);
    cleanupDir(packed.tempDir);
    throw lastError;
  }

  const { client, transport, getStderr } = bundle;

  try {
    await runCoreAssertions(client);
    const stderr = getStderr();
    assert.match(
      stderr,
      /\[data\].*event=startup_mode.*mode=custom/,
      "Expected custom data startup mode when MCP_DATA_DIR is supplied"
    );
  } finally {
    await transport.close();
    cleanupDir(workspaceDir);
    cleanupDir(packed.tempDir);
  }
});
