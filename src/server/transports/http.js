import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logEvent } from "../../observability/logging.js";

async function startHttpServer({ host, port, mcpPath, createServer }) {
  logEvent("transport", "server_start", { mode: "http", host, port, path: mcpPath });

  const httpServer = createHttpServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);
    if (requestUrl.pathname !== mcpPath) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    let closed = false;
    const closeResources = async () => {
      if (closed) return;
      closed = true;
      try {
        await transport.close();
      } catch {}
      try {
        await server.close();
      } catch {}
    };

    res.on("close", () => {
      void closeResources();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logEvent("transport", "request_error", { mode: "http", message }, { level: "error" });
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        }));
      }
      await closeResources();
    }
  });

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const shutdown = async (signal) => {
    logEvent("transport", "server_shutdown", { mode: "http", signal });
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  return { httpServer };
}

export { startHttpServer };
