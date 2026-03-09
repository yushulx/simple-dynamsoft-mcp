import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { startHttpServer } from "../../src/server/transports/http.js";

async function getFreePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();
    server.unref();
    server.on("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectPromise(new Error("Unable to resolve ephemeral port"));
        return;
      }
      const { port } = address;
      server.close(() => resolvePromise(port));
    });
  });
}

test("HTTP transport returns 503 while startup is not ready", async (t) => {
  const port = await getFreePort();
  let createServerCalls = 0;

  const runningServer = await startHttpServer({
    host: "127.0.0.1",
    port,
    mcpPath: "/mcp",
    createServer: () => {
      createServerCalls += 1;
      throw new Error("createServer should not be called while startup is not ready");
    },
    isReady: () => false,
    getReadinessState: () => ({ stage: "initializing-data" }),
    registerSignalHandlers: false
  });

  t.after(async () => {
    await new Promise((resolvePromise) => {
      runningServer.httpServer.close(() => resolvePromise());
    });
  });

  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    signal: AbortSignal.timeout(2000),
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    })
  });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "2");
  assert.equal(createServerCalls, 0);

  const body = await response.json();
  assert.equal(body.error.code, -32000);
  assert.match(body.error.message, /warming up/i);
  assert.equal(body.error.data.stage, "initializing-data");
});
