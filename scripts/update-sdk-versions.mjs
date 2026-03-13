#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const projectRoot = process.cwd();
const metadataPath = join(projectRoot, "data", "metadata", "dynamsoft_sdks.json");
const checkOnly = process.argv.includes("--check");
const strictMode = process.argv.includes("--strict") || process.env.VERSION_SYNC_STRICT === "true";

function logVersionSync(message) {
  console.log(`[version-sync] ${message}`);
}

function walkFiles(rootDir, fileFilter) {
  if (!existsSync(rootDir)) return [];
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".git")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && fileFilter(fullPath, entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files.sort((a, b) => a.localeCompare(b));
}

function normalizeVersion(version) {
  const parts = String(version)
    .trim()
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isInteger(part) && part >= 0);
  if (parts.length < 2) return "";
  return parts.join(".");
}

function compareVersion(a, b) {
  const aParts = String(a).split(".").map((part) => Number.parseInt(part, 10));
  const bParts = String(b).split(".").map((part) => Number.parseInt(part, 10));
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const av = Number.isInteger(aParts[i]) ? aParts[i] : 0;
    const bv = Number.isInteger(bParts[i]) ? bParts[i] : 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function getHighestVersion(versions) {
  const normalized = versions
    .map((item) => normalizeVersion(item))
    .filter(Boolean);
  if (normalized.length === 0) return "";
  normalized.sort((a, b) => compareVersion(a, b)).reverse();
  return normalized[0];
}

function extractVersionCandidates(text) {
  const values = [];
  const regex = /(?:^|[^0-9])v?(\d{1,2}(?:\.\d+){1,3})(?![\d.])/gi;
  const source = String(text || "");
  let match = regex.exec(source);
  while (match) {
    const normalized = normalizeVersion(match[1]);
    if (normalized) values.push(normalized);
    match = regex.exec(source);
  }
  return values;
}

function detectFromReleaseNoteIndexes(docRoot) {
  const markdownFiles = walkFiles(docRoot, (fullPath, name) => {
    if (!name.toLowerCase().endsWith(".md")) return false;
    const normalized = fullPath.replace(/\\/g, "/").toLowerCase();
    return normalized.endsWith("/release-notes/index.md") || normalized.endsWith("/releasenotes/index.md");
  });

  if (markdownFiles.length === 0) {
    return { version: "", detail: "release-note index files=0" };
  }

  const versions = [];
  for (const filePath of markdownFiles) {
    const content = readFileSync(filePath, "utf8");
    versions.push(...extractVersionCandidates(content));
  }

  const version = getHighestVersion(versions);
  return {
    version,
    detail: `release-note index files=${markdownFiles.length} candidates=${versions.length}`
  };
}

function detectFromProductVersionYml(docRoot) {
  const filePath = join(docRoot, "_data", "product_version.yml");
  if (!existsSync(filePath)) return { version: "", detail: "_data/product_version.yml missing" };
  const content = readFileSync(filePath, "utf8");

  const latestLine = content
    .split(/\r?\n/)
    .find((line) => /latest version/i.test(line));
  if (!latestLine) return { version: "", detail: "latest version line missing in product_version.yml" };

  const candidates = extractVersionCandidates(latestLine);
  return {
    version: getHighestVersion(candidates),
    detail: `product_version.yml candidates=${candidates.length}`
  };
}

function detectFromLatestVersionJs(docRoot, relativeFile) {
  const filePath = join(docRoot, ...relativeFile.split("/"));
  if (!existsSync(filePath)) return { version: "", detail: `${relativeFile} missing` };
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/versionNoteLatestVersion\s*=\s*["']([0-9.]+)["']/i);
  if (!match) return { version: "", detail: `${relativeFile} has no versionNoteLatestVersion` };
  return { version: normalizeVersion(match[1]), detail: `parsed ${relativeFile}` };
}

function detectFromStrategies(strategies, source, resolvedVersions, metadata) {
  const docsRoot = source.docsPath ? join(projectRoot, source.docsPath) : "";
  const attempts = [];

  for (const strategy of strategies) {
    if (strategy === "release-note-indexes") {
      if (!docsRoot || !existsSync(docsRoot)) {
        attempts.push("release-note-indexes: docs root missing");
        continue;
      }
      const result = detectFromReleaseNoteIndexes(docsRoot);
      attempts.push(`release-note-indexes: ${result.detail}`);
      if (result.version) {
        return { version: result.version, strategy: "release-note-indexes", attempts };
      }
      continue;
    }

    if (strategy === "product-version-yml") {
      if (!docsRoot || !existsSync(docsRoot)) {
        attempts.push("product-version-yml: docs root missing");
        continue;
      }
      const result = detectFromProductVersionYml(docsRoot);
      attempts.push(`product-version-yml: ${result.detail}`);
      if (result.version) {
        return { version: result.version, strategy: "product-version-yml", attempts };
      }
      continue;
    }

    if (typeof strategy === "object" && strategy.type === "latest-version-js") {
      if (!docsRoot || !existsSync(docsRoot)) {
        attempts.push(`latest-version-js(${strategy.file}): docs root missing`);
        continue;
      }
      const result = detectFromLatestVersionJs(docsRoot, strategy.file);
      attempts.push(`latest-version-js(${strategy.file}): ${result.detail}`);
      if (result.version) {
        return { version: result.version, strategy: `latest-version-js(${strategy.file})`, attempts };
      }
      continue;
    }

    if (typeof strategy === "object" && strategy.type === "max-of-sdks") {
      const candidates = [];
      for (const sdkId of strategy.sdkIds || []) {
        const resolved = resolvedVersions[sdkId] || String(metadata?.sdks?.[sdkId]?.version || "");
        const normalized = normalizeVersion(resolved);
        if (normalized) candidates.push(normalized);
      }
      const detected = getHighestVersion(candidates);
      attempts.push(`max-of-sdks(${(strategy.sdkIds || []).join(",")}): candidates=${candidates.length}`);
      if (detected) {
        return { version: detected, strategy: `max-of-sdks(${(strategy.sdkIds || []).join(",")})`, attempts };
      }
      continue;
    }
  }

  return { version: "", strategy: "", attempts };
}

const sdkVersionSources = [
  {
    sdkId: "dbr-web",
    docsPath: "data/documentation/barcode-reader-docs-js",
    strategies: ["release-note-indexes"]
  },
  {
    sdkId: "dbr-mobile",
    docsPath: "data/documentation/barcode-reader-docs-mobile",
    strategies: ["release-note-indexes"]
  },
  {
    sdkId: "dbr-server",
    docsPath: "data/documentation/barcode-reader-docs-server",
    strategies: ["release-note-indexes"]
  },
  {
    sdkId: "dwt",
    docsPath: "data/documentation/web-twain-docs",
    strategies: [{ type: "latest-version-js", file: "assets/js/setLatestVersion.js" }]
  },
  {
    sdkId: "ddv",
    docsPath: "data/documentation/document-viewer-docs",
    strategies: ["product-version-yml", "release-note-indexes"]
  },
  {
    sdkId: "mds",
    docsPath: "data/documentation/mobile-document-scanner-docs-js",
    strategies: ["product-version-yml", "release-note-indexes"]
  },
  {
    sdkId: "dcv-web",
    docsPath: "data/documentation/capture-vision-docs-js",
    strategies: ["release-note-indexes"]
  },
  {
    sdkId: "dcv-mobile",
    docsPath: "data/documentation/capture-vision-docs-mobile",
    strategies: ["release-note-indexes"]
  },
  {
    sdkId: "dcv-server",
    docsPath: "data/documentation/capture-vision-docs-server",
    strategies: ["release-note-indexes"]
  },
  {
    sdkId: "dcv-core",
    docsPath: "data/documentation/capture-vision-docs",
    strategies: ["product-version-yml", { type: "max-of-sdks", sdkIds: ["dcv-server", "dcv-mobile", "dcv-web"] }]
  }
];

if (!existsSync(metadataPath)) {
  console.error(`[version-sync] metadata file not found: ${metadataPath}`);
  process.exit(1);
}

logVersionSync(
  `start mode=${checkOnly ? "check" : "update"} strict=${strictMode ? "true" : "false"} metadata=${relative(projectRoot, metadataPath)} sources=${sdkVersionSources.length}`
);

const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
const updates = [];
const unchanged = [];
const skipped = [];
const resolvedVersions = {};

for (const source of sdkVersionSources) {
  const sdkEntry = metadata?.sdks?.[source.sdkId];
  if (!sdkEntry) {
    skipped.push(`${source.sdkId} (missing metadata entry)`);
    continue;
  }

  if (source.docsPath) {
    const docsRoot = join(projectRoot, source.docsPath);
    if (!existsSync(docsRoot)) {
      skipped.push(`${source.sdkId} (${source.docsPath} not found)`);
      continue;
    }
  }

  const detection = detectFromStrategies(source.strategies, source, resolvedVersions, metadata);
  if (!detection.version) {
    skipped.push(
      `${source.sdkId} (no version found; attempts=${detection.attempts.join(" | ") || "none"})`
    );
    continue;
  }

  resolvedVersions[source.sdkId] = detection.version;
  const current = String(sdkEntry.version || "");
  if (current !== detection.version) {
    updates.push({
      sdkId: source.sdkId,
      from: current,
      to: detection.version,
      docsPath: source.docsPath || "n/a",
      strategy: detection.strategy
    });
    sdkEntry.version = detection.version;
  } else {
    unchanged.push({
      sdkId: source.sdkId,
      version: current,
      strategy: detection.strategy
    });
  }
}

if (updates.length === 0) {
  logVersionSync("no version updates detected");
} else {
  for (const update of updates) {
    logVersionSync(
      `update ${update.sdkId}: ${update.from} -> ${update.to} (source=${update.docsPath}, strategy=${update.strategy})`
    );
  }
}

if (unchanged.length > 0) {
  for (const item of unchanged) {
    logVersionSync(`keep ${item.sdkId}: ${item.version} (strategy=${item.strategy})`);
  }
}

if (skipped.length > 0) {
  for (const item of skipped) {
    logVersionSync(`skip ${item}`);
  }
}

logVersionSync(
  `summary updates=${updates.length} unchanged=${unchanged.length} skipped=${skipped.length}`
);

if (strictMode && skipped.length > 0) {
  console.error("[version-sync] strict mode failed: one or more SDK sources could not be resolved.");
  process.exit(1);
}

if (checkOnly) {
  if (updates.length > 0) {
    console.error("[version-sync] version metadata is stale. Run: npm run data:versions");
    process.exit(1);
  }
  process.exit(0);
}

if (updates.length > 0) {
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  logVersionSync(`updated ${relative(projectRoot, metadataPath)}`);
}
