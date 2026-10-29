#!/usr/bin/env node
// Measures search relevance against the golden query set.
//
//   node scripts/eval-retrieval.mjs [--provider=lexical|gemini|openai|azure-openai] [--case=<id>] [--show] [--json=<path>]
//
// The provider is passed through RAG_PROVIDER before the RAG layer loads, with
// fallback disabled so a failing provider is reported instead of masked.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "true"];
  })
);
const provider = args.provider || "lexical";
process.env.RAG_PROVIDER = provider;
process.env.RAG_FALLBACK = "none";
process.env.RAG_PREWARM = "false";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const goldenPath = args.golden || join(repoRoot, "test", "fixtures", "retrieval-golden.json");
const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
const cases = args.case ? golden.cases.filter((item) => item.id === args.case) : golden.cases;
if (cases.length === 0) {
  console.error(`No golden cases matched ${args.case}`);
  process.exit(1);
}

const { ensureResourceIndexReady } = await import("../src/server/resource-index.js");
const { searchResources } = await import("../src/rag/index.js");
const { runRetrievalEval } = await import("./lib/retrieval-eval.mjs");
const { isResultInScope } = await import("./lib/scope-matcher.mjs");

ensureResourceIndexReady();
const report = await runRetrievalEval({ searchResources, cases, k: golden.k || 5, isInScope: isResultInScope });
report.provider = provider;

const fmt = (value) => (value === null || value === undefined ? "n/a" : value.toFixed(3));
for (const item of report.cases) {
  const flag = item.gap ? "GAP " : item.requiredHit === false ? "MISS" : "ok  ";
  console.log(`${flag} ${item.id.padEnd(34)} recall=${fmt(item.recall)} mrr=${fmt(item.mrr)} ndcg=${fmt(item.ndcg)} dup=${item.duplicates} off=${item.offScope} rn=${item.releaseNotes} ms=${item.latencyMs.toFixed(0)}`);
  if (args.show || item.requiredHit === false) {
    for (const hit of item.top) {
      console.log(`       ${hit.rank}. [g${hit.grade}] [${hit.product}] ${hit.title} :: ${hit.url || hit.uri}`);
    }
    for (const url of item.requiredMissing) console.log(`       missing: ${url}`);
  }
}

const s = report.summary;
console.log(`\nprovider=${provider} cases=${s.cases} (gap=${s.gapCases}) k=${report.k}`);
console.log(`recall@${report.k}=${fmt(s.recallAtK)} mrr=${fmt(s.mrr)} ndcg@${report.k}=${fmt(s.ndcgAtK)} required_hit=${fmt(s.requiredHitRate)}`);
console.log(`duplicate_rate=${fmt(s.duplicateRate)} off_scope_rate=${fmt(s.offScopeRate)} release_notes_rate=${fmt(s.releaseNotesRate)}`);
const lat = s.latencyMs;
console.log(`latency_ms first_query=${lat.firstQuery.toFixed(0)} first_pass p50=${lat.p50FirstPass.toFixed(0)} p95=${lat.p95FirstPass.toFixed(0)} | warm p50=${lat.p50Warm.toFixed(0)} p95=${lat.p95Warm.toFixed(0)}`);

if (args.json) {
  writeFileSync(args.json, JSON.stringify(report, null, 2));
  console.log(`wrote ${args.json}`);
}
