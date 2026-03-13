const sdkAliases = {
  // DCV
  "dcv": "dcv-mobile",
  "dcv-mobile": "dcv-mobile",
  "dcv-server": "dcv-server",
  "dcv-web": "dcv-web",
  "capture vision": "dcv-mobile",
  "capture-vision": "dcv-mobile",
  "dynamsoft capture vision": "dcv-mobile",
  "mrz scanner": "dcv-mobile",
  "vin scanner": "dcv-mobile",
  "driver license scanner": "dcv-mobile",
  "document normalization": "dcv-mobile",
  "document normalizer": "dcv-mobile",
  // DDV
  "ddv": "ddv",
  "document-viewer": "ddv",
  "document viewer": "ddv",
  "pdf viewer": "ddv",
  "edit viewer": "ddv",
  // DBR Mobile
  "dbr": "dbr-mobile",
  "dbr-mobile": "dbr-mobile",
  "barcode-reader": "dbr-mobile",
  "barcode reader": "dbr-mobile",
  "barcode reader mobile": "dbr-mobile",
  "mobile barcode": "dbr-mobile",
  // DBR Server/Desktop
  "dbr-server": "dbr-server",
  "python barcode": "dbr-server",
  "barcode python": "dbr-server",
  "barcode reader python": "dbr-server",
  "server barcode": "dbr-server",
  "desktop barcode": "dbr-server",
  // DBR Web
  "dbr-web": "dbr-web",
  "web barcode": "dbr-web",
  "barcode web": "dbr-web",
  "javascript barcode": "dbr-web",
  "barcode javascript": "dbr-web",
  "barcode js": "dbr-web",
  // Dynamic Web TWAIN
  "dwt": "dwt",
  "web twain": "dwt",
  "webtwain": "dwt",
  "dynamic web twain": "dwt",
  "twain": "dwt",
  // MDS
  "mds": "mds",
  "mobile document scanner": "mds",
  "dynamsoft mobile document scanner": "mds"
};

const platformAliases = {
  // Mobile platforms
  rn: "react-native",
  reactnative: "react-native",
  "react native": "react-native",
  "react-native": "react-native",
  ios: "ios",
  swift: "ios",
  objc: "ios",
  "objective-c": "ios",
  android: "android",
  kotlin: "android",
  flutter: "flutter",
  dart: "flutter",
  maui: "maui",
  "dotnet maui": "maui",
  ".net maui": "maui",
  spm: "spm",
  "swift package manager": "spm",
  "swiftpm": "spm",
  // Desktop/Server
  python: "python",
  py: "python",
  cpp: "cpp",
  "c++": "cpp",
  cplusplus: "cpp",
  java: "java",
  dotnet: "dotnet",
  ".net": "dotnet",
  "c#": "dotnet",
  csharp: "dotnet",
  node: "nodejs",
  nodejs: "nodejs",
  "node.js": "nodejs",
  // Web
  web: "web",
  javascript: "web",
  js: "web",
  typescript: "web",
  ts: "web",
  // Web frameworks (from sample repositories)
  angular: "angular",
  angularjs: "angular",
  react: "react",
  reactjs: "react",
  "react.js": "react",
  "react-vite": "react",
  vue: "vue",
  vuejs: "vue",
  next: "next",
  nextjs: "next",
  nuxt: "nuxt",
  nuxtjs: "nuxt",
  svelte: "svelte",
  blazor: "blazor",
  capacitor: "capacitor",
  electron: "electron",
  es6: "es6",
  "native-ts": "native-ts",
  pwa: "pwa",
  requirejs: "requirejs",
  webview: "webview"
};

const SERVER_PLATFORMS = new Set(["python", "cpp", "java", "dotnet", "nodejs"]);
const WEB_FRAMEWORK_TAG_ALIASES = {
  react: ["react", "react-vite"]
};

const languageAliases = {
  kt: "kotlin",
  kotlin: "kotlin",
  java: "java",
  swift: "swift",
  objc: "objective-c",
  "objective-c": "objective-c",
  py: "python",
  python: "python",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript"
};

const sampleAliases = {
  // Mobile samples
  "scan single": "ScanSingleBarcode",
  "single barcode": "ScanSingleBarcode",
  "scan multiple": "ScanMultipleBarcodes",
  "multiple barcodes": "ScanMultipleBarcodes",
  "camera enhancer": "DecodeWithCameraEnhancer",
  "dce": "DecodeWithCameraEnhancer",
  "camerax": "DecodeWithCameraX",
  "decode image": "DecodeFromAnImage",
  "from image": "DecodeFromAnImage",
  "driver license": "DriversLicenseScanner",
  "general settings": "GeneralSettings",
  "tiny barcode": "TinyBarcodeDecoding",
  "gs1": "ReadGS1AI",
  "locate item": "LocateAnItemWithBarcode",
  // Python samples
  "read image": "read_an_image",
  "video decoding": "video_decoding",
  "video": "video_decoding",
  // DWT samples
  "basic scan": "basic-scan",
  "scan": "basic-scan",
  "read barcode": "read-barcode",
  "load local": "load-from-local-drive",
  "save": "save",
  "upload": "upload"
};

const dcvFeatureTerms = [
  "capture vision",
  "mrz",
  "machine readable zone",
  "vin",
  "vehicle identification",
  "driver license",
  "drivers license",
  "id card",
  "passport",
  "document normalization",
  "document normalizer",
  "document scanner",
  "document scanning",
  "document scan",
  "auto capture",
  "auto-capture",
  "cropping",
  "crop"
];

const dwtFeatureTerms = ["dwt", "web twain", "webtwain", "twain", "wia", "ica", "sane"];

let webFrameworkPlatformsGetter = null;

function getWebFrameworkPlatformsInternal() {
  if (typeof webFrameworkPlatformsGetter !== "function") {
    return new Set();
  }
  const value = webFrameworkPlatformsGetter();
  if (!value) return new Set();
  return value instanceof Set ? value : new Set(value);
}

function setWebFrameworkPlatformsGetter(getter) {
  webFrameworkPlatformsGetter = getter;
}

function normalizeSdkId(sdk) {
  if (!sdk) return "";
  const normalized = sdk.trim().toLowerCase();
  return sdkAliases[normalized] || normalized;
}

function normalizePlatform(platform) {
  if (!platform) return "";
  const normalized = platform.trim().toLowerCase();
  return platformAliases[normalized] || normalized;
}

function normalizeLanguage(lang) {
  if (!lang) return "";
  const normalized = lang.trim().toLowerCase();
  return languageAliases[normalized] || normalized;
}

function normalizeApiLevel(level) {
  if (!level) return "high-level";
  const normalized = level.trim().toLowerCase();
  if (["low", "foundation", "foundational", "base", "manual", "core", "advanced", "custom", "template", "capturevision", "cvr"].some((word) => normalized.includes(word))) {
    return "low-level";
  }
  return "high-level";
}

function normalizeSampleName(name) {
  if (!name) return "";
  const normalized = name.trim().toLowerCase();
  return sampleAliases[normalized] || name;
}

function normalizeProduct(product) {
  if (!product) return "";
  const normalized = product.trim().toLowerCase();
  if (
    [
      "dcv",
      "capture vision",
      "capture-vision",
      "dynamsoft capture vision",
      "dynamsoft capture vision sdk",
      "capture vision bundle",
      "mrz scanner",
      "vin scanner",
      "driver license scanner",
      "document normalizer",
      "document normalization"
    ].includes(normalized)
  ) {
    return "dcv";
  }
  if (["mds", "mobile document scanner", "dynamsoft mobile document scanner"].includes(normalized)) {
    return "mds";
  }
  if (["ddv", "document viewer", "document-viewer", "dynamsoft document viewer", "doc viewer", "pdf viewer", "edit viewer"].includes(normalized)) {
    return "ddv";
  }
  if (["dbr", "barcode reader", "barcode-reader", "dynamsoft barcode reader"].includes(normalized)) {
    return "dbr";
  }
  if (["dwt", "dynamic web twain", "web twain", "webtwain"].includes(normalized)) {
    return "dwt";
  }
  return normalized;
}

function normalizeEdition(edition, platform, product) {
  if (product === "dwt" || product === "ddv") return "web";
  const normalizedPlatform = normalizePlatform(platform);

  if (!edition) {
    if (product === "dcv" && normalizedPlatform === "core") return "core";
    if (["android", "ios", "maui", "react-native", "flutter", "spm"].includes(normalizedPlatform)) return "mobile";
    if (isWebPlatform(normalizedPlatform)) return "web";
    if (isServerPlatform(normalizedPlatform)) return "server";
    return "";
  }

  const normalized = edition.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  if (["mobile", "android", "ios", "maui", "react-native", "react native", "flutter", "spm"].includes(normalized)) return "mobile";
  if (["web", "javascript", "js", "typescript", "ts"].includes(normalized)) return "web";
  if (normalized === "core") return "core";
  if (["server", "desktop", "server/desktop", "server-desktop", "serverdesktop"].includes(normalized) || compact === "serverdesktop") return "server";
  if (["python", "py", "java", "c++", "cpp", "dotnet", ".net", "c#", "csharp", "node", "nodejs", "node.js"].includes(normalized)) return "server";
  return normalized;
}

function isServerPlatform(platform) {
  return SERVER_PLATFORMS.has(platform);
}

function isWebFrameworkPlatform(platform) {
  return getWebFrameworkPlatformsInternal().has(platform);
}

function isWebPlatform(platform) {
  return platform === "web" || isWebFrameworkPlatform(platform);
}

function inferProductFromQuery(query) {
  if (!query) return "";
  const normalized = query.toLowerCase();
  if (
    normalized.includes("dynamsoft mobile document scanner") ||
    normalized.includes("mobile document scanner") ||
    /(^|\W)mds(\W|$)/.test(normalized)
  ) return "mds";
  const isDwtQuery = dwtFeatureTerms.some((term) => normalized.includes(term));
  if (isDwtQuery) return "dwt";
  const isDcvQuery = dcvFeatureTerms.some((term) => normalized.includes(term));
  if (isDcvQuery) return "dcv";
  if (normalized.includes("ddv") || normalized.includes("document viewer") || normalized.includes("pdf viewer") || normalized.includes("edit viewer")) {
    return "ddv";
  }
  if (normalized.includes("dcv") || normalized.includes("capture vision") || normalized.includes("capture-vision")) {
    return "dcv";
  }
  if (normalized.includes("dbr") || normalized.includes("barcode reader") || normalized.includes("barcode")) {
    return "dbr";
  }
  return "";
}

export {
  sdkAliases,
  platformAliases,
  languageAliases,
  sampleAliases,
  SERVER_PLATFORMS,
  WEB_FRAMEWORK_TAG_ALIASES,
  setWebFrameworkPlatformsGetter,
  normalizeSdkId,
  normalizePlatform,
  normalizeLanguage,
  normalizeApiLevel,
  normalizeSampleName,
  normalizeProduct,
  normalizeEdition,
  isServerPlatform,
  isWebFrameworkPlatform,
  isWebPlatform,
  inferProductFromQuery
};
