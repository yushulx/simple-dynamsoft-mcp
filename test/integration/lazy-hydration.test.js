import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  cleanupDir,
  createStdioClient,
  npxCommand,
  npmCommand,
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

  for (const candidate of commandCandidates) {
    try {
      bundle = await createStdioClient({
        command: candidate.command,
        args: candidate.args,
        cwd: workspaceDir,
        env,
        name: "integration-package-lazy-hydration"
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!bundle) {
    cleanupDir(cacheDir);
    cleanupDir(workspaceDir);
    cleanupDir(packed.tempDir);
    throw lastError;
  }

  const { client, transport, getStderr } = bundle;

  try {
    const tools = await client.listTools();
    assert.ok(tools.tools.length > 0, "Expected server to expose MCP tools");
    const stderr = getStderr();
    assert.match(stderr, /\[data\] mode=downloaded-lazy/, "Expected downloaded-lazy startup mode");
  } finally {
    await transport.close();
    cleanupDir(cacheDir);
    cleanupDir(workspaceDir);
    cleanupDir(packed.tempDir);
  }
});
