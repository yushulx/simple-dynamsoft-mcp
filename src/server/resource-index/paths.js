import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC_DIRS, SAMPLE_DIRS } from "./config.js";
import { getResolvedDataRoot } from "../../data/root.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..");

const dataRoot = getResolvedDataRoot();
const metadataRoot = join(dataRoot, "metadata");
const samplesRoot = join(dataRoot, "samples");
const docsRoot = join(dataRoot, "documentation");

const registryPath = join(metadataRoot, "dynamsoft_sdks.json");
const dataManifestPath = join(metadataRoot, "data-manifest.json");

const manifestCommitLookupCache = new Map();

const SAMPLE_ROOTS = {
  dbrWeb: join(samplesRoot, SAMPLE_DIRS.dbrWeb),
  dbrMobile: join(samplesRoot, SAMPLE_DIRS.dbrMobile),
  dbrPython: join(samplesRoot, SAMPLE_DIRS.dbrPython),
  dbrDotnet: join(samplesRoot, SAMPLE_DIRS.dbrDotnet),
  dbrJava: join(samplesRoot, SAMPLE_DIRS.dbrJava),
  dbrCpp: join(samplesRoot, SAMPLE_DIRS.dbrCpp),
  dbrMaui: join(samplesRoot, SAMPLE_DIRS.dbrMaui),
  dbrReactNative: join(samplesRoot, SAMPLE_DIRS.dbrReactNative),
  dbrFlutter: join(samplesRoot, SAMPLE_DIRS.dbrFlutter),
  dbrNodejs: join(samplesRoot, SAMPLE_DIRS.dbrNodejs),
  dcvWeb: join(samplesRoot, SAMPLE_DIRS.dcvWeb),
  dcvMobile: join(samplesRoot, SAMPLE_DIRS.dcvMobile),
  dcvPython: join(samplesRoot, SAMPLE_DIRS.dcvPython),
  dcvDotnet: join(samplesRoot, SAMPLE_DIRS.dcvDotnet),
  dcvJava: join(samplesRoot, SAMPLE_DIRS.dcvJava),
  dcvCpp: join(samplesRoot, SAMPLE_DIRS.dcvCpp),
  dcvMaui: join(samplesRoot, SAMPLE_DIRS.dcvMaui),
  dcvReactNative: join(samplesRoot, SAMPLE_DIRS.dcvReactNative),
  dcvFlutter: join(samplesRoot, SAMPLE_DIRS.dcvFlutter),
  dcvNodejs: join(samplesRoot, SAMPLE_DIRS.dcvNodejs),
  dcvSpm: join(samplesRoot, SAMPLE_DIRS.dcvSpm),
  dwt: join(samplesRoot, SAMPLE_DIRS.dwt),
  ddv: join(samplesRoot, SAMPLE_DIRS.ddv)
};

const DOC_ROOTS = {
  dbrWeb: join(docsRoot, DOC_DIRS.dbrWeb),
  dbrMobile: join(docsRoot, DOC_DIRS.dbrMobile),
  dbrServer: join(docsRoot, DOC_DIRS.dbrServer),
  dcvWeb: join(docsRoot, DOC_DIRS.dcvWeb),
  dcvMobile: join(docsRoot, DOC_DIRS.dcvMobile),
  dcvServer: join(docsRoot, DOC_DIRS.dcvServer),
  dcvCore: join(docsRoot, DOC_DIRS.dcvCore),
  dwt: join(docsRoot, DOC_DIRS.dwt),
  dwtArticles: join(docsRoot, DOC_DIRS.dwt, "_articles"),
  ddv: join(docsRoot, DOC_DIRS.ddv)
};

function getExistingPath(...candidates) {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeManifestRepoPath(pathValue) {
  return String(pathValue || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function getManifestRepoPath(repoPath, dataRootPath = dataRoot) {
  const resolvedDataRoot = resolve(dataRootPath);
  const resolvedRepoPath = resolve(repoPath);
  const manifestRepoPath = normalizeManifestRepoPath(
    relative(resolvedDataRoot, resolvedRepoPath)
  );

  if (!manifestRepoPath || manifestRepoPath === ".") {
    throw new Error(`Unable to resolve manifest repo path for ${repoPath}`);
  }

  if (manifestRepoPath.startsWith("..")) {
    throw new Error(
      `Repo path ${repoPath} is outside data root ${resolvedDataRoot}`
    );
  }

  return manifestRepoPath;
}

function buildManifestCommitLookup(manifestPath = dataManifestPath) {
  const resolvedManifestPath = resolve(manifestPath);
  const cachedLookup = manifestCommitLookupCache.get(resolvedManifestPath);
  if (cachedLookup) {
    return cachedLookup;
  }

  if (!existsSync(resolvedManifestPath)) {
    throw new Error(`Missing data manifest at ${resolvedManifestPath}`);
  }

  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(resolvedManifestPath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse data manifest at ${resolvedManifestPath}: ${reason}`
    );
  }

  if (!manifest || !Array.isArray(manifest.repos)) {
    throw new Error(
      `Invalid data manifest at ${resolvedManifestPath}: missing repos array`
    );
  }

  const lookup = new Map();
  for (const repo of manifest.repos) {
    const repoPath = normalizeManifestRepoPath(repo?.path);
    const commit = String(repo?.commit || "").trim();
    if (!repoPath || !commit) {
      throw new Error(
        `Invalid data manifest entry at ${resolvedManifestPath}: path and commit are required`
      );
    }
    lookup.set(repoPath, commit);
  }

  manifestCommitLookupCache.set(resolvedManifestPath, lookup);
  return lookup;
}

function readManifestRepoCommit(repoPath, options = {}) {
  const dataRootPath = options.dataRootPath || dataRoot;
  const manifestPath = options.manifestPath || dataManifestPath;
  const commitLookup =
    options.commitLookup || buildManifestCommitLookup(manifestPath);
  const manifestRepoPath = getManifestRepoPath(repoPath, dataRootPath);
  const commit = commitLookup.get(manifestRepoPath);

  if (!commit) {
    throw new Error(
      `Missing commit for ${manifestRepoPath} in data manifest ${resolve(manifestPath)}`
    );
  }

  return commit;
}

export {
  projectRoot,
  dataRoot,
  metadataRoot,
  samplesRoot,
  docsRoot,
  registryPath,
  dataManifestPath,
  SAMPLE_ROOTS,
  DOC_ROOTS,
  getExistingPath,
  buildManifestCommitLookup,
  readManifestRepoCommit
};
