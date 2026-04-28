import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import {
  DBR_MOBILE_PLATFORM_CANDIDATES,
  DBR_SERVER_PLATFORM_CANDIDATES,
  DBR_SERVER_PREFERRED_EXTS,
  DBR_SERVER_PREFERRED_FILES,
  DCV_MOBILE_PLATFORM_CANDIDATES,
  DCV_SERVER_PLATFORM_CANDIDATES,
  DCV_SERVER_PREFERRED_EXTS,
  DCV_SERVER_PREFERRED_FILES,
  CODE_FILE_EXTENSIONS
} from "./config.js";
import { SAMPLE_ROOTS, getExistingPath } from "./paths.js";
import { normalizePlatform } from "../normalizers.js";

let cachedWebFrameworkPlatforms = null;
let cachedDbrWebFrameworkPlatforms = null;
let cachedDdvWebFrameworkPlatforms = null;
let cachedDcvWebFrameworkPlatforms = null;
let cachedMrzWebFrameworkPlatforms = null;
let cachedMdsWebFrameworkPlatforms = null;

function resetSampleDiscoveryCaches() {
  cachedWebFrameworkPlatforms = null;
  cachedDbrWebFrameworkPlatforms = null;
  cachedDdvWebFrameworkPlatforms = null;
  cachedDcvWebFrameworkPlatforms = null;
  cachedMrzWebFrameworkPlatforms = null;
  cachedMdsWebFrameworkPlatforms = null;
}

function getCodeFileExtensions() {
  return CODE_FILE_EXTENSIONS;
}

function isCodeFile(filename) {
  return getCodeFileExtensions().includes(extname(filename).toLowerCase());
}

function sortUnique(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function classifyMobileSampleLevel(sampleName) {
  return /foundational/i.test(sampleName) ? "low-level" : "high-level";
}

function getDbrWebSamplesRoot() {
  return getExistingPath(join(SAMPLE_ROOTS.dbrWeb, "web"), SAMPLE_ROOTS.dbrWeb);
}

function getDedicatedWebSamplesRoot(root) {
  return getExistingPath(join(root, "samples"), root);
}

function getDbrCrossMobileRoot(platform) {
  if (platform === "maui") return SAMPLE_ROOTS.dbrMaui;
  if (platform === "react-native") return SAMPLE_ROOTS.dbrReactNative;
  if (platform === "flutter") return SAMPLE_ROOTS.dbrFlutter;
  return null;
}

function getDcvCrossMobileRoot(platform) {
  if (platform === "maui") return SAMPLE_ROOTS.dcvMaui;
  if (platform === "react-native") return SAMPLE_ROOTS.dcvReactNative;
  if (platform === "flutter") return SAMPLE_ROOTS.dcvFlutter;
  if (platform === "spm") return SAMPLE_ROOTS.dcvSpm;
  return null;
}

function discoverCrossMobileSamples(platform) {
  const samples = { "high-level": [], "low-level": [] };
  const root = getDbrCrossMobileRoot(platform);
  if (!root || !existsSync(root)) return samples;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const level = classifyMobileSampleLevel(entry.name);
    samples[level].push(entry.name);
  }

  samples["high-level"] = sortUnique(samples["high-level"]);
  samples["low-level"] = sortUnique(samples["low-level"]);
  return samples;
}

function discoverMobileSamples(platform) {
  const normalizedPlatform = normalizePlatform(platform);
  if (["maui", "react-native", "flutter"].includes(normalizedPlatform)) {
    return discoverCrossMobileSamples(normalizedPlatform);
  }

  const samples = { "high-level": [], "low-level": [] };
  const platformPath = join(SAMPLE_ROOTS.dbrMobile, normalizedPlatform);
  if (!existsSync(platformPath)) return samples;

  const highLevelPath = join(platformPath, "BarcodeScannerAPISamples");
  if (existsSync(highLevelPath)) {
    for (const entry of readdirSync(highLevelPath, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("gradle") && !entry.name.startsWith("build")) {
        samples["high-level"].push(entry.name);
      }
    }
  }

  const lowLevelPath = join(platformPath, "FoundationalAPISamples");
  if (existsSync(lowLevelPath)) {
    for (const entry of readdirSync(lowLevelPath, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("gradle") && !entry.name.startsWith("build")) {
        samples["low-level"].push(entry.name);
      }
    }
  }

  samples["high-level"] = sortUnique(samples["high-level"]);
  samples["low-level"] = sortUnique(samples["low-level"]);
  return samples;
}

function discoverPythonSamples() {
  const samples = [];
  const pythonPath = join(SAMPLE_ROOTS.dbrPython, "Samples");
  if (!existsSync(pythonPath)) return samples;

  for (const entry of readdirSync(pythonPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".py")) {
      samples.push(entry.name.replace(".py", ""));
    }
  }

  return sortUnique(samples);
}

function getDbrServerSamplesRoot(platform) {
  if (platform === "python") return SAMPLE_ROOTS.dbrPython;
  if (platform === "dotnet") return SAMPLE_ROOTS.dbrDotnet;
  if (platform === "java") return SAMPLE_ROOTS.dbrJava;
  if (platform === "cpp") return SAMPLE_ROOTS.dbrCpp;
  if (platform === "nodejs") return SAMPLE_ROOTS.dbrNodejs;
  return null;
}

function discoverDirectoryNames(path) {
  if (!path || !existsSync(path)) return [];
  const names = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    names.push(entry.name);
  }
  return sortUnique(names);
}

function discoverDirectoryNamesWithFilter(path, matcher) {
  return discoverDirectoryNames(path).filter((name) => matcher(name));
}

function isDcvScenarioSampleName(sampleName) {
  return /scan|scanner|mrz|driver|license|document|gs1/i.test(sampleName || "");
}

function discoverDbrServerSamples(platform) {
  const normalizedPlatform = normalizePlatform(platform);
  if (normalizedPlatform === "python") return discoverPythonSamples();
  if (normalizedPlatform === "nodejs") return discoverDirectoryNames(getDbrServerSamplesRoot("nodejs"));
  if (["dotnet", "java", "cpp"].includes(normalizedPlatform)) {
    const root = getDbrServerSamplesRoot(normalizedPlatform);
    return discoverDirectoryNames(join(root || "", "Samples"));
  }
  return [];
}

function getDbrMobilePlatforms() {
  const available = [];
  for (const platform of DBR_MOBILE_PLATFORM_CANDIDATES) {
    const samples = discoverMobileSamples(platform);
    if (samples["high-level"].length > 0 || samples["low-level"].length > 0) available.push(platform);
  }
  return available;
}

function getDbrServerPlatforms() {
  return DBR_SERVER_PLATFORM_CANDIDATES.filter((platform) => discoverDbrServerSamples(platform).length > 0);
}

function discoverDcvCrossMobileSamples(platform) {
  const root = getDcvCrossMobileRoot(platform);
  if (!root || !existsSync(root)) return [];
  if (platform === "spm") {
    return existsSync(join(root, "Package.swift")) ? ["package-swift"] : [];
  }

  return discoverDirectoryNamesWithFilter(root, (name) => isDcvScenarioSampleName(name));
}

function discoverDcvMobileSamples(platform) {
  const normalizedPlatform = normalizePlatform(platform);

  if (["maui", "react-native", "flutter", "spm"].includes(normalizedPlatform)) {
    return discoverDcvCrossMobileSamples(normalizedPlatform);
  }

  if (normalizedPlatform === "android") {
    return discoverDirectoryNamesWithFilter(join(SAMPLE_ROOTS.dcvMobile, "Android"), (name) => isDcvScenarioSampleName(name));
  }

  if (normalizedPlatform === "ios") {
    return discoverDirectoryNamesWithFilter(join(SAMPLE_ROOTS.dcvMobile, "ios"), (name) => isDcvScenarioSampleName(name));
  }

  return [];
}

function discoverDcvPythonSamples() {
  const samples = [];
  const pythonPath = join(SAMPLE_ROOTS.dcvPython, "Samples");
  if (!existsSync(pythonPath)) return samples;

  for (const entry of readdirSync(pythonPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".py")) {
      samples.push(entry.name.replace(".py", ""));
    }
  }
  return sortUnique(samples);
}

function getDcvServerSamplesRoot(platform) {
  if (platform === "python") return SAMPLE_ROOTS.dcvPython;
  if (platform === "dotnet") return SAMPLE_ROOTS.dcvDotnet;
  if (platform === "java") return SAMPLE_ROOTS.dcvJava;
  if (platform === "cpp") return SAMPLE_ROOTS.dcvCpp;
  if (platform === "nodejs") return SAMPLE_ROOTS.dcvNodejs;
  return null;
}

function discoverDcvServerSamples(platform) {
  const normalizedPlatform = normalizePlatform(platform);
  if (normalizedPlatform === "python") return discoverDcvPythonSamples();
  if (normalizedPlatform === "nodejs") return discoverDirectoryNames(getDcvServerSamplesRoot("nodejs"));

  if (["dotnet", "java", "cpp"].includes(normalizedPlatform)) {
    const root = getDcvServerSamplesRoot(normalizedPlatform);
    return discoverDirectoryNames(join(root || "", "Samples"));
  }
  return [];
}

function getDcvMobilePlatforms() {
  return DCV_MOBILE_PLATFORM_CANDIDATES.filter((platform) => discoverDcvMobileSamples(platform).length > 0);
}

function getDcvServerPlatforms() {
  return DCV_SERVER_PLATFORM_CANDIDATES.filter((platform) => discoverDcvServerSamples(platform).length > 0);
}

function discoverDcvWebSamples() {
  return [];
}

function getDcvWebFrameworkPlatforms() {
  if (cachedDcvWebFrameworkPlatforms) return cachedDcvWebFrameworkPlatforms;
  // Current DCV web samples are plain JS scenario samples.
  cachedDcvWebFrameworkPlatforms = [];
  return cachedDcvWebFrameworkPlatforms;
}

function discoverWebSamples() {
  const categories = { root: [], frameworks: [], scenarios: [] };
  const webPath = getDbrWebSamplesRoot();
  if (!webPath || !existsSync(webPath)) return categories;

  for (const entry of readdirSync(webPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      categories.root.push(entry.name.replace(".html", ""));
    }
  }

  for (const subdir of ["frameworks", "scenarios"]) {
    const subdirPath = join(webPath, subdir);
    if (!existsSync(subdirPath)) continue;
    for (const entry of readdirSync(subdirPath, { withFileTypes: true })) {
      if (entry.isDirectory()) categories[subdir].push(entry.name);
      else if (entry.isFile() && entry.name.endsWith(".html")) categories[subdir].push(entry.name.replace(".html", ""));
    }
  }

  for (const [key, value] of Object.entries(categories)) {
    if (value.length === 0) delete categories[key];
  }

  return categories;
}

function discoverDedicatedWebSamples(root) {
  const categories = { root: [] };
  const webPath = getDedicatedWebSamplesRoot(root);
  if (!webPath || !existsSync(webPath)) return categories;

  for (const entry of readdirSync(webPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isFile() && entry.name.endsWith(".html")) {
      if (entry.name !== "index.html") {
        categories.root.push(entry.name.replace(".html", ""));
      }
      continue;
    }

    if (!entry.isDirectory()) continue;

    const categoryPath = join(webPath, entry.name);

    if (entry.name === "frameworks" || entry.name === "scenarios") {
      const categorySamples = [];
      for (const child of readdirSync(categoryPath, { withFileTypes: true })) {
        if (child.name.startsWith(".")) continue;
        if (child.isDirectory()) categorySamples.push(child.name);
        else if (child.isFile() && child.name.endsWith(".html") && child.name !== "index.html") {
          categorySamples.push(child.name.replace(".html", ""));
        }
      }

      categories[entry.name] = sortUnique(categorySamples);
      continue;
    }

    if (existsSync(join(categoryPath, "index.html")) || existsSync(join(categoryPath, "README.md"))) {
      categories.root.push(entry.name);
      continue;
    }

    const categorySamples = [];
    for (const child of readdirSync(categoryPath, { withFileTypes: true })) {
      if (child.name.startsWith(".")) continue;
      if (child.isDirectory()) categorySamples.push(child.name);
      else if (child.isFile() && child.name.endsWith(".html") && child.name !== "index.html") {
        categorySamples.push(child.name.replace(".html", ""));
      }
    }

    categories[entry.name] = sortUnique(categorySamples);
  }

  for (const [key, value] of Object.entries(categories)) {
    if (value.length === 0) delete categories[key];
  }

  return categories;
}

function getWebSamplePath(category, sampleName) {
  const webPath = getDbrWebSamplesRoot();
  if (!webPath || !existsSync(webPath)) return null;

  if (category === "root" || !category) {
    const htmlPath = join(webPath, `${sampleName}.html`);
    if (existsSync(htmlPath)) return htmlPath;
  } else {
    const dirPath = join(webPath, category, sampleName);
    if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
      const indexPath = join(dirPath, "index.html");
      if (existsSync(indexPath)) return indexPath;
      for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".html")) return join(dirPath, entry.name);
      }
    }
    const htmlPath = join(webPath, category, `${sampleName}.html`);
    if (existsSync(htmlPath)) return htmlPath;
  }

  const rootPath = join(webPath, `${sampleName}.html`);
  if (existsSync(rootPath)) return rootPath;
  return null;
}

function getDedicatedWebSamplePath(root, category, sampleName) {
  const webPath = getDedicatedWebSamplesRoot(root);
  if (!webPath || !existsSync(webPath)) return null;

  if (category === "root" || !category) {
    const htmlPath = join(webPath, `${sampleName}.html`);
    if (existsSync(htmlPath)) return htmlPath;

    const dirPath = join(webPath, sampleName);
    if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
      const indexPath = join(dirPath, "index.html");
      if (existsSync(indexPath)) return indexPath;
      const readmePath = join(dirPath, "README.md");
      if (existsSync(readmePath)) return readmePath;
      return dirPath;
    }

    return null;
  }

  const dirPath = join(webPath, category, sampleName);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    return dirPath;
  }

  const htmlPath = join(webPath, category, `${sampleName}.html`);
  if (existsSync(htmlPath)) return htmlPath;
  return null;
}

function discoverMrzWebSamples() {
  return discoverDedicatedWebSamples(SAMPLE_ROOTS.mrzWeb);
}

function discoverMdsWebSamples() {
  return discoverDedicatedWebSamples(SAMPLE_ROOTS.mdsWeb);
}

function discoverDwtSamples() {
  const categories = {};
  if (!existsSync(SAMPLE_ROOTS.dwt)) return categories;

  for (const entry of readdirSync(SAMPLE_ROOTS.dwt, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const categoryPath = join(SAMPLE_ROOTS.dwt, entry.name);
    const samples = [];

    function findHtmlFiles(dir) {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (item.isFile() && item.name.endsWith(".html")) {
          samples.push(item.name.replace(".html", ""));
        } else if (item.isDirectory() && !item.name.startsWith(".")) {
          findHtmlFiles(join(dir, item.name));
        }
      }
    }

    findHtmlFiles(categoryPath);
    if (samples.length > 0) categories[entry.name] = samples;
  }

  return categories;
}

function discoverDdvSamples() {
  const sampleSet = new Set();
  if (!existsSync(SAMPLE_ROOTS.ddv)) return [];

  for (const entry of readdirSync(SAMPLE_ROOTS.ddv, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) sampleSet.add(entry.name.replace(".html", ""));
    else if (entry.isDirectory() && !entry.name.startsWith(".")) sampleSet.add(entry.name);
  }
  return Array.from(sampleSet).sort();
}

function mapDdvSampleToFramework(sampleName) {
  if (!sampleName) return "";
  const normalized = sampleName.trim().toLowerCase();
  if (normalized === "react-vite" || normalized === "react") return "react";
  if (normalized === "vue") return "vue";
  if (normalized === "angular") return "angular";
  if (normalized === "next") return "next";
  return "";
}

function getDbrWebFrameworkPlatforms() {
  if (cachedDbrWebFrameworkPlatforms) return cachedDbrWebFrameworkPlatforms;
  const webSamples = discoverWebSamples();
  const frameworks = new Set();
  if (webSamples.frameworks) {
    for (const name of webSamples.frameworks) {
      const normalized = normalizePlatform(name);
      if (normalized && normalized !== "web") frameworks.add(normalized);
    }
  }
  cachedDbrWebFrameworkPlatforms = Array.from(frameworks).sort();
  return cachedDbrWebFrameworkPlatforms;
}

function getDdvWebFrameworkPlatforms() {
  if (cachedDdvWebFrameworkPlatforms) return cachedDdvWebFrameworkPlatforms;
  const frameworks = new Set();
  for (const sampleName of discoverDdvSamples()) {
    const framework = mapDdvSampleToFramework(sampleName);
    if (framework) frameworks.add(framework);
  }
  cachedDdvWebFrameworkPlatforms = Array.from(frameworks).sort();
  return cachedDdvWebFrameworkPlatforms;
}

function getMrzWebFrameworkPlatforms() {
  if (cachedMrzWebFrameworkPlatforms) return cachedMrzWebFrameworkPlatforms;
  const frameworks = new Set();
  const webSamples = discoverMrzWebSamples();
  if (webSamples.frameworks) {
    for (const name of webSamples.frameworks) {
      const normalized = normalizePlatform(name);
      if (normalized && normalized !== "web") frameworks.add(normalized);
    }
  }
  cachedMrzWebFrameworkPlatforms = Array.from(frameworks).sort();
  return cachedMrzWebFrameworkPlatforms;
}

function getMdsWebFrameworkPlatforms() {
  if (cachedMdsWebFrameworkPlatforms) return cachedMdsWebFrameworkPlatforms;
  const frameworks = new Set();
  const webSamples = discoverMdsWebSamples();
  if (webSamples.frameworks) {
    for (const name of webSamples.frameworks) {
      const normalized = normalizePlatform(name);
      if (normalized && normalized !== "web") frameworks.add(normalized);
    }
  }
  cachedMdsWebFrameworkPlatforms = Array.from(frameworks).sort();
  return cachedMdsWebFrameworkPlatforms;
}

function getWebFrameworkPlatforms() {
  if (cachedWebFrameworkPlatforms) return cachedWebFrameworkPlatforms;
  const frameworks = new Set([
    ...getDbrWebFrameworkPlatforms(),
    ...getDdvWebFrameworkPlatforms(),
    ...getDcvWebFrameworkPlatforms(),
    ...getMrzWebFrameworkPlatforms(),
    ...getMdsWebFrameworkPlatforms()
  ]);
  cachedWebFrameworkPlatforms = frameworks;
  return cachedWebFrameworkPlatforms;
}

function findCodeFilesInSample(samplePath, maxDepth = 15) {
  const codeFiles = [];

  function walk(dir, depth) {
    if (depth > maxDepth || !existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["build", "gradle", ".gradle", ".idea", "node_modules", "Pods", "DerivedData", ".git", "__pycache__"].includes(entry.name)) {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile() && isCodeFile(entry.name)) {
        codeFiles.push({
          path: fullPath,
          relativePath: relative(samplePath, fullPath),
          filename: entry.name,
          extension: extname(entry.name).toLowerCase()
        });
      }
    }
  }

  walk(samplePath, 0);
  return codeFiles;
}

function getMobileSamplePath(platform, apiLevel, sampleName) {
  const normalizedPlatform = normalizePlatform(platform);
  if (["maui", "react-native", "flutter"].includes(normalizedPlatform)) {
    const root = getDbrCrossMobileRoot(normalizedPlatform);
    const direct = root ? join(root, sampleName) : "";
    return getExistingPath(direct) || direct;
  }

  const levelFolder = apiLevel === "high-level" ? "BarcodeScannerAPISamples" : "FoundationalAPISamples";
  const primary = join(SAMPLE_ROOTS.dbrMobile, normalizedPlatform, levelFolder, sampleName);
  return getExistingPath(primary) || primary;
}

function getPythonSamplePath(sampleName) {
  const fileName = sampleName.endsWith(".py") ? sampleName : `${sampleName}.py`;
  const primary = join(SAMPLE_ROOTS.dbrPython, "Samples", fileName);
  return getExistingPath(primary) || primary;
}

function getDbrServerSamplePath(platform, sampleName) {
  const normalizedPlatform = normalizePlatform(platform) || "python";
  if (normalizedPlatform === "python") return getPythonSamplePath(sampleName);

  if (normalizedPlatform === "nodejs") {
    const root = getDbrServerSamplesRoot("nodejs");
    if (!root) return "";
    const direct = join(root, sampleName);
    const js = join(root, `${sampleName}.js`);
    const mjs = join(root, `${sampleName}.mjs`);
    return getExistingPath(direct, js, mjs) || direct;
  }

  if (["dotnet", "java", "cpp"].includes(normalizedPlatform)) {
    const root = getDbrServerSamplesRoot(normalizedPlatform);
    if (!root) return "";
    const direct = join(root, "Samples", sampleName);
    return getExistingPath(direct) || direct;
  }

  return "";
}

function getDwtSamplePath(category, sampleName) {
  const fileName = sampleName.endsWith(".html") ? sampleName : `${sampleName}.html`;
  const categoryPath = getExistingPath(join(SAMPLE_ROOTS.dwt, category));
  if (!categoryPath) return null;

  function findFile(dir) {
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name === fileName) return join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFile(join(dir, entry.name));
        if (found) return found;
      }
    }
    return null;
  }

  return findFile(categoryPath);
}

function getDdvSamplePath(sampleName) {
  if (!existsSync(SAMPLE_ROOTS.ddv)) return null;
  let path = join(SAMPLE_ROOTS.ddv, `${sampleName}.html`);
  if (existsSync(path)) return path;
  path = join(SAMPLE_ROOTS.ddv, sampleName);
  if (existsSync(path) && statSync(path).isDirectory()) return path;
  return null;
}

function getDcvMobileSamplePath(platform, sampleName) {
  const normalizedPlatform = normalizePlatform(platform);

  if (["maui", "react-native", "flutter"].includes(normalizedPlatform)) {
    const root = getDcvCrossMobileRoot(normalizedPlatform);
    const direct = root ? join(root, sampleName) : "";
    return getExistingPath(direct) || direct;
  }

  if (normalizedPlatform === "spm") {
    const root = getDcvCrossMobileRoot("spm");
    if (!root) return "";
    const packageFile = join(root, "Package.swift");
    const readmeFile = join(root, "README.md");
    if (sampleName === "package-swift") return getExistingPath(packageFile, readmeFile) || packageFile;
    const direct = join(root, sampleName);
    return getExistingPath(direct, packageFile, readmeFile) || direct;
  }

  if (normalizedPlatform === "android") {
    const direct = join(SAMPLE_ROOTS.dcvMobile, "Android", sampleName);
    return getExistingPath(direct) || direct;
  }

  if (normalizedPlatform === "ios") {
    const direct = join(SAMPLE_ROOTS.dcvMobile, "ios", sampleName);
    return getExistingPath(direct) || direct;
  }

  return "";
}

function getDcvServerSamplePath(platform, sampleName) {
  const normalizedPlatform = normalizePlatform(platform) || "python";

  if (normalizedPlatform === "python") {
    const fileName = sampleName.endsWith(".py") ? sampleName : `${sampleName}.py`;
    const primary = join(SAMPLE_ROOTS.dcvPython, "Samples", fileName);
    return getExistingPath(primary) || primary;
  }

  if (normalizedPlatform === "nodejs") {
    const root = getDcvServerSamplesRoot("nodejs");
    if (!root) return "";
    const direct = join(root, sampleName);
    const js = join(root, `${sampleName}.js`);
    const mjs = join(root, `${sampleName}.mjs`);
    return getExistingPath(direct, js, mjs) || direct;
  }

  if (["dotnet", "java", "cpp"].includes(normalizedPlatform)) {
    const root = getDcvServerSamplesRoot(normalizedPlatform);
    if (!root) return "";
    const direct = join(root, "Samples", sampleName);
    return getExistingPath(direct) || direct;
  }

  return "";
}

function getDcvWebSamplePath(sampleName) {
  return null;
}

function getMrzWebSamplePath(category, sampleName) {
  return getDedicatedWebSamplePath(SAMPLE_ROOTS.mrzWeb, category, sampleName);
}

function getMdsWebSamplePath(category, sampleName) {
  return getDedicatedWebSamplePath(SAMPLE_ROOTS.mdsWeb, category, sampleName);
}

function readCodeFile(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf8");
}

function getMainCodeFile(platform, samplePath) {
  const codeFiles = findCodeFilesInSample(samplePath);
  const mainPatterns = platform === "android"
    ? ["MainActivity.java", "MainActivity.kt", "HomeActivity.java", "CaptureActivity.java"]
    : ["ViewController.swift", "CameraViewController.swift", "ContentView.swift"];

  for (const pattern of mainPatterns) {
    const found = codeFiles.find((file) => file.filename === pattern);
    if (found) return found;
  }
  return codeFiles[0];
}

function getMimeTypeForExtension(ext) {
  const normalized = ext.replace(/^\./, "").toLowerCase();
  if (normalized === "cs") return "text/x-csharp";
  if (["cpp", "cc", "cxx"].includes(normalized)) return "text/x-c++src";
  if (["hpp", "hxx"].includes(normalized)) return "text/x-c++hdr";
  if (normalized === "swift") return "text/x-swift";
  if (normalized === "kt") return "text/x-kotlin";
  if (normalized === "java") return "text/x-java";
  if (normalized === "py") return "text/x-python";
  if (normalized === "dart") return "text/x-dart";
  if (normalized === "jsx") return "text/jsx";
  if (normalized === "tsx") return "text/tsx";
  if (normalized === "vue") return "text/x-vue";
  if (normalized === "cjs" || normalized === "mjs") return "text/javascript";
  if (normalized === "html") return "text/html";
  if (normalized === "md" || normalized === "markdown") return "text/markdown";
  if (normalized === "json") return "application/json";
  if (normalized === "png") return "image/png";
  return "text/plain";
}

function getDbrServerSampleContent(platform, sampleName) {
  const samplePath = getDbrServerSamplePath(platform, sampleName);
  if (!samplePath || !existsSync(samplePath)) return { text: "Sample not found", mimeType: "text/plain" };

  const stat = statSync(samplePath);
  if (stat.isFile()) {
    const ext = extname(samplePath).replace(".", "");
    return { text: readCodeFile(samplePath), mimeType: getMimeTypeForExtension(ext) };
  }

  const preferredFiles = DBR_SERVER_PREFERRED_FILES[platform] || [];
  for (const name of preferredFiles) {
    const candidate = join(samplePath, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const ext = extname(candidate).replace(".", "");
      return { text: readCodeFile(candidate), mimeType: getMimeTypeForExtension(ext) };
    }
  }

  const readmePath = join(samplePath, "README.md");
  if (existsSync(readmePath)) return { text: readCodeFile(readmePath), mimeType: "text/markdown" };

  const codeFiles = findCodeFilesInSample(samplePath);
  if (codeFiles.length > 0) {
    const preferredExts = DBR_SERVER_PREFERRED_EXTS[platform] || [];
    const preferred = codeFiles.find((file) => preferredExts.includes(file.extension)) || codeFiles[0];
    return { text: readCodeFile(preferred.path), mimeType: getMimeTypeForExtension(preferred.extension) };
  }

  const files = readdirSync(samplePath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  return {
    text: files.length > 0 ? files.join("\n") : "Sample found, but no code files detected.",
    mimeType: "text/plain"
  };
}

function getDcvServerSampleContent(platform, sampleName) {
  const samplePath = getDcvServerSamplePath(platform, sampleName);
  if (!samplePath || !existsSync(samplePath)) return { text: "Sample not found", mimeType: "text/plain" };

  const stat = statSync(samplePath);
  if (stat.isFile()) {
    const ext = extname(samplePath).replace(".", "");
    return { text: readCodeFile(samplePath), mimeType: getMimeTypeForExtension(ext) };
  }

  const normalizedPlatform = normalizePlatform(platform);
  const preferredFiles = DCV_SERVER_PREFERRED_FILES[normalizedPlatform] || [];
  for (const name of preferredFiles) {
    const candidate = join(samplePath, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const ext = extname(candidate).replace(".", "");
      return { text: readCodeFile(candidate), mimeType: getMimeTypeForExtension(ext) };
    }
  }

  const readmePath = join(samplePath, "README.md");
  if (existsSync(readmePath)) return { text: readCodeFile(readmePath), mimeType: "text/markdown" };

  const codeFiles = findCodeFilesInSample(samplePath);
  if (codeFiles.length > 0) {
    const preferredExts = DCV_SERVER_PREFERRED_EXTS[normalizedPlatform] || [];
    const preferred = codeFiles.find((file) => preferredExts.includes(file.extension)) || codeFiles[0];
    return { text: readCodeFile(preferred.path), mimeType: getMimeTypeForExtension(preferred.extension) };
  }

  const files = readdirSync(samplePath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  return {
    text: files.length > 0 ? files.join("\n") : "Sample found, but no code files detected.",
    mimeType: "text/plain"
  };
}

export {
  getCodeFileExtensions,
  isCodeFile,
  discoverMobileSamples,
  discoverDbrServerSamples,
  discoverPythonSamples,
  discoverDcvMobileSamples,
  discoverDcvServerSamples,
  discoverDcvWebSamples,
  discoverWebSamples,
  discoverMrzWebSamples,
  discoverMdsWebSamples,
  getWebSamplePath,
  discoverDwtSamples,
  discoverDdvSamples,
  mapDdvSampleToFramework,
  getDbrWebFrameworkPlatforms,
  getDcvWebFrameworkPlatforms,
  getDdvWebFrameworkPlatforms,
  getMrzWebFrameworkPlatforms,
  getMdsWebFrameworkPlatforms,
  getWebFrameworkPlatforms,
  findCodeFilesInSample,
  getDbrMobilePlatforms,
  getDbrServerPlatforms,
  getDcvMobilePlatforms,
  getDcvServerPlatforms,
  getMobileSamplePath,
  getPythonSamplePath,
  getDbrServerSamplePath,
  getDcvMobileSamplePath,
  getDcvServerSamplePath,
  getDcvWebSamplePath,
  getMrzWebSamplePath,
  getMdsWebSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  readCodeFile,
  getMainCodeFile,
  getMimeTypeForExtension,
  getDbrServerSampleContent,
  getDcvServerSampleContent,
  resetSampleDiscoveryCaches
};
