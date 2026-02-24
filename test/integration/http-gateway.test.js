import assert from "node:assert/strict";
import test from "node:test";
import {
  RUN_FUSE_PROVIDER_TESTS,
  RUN_LOCAL_PROVIDER_TESTS,
  connectStreamableClientWithRetry,
  getFreePort,
  resolveServerEnv,
  runCoreAssertions,
  startSupergateway
} from "./helpers.js";

async function runGatewayScenario(provider) {
  const port = await getFreePort();
  const env = resolveServerEnv({ provider });
  const gateway = startSupergateway({
    port,
    env
  });

  let client = null;
  let transport = null;
  try {
    const connected = await connectStreamableClientWithRetry({
      urls: [`http://127.0.0.1:${port}/mcp`, `http://127.0.0.1:${port}`],
      name: `integration-http-${provider}`
    });
    client = connected.client;
    transport = connected.transport;

    await runCoreAssertions(client, {
      requestTimeoutMs: provider === "local" ? 300000 : 60000
    });

    const logs = gateway.getLogs();
    assert.match(
      `${logs.stdout}\n${logs.stderr}`,
      /\[data\] mode=/,
      "Expected wrapped stdio server data mode logs through gateway output"
    );
  } finally {
    if (transport) {
      await transport.close();
    }
    await gateway.stop();
  }
}

if (RUN_FUSE_PROVIDER_TESTS) {
  test("[fuse] streamableHttp gateway integration works", async () => {
    await runGatewayScenario("fuse");
  });
} else {
  test.skip("[fuse] streamableHttp gateway integration works", () => {});
}

if (RUN_LOCAL_PROVIDER_TESTS) {
  test("[local] streamableHttp gateway integration works", async () => {
    await runGatewayScenario("local");
  });
} else {
  test.skip("[local] streamableHttp gateway integration works", () => {});
}
