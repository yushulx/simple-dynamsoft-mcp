import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  RUN_GEMINI_PROVIDER_TESTS,
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

function responseText(result) {
  return (result.content || []).map((item) => [item.text, item.description].filter(Boolean).join("\n")).join("\n");
}

test("[lexical] ?delivery=links serves sample and docs links but never code", async () => {
  const port = await getFreePort();
  const server = startNativeHttpServer({ port, env: resolveServerEnv({ provider: "lexical", fallback: "none" }) });
  const connections = [];
  try {
    const links = await connectStreamableClientWithRetry({ urls: [`http://127.0.0.1:${port}/mcp?delivery=links`], name: "links" });
    const full = await connectStreamableClientWithRetry({ urls: [`http://127.0.0.1:${port}/mcp`], name: "full" });
    connections.push(links, full);
    const call = (client, name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
    const dotnet = { product: "dbr", edition: "server", platform: "dotnet" };

    const search = await call(links.client, "search", { ...dotnet, query: "read barcodes from an image file", content: "passage" });
    const docUri = (search.content || []).find((item) => item.type === "resource_link" && item.uri.startsWith("doc://"))?.uri;
    assert.ok(docUri, "search should return a doc:// result");
    const listing = await call(links.client, "list_samples", dotnet);
    const sampleUri = responseText(listing).match(/sample:\/\/\S+HelloWorld/)?.[0];
    assert.ok(sampleUri, "list_samples should list HelloWorld");

    const linkReplies = {
      search,
      list_samples: listing,
      get_quickstart: await call(links.client, "get_quickstart", dotnet),
      get_sample_files: await call(links.client, "get_sample_files", { ...dotnet, sample_id: "HelloWorld" }),
      read_document: await call(links.client, "read_document", { uri: docUri })
    };
    for (const [tool, result] of Object.entries(linkReplies)) {
      assert.equal(result.isError, undefined, `${tool}: ${responseText(result).slice(0, 300)}`);
      assert.ok(!responseText(result).includes("```"), `${tool} returned a code block on a links-only connection`);
    }
    assert.match(responseText(linkReplies.list_samples), /source: https:\/\/github\.com\/Dynamsoft\//);
    assert.match(responseText(linkReplies.get_quickstart), /Sample source:\*\* https:\/\/github\.com\/Dynamsoft\//);
    assert.match(responseText(linkReplies.get_sample_files), /^Source: https:\/\/github\.com\/Dynamsoft\//m);
    assert.ok(!responseText(linkReplies.get_sample_files).includes("## HelloWorld.sln"), "links-only get_sample_files must not return file contents");

    const sampleResource = await links.client.readResource({ uri: sampleUri });
    assert.match(sampleResource.contents[0].text, /^Sample source: https:\/\/github\.com\/Dynamsoft\//);
    assert.ok(!/LicenseManager|static void Main/.test(sampleResource.contents[0].text), "links-only resources must not return source code");

    // The default connection on the same server still serves code.
    assert.ok(responseText(await call(full.client, "get_quickstart", dotnet)).includes("```csharp"));
    assert.ok(responseText(await call(full.client, "read_document", { uri: docUri })).includes("```"));
  } finally {
    for (const { transport } of connections) await transport.close();
    await server.stop();
  }
});
