#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { ensureDataReady } from "./data/bootstrap.js";
import { maybeSyncSubmodulesOnStart } from "./data/submodule-sync.js";
import { createMcpServerInstance } from "./server/create-server.js";
import { MCP_HTTP_PATH, resolveRuntimeConfig } from "./server/runtime-config.js";
import { startStdioServer } from "./server/transports/stdio.js";
import { startHttpServer } from "./server/transports/http.js";
import { logEvent } from "./observability/logging.js";

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));

await maybeSyncSubmodulesOnStart();
const dataStatus = await ensureDataReady();
logEvent("data", "startup_mode", {
  mode: dataStatus.mode,
  path: dataStatus.dataRoot,
  cache_source: dataStatus.mode.includes("downloaded") ? (dataStatus.downloaded ? "fresh-download" : "cache") : "n/a"
});

const resourceIndexApi = await import("./server/resource-index.js");
const ragApi = await import("./rag/index.js");

logEvent("profile", "resolved", {
  profile: ragApi.ragConfig.profile,
  provider: ragApi.ragConfig.provider,
  provider_source: ragApi.ragConfig.providerSource,
  fallback: ragApi.ragConfig.fallback,
  fallback_source: ragApi.ragConfig.fallbackSource,
  shared_state_path: ragApi.ragConfig.sharedStatePath ? "set" : "empty"
});

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
  logEvent("transport", "config_error", { message }, { level: "error" });
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
