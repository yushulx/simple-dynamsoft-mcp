#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { ensureDataReady } from "./data/bootstrap.js";
import { maybeSyncSubmodulesOnStart } from "./data/submodule-sync.js";
import { createMcpServerInstance } from "./server/create-server.js";
import { MCP_HTTP_PATH, resolveRuntimeConfig } from "./server/runtime-config.js";
import { startStdioServer } from "./server/transports/stdio.js";
import { startHttpServer } from "./server/transports/http.js";

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));

await maybeSyncSubmodulesOnStart();
const dataStatus = await ensureDataReady();
if (dataStatus.mode === "downloaded") {
  console.error(
    `[data] mode=downloaded path=${dataStatus.dataRoot} source=${dataStatus.downloaded ? "fresh-download" : "cache"}`
  );
} else {
  console.error(`[data] mode=${dataStatus.mode} path=${dataStatus.dataRoot}`);
}

const resourceIndexApi = await import("./server/resource-index.js");
const ragApi = await import("./rag/index.js");

console.error(
  `[profile] name=${ragApi.ragConfig.profile} ` +
  `provider=${ragApi.ragConfig.provider} provider_source=${ragApi.ragConfig.providerSource} ` +
  `fallback=${ragApi.ragConfig.fallback} fallback_source=${ragApi.ragConfig.fallbackSource}`
);

const createServer = () => createMcpServerInstance({
  pkgVersion: pkg.version,
  resourceIndexApi,
  ragApi
});

async function maybePrewarm() {
  if (!ragApi.ragConfig.prewarm) return;
  if (ragApi.ragConfig.prewarmBlock) {
    await ragApi.prewarmRagIndex();
  } else {
    void ragApi.prewarmRagIndex();
  }
}

let runtimeConfig;
try {
  runtimeConfig = resolveRuntimeConfig();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[transport] ${message}`);
  process.exit(1);
}

if (runtimeConfig.transport === "http") {
  await startHttpServer({
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    mcpPath: MCP_HTTP_PATH,
    createServer
  });
} else {
  await startStdioServer({ createServer });
}

await maybePrewarm();
