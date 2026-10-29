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
  createStdioClient,
  requestTimeoutForProvider,
  resolveServerEnv,
  runCoreAssertions
} from "./helpers.js";

async function runStdioScenario(provider) {
  const requestLogDir = mkdtempSync(join(tmpdir(), "mcp-request-logs-stdio-"));
  const env = resolveServerEnv({ provider, extra: { MCP_REQUEST_LOG_DIR: requestLogDir } });
  const { client, transport, getStderr } = await createStdioClient({
    env,
    name: `integration-stdio-${provider}`
  });

  try {
    const requestTimeoutMs = requestTimeoutForProvider(provider);
    await runCoreAssertions(client, { requestTimeoutMs });

    const stderr = getStderr();
    assertStructuredDataStartupMode(stderr);
    await assertRequestLogs(getStderr, requestLogDir, "stdio");
  } finally {
    await transport.close();
    cleanupDir(requestLogDir);
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

if (RUN_VECTOR_PROVIDER_TESTS) {
  test(`[${VECTOR_PROVIDER}] stdio integration works`, async () => {
    await runStdioScenario(VECTOR_PROVIDER);
  });
} else {
  test.skip(`[${VECTOR_PROVIDER}] stdio integration works`, () => {});
}

test("[lexical fallback] stdio integration works when gemini is unavailable", async () => {
  await runLexicalFallbackScenario();
});

test("[lexical] stdio integration works", async () => {
  await runStdioScenario("lexical");
});
