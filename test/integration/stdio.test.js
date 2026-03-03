import assert from "node:assert/strict";
import test from "node:test";
import {
  RUN_FUSE_PROVIDER_TESTS,
  RUN_LOCAL_PROVIDER_TESTS,
  RUN_GEMINI_PROVIDER_TESTS,
  assertStructuredDataStartupMode,
  createStdioClient,
  requestTimeoutForProvider,
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
    const requestTimeoutMs = requestTimeoutForProvider(provider);
    await runCoreAssertions(client, { requestTimeoutMs });

    if (provider === "local") {
      // The core assertions search uses an exact sample ID ("basic-scan")
      // which hits the fast path and bypasses the RAG provider. Run a
      // keyword search here to exercise the local RAG provider so its
      // [rag] diagnostic is emitted to stderr.
      await client.callTool(
        { name: "search", arguments: { query: "how to scan documents", product: "dwt", type: "doc", limit: 1 } },
        undefined,
        { timeout: requestTimeoutMs }
      );
    }

    const stderr = getStderr();
    assertStructuredDataStartupMode(stderr);
    if (provider === "local") {
      assert.match(stderr, /\[rag\]/, "Expected rag diagnostics in stderr for local provider");
    }
  } finally {
    await transport.close();
  }
}

async function runLexicalFallbackScenario() {
  const env = resolveServerEnv({
    provider: "gemini",
    fallback: "lexical",
    extra: {
      GEMINI_API_KEY: ""
    }
  });

  const { client, transport } = await createStdioClient({
    env,
    name: "integration-stdio-lexical-fallback"
  });

  try {
    await runCoreAssertions(client, { requestTimeoutMs: 60000 });
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

if (RUN_GEMINI_PROVIDER_TESTS) {
  test("[gemini] stdio integration works", async () => {
    await runStdioScenario("gemini");
  });
} else {
  test.skip("[gemini] stdio integration works", () => {});
}

test("[lexical fallback] stdio integration works when gemini is unavailable", async () => {
  await runLexicalFallbackScenario();
});

test("[lexical] stdio integration works", async () => {
  await runStdioScenario("lexical");
});
