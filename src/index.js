#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { ensureDataReady } from "./data/bootstrap.js";
import { maybeSyncSubmodulesOnStart } from "./data/submodule-sync.js";
import { createStartupTimingTracker } from "./observability/startup-timing.js";
import { createMcpServerInstance } from "./server/create-server.js";
import { MCP_HTTP_PATH, resolveRuntimeConfig } from "./server/runtime-config.js";
import { startStdioServer } from "./server/transports/stdio.js";
import { startHttpServer } from "./server/transports/http.js";
import { logEvent } from "./observability/logging.js";

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8"));
const startupTiming = createStartupTimingTracker();

let runtimeConfig;
try {
  runtimeConfig = resolveRuntimeConfig();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logEvent("transport", "config_error", { message }, { level: "error" });
  process.exit(1);
}

startupTiming.mark("runtime_config_resolved", {
  transport: runtimeConfig.transport
});

let resourceIndexApi = null;
let ragApi = null;

const startupState = {
  ready: false,
  stage: "initializing"
};

function startupCacheSource(dataStatus) {
  if (!dataStatus.mode.includes("downloaded")) return "n/a";
  return dataStatus.downloaded ? "fresh-download" : "cache";
}

function createServer() {
  if (!resourceIndexApi || !ragApi) {
    throw new Error("MCP server is still initializing");
  }

  return createMcpServerInstance({
    pkgVersion: pkg.version,
    resourceIndexApi,
    ragApi
  });
}

function logResolvedProfile() {
  logEvent("profile", "resolved", {
    profile: ragApi.ragConfig.profile,
    provider: ragApi.ragConfig.provider,
    provider_source: ragApi.ragConfig.providerSource,
    fallback: ragApi.ragConfig.fallback,
    fallback_source: ragApi.ragConfig.fallbackSource
  });
}

async function maybePrewarm() {
  if (!ragApi?.ragConfig?.prewarm) return;

  startupTiming.mark("prewarm_triggered", {
    provider: ragApi.ragConfig.provider,
    block: ragApi.ragConfig.prewarmBlock ? "true" : "false"
  });

  if (ragApi.ragConfig.prewarmBlock) {
    await ragApi.prewarmRagIndex();
    startupTiming.mark("prewarm_done", {
      provider: ragApi.ragConfig.provider
    });
    return;
  }

  void ragApi.prewarmRagIndex().then(
    () => {
      startupTiming.mark("prewarm_done", {
        provider: ragApi.ragConfig.provider
      });
    },
    () => {
      // prewarmRagIndex already logs failure details.
    }
  );
}

async function initializeRuntime() {
  startupState.stage = "submodule_sync";
  await maybeSyncSubmodulesOnStart();
  startupTiming.mark("submodule_sync_done");

  startupState.stage = "data_resolve";
  const dataStatus = await ensureDataReady();
  logEvent("data", "startup_mode", {
    mode: dataStatus.mode,
    path: dataStatus.dataRoot,
    cache_source: startupCacheSource(dataStatus)
  });
  startupTiming.mark("data_ready", {
    mode: dataStatus.mode,
    cache_source: startupCacheSource(dataStatus)
  });

  startupState.stage = "resource_index_import";
  resourceIndexApi = await import("./server/resource-index.js");
  startupTiming.mark("resource_index_module_loaded");

  startupState.stage = "resource_index_build";
  const indexReady = resourceIndexApi.ensureResourceIndexReady();
  startupTiming.mark("resource_index_ready", {
    resource_count: indexReady.resourceCount
  });

  startupState.stage = "rag_import";
  ragApi = await import("./rag/index.js");
  startupTiming.mark("rag_module_loaded", {
    provider: ragApi.ragConfig.provider,
    fallback: ragApi.ragConfig.fallback
  });

  logResolvedProfile();

  startupState.ready = true;
  startupState.stage = "mcp_ready";
  startupTiming.mark("mcp_ready");

  return dataStatus;
}

function logStartupFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  startupState.stage = "startup_failed";
  startupState.ready = false;
  logEvent("startup", "failed", { message }, { level: "error" });
}

if (runtimeConfig.transport === "http") {
  await startHttpServer({
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    mcpPath: MCP_HTTP_PATH,
    createServer,
    isReady: () => startupState.ready,
    getReadinessState: () => ({ stage: startupState.stage })
  });
  startupTiming.mark("http_listener_ready", {
    host: runtimeConfig.host,
    port: runtimeConfig.port
  });

  try {
    const dataStatus = await initializeRuntime();
    await maybePrewarm();
    startupTiming.complete({
      transport: "http",
      data_mode: dataStatus.mode
    });
  } catch (error) {
    logStartupFailure(error);
    process.exit(1);
  }
} else {
  try {
    const dataStatus = await initializeRuntime();
    await startStdioServer({ createServer });
    startupTiming.mark("stdio_listener_ready");
    await maybePrewarm();
    startupTiming.complete({
      transport: "stdio",
      data_mode: dataStatus.mode
    });
  } catch (error) {
    logStartupFailure(error);
    process.exit(1);
  }
}
