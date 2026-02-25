import assert from "node:assert/strict";
import test from "node:test";
import {
  RUN_FUSE_PROVIDER_TESTS,
  RUN_LOCAL_PROVIDER_TESTS,
  RUN_GEMINI_PROVIDER_TESTS,
  connectStreamableClientWithRetry,
  getFreePort,
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
      requestTimeoutMs: provider === "local" || provider === "gemini" ? 300000 : 60000
    });

    const logs = server.getLogs();
    assert.match(
      `${logs.stdout}\n${logs.stderr}`,
      /\[data\] mode=/,
      "Expected data mode logs from native HTTP server output"
    );
    assert.match(
      `${logs.stdout}\n${logs.stderr}`,
      /\[transport\] mode=http/,
      "Expected transport mode logs from native HTTP server output"
    );
  } finally {
    if (transport) {
      await transport.close();
    }
    await server.stop();
  }
}

if (RUN_FUSE_PROVIDER_TESTS) {
  test("[fuse] streamableHttp integration works", async () => {
    await runHttpScenario("fuse");
  });
} else {
  test.skip("[fuse] streamableHttp integration works", () => {});
}

if (RUN_LOCAL_PROVIDER_TESTS) {
  test("[local] streamableHttp integration works", async () => {
    await runHttpScenario("local");
  });
} else {
  test.skip("[local] streamableHttp integration works", () => {});
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
