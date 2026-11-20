import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { findLocalSampleRefs } from "../helpers/sample-refs.js";
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
  getSampleSourceUrl,
  resolveSampleUriPath
};
