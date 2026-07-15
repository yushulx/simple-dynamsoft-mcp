// Deterministic contract tests (issue #155): every URI the server advertises
// must be fetchable, and every mainstream quickstart cell must return real
// content or an explicit redirect — never a bare "Sample not found" or another
// platform's language. These mechanically guard the bug classes fixed for v7.4.
//
// Requires MCP_DATA_DIR to point at a populated data dir (worktree data/ is empty):
//   MCP_DATA_DIR=/abs/path/to/data node --test test/contract/contract.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const REQ = { timeout: 60000 };

async function withClient(fn) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["src/index.js"],
    env: { ...process.env, RAG_PROVIDER: "lexical", RAG_FALLBACK: "none", MCP_DATA_AUTO_DOWNLOAD: "false" }
  });
  const client = new Client({ name: "contract", version: "1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function textOf(res) {
  return (res.content || []).map((c) => c.text || "").join("\n");
}

test("#155 URI round-trip: every sample:// URI from list_samples is fetchable", async () => {
  await withClient(async (client) => {
    const ls = await client.callTool({ name: "list_samples", arguments: { limit: 200 } }, undefined, REQ);
    const lsText = textOf(ls);
    const uris = [...new Set((lsText.match(/sample:\/\/[^\s)"']+/g) || []))];
    assert.ok(uris.length > 0, "list_samples should advertise sample URIs");

    // Cap to keep runtime bounded; sample across the list.
    const step = Math.max(1, Math.floor(uris.length / 40));
    const sampled = uris.filter((_, i) => i % step === 0).slice(0, 40);
    const failures = [];
    for (const uri of sampled) {
      const r = await client.callTool({ name: "get_sample_files", arguments: { resource_uri: uri } }, undefined, REQ);
      const t = textOf(r);
      const ok = r.isError !== true && (/## Files \(|## /.test(t) || /docs URL|samples URL|Docs:/i.test(t));
      if (!ok) failures.push(uri);
    }
    assert.deepEqual(failures, [], `these advertised URIs were not fetchable: ${failures.join(", ")}`);
  });
});

test("#155 quickstart matrix: mainstream cells return code or an explicit redirect, never a bare miss", async () => {
  const cells = [
    { product: "dbr", edition: "web", platform: "js" },
    { product: "dbr", edition: "web", platform: "react" },
    { product: "dbr", edition: "web", platform: "angular" },
    { product: "dbr", edition: "mobile", platform: "android" },
    { product: "dbr", edition: "mobile", platform: "ios" },
    { product: "dbr", edition: "mobile", platform: "flutter" },
    { product: "dbr", edition: "mobile", platform: "react-native" },
    { product: "dbr", edition: "server", platform: "python" },
    { product: "dbr", edition: "server", platform: "nodejs" },
    { product: "dbr", edition: "server", platform: "java" },
    { product: "dbr", edition: "server", platform: "dotnet" },
    { product: "mrz", platform: "js" },
    { product: "mds", platform: "js" },
    { product: "dwt", platform: "js" },
    { product: "ddv", platform: "js" }
  ];
  await withClient(async (client) => {
    const problems = [];
    for (const cell of cells) {
      const r = await client.callTool({ name: "get_quickstart", arguments: cell }, undefined, REQ);
      const t = textOf(r);
      if (/Sample not found:/i.test(t)) problems.push(`${JSON.stringify(cell)} -> bare 'Sample not found'`);
      // A nodejs cell must never return Python install lines.
      if (cell.platform === "nodejs" && /pip install/i.test(t)) problems.push(`${JSON.stringify(cell)} -> served Python`);
      const hasContent = /```|Docs:|get_sample_files|docs URL|Related samples/i.test(t);
      if (!hasContent) problems.push(`${JSON.stringify(cell)} -> no code, redirect, or recovery`);
    }
    assert.deepEqual(problems, [], `quickstart matrix problems:\n${problems.join("\n")}`);
  });
});
