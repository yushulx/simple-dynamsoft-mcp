#!/usr/bin/env node
// Version-drift check (issue #158): compare the SDK versions the server advertises
// (data/metadata/dynamsoft_sdks.json) against versions pinned inside served
// samples (gradle bundles, npm deps, CDN URLs). Report-only by default — prints a
// table and exits 1 when drift is found so CI can flag it.
//
// Usage: node scripts/check-version-drift.mjs [--data-dir <path>] (default: ./data or $MCP_DATA_DIR)
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dirFlagIdx = args.indexOf("--data-dir");
const dataDir = dirFlagIdx !== -1 ? args[dirFlagIdx + 1] : (process.env.MCP_DATA_DIR || join(process.cwd(), "data"));

const manifestPath = join(dataDir, "metadata", "dynamsoft_sdks.json");
if (!existsSync(manifestPath)) {
  console.error(`No SDK manifest at ${manifestPath}. Pass --data-dir or set MCP_DATA_DIR.`);
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// Collect advertised versions (any "version": "x.y.z" under the sdk registry).
const advertised = new Set();
function collectVersions(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (k === "version" && typeof v === "string") advertised.add(v);
    else if (typeof v === "object") collectVersions(v);
  }
}
collectVersions(manifest);

const PIN_PATTERNS = [
  /barcodereaderbundle:(\d+\.\d+\.\d+)/g,
  /dynamsoft-[a-z-]+["']?\s*:\s*["']\^?(\d+\.\d+\.\d+)/g,
  /@dynamsoft\/[a-z-]+@(\d+\.\d+\.\d+)/g,
  /capture-vision-bundle@(\d+\.\d+\.\d+)/g
];

const samplesDir = join(dataDir, "samples");
const pinned = new Map(); // version -> example file

function walk(dir, depth) {
  if (depth > 6 || !existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || ["node_modules", "build", "Pods"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth + 1);
    } else if (/\.(gradle|json|html|md|xml|podspec|txt)$/.test(entry.name)) {
      let content = "";
      try { content = readFileSync(full, "utf8"); } catch { continue; }
      for (const re of PIN_PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(content)) !== null) {
          if (!pinned.has(m[1])) pinned.set(m[1], full.replace(dataDir, "."));
        }
      }
    }
  }
}

if (existsSync(samplesDir)) walk(samplesDir, 0);

const drift = [...pinned.entries()].filter(([ver]) => !advertised.has(ver));

console.log("Advertised SDK versions:", [...advertised].sort().join(", ") || "(none)");
console.log("\nPinned versions found in samples:");
for (const [ver, file] of [...pinned.entries()].sort()) {
  const mark = advertised.has(ver) ? "ok " : "DRIFT";
  console.log(`  [${mark}] ${ver}  e.g. ${file}`);
}

if (drift.length) {
  console.log(`\n${drift.length} pinned version(s) not in the advertised set (possible drift).`);
  process.exit(1);
}
console.log("\nNo version drift detected.");
