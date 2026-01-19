#!/usr/bin/env node
/**
 * MCP HTTP Wrapper for Copilot Studio
 *
 * - POST /mcp: JSON-RPC proxy to the MCP stdio child
 * - GET  /mcp: SSE stream (kept for compatibility; Copilot may or may not use it)
 * - Proxies MCP requests, forwards notifications to SSE, and returns discovery inline
 * - Handles notifications/initialized with a discovery response
 */

import express from "express";
import bodyParser from "body-parser";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import os from "node:os";

// -----------------------------
// Config
// -----------------------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 3333;
const MCP_COMMAND = process.env.MCP_COMMAND || process.execPath; // node
const MCP_ARGS = process.env.MCP_ARGS
  ? JSON.parse(process.env.MCP_ARGS)
  : ["./src/index.js"]; // relative to repo root
const WORKDIR = process.env.WORKDIR || process.cwd();

const ENABLE_SSE_PUSH_DISCOVERY = process.env.SSE_PUSH_DISCOVERY !== "0"; // default ON
const SSE_KEEPALIVE_MS = process.env.SSE_KEEPALIVE_MS
  ? Number(process.env.SSE_KEEPALIVE_MS)
  : 15000;
const SESSION_ID = crypto.randomUUID();

// Log levels: error < warn < info < debug
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;

// -----------------------------
// Utils
// -----------------------------
function nowIso() {
  return new Date().toISOString();
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function makeId() {
  return crypto.randomUUID();
}

function shouldLog(level) {
  return (LEVELS[level] ?? LEVELS.info) <= LOG_LEVEL;
}

function logAt(level, ...args) {
  if (shouldLog(level)) {
    console.log(...args);
  }
}

function err(...args) {
  console.error(...args);
}

const MCP_INSTRUCTIONS = `# Dynamsoft MCP Server

Use these tools to answer questions about Dynamsoft SDKs:
- list_sdks: show available SDKs and platforms
- get_sdk_info: versions, install/licensing, docs for a platform
- list_samples / list_python_samples / list_dwt_categories: browse samples
- get_code_snippet / get_python_sample / get_dwt_sample: fetch code
- get_quick_start: full quick start for a target
- get_gradle_config, get_license_info, get_api_usage, search_samples

Workflow:
1) Call tools/list to discover names/schemas (or use discovery from initialize).
2) Invoke the relevant tool with arguments.
3) Use resources/list + resources/read if you need pre-registered sample/code resources.`;

// -----------------------------
// Response helpers (SSE-style if requested)
// -----------------------------
function wantsSse(req) {
  return (req.headers.accept || "").includes("text/event-stream");
}

function sendResponse(res, payload, useSse = false) {
  const sessionHeader = Buffer.from(
    JSON.stringify({ sessionId: SESSION_ID })
  ).toString("base64");

  res.setHeader("mcp-session-id", sessionHeader);
  if (useSse) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    res.end();
    return;
  }
  res.status(200).json(payload);
}

// -----------------------------
// Spawn MCP child
// -----------------------------
logAt("info", "");
logAt("info", `[MCP WRAPPER] MCP child starting...`);
logAt("info", `[MCP WRAPPER] -> ${MCP_COMMAND} ${MCP_ARGS.join(" ")}`);
logAt("info", `[MCP WRAPPER] Working dir: ${WORKDIR}`);
logAt("info", "");

const child = spawn(MCP_COMMAND, MCP_ARGS, {
  cwd: WORKDIR,
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

logAt("info", `[MCP WRAPPER] MCP child started pid=${child.pid}`);

child.on("exit", (code, signal) => {
  err(`[MCP WRAPPER] MCP child exited code=${code} signal=${signal}`);
});

child.stderr.on("data", (buf) => {
  err(`[MCP STDERR] ${buf.toString("utf8")}`);
});

// -----------------------------
// MCP stdio JSON-RPC transport
// -----------------------------
let stdoutBuffer = "";
const pending = new Map(); // id -> {resolve,reject,ts,timeout}

child.stdout.on("data", (buf) => {
  stdoutBuffer += buf.toString("utf8");

  // MCP stdio messages are newline-delimited JSON (NDJSON)
  while (true) {
    const idx = stdoutBuffer.indexOf("\n");
    if (idx < 0) break;

    const line = stdoutBuffer.slice(0, idx).trim();
    stdoutBuffer = stdoutBuffer.slice(idx + 1);

    if (!line) continue;

    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      err(`[MCP WRAPPER] Failed to parse MCP stdout line: ${line}`);
      continue;
    }

    // Response?
    if (msg && msg.id && pending.has(String(msg.id))) {
      const p = pending.get(String(msg.id));
      pending.delete(String(msg.id));
      clearTimeout(p.timeout);
      p.resolve(msg);
      continue;
    }

    // Notification / server event -> forward to SSE clients if any
    broadcastSse({
      event: "mcp",
      data: msg,
    });
  }
});

function sendToChild(req, { timeoutMs = 30000 } = {}) {
  const id = req.id != null ? String(req.id) : null;

  return new Promise((resolve, reject) => {
    const payload = safeJson(req).replace(/\n/g, "");
    // write NDJSON line
    child.stdin.write(payload + "\n", "utf8");

    // Notifications have no id; resolve immediately.
    if (!id) {
      resolve({ ok: true, notification: true });
      return;
    }

    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP child timeout waiting id=${id}`));
    }, timeoutMs);

    pending.set(id, { resolve, reject, ts: Date.now(), timeout: t });
  });
}

// -----------------------------
// SSE clients
// -----------------------------
const sseClients = new Set(); // res
let keepaliveTimer = null;

function broadcastSse({ event = "message", data }) {
  const msg = typeof data === "string" ? data : JSON.stringify(data);
  for (const res of sseClients) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${msg}\n\n`);
    } catch {}
  }
}

function startKeepalive() {
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => {
    broadcastSse({
      event: "ping",
      data: { t: Date.now() },
    });
  }, SSE_KEEPALIVE_MS);
}

function stopKeepaliveIfNoClients() {
  if (sseClients.size === 0 && keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

// -----------------------------
// Express app
// -----------------------------
const app = express();

// Accept JSON bodies
app.use(bodyParser.json({ limit: "2mb" }));

// Basic HTTP logger
app.use((req, res, next) => {
  logAt("info", `[HTTP ${nowIso()}] ${req.method} ${req.path}`);
  next();
});

// Health endpoint
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: nowIso(),
    childPid: child.pid,
    sseClients: sseClients.size,
    host: os.hostname(),
  });
});

// SSE endpoint (kept for compatibility; Copilot may or may not use it)
app.get("/mcp", (req, res) => {
  logAt("info", `[SSE] Client connected: ${req.headers["user-agent"] || "unknown"}`);

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // helpful for proxies/nginx
  res.flushHeaders?.();

  // Send initial event
  res.write(`event: open\n`);
  res.write(`data: ${JSON.stringify({ ok: true, time: nowIso() })}\n\n`);

  sseClients.add(res);
  startKeepalive();

  req.on("close", () => {
    sseClients.delete(res);
    stopKeepaliveIfNoClients();
    logAt("info", `[SSE] Client disconnected. active=${sseClients.size}`);
  });
});

// MCP JSON-RPC endpoint
app.post("/mcp", async (req, res) => {
  const useSse = wantsSse(req);
  // Log headers (and body if enabled) for debugging
  logAt("info", `[/mcp] headers: ${safeJson(req.headers)}`);
  logAt("debug", `[/mcp] raw body: ${safeJson(req.body)}`);

  const body = req.body;

  // Handle notifications/initialized (Copilot sends this and expects no error)
  if (
    body &&
    body.jsonrpc === "2.0" &&
    body.method === "notifications/initialized"
  ) {
    logAt("info", `[/mcp] notification received: notifications/initialized`);
    const useSse = wantsSse(req);
    try {
      const discovery = await fetchDiscovery();
      const notifPayload = {
        jsonrpc: "2.0",
        method: "discovery",
        params: discovery,
      };
      sendResponse(res, notifPayload, useSse);
    } catch (e) {
      err(`[DISCOVERY] notification fetch failed: ${e?.message || e}`);
      return res.status(204).end();
    }
    return;
  }

  // JSON-RPC requests
  try {
    // initialize
    if (body?.method === "initialize") {
      // Forward initialize to child
      const childResp = await sendToChild(body);

      // Patch capability set (prompts sometimes required)
      if (childResp?.result) {
        childResp.result.capabilities = childResp.result.capabilities || {};
        childResp.result.capabilities.tools = { listChanged: true };
        childResp.result.capabilities.resources = { listChanged: true };
        childResp.result.capabilities.prompts = { listChanged: true }; // Copilot quirk
        childResp.result.capabilities.logging = {};
        childResp.result.instructions = MCP_INSTRUCTIONS;
      }

      // Fetch tools/resources immediately for clients that do not use SSE
      try {
        const discovery = await fetchDiscovery();
        childResp.result.discovery = discovery;
      } catch (e) {
        err(`[DISCOVERY] fetch failed: ${e?.message || e}`);
      }

      sendResponse(res, childResp, useSse);

      // ---- Proactive discovery push over SSE (Copilot workaround)
      // (This runs only if SSE is enabled; safe to keep even if unused)
      if (ENABLE_SSE_PUSH_DISCOVERY) {
        setTimeout(async () => {
          try {
            await pushDiscoveryToSse();
          } catch (e) {
            err(`[DISCOVERY] push failed: ${e?.message || e}`);
          }
        }, 250);
      }

      return;
    }

    // Forward other methods to child
    const childResp = await sendToChild(body);

    // If childResp is notification ack
    if (childResp?.notification) {
      return res.status(204).end();
    }

    logAt("debug", `[/mcp] MCP response: ${safeJson(childResp)}`);
    return sendResponse(res, childResp, useSse);
  } catch (e) {
    err(`[/mcp] Error proxying request: ${e?.stack || e}`);

    // JSON-RPC error object
    const id = body?.id ?? null;
    return sendResponse(res, {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: String(e?.message || e),
      },
    }, useSse);
  }
});

// -----------------------------
// Proactive discovery push
// -----------------------------
async function pushDiscoveryToSse() {
  if (sseClients.size === 0) {
    logAt("debug", `[DISCOVERY] No SSE clients; skipping push.`);
    return;
  }

  logAt("debug", `[DISCOVERY] Querying tools/list + resources/list from MCP child...`);

  // tools/list
  const toolsReq = {
    jsonrpc: "2.0",
    id: makeId(),
    method: "tools/list",
    params: {},
  };
  const toolsResp = await sendToChild(toolsReq, { timeoutMs: 30000 });

  // resources/list
  const resReq = {
    jsonrpc: "2.0",
    id: makeId(),
    method: "resources/list",
    params: {},
  };
  const resResp = await sendToChild(resReq, { timeoutMs: 30000 });

  logAt("debug", `[DISCOVERY] tools/list result keys: ${Object.keys(toolsResp || {})}`);
  logAt("debug", `[DISCOVERY] resources/list result keys: ${Object.keys(resResp || {})}`);

  // Push as SSE events (even if client didn't ask!)
  // This is a compatibility hack for Copilot Studio UI.
  broadcastSse({ event: "mcp", data: toolsResp });
  broadcastSse({ event: "mcp", data: resResp });

  // Also emit “server ready” event
  broadcastSse({
    event: "ready",
    data: {
      time: nowIso(),
      toolsCount: toolsResp?.result?.tools?.length ?? null,
      resourcesCount: resResp?.result?.resources?.length ?? null,
    },
  });

  logAt(
    "info",
    `[DISCOVERY] pushed tools/resources over SSE. tools=${toolsResp?.result?.tools?.length ?? "?"} resources=${resResp?.result?.resources?.length ?? "?"}`
  );
}

// Fallback: fetch discovery for clients that don't use SSE
async function fetchDiscovery() {
  logAt("debug", `[DISCOVERY] Fetching tools/resources for non-SSE client...`);

  const toolsReq = {
    jsonrpc: "2.0",
    id: makeId(),
    method: "tools/list",
    params: {},
  };
  const resReq = {
    jsonrpc: "2.0",
    id: makeId(),
    method: "resources/list",
    params: {},
  };

  const [toolsResp, resResp] = await Promise.all([
    sendToChild(toolsReq, { timeoutMs: 30000 }),
    sendToChild(resReq, { timeoutMs: 30000 }),
  ]);

  return {
    tools: toolsResp?.result?.tools ?? [],
    resources: resResp?.result?.resources ?? [],
  };
}

// -----------------------------
// Start server
// -----------------------------
app.listen(PORT, "0.0.0.0", () => {
  logAt("info", "");
  logAt("info", `[MCP WRAPPER] Listening on http://localhost:${PORT}`);
  logAt("info", `[MCP WRAPPER] GET  /mcp = SSE stream (Copilot Studio expects this)`);
  logAt("info", `[MCP WRAPPER] POST /mcp = JSON-RPC endpoint`);
  logAt("info", `[MCP WRAPPER] /health = status`);
  logAt("info", "");
});
