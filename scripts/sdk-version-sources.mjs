import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function normalizeVersion(version) {
  const parts = String(version)
    .trim()
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isInteger(part) && part >= 0);
  if (parts.length < 2) return "";
  return parts.join(".");
}

export function detectFromPackageJson(rootDir, relativeFile = "package.json") {
  const filePath = join(rootDir, ...relativeFile.split("/"));
  if (!existsSync(filePath)) return { version: "", detail: `${relativeFile} missing` };

  try {
    const pkg = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      version: normalizeVersion(pkg?.version || ""),
      detail: `parsed ${relativeFile}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { version: "", detail: `${relativeFile} invalid JSON (${message})` };
  }
}

export const sdkVersionSources = [
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
  },
  {
    sdkId: "mrz-web",
    strategies: [{ type: "package-json", file: "data/samples/mrz-scanner-javascript/package.json" }]
  },
  {
    sdkId: "mds-web",
    strategies: [{ type: "package-json", file: "data/samples/document-scanner-javascript/package.json" }]
  }
];
