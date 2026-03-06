import assert from "node:assert/strict";
import test from "node:test";
import {
  RUN_GEMINI_PROVIDER_TESTS,
  assertStructuredDataStartupMode,
  connectStreamableClientWithRetry,
  getFreePort,
  requestTimeoutForProvider,
  resolveServerEnv,
  runCoreAssertions,
  startNativeHttpServer
} from "./helpers.js";

async function runHttpScenario(provider, { fallback = "none", extraEnv = {} } = {}) {
  const port = await getFreePort();
  const env = resolveServerEnv({ provider, fallback, extra: extraEnv });
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
    assertStructuredDataStartupMode(`${logs.stdout}\n${logs.stderr}`);
    assert.match(
      `${logs.stdout}\n${logs.stderr}`,
      /\[transport\].*event=server_start.*mode=http/,
      "Expected structured transport startup logs from native HTTP server output"
    );
  } finally {
    if (transport) {
      await transport.close();
    }
    await server.stop();
  }
}

if (RUN_GEMINI_PROVIDER_TESTS) {
  test("[gemini] streamableHttp integration works", async () => {
    await runHttpScenario("gemini");
  });
} else {
  test.skip("[gemini] streamableHttp integration works", () => {});
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
