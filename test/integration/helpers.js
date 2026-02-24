import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const projectRoot = resolve(__dirname, "..", "..");
const serverEntry = join(projectRoot, "src", "index.js");
const dataRoot = join(projectRoot, "data");
const supergatewayEntry = join(projectRoot, "node_modules", "supergateway", "dist", "index.js");

const RUN_FUSE_PROVIDER_TESTS = process.env.RUN_FUSE_PROVIDER_TESTS !== "false";
const RUN_LOCAL_PROVIDER_TESTS = process.env.RUN_LOCAL_PROVIDER_TESTS === "true";

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function nodeCommand() {
  return process.execPath;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function makeClient(name) {
  return new Client({ name, version: "1.0.0" });
}

function sanitizeEnv(rawEnv) {
  const sanitized = {};
  for (const [key, value] of Object.entries(rawEnv || {})) {
    if (value === undefined || value === null) continue;
    sanitized[key] = String(value);
  }
  return sanitized;
}

function resolveServerEnv({ provider, extra = {} }) {
  const base = {
    MCP_DATA_DIR: dataRoot,
    MCP_DATA_AUTO_DOWNLOAD: "false",
    MCP_DATA_REFRESH_ON_START: "false",
    RAG_PROVIDER: provider,
    RAG_FALLBACK: provider === "local" ? "none" : "none",
    RAG_REBUILD: "false",
    RAG_PREWARM: "false",
    RAG_PREWARM_BLOCK: "false",
    RAG_LOCAL_MODEL: process.env.RAG_LOCAL_MODEL || "Xenova/all-MiniLM-L6-v2",
    RAG_LOCAL_QUANTIZED: process.env.RAG_LOCAL_QUANTIZED || "true",
    RAG_CACHE_DIR: process.env.RAG_CACHE_DIR || join(projectRoot, ".cache", "rag-index"),
    RAG_MODEL_CACHE_DIR: process.env.RAG_MODEL_CACHE_DIR || join(projectRoot, ".cache", "rag-models")
  };
  return { ...process.env, ...base, ...extra };
}

async function createStdioClient({
  command = nodeCommand(),
  args = [serverEntry],
  cwd = projectRoot,
  env = {},
  name = "integration-stdio-client"
} = {}) {
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: sanitizeEnv(env),
    stderr: "pipe"
  });

  let stderrOutput = "";
  const stderrStream = transport.stderr;
  if (stderrStream) {
    stderrStream.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });
  }

  const client = makeClient(name);
  try {
    await client.connect(transport);
  } catch (error) {
    const detail = stderrOutput.trim();
    const wrapped = new Error(
      `Failed to connect stdio client (${name}). ${detail ? `stderr: ${detail}` : "No stderr output."}`
    );
    wrapped.cause = error;
    throw wrapped;
  }

  return {
    client,
    transport,
    getStderr: () => stderrOutput
  };
}

async function runCoreAssertions(client, { requestTimeoutMs = 60000 } = {}) {
  const requestOptions = { timeout: requestTimeoutMs };
  const tools = await client.listTools(undefined, requestOptions);
  const toolNames = tools.tools.map((tool) => tool.name);
  const expectedTools = [
    "get_index",
    "search",
    "list_samples",
    "resolve_sample",
    "resolve_version",
    "get_quickstart",
    "generate_project"
  ];
  assert.equal(tools.tools.length, expectedTools.length, "Unexpected tool count");
  for (const tool of expectedTools) {
    assert.ok(toolNames.includes(tool), `Missing tool: ${tool}`);
  }

  const search = await client.callTool(
    {
      name: "search",
      arguments: { query: "basic-scan", product: "dwt", limit: 3 }
    },
    undefined,
    requestOptions
  );
  assert.equal(search.isError, undefined, "Search should not return isError");
  const link = search.content.find((item) => item.type === "resource_link");
  assert.ok(link, "Search should return at least one resource_link");

  const resources = await client.listResources(undefined, requestOptions);
  assert.ok(resources.resources.length > 0, "resources/list should return pinned resources");
  const read = await client.readResource({ uri: link.uri }, requestOptions);
  assert.ok(read.contents.length > 0, "resources/read should return non-empty contents");
}

async function getFreePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();
    server.unref();
    server.on("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectPromise(new Error("Unable to resolve ephemeral port"));
        return;
      }
      const { port } = address;
      server.close(() => resolvePromise(port));
    });
  });
}

function startSupergateway({
  port,
  cwd = projectRoot,
  env = {},
  stdioCommand = "npm start"
}) {
  if (!existsSync(supergatewayEntry)) {
    throw new Error(`supergateway binary not found: ${supergatewayEntry}. Run npm install first.`);
  }
  const command = nodeCommand();
  const args = [
    supergatewayEntry,
    "--stdio",
    stdioCommand,
    "--outputTransport",
    "streamableHttp",
    "--port",
    String(port)
  ];
  const proc = spawn(command, args, {
    cwd,
    env: sanitizeEnv(env),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const stop = async () => {
    if (proc.killed || proc.exitCode !== null) return;
    proc.kill();
    await Promise.race([
      new Promise((resolvePromise) => proc.once("exit", resolvePromise)),
      sleep(4000).then(() => {
        if (proc.exitCode === null) {
          proc.kill("SIGKILL");
        }
      })
    ]);
  };

  return {
    proc,
    stop,
    getLogs: () => ({ stdout, stderr })
  };
}

async function connectStreamableClientWithRetry({
  urls,
  timeoutMs = 30000,
  retryDelayMs = 400,
  name = "integration-http-client"
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    for (const rawUrl of urls) {
      let transport = null;
      try {
        const client = makeClient(name);
        transport = new StreamableHTTPClientTransport(new URL(rawUrl));
        await client.connect(transport);
        return { client, transport, url: rawUrl };
      } catch (error) {
        lastError = error;
        if (transport) {
          try {
            await transport.close();
          } catch {
            // Ignore close errors while retrying.
          }
        }
      }
    }
    await sleep(retryDelayMs);
  }

  throw new Error(`Failed to connect Streamable HTTP client. Last error: ${lastError?.message || "unknown"}`);
}

function packProjectToTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), "simple-dynamsoft-mcp-pack-"));
  const result = spawnSync(`${npmCommand()} pack --pack-destination "${tempDir}"`, {
    cwd: projectRoot,
    encoding: "utf8",
    shell: true
  });
  if (result.status !== 0) {
    const reason = result.stderr || result.stdout || result.error?.message || "unknown error";
    throw new Error(`npm pack failed: ${reason}`);
  }
  const tgz = readdirSync(tempDir).find((entry) => entry.endsWith(".tgz"));
  if (!tgz) {
    throw new Error(`npm pack did not produce a .tgz in ${tempDir}`);
  }
  return {
    tempDir,
    tgzPath: join(tempDir, tgz)
  };
}

function cleanupDir(path) {
  if (path && existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

export {
  RUN_FUSE_PROVIDER_TESTS,
  RUN_LOCAL_PROVIDER_TESTS,
  cleanupDir,
  connectStreamableClientWithRetry,
  createStdioClient,
  dataRoot,
  getFreePort,
  npmCommand,
  npxCommand,
  packProjectToTempDir,
  projectRoot,
  resolveServerEnv,
  runCoreAssertions,
  serverEntry,
  startSupergateway
};
