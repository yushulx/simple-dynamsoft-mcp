import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  RUN_VECTOR_PROVIDER_TESTS,
  VECTOR_PROVIDER,
  assertRequestLogs,
  cleanupDir,
  assertStructuredDataStartupMode,
  connectStreamableClientWithRetry,
  findLogEvents,
  getFreePort,
  requestTimeoutForProvider,
  resolveServerEnv,
  runCoreAssertions,
  startNativeHttpServer
} from "./helpers.js";

async function runHttpScenario(provider, { fallback = "none", extraEnv = {} } = {}) {
  const port = await getFreePort();
  const requestLogDir = mkdtempSync(join(tmpdir(), "mcp-request-logs-http-"));
  const env = resolveServerEnv({ provider, fallback, extra: { MCP_REQUEST_LOG_DIR: requestLogDir, ...extraEnv } });
  const server = startNativeHttpServer({
    port,
    env
  });

  let client = null;
  let transport = null;
  try {
    const connected = await connectStreamableClientWithRetry({
      urls: [`http://127.0.0.1:${port}/mcp`],
      name: `integration-http-${provider}`
    });
    client = connected.client;
    transport = connected.transport;

    await runCoreAssertions(client, {
      requestTimeoutMs: requestTimeoutForProvider(provider)
    });

    const logs = server.getLogs();
    const output = `${logs.stdout}\n${logs.stderr}`;
    assertStructuredDataStartupMode(output);
    assert.ok(
      findLogEvents(output, "transport", "server_start").some((entry) => entry.mode === "http"),
      "Expected structured transport startup logs from native HTTP server output"
    );
    assert.ok(
      findLogEvents(output, "startup", "stage").some((entry) => entry.stage === "http_listener_ready"),
      "Expected startup stage timing logs from native HTTP server output"
    );
    await assertRequestLogs(() => server.getLogs().stderr, requestLogDir, "http");
  } finally {
    if (transport) {
      await transport.close();
    }
    await server.stop();
    cleanupDir(requestLogDir);
  }
}

if (RUN_VECTOR_PROVIDER_TESTS) {
  test(`[${VECTOR_PROVIDER}] streamableHttp integration works`, async () => {
    await runHttpScenario(VECTOR_PROVIDER);
  });
} else {
  test.skip(`[${VECTOR_PROVIDER}] streamableHttp integration works`, () => {});
}

test("[lexical fallback] streamableHttp integration works when gemini is unavailable", async () => {
  await runHttpScenario("gemini", {
    fallback: "lexical",
    extraEnv: {
      GEMINI_API_KEY: ""
    }
  });
});

test("[lexical] streamableHttp integration works", async () => {
  await runHttpScenario("lexical");
});
