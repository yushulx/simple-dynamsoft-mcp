import assert from "node:assert/strict";
import test from "node:test";
import {
  RUN_FUSE_PROVIDER_TESTS,
  RUN_LOCAL_PROVIDER_TESTS,
  createStdioClient,
  resolveServerEnv,
  runCoreAssertions
} from "./helpers.js";

async function runStdioScenario(provider) {
  const env = resolveServerEnv({ provider });
  const { client, transport, getStderr } = await createStdioClient({
    env,
    name: `integration-stdio-${provider}`
  });

  try {
    await runCoreAssertions(client, {
      requestTimeoutMs: provider === "local" ? 300000 : 60000
    });

    const stderr = getStderr();
    assert.match(stderr, /\[data\] mode=/, "Expected data mode log in stderr");
    if (provider === "local") {
      assert.match(stderr, /\[rag\]/, "Expected rag diagnostics in stderr for local provider");
    }
  } finally {
    await transport.close();
  }
}

if (RUN_FUSE_PROVIDER_TESTS) {
  test("[fuse] stdio integration works", async () => {
    await runStdioScenario("fuse");
  });
} else {
  test.skip("[fuse] stdio integration works", () => {});
}

if (RUN_LOCAL_PROVIDER_TESTS) {
  test("[local] stdio integration works", async () => {
    await runStdioScenario("local");
  });
} else {
  test.skip("[local] stdio integration works", () => {});
}
