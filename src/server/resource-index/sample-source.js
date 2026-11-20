import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { getRepoSourceUrl } from "./paths.js";
import {
  getDcvMobileSamplePath,
  getDcvServerSamplePath,
  getDcvWebSamplePath,
  getDbrServerSamplePath,
  getDdvSamplePath,
  getDwtSamplePath,
  getMdsWebSamplePath,
  getMobileSamplePath,
  getMrzWebSamplePath,
  getWebSamplePath
} from "./samples.js";

const SAMPLE_REF_PATTERN = /(?:src|href)\s*=\s*["']([^"']+)["']|from\s+["']([^"']+)["']|initSettingsFromFile\(\s*["']([^"']+)["']|["'](\.\.?\/[^"']+\.(?:json|css|js|xml))["']/g;

// Files a sample file references that exist inside rootDir. Absolute URLs,
// data URIs, node_modules, filesystem-absolute paths, and references that leave
// rootDir are never followed, so host files outside the sample are never read.
function findLocalSampleRefs(content, fileDir, rootDir) {
  const refs = [];
  const pattern = new RegExp(SAMPLE_REF_PATTERN.source, "g");
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const ref = match[1] || match[2] || match[3] || match[4];
    if (!ref) continue;
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:") || ref.startsWith("/") || ref.includes("node_modules")) continue;
    const resolved = join(fileDir, ref.split(/[?#]/)[0]);
    const relPath = relative(rootDir, resolved);
    if (!relPath || relPath.startsWith("..")) continue;
    try {
      if (!statSync(resolved).isFile()) continue;
    } catch {
      continue;
    }
    refs.push({ resolved, relPath });
  }
  return refs;
}

// A file-backed sample owns its folder when the folder is named for it
// (scenarios/scan-qr-code/index.html, upload/upload.html) or the file
// references siblings; the Source link then covers the folder. Standalone
// files among other samples (basics/hello-world.html) keep a file link.
function getSampleSourceUrl(samplePath, { resolveRepoUrl = getRepoSourceUrl } = {}) {
  if (!samplePath || !existsSync(samplePath)) return "";

  let target = samplePath;
  if (!statSync(samplePath).isDirectory()) {
    const folder = dirname(samplePath);
    const fileName = basename(samplePath);
    let ownsFolder = fileName === "index.html" || basename(folder) === basename(fileName, extname(fileName));
    if (!ownsFolder) {
      try {
        ownsFolder = findLocalSampleRefs(readFileSync(samplePath, "utf8"), folder, folder).length > 0;
      } catch {
        ownsFolder = false;
      }
    }
    if (ownsFolder) target = folder;
  }

  try {
    return resolveRepoUrl(target);
  } catch {
    // A missing or invalid data manifest only drops the link.
    return "";
  }
}

// Local path for a parsed sample:// URI (see uri.js parseSampleUri).
function resolveSampleUriPath(sampleInfo) {
  const { product, edition, platform, level, category, sampleName } = sampleInfo || {};
  if (product === "dbr" && edition === "mobile") return getMobileSamplePath(platform, level, sampleName);
  if (product === "dbr" && edition === "web") return getWebSamplePath(category, sampleName);
  if (product === "dbr" && (edition === "python" || edition === "server")) return getDbrServerSamplePath(platform, sampleName);
  if (["mrz", "mds", "dcv"].includes(product) && edition === "mobile") return getDcvMobileSamplePath(platform, sampleName);
  if (["mrz", "mds", "dcv"].includes(product) && edition === "server") return getDcvServerSamplePath(platform, sampleName);
  if (product === "mrz" && edition === "web") return getMrzWebSamplePath(category, sampleName);
  if (product === "mds" && edition === "web") return getMdsWebSamplePath(category, sampleName);
  if (product === "dcv" && edition === "web") return getDcvWebSamplePath(sampleName);
  if (product === "dwt") return getDwtSamplePath(category, sampleName);
  if (product === "ddv") return getDdvSamplePath(sampleName);
  return null;
}

export {
  findLocalSampleRefs,
  getSampleSourceUrl,
  resolveSampleUriPath
};
