import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { DDV_PREFERRED_ENTRY_FILES } from "./config.js";
import { PUBLIC_OFFERING_PRODUCTS } from "../public-offerings.js";

const MRZ_MATCHER = /(?:\bmrz\b|machine[-\s]?readable[-\s]?zone|passport)/i;
const MDS_MATCHER = /(?:document[-\s]scan|document scanner|document scanning|document normalizer|document normalization|normaliz|auto[-\s]?capture|crop|cropping|deskew)/i;
const WEB_FRAMEWORK_PLATFORMS = new Set(["react", "vue", "angular", "next", "nuxt", "svelte", "blazor", "capacitor", "electron", "es6", "native-ts", "pwa", "requirejs", "webview"]);

function normalizeFrameworkTag(tag) {
  const normalized = String(tag || "").trim().toLowerCase();
  if (normalized === "react-hooks" || normalized === "react-vite") return "react";
  return normalized;
}

function countSamples(sampleData) {
  if (Array.isArray(sampleData)) {
    return sampleData.length;
  }

  if (sampleData && typeof sampleData === "object") {
    return Object.values(sampleData).reduce((total, value) => {
      return total + countSamples(value);
    }, 0);
  }

  return 0;
}

function countDiscoveredSamplesByPlatforms(platforms, discoverSamplesForPlatform) {
  return platforms.reduce((total, platform) => {
    return total + countSamples(discoverSamplesForPlatform(platform));
  }, 0);
}

function getDcvScenarioTags(sampleName) {
  const normalized = String(sampleName || "").toLowerCase();
  const tags = [];
  if (normalized.includes("mrz")) {
    tags.push("mrz", "passport", "id-card", "machine-readable-zone");
  }
  if (normalized.includes("vin")) {
    tags.push("vin", "vehicle-identification-number", "vehicle", "automotive");
  }
  if (normalized.includes("driver") || normalized.includes("license")) {
    tags.push("driver-license", "id-card", "dl", "aamva");
  }
  if (normalized.includes("document")) {
    tags.push("document-scan", "document-normalization", "auto-capture", "cropping", "deskew");
  }
  if (normalized.includes("gs1")) {
    tags.push("gs1", "application-identifiers", "ai");
  }
  return Array.from(new Set(tags));
}

function buildProductSelectionGuidanceText() {
  return [
    "# Product Selection Guidance",
    "",
    "## Public Product Offerings",
    "",
    "The public MCP catalog exposes five first-tier products: Dynamic Web TWAIN (DWT), Dynamsoft Document Viewer (DDV), Dynamsoft Barcode Reader (DBR), MRZ Scanner (MRZ), and Mobile Document Scanner (MDS).",
    "",
    "- Dynamic Web TWAIN (DWT): use for browser-based document acquisition and scanner control.",
    "- Dynamsoft Document Viewer (DDV): use as a standalone viewer. It is the extension path for DWT users who need mobile support or PDF annotation, and for MDS users who need multi-page support or PDF output.",
    "- Dynamsoft Barcode Reader (DBR): use for barcode workflows. On server/desktop, it is the foundational subset with dedicated docs, samples, and packages for C++, Python, Java, and .NET. On web, start with the foundational API by default for the current 11.4 positioning, with only minimal use of BarcodeScanner RTU when utter simplicity matters. On mobile, both the foundational API and BarcodeScanner RTU remain official.",
    "- MRZ Scanner (MRZ): use for passport and machine-readable-zone workflows. Public guidance is web/mobile solution/RTU only. Do not default to a foundational API path here; handle server/desktop separately through contact-driven guidance.",
    "- Mobile Document Scanner (MDS): use for document scan and normalization workflows. Public guidance is web-only solution/RTU. Do not default to a foundational API path here; handle mobile and server/desktop separately through contact-driven guidance.",
    "",
    "Choose DBR when you want direct barcode capabilities, MRZ when you want passport/MRZ flows, MDS when you want document scanning flows, DWT when you need browser acquisition, and DDV when you need viewing, annotation, multi-page handling, or PDF-oriented extension paths."
  ].join("\n");
}

function getEntryClassificationText(entry) {
  return [
    entry.title,
    entry.summary,
    entry.uri,
    entry.path,
    Array.isArray(entry.tags) ? entry.tags.join(" ") : ""
  ].filter(Boolean).join(" ");
}

function classifyDcvPublicProduct(entry) {
  if (entry.edition === "web" || entry.platform === "web") {
    return "";
  }

  const text = getEntryClassificationText(entry);
  const isSupportedMrzEdition = entry.edition === "mobile";

  if (isSupportedMrzEdition && MRZ_MATCHER.test(text)) {
    return "mrz";
  }

  return "";
}

function rewriteProductInUri(uri, product) {
  if (typeof uri !== "string" || !uri.includes("://") || !product) return uri;
  const [scheme, rest] = uri.split("://");
  const parts = String(rest || "").split("/");
  if (parts.length === 0) return uri;
  parts[0] = product;
  return `${scheme}://${parts.join("/")}`;
}

function rewritePublicTitle(title, publicProduct) {
  if (typeof title !== "string") return title;
  const base = title
    .replace(/\bDynamsoft\s+Capture\s+Vision\b\s*/gi, "")
    .replace(/\bCapture\s+Vision\b\s*/gi, "")
    .replace(/\bDCV\b\s*/gi, "")
    .trim();
  if (publicProduct === "mrz") return base.replace(/sample:/i, "MRZ sample:");
  if (publicProduct === "mds") return base.replace(/sample:/i, "MDS sample:");
  return base;
}

function rewritePublicSummary(summary, publicProduct) {
  if (typeof summary !== "string") return summary;
  const withoutBrand = summary
    .replace(/\bDynamsoft\s+Capture\s+Vision\b\s*/gi, "")
    .replace(/\bCapture\s+Vision\b\s*/gi, "")
    .replace(/\bDCV\b\s*/gi, "")
    .trim();
  if (publicProduct === "mrz") {
    return withoutBrand.replace(/^python sample/i, "MRZ python sample")
      .replace(/^cpp sample/i, "MRZ cpp sample")
      .replace(/^dotnet sample/i, "MRZ dotnet sample")
      .replace(/^java sample/i, "MRZ java sample")
      .replace(/^mobile ([a-z-]+) sample/i, "MRZ mobile $1 sample")
      .replace(/^web documentation/i, "MRZ web documentation")
      .replace(/^mobile documentation/i, "MRZ mobile documentation")
      .replace(/^server\/desktop documentation/i, "MRZ server/desktop documentation")
      .replace(/^core documentation/i, "MRZ core documentation");
  }
  if (publicProduct === "mds") {
    return withoutBrand.replace(/^python sample/i, "MDS python sample")
      .replace(/^cpp sample/i, "MDS cpp sample")
      .replace(/^dotnet sample/i, "MDS dotnet sample")
      .replace(/^java sample/i, "MDS java sample")
      .replace(/^mobile ([a-z-]+) sample/i, "MDS mobile $1 sample")
      .replace(/^web documentation/i, "MDS web documentation")
      .replace(/^mobile documentation/i, "MDS mobile documentation")
      .replace(/^server\/desktop documentation/i, "MDS server/desktop documentation")
      .replace(/^core documentation/i, "MDS core documentation");
  }
  return withoutBrand;
}

function toPublicEntry(entry) {
  if (!entry?.product || entry.product !== "dcv") {
    return entry;
  }

  const publicProduct = classifyDcvPublicProduct(entry);
  if (!publicProduct) {
    return null;
  }

  return {
    ...entry,
    product: publicProduct,
    uri: rewriteProductInUri(entry.uri, publicProduct),
    title: rewritePublicTitle(entry.title, publicProduct),
    summary: rewritePublicSummary(entry.summary, publicProduct),
    tags: Array.from(new Set([...(entry.tags || []), publicProduct]))
  };
}

function addPublicResourceToIndex(addResourceToIndex, entry) {
  const publicEntry = toPublicEntry(entry);
  if (publicEntry) {
    addResourceToIndex(publicEntry);
  }
}

function addMarkdownDocResources({
  addResourceToIndex,
  docs,
  idPrefix,
  uriPrefix,
  product,
  edition,
  version,
  majorVersion,
  defaultPlatform = "web",
  defaultSummary,
  baseTags
}) {
  for (let i = 0; i < docs.length; i++) {
    const article = docs[i];
    if (!article?.title) continue;
    const slug = `${encodeURIComponent(article.title)}-${i}`;
    const platform = article.platform || defaultPlatform;
    const tags = [...baseTags, platform];
    if (article.breadcrumb) tags.push(...article.breadcrumb.toLowerCase().split(/\s*>\s*/));

    addPublicResourceToIndex(addResourceToIndex, {
      id: `${idPrefix}-${i}`,
      uri: `${uriPrefix}/${platform}/${version}/${slug}`,
      type: "doc",
      product,
      edition,
      platform,
      version,
      majorVersion,
      title: product === "mrz" || product === "mds"
        ? rewritePublicTitle(article.title, product)
        : article.title,
      summary: product === "mrz" || product === "mds"
        ? rewritePublicSummary(article.breadcrumb || defaultSummary, product)
        : (article.breadcrumb || defaultSummary),
      embedText: article.content,
      mimeType: "text/markdown",
      tags,
      loadContent: async () => ({
        text: [
          `# ${article.title}`,
          "",
          article.breadcrumb ? `**Category:** ${article.breadcrumb}` : "",
          article.url ? `**URL:** ${article.url}` : "",
          "",
          "---",
          "",
          article.content
        ].filter(Boolean).join("\n"),
        mimeType: "text/markdown"
      })
    });
  }
}

function loadStructuredWebSampleContent({
  category,
  sampleName,
  getSamplePath,
  findCodeFilesInSample,
  readCodeFile,
  getMimeTypeForExtension
}) {
  const samplePath = getSamplePath(category, sampleName);
  if (!samplePath || !existsSync(samplePath)) {
    return { text: "Sample not found", mimeType: "text/plain" };
  }

  const stat = statSync(samplePath);
  if (stat.isDirectory()) {
    const readmePath = join(samplePath, "README.md");
    if (existsSync(readmePath)) {
      return { text: readCodeFile(readmePath), mimeType: "text/markdown" };
    }

    const codeFiles = findCodeFilesInSample(samplePath);
    if (codeFiles.length > 0) {
      const preferred = codeFiles.find((file) => file.filename === "index.html") || codeFiles[0];
      return { text: readCodeFile(preferred.path), mimeType: getMimeTypeForExtension(preferred.extension) };
    }

    return { text: "Sample found, but no code files detected.", mimeType: "text/plain" };
  }

  const ext = extname(samplePath).replace(".", "");
  return { text: readCodeFile(samplePath), mimeType: getMimeTypeForExtension(ext) };
}

function buildIndexData({
  LATEST_VERSIONS,
  LATEST_MAJOR,
  dcvCoreDocs,
  dcvWebDocs,
  mrzWebDocs,
  mdsWebDocs,
  dcvMobileDocs,
  dcvServerDocs,
  dbrWebDocs,
  dbrMobileDocs,
  dbrServerDocs,
  dwtDocs,
  ddvDocs,
  discoverDcvWebSamples,
  getDcvWebFrameworkPlatforms,
  discoverMrzWebSamples,
  getMrzWebFrameworkPlatforms,
  discoverMdsWebSamples,
  getMdsWebFrameworkPlatforms,
  getDcvMobilePlatforms,
  getDcvServerPlatforms,
  discoverDcvMobileSamples,
  discoverDcvServerSamples,
  discoverWebSamples,
  getDbrWebFrameworkPlatforms,
  getDbrMobilePlatforms,
  getDbrServerPlatforms,
  discoverMobileSamples,
  discoverDbrServerSamples,
  discoverDwtSamples,
  discoverDdvSamples,
  getDdvWebFrameworkPlatforms,
  resourceIndex
}) {
  if (Array.isArray(resourceIndex) && resourceIndex.length > 0) {
    const products = Object.fromEntries(PUBLIC_OFFERING_PRODUCTS.map((product) => [product, {
      latestMajor: LATEST_MAJOR[product],
      editions: {}
    }]));

    for (const entry of resourceIndex) {
      if (!entry?.product || !PUBLIC_OFFERING_PRODUCTS.includes(entry.product)) continue;
      if (entry.type !== "doc" && entry.type !== "sample") continue;

      const editionName = entry.edition === "python" ? "server" : (entry.edition || "web");
      if (entry.product === "mrz" && editionName === "mobile") continue;
      if (!products[entry.product].editions[editionName]) {
        const version = entry.version
          || LATEST_VERSIONS[entry.product]?.[editionName]
          || "";
        products[entry.product].editions[editionName] = {
          version,
          platforms: [],
          docCount: 0,
          sampleCount: 0
        };
      }

      const edition = products[entry.product].editions[editionName];
      const platforms = new Set();
      if (entry.platform) {
        platforms.add(entry.platform);
        if (entry.edition === "web" && entry.platform === "web") {
          platforms.add("js");
        }
      }
      if (entry.edition === "web" && Array.isArray(entry.tags)) {
        for (const tag of entry.tags) {
          const normalizedTag = normalizeFrameworkTag(tag);
          if (WEB_FRAMEWORK_PLATFORMS.has(normalizedTag)) {
            platforms.add(normalizedTag);
          }
        }
      }

      for (const platform of platforms) {
        if (!edition.platforms.includes(platform)) {
          edition.platforms.push(platform);
        }
      }
      if (entry.type === "doc") edition.docCount += 1;
      if (entry.type === "sample") edition.sampleCount += 1;
    }

    for (const product of Object.values(products)) {
      for (const edition of Object.values(product.editions)) {
        edition.platforms.sort();
      }
    }

    return {
      productSelection: {
        publicOfferings: [...PUBLIC_OFFERING_PRODUCTS],
        offerings: {
          dwt: {
            name: "Dynamic Web TWAIN",
            abbreviation: "DWT",
            whenToUse: ["Browser-based document acquisition and scanner control."]
          },
          ddv: {
            name: "Dynamsoft Document Viewer",
            abbreviation: "DDV",
            whenToUse: ["Standalone viewing plus extension paths for mobile, annotation, multi-page handling, and PDF output."]
          },
          dbr: {
            name: "Dynamsoft Barcode Reader",
            abbreviation: "DBR",
            whenToUse: [
              "Barcode workflows across server/desktop, web, and mobile.",
              "Use the foundational API by default on web; BarcodeScanner RTU is a minimal-simplicity option; mobile supports both foundational API and BarcodeScanner RTU."
            ]
          },
          mrz: {
            name: "MRZ Scanner",
            abbreviation: "MRZ",
            whenToUse: ["Passport and machine-readable-zone workflows on public web/mobile solution or RTU paths."]
          },
          mds: {
            name: "Mobile Document Scanner",
            abbreviation: "MDS",
            whenToUse: ["Document scan and normalization workflows on the public web-only solution or RTU path."]
          }
        }
      },
      products
    };
  }

  const dcvCoreVersion = LATEST_VERSIONS.dcv.core;
  const dcvWebVersion = LATEST_VERSIONS.dcv.web;
  const dcvMobileVersion = LATEST_VERSIONS.dcv.mobile;
  const dcvServerVersion = LATEST_VERSIONS.dcv.server;
  const dbrMobileVersion = LATEST_VERSIONS.dbr.mobile;
  const dbrWebVersion = LATEST_VERSIONS.dbr.web;
  const dbrServerVersion = LATEST_VERSIONS.dbr.server;
  const dwtVersion = LATEST_VERSIONS.dwt.web;
  const ddvVersion = LATEST_VERSIONS.ddv.web;
  const mrzWebVersion = LATEST_VERSIONS.mrz.web;
  const mdsWebVersion = LATEST_VERSIONS.mds.web;

  const dcvWebSamples = discoverDcvWebSamples();
  const dcvWebFrameworks = getDcvWebFrameworkPlatforms();
  const mrzWebSamples = discoverMrzWebSamples();
  const mrzWebFrameworks = getMrzWebFrameworkPlatforms();
  const mdsWebSamples = discoverMdsWebSamples();
  const mdsWebFrameworks = getMdsWebFrameworkPlatforms();
  const dcvMobilePlatforms = getDcvMobilePlatforms();
  const dcvServerPlatforms = getDcvServerPlatforms();
  const dbrWebSampleCount = countSamples(discoverWebSamples());
  const dbrWebFrameworks = getDbrWebFrameworkPlatforms();
  const dbrMobilePlatforms = getDbrMobilePlatforms();
  const dbrServerPlatforms = getDbrServerPlatforms();
  const dwtSampleCount = countSamples(discoverDwtSamples());
  const ddvSamples = discoverDdvSamples();
  const ddvWebFrameworks = getDdvWebFrameworkPlatforms();

  return {
    productSelection: {
      dcvSupersetSummary: "Dynamsoft Capture Vision (DCV) aggregates Dynamsoft Barcode Reader (DBR), Dynamsoft Label Recognizer (DLR), Dynamsoft Document Normalizer (DDN), Dynamsoft Code Parser (DCP), and Dynamsoft Camera Enhancer (DCE) into one pipeline.",
      useDbrWhen: [
        "Barcode-only workflows where DCV-specific workflows are not required."
      ],
      useDcvWhen: [
        "VIN scanning",
        "MRZ/passport/ID scanning",
        "Driver license parsing",
        "Document normalization/auto-capture/cropping",
        "Multi-task capture vision workflows"
      ]
    },
    products: {
      dcv: {
        latestMajor: LATEST_MAJOR.dcv,
        editions: {
          core: {
            version: dcvCoreVersion,
            platforms: ["core"],
            docCount: dcvCoreDocs.length,
            sampleCount: 0
          },
          web: {
            version: dcvWebVersion,
            platforms: ["js", ...dcvWebFrameworks],
            docCount: dcvWebDocs.length,
            sampleCount: countSamples(dcvWebSamples)
          },
          mobile: {
            version: dcvMobileVersion,
            platforms: dcvMobilePlatforms,
            docCount: dcvMobileDocs.length,
            sampleCount: countDiscoveredSamplesByPlatforms(dcvMobilePlatforms, discoverDcvMobileSamples)
          },
          server: {
            version: dcvServerVersion,
            platforms: dcvServerPlatforms,
            docCount: dcvServerDocs.length,
            sampleCount: countDiscoveredSamplesByPlatforms(dcvServerPlatforms, discoverDcvServerSamples)
          }
        }
      },
      dbr: {
        latestMajor: LATEST_MAJOR.dbr,
        editions: {
          mobile: {
            version: dbrMobileVersion,
            platforms: dbrMobilePlatforms,
            docCount: dbrMobileDocs.length,
            sampleCount: countDiscoveredSamplesByPlatforms(dbrMobilePlatforms, discoverMobileSamples)
          },
          web: {
            version: dbrWebVersion,
            platforms: ["js", ...dbrWebFrameworks],
            docCount: dbrWebDocs.length,
            sampleCount: dbrWebSampleCount
          },
          server: {
            version: dbrServerVersion,
            platforms: dbrServerPlatforms,
            docCount: dbrServerDocs.length,
            sampleCount: countDiscoveredSamplesByPlatforms(dbrServerPlatforms, discoverDbrServerSamples)
          }
        }
      },
      dwt: {
        latestMajor: LATEST_MAJOR.dwt,
        editions: {
          web: {
            version: dwtVersion,
            platforms: ["js"],
            docCount: dwtDocs.articles.length,
            sampleCount: dwtSampleCount
          }
        }
      },
      ddv: {
        latestMajor: LATEST_MAJOR.ddv,
        editions: {
          web: {
            version: ddvVersion,
            platforms: ["js", ...ddvWebFrameworks],
            docCount: ddvDocs.articles.length,
            sampleCount: countSamples(ddvSamples)
          }
        }
      },
      mrz: {
        latestMajor: LATEST_MAJOR.mrz,
        editions: {
          web: {
            version: mrzWebVersion,
            platforms: ["js", ...mrzWebFrameworks],
            docCount: mrzWebDocs.length,
            sampleCount: countSamples(mrzWebSamples)
          }
        }
      },
      mds: {
        latestMajor: LATEST_MAJOR.mds,
        editions: {
          web: {
            version: mdsWebVersion,
            platforms: ["js", ...mdsWebFrameworks],
            docCount: mdsWebDocs.length,
            sampleCount: countSamples(mdsWebSamples)
          }
        }
      }
    }
  };
}

function buildResourceIndex({
  addResourceToIndex,
  buildIndexData,
  buildVersionPolicyText,
  LATEST_VERSIONS,
  LATEST_MAJOR,
  dcvCoreDocs,
  dcvWebDocs,
  mrzWebDocs,
  mdsWebDocs,
  dcvMobileDocs,
  dcvServerDocs,
  dbrWebDocs,
  dbrMobileDocs,
  dbrServerDocs,
  dwtDocs,
  ddvDocs,
  discoverDcvMobileSamples,
  getDcvMobilePlatforms,
  getDcvMobileSamplePath,
  getDcvServerPlatforms,
  discoverDcvServerSamples,
  getDcvServerSampleContent,
  discoverDcvWebSamples,
  getDcvWebSamplePath,
  discoverMrzWebSamples,
  getMrzWebSamplePath,
  discoverMdsWebSamples,
  getMdsWebSamplePath,
  discoverMobileSamples,
  getDbrMobilePlatforms,
  getMobileSamplePath,
  getMainCodeFile,
  readCodeFile,
  getMimeTypeForExtension,
  getDbrServerPlatforms,
  discoverDbrServerSamples,
  getDbrServerSampleContent,
  discoverWebSamples,
  getWebSamplePath,
  discoverDwtSamples,
  getDwtSamplePath,
  discoverDdvSamples,
  getDdvSamplePath,
  findCodeFilesInSample
}) {
  addResourceToIndex({
    id: "index",
    uri: "doc://index",
    type: "index",
    title: "Dynamsoft MCP Index",
    summary: "Compact index of products, editions, versions, samples, and docs.",
    mimeType: "application/json",
    tags: ["index", "overview", "catalog"],
    pinned: true,
    loadContent: async () => ({
      text: JSON.stringify(buildIndexData(), null, 2),
      mimeType: "application/json"
    })
  });

  addResourceToIndex({
    id: "version-policy",
    uri: "doc://version-policy",
    type: "policy",
    title: "Version Policy",
    summary: "Latest major versions only; legacy docs are linked for select versions.",
    mimeType: "text/markdown",
    tags: ["policy", "version", "support"],
    pinned: true,
    loadContent: async () => ({
      text: buildVersionPolicyText(),
      mimeType: "text/markdown"
    })
  });

  addResourceToIndex({
    id: "product-selection",
    uri: "doc://product-selection",
    type: "policy",
    title: "Product Selection Guidance",
    summary: "When to use Dynamic Web TWAIN (DWT), Dynamsoft Document Viewer (DDV), Dynamsoft Barcode Reader (DBR), MRZ Scanner (MRZ), and Mobile Document Scanner (MDS).",
    mimeType: "text/markdown",
    tags: ["guidance", "product-selection", "dbr", "dwt", "ddv", "mrz", "mds"],
    pinned: true,
    loadContent: async () => ({
      text: buildProductSelectionGuidanceText(),
      mimeType: "text/markdown"
    })
  });

  const dcvCoreVersion = LATEST_VERSIONS.dcv.core;
  const dcvWebVersion = LATEST_VERSIONS.dcv.web;
  const dcvMobileVersion = LATEST_VERSIONS.dcv.mobile;
  const dcvServerVersion = LATEST_VERSIONS.dcv.server;
  const dbrMobileVersion = LATEST_VERSIONS.dbr.mobile;
  const dbrWebVersion = LATEST_VERSIONS.dbr.web;
  const dbrServerVersion = LATEST_VERSIONS.dbr.server;
  const dwtVersion = LATEST_VERSIONS.dwt.web;
  const ddvVersion = LATEST_VERSIONS.ddv.web;
  const mrzWebVersion = LATEST_VERSIONS.mrz.web;
  const mdsWebVersion = LATEST_VERSIONS.mds.web;

  addMarkdownDocResources({
    addResourceToIndex,
    docs: dcvCoreDocs,
    idPrefix: "dcv-core-doc",
    uriPrefix: "doc://dcv/core",
    product: "dcv",
    edition: "core",
    version: dcvCoreVersion,
    majorVersion: LATEST_MAJOR.dcv,
    defaultPlatform: "core",
    defaultSummary: "Dynamsoft Capture Vision Core documentation",
    baseTags: ["doc", "dcv", "core"]
  });

  addMarkdownDocResources({
    addResourceToIndex,
    docs: dcvWebDocs,
    idPrefix: "dcv-web-doc",
    uriPrefix: "doc://dcv/web",
    product: "dcv",
    edition: "web",
    version: dcvWebVersion,
    majorVersion: LATEST_MAJOR.dcv,
    defaultPlatform: "web",
    defaultSummary: "Dynamsoft Capture Vision Web documentation",
    baseTags: ["doc", "dcv", "web"]
  });

  addMarkdownDocResources({
    addResourceToIndex,
    docs: mrzWebDocs,
    idPrefix: "mrz-web-doc",
    uriPrefix: "doc://mrz/web",
    product: "mrz",
    edition: "web",
    version: mrzWebVersion,
    majorVersion: LATEST_MAJOR.mrz,
    defaultPlatform: "web",
    defaultSummary: "Dynamsoft MRZ Scanner Web documentation",
    baseTags: ["doc", "mrz", "web"]
  });

  addMarkdownDocResources({
    addResourceToIndex,
    docs: mdsWebDocs,
    idPrefix: "mds-web-doc",
    uriPrefix: "doc://mds/web",
    product: "mds",
    edition: "web",
    version: mdsWebVersion,
    majorVersion: LATEST_MAJOR.mds,
    defaultPlatform: "web",
    defaultSummary: "Dynamsoft Mobile Document Scanner Web documentation",
    baseTags: ["doc", "mds", "web"]
  });

  addMarkdownDocResources({
    addResourceToIndex,
    docs: dcvMobileDocs,
    idPrefix: "dcv-mobile-doc",
    uriPrefix: "doc://dcv/mobile",
    product: "dcv",
    edition: "mobile",
    version: dcvMobileVersion,
    majorVersion: LATEST_MAJOR.dcv,
    defaultPlatform: "mobile",
    defaultSummary: "Dynamsoft Capture Vision Mobile documentation",
    baseTags: ["doc", "dcv", "mobile"]
  });

  addMarkdownDocResources({
    addResourceToIndex,
    docs: dcvServerDocs,
    idPrefix: "dcv-server-doc",
    uriPrefix: "doc://dcv/server",
    product: "dcv",
    edition: "server",
    version: dcvServerVersion,
    majorVersion: LATEST_MAJOR.dcv,
    defaultPlatform: "server",
    defaultSummary: "Dynamsoft Capture Vision Server/Desktop documentation",
    baseTags: ["doc", "dcv", "server"]
  });

  for (const sampleName of discoverDcvWebSamples()) {
    const scenarioTags = getDcvScenarioTags(sampleName);
    addPublicResourceToIndex(addResourceToIndex, {
      id: `dcv-web-${sampleName}`,
      uri: `sample://dcv/web/web/${dcvWebVersion}/${sampleName}`,
      type: "sample",
      product: "dcv",
      edition: "web",
      platform: "web",
      version: dcvWebVersion,
      majorVersion: LATEST_MAJOR.dcv,
      title: `DCV web sample: ${sampleName}`,
      summary: `DCV web sample ${sampleName}.`,
      mimeType: "text/plain",
      tags: ["sample", "dcv", "web", sampleName, ...scenarioTags],
      loadContent: async () => {
        const samplePath = getDcvWebSamplePath(sampleName);
        if (!samplePath || !existsSync(samplePath)) return { text: "Sample not found", mimeType: "text/plain" };

        const stat = statSync(samplePath);
        if (stat.isDirectory()) {
          const readmePath = join(samplePath, "README.md");
          if (existsSync(readmePath)) return { text: readCodeFile(readmePath), mimeType: "text/markdown" };
          const codeFiles = findCodeFilesInSample(samplePath);
          if (codeFiles.length > 0) {
            const preferred = codeFiles.find((file) => file.filename === "index.html") || codeFiles[0];
            return { text: readCodeFile(preferred.path), mimeType: getMimeTypeForExtension(preferred.extension) };
          }
          return { text: "Sample found, but no code files detected.", mimeType: "text/plain" };
        }

        const ext = extname(samplePath).replace(".", "");
        return { text: readCodeFile(samplePath), mimeType: getMimeTypeForExtension(ext) };
      }
    });
  }

  for (const [category, samples] of Object.entries(discoverMrzWebSamples())) {
    for (const sampleName of samples) {
      addResourceToIndex({
        id: `mrz-web-${category}-${sampleName}`,
        uri: `sample://mrz/web/web/${mrzWebVersion}/${category}/${sampleName}`,
        type: "sample",
        product: "mrz",
        edition: "web",
        platform: "web",
        version: mrzWebVersion,
        majorVersion: LATEST_MAJOR.mrz,
        title: `MRZ sample: ${sampleName} (${category})`,
        summary: `MRZ web sample ${category}/${sampleName}.`,
        mimeType: "text/plain",
        tags: ["sample", "mrz", "web", category, sampleName],
        loadContent: async () => loadStructuredWebSampleContent({
          category,
          sampleName,
          getSamplePath: getMrzWebSamplePath,
          findCodeFilesInSample,
          readCodeFile,
          getMimeTypeForExtension
        })
      });
    }
  }

  for (const [category, samples] of Object.entries(discoverMdsWebSamples())) {
    for (const sampleName of samples) {
      addResourceToIndex({
        id: `mds-web-${category}-${sampleName}`,
        uri: `sample://mds/web/web/${mdsWebVersion}/${category}/${sampleName}`,
        type: "sample",
        product: "mds",
        edition: "web",
        platform: "web",
        version: mdsWebVersion,
        majorVersion: LATEST_MAJOR.mds,
        title: `MDS sample: ${sampleName} (${category})`,
        summary: `MDS web sample ${category}/${sampleName}.`,
        mimeType: "text/plain",
        tags: ["sample", "mds", "web", category, sampleName],
        loadContent: async () => loadStructuredWebSampleContent({
          category,
          sampleName,
          getSamplePath: getMdsWebSamplePath,
          findCodeFilesInSample,
          readCodeFile,
          getMimeTypeForExtension
        })
      });
    }
  }

  for (const platform of getDcvMobilePlatforms()) {
    for (const sampleName of discoverDcvMobileSamples(platform)) {
      const scenarioTags = getDcvScenarioTags(sampleName);
      addPublicResourceToIndex(addResourceToIndex, {
        id: `dcv-mobile-${platform}-${sampleName}`,
        uri: `sample://dcv/mobile/${platform}/${dcvMobileVersion}/${sampleName}`,
        type: "sample",
        product: "dcv",
        edition: "mobile",
        platform,
        version: dcvMobileVersion,
        majorVersion: LATEST_MAJOR.dcv,
        title: `DCV mobile sample: ${sampleName} (${platform})`,
        summary: `DCV mobile ${platform} sample ${sampleName}.`,
        mimeType: "text/plain",
        tags: ["sample", "dcv", "mobile", platform, sampleName, ...scenarioTags],
        loadContent: async () => {
          const samplePath = getDcvMobileSamplePath(platform, sampleName);
          if (!samplePath || !existsSync(samplePath)) return { text: "Sample not found", mimeType: "text/plain" };

          const stat = statSync(samplePath);
          if (stat.isFile()) {
            const ext = extname(samplePath).replace(".", "");
            return { text: readCodeFile(samplePath), mimeType: getMimeTypeForExtension(ext) };
          }

          const mainFile = getMainCodeFile(platform, samplePath);
          if (mainFile) {
            const ext = mainFile.filename.split(".").pop() || "";
            return { text: readCodeFile(mainFile.path), mimeType: getMimeTypeForExtension(ext) };
          }

          const readmePath = join(samplePath, "README.md");
          if (existsSync(readmePath)) return { text: readCodeFile(readmePath), mimeType: "text/markdown" };
          return { text: "Sample found, but no code files detected.", mimeType: "text/plain" };
        }
      });
    }
  }

  for (const platform of getDcvServerPlatforms()) {
    for (const sampleName of discoverDcvServerSamples(platform)) {
      const scenarioTags = getDcvScenarioTags(sampleName);
      addPublicResourceToIndex(addResourceToIndex, {
        id: `dcv-${platform}-${sampleName}`,
        uri: `sample://dcv/server/${platform}/${dcvServerVersion}/${sampleName}`,
        type: "sample",
        product: "dcv",
        edition: "server",
        platform,
        version: dcvServerVersion,
        majorVersion: LATEST_MAJOR.dcv,
        title: `DCV ${platform.toUpperCase()} sample: ${sampleName}`,
        summary: `DCV ${platform} sample ${sampleName}.`,
        mimeType: platform === "python" ? "text/x-python" : (platform === "nodejs" ? "text/javascript" : "text/plain"),
        tags: ["sample", "dcv", "server", platform, sampleName, ...scenarioTags],
        loadContent: async () => getDcvServerSampleContent(platform, sampleName)
      });
    }
  }

  addMarkdownDocResources({
    addResourceToIndex,
    docs: dbrWebDocs,
    idPrefix: "dbr-web-doc",
    uriPrefix: "doc://dbr/web",
    product: "dbr",
    edition: "web",
    version: dbrWebVersion,
    majorVersion: LATEST_MAJOR.dbr,
    defaultPlatform: "web",
    defaultSummary: "Dynamsoft Barcode Reader Web documentation",
    baseTags: ["doc", "dbr", "web"]
  });

  addMarkdownDocResources({
    addResourceToIndex,
    docs: dbrMobileDocs,
    idPrefix: "dbr-mobile-doc",
    uriPrefix: "doc://dbr/mobile",
    product: "dbr",
    edition: "mobile",
    version: dbrMobileVersion,
    majorVersion: LATEST_MAJOR.dbr,
    defaultPlatform: "mobile",
    defaultSummary: "Dynamsoft Barcode Reader Mobile documentation",
    baseTags: ["doc", "dbr", "mobile"]
  });

  addMarkdownDocResources({
    addResourceToIndex,
    docs: dbrServerDocs,
    idPrefix: "dbr-server-doc",
    uriPrefix: "doc://dbr/server",
    product: "dbr",
    edition: "server",
    version: dbrServerVersion,
    majorVersion: LATEST_MAJOR.dbr,
    defaultPlatform: "server",
    defaultSummary: "Dynamsoft Barcode Reader Server/Desktop documentation",
    baseTags: ["doc", "dbr", "server"]
  });

  for (const platform of getDbrMobilePlatforms()) {
    const samples = discoverMobileSamples(platform);
    for (const level of ["high-level", "low-level"]) {
      for (const sampleName of samples[level]) {
        addResourceToIndex({
          id: `dbr-mobile-${platform}-${level}-${sampleName}`,
          uri: `sample://dbr/mobile/${platform}/${dbrMobileVersion}/${level}/${sampleName}`,
          type: "sample",
          product: "dbr",
          edition: "mobile",
          platform,
          version: dbrMobileVersion,
          majorVersion: LATEST_MAJOR.dbr,
          title: `${sampleName} (${platform}, ${level})`,
          summary: `DBR mobile ${platform} ${level} sample ${sampleName}.`,
          mimeType: "text/plain",
          tags: ["sample", "dbr", "mobile", platform, level, sampleName],
          loadContent: async () => {
            const samplePath = getMobileSamplePath(platform, level, sampleName);
            if (!samplePath || !existsSync(samplePath)) return { text: "Sample not found", mimeType: "text/plain" };
            const mainFile = getMainCodeFile(platform, samplePath);
            if (!mainFile) return { text: "Sample not found", mimeType: "text/plain" };
            const content = readCodeFile(mainFile.path);
            const ext = mainFile.filename.split(".").pop() || "";
            return { text: content, mimeType: getMimeTypeForExtension(ext) };
          }
        });
      }
    }
  }

  for (const platform of getDbrServerPlatforms()) {
    const samples = discoverDbrServerSamples(platform);
    for (const sampleName of samples) {
      const isPython = platform === "python";
      const edition = isPython ? "python" : "server";
      const uri = isPython
        ? `sample://dbr/python/python/${dbrServerVersion}/${sampleName}`
        : `sample://dbr/server/${platform}/${dbrServerVersion}/${sampleName}`;
      addResourceToIndex({
        id: `dbr-${platform}-${sampleName}`,
        uri,
        type: "sample",
        product: "dbr",
        edition,
        platform,
        version: dbrServerVersion,
        majorVersion: LATEST_MAJOR.dbr,
        title: `${platform.toUpperCase()} sample: ${sampleName}`,
        summary: `DBR ${platform} sample ${sampleName}.`,
        mimeType: platform === "python" ? "text/x-python" : (platform === "nodejs" ? "text/javascript" : "text/plain"),
        tags: ["sample", "dbr", "server", platform, sampleName],
        loadContent: async () => getDbrServerSampleContent(platform, sampleName)
      });
    }
  }

  const webCategories = discoverWebSamples();
  for (const [category, samples] of Object.entries(webCategories)) {
    for (const sampleName of samples) {
      addResourceToIndex({
        id: `dbr-web-${category}-${sampleName}`,
        uri: `sample://dbr/web/web/${dbrWebVersion}/${category}/${sampleName}`,
        type: "sample",
        product: "dbr",
        edition: "web",
        platform: "web",
        version: dbrWebVersion,
        majorVersion: LATEST_MAJOR.dbr,
        title: `Web sample: ${sampleName} (${category})`,
        summary: `DBR web sample ${category}/${sampleName}.`,
        mimeType: "text/html",
        tags: ["sample", "dbr", "web", category, sampleName],
        loadContent: async () => {
          const samplePath = getWebSamplePath(category, sampleName);
          const content = samplePath && existsSync(samplePath) ? readCodeFile(samplePath) : "Sample not found";
          return { text: content, mimeType: "text/html" };
        }
      });
    }
  }

  const dwtCategories = discoverDwtSamples();
  for (const [category, samples] of Object.entries(dwtCategories)) {
    for (const sampleName of samples) {
      addResourceToIndex({
        id: `dwt-${category}-${sampleName}`,
        uri: `sample://dwt/web/web/${dwtVersion}/${category}/${sampleName}`,
        type: "sample",
        product: "dwt",
        edition: "web",
        platform: "web",
        version: dwtVersion,
        majorVersion: LATEST_MAJOR.dwt,
        title: `DWT sample: ${sampleName} (${category})`,
        summary: `Dynamic Web TWAIN sample ${category}/${sampleName}.`,
        mimeType: "text/html",
        tags: ["sample", "dwt", category, sampleName],
        loadContent: async () => {
          const samplePath = getDwtSamplePath(category, sampleName);
          const content = samplePath && existsSync(samplePath) ? readCodeFile(samplePath) : "Sample not found";
          return { text: content, mimeType: "text/html" };
        }
      });
    }
  }

  addMarkdownDocResources({
    addResourceToIndex,
    docs: dwtDocs.articles,
    idPrefix: "dwt-doc",
    uriPrefix: "doc://dwt/web",
    product: "dwt",
    edition: "web",
    version: dwtVersion,
    majorVersion: LATEST_MAJOR.dwt,
    defaultPlatform: "web",
    defaultSummary: "Dynamic Web TWAIN documentation",
    baseTags: ["doc", "dwt"]
  });

  for (const sampleName of discoverDdvSamples()) {
    addResourceToIndex({
      id: `ddv-${sampleName}`,
      uri: `sample://ddv/web/web/${ddvVersion}/${sampleName}`,
      type: "sample",
      product: "ddv",
      edition: "web",
      platform: "web",
      version: ddvVersion,
      majorVersion: LATEST_MAJOR.ddv,
      title: `DDV sample: ${sampleName}`,
      summary: `Dynamsoft Document Viewer sample ${sampleName}.`,
      mimeType: "text/plain",
      tags: ["sample", "ddv", "document-viewer", "web", sampleName],
      loadContent: async () => {
        const samplePath = getDdvSamplePath(sampleName);
        if (!samplePath || !existsSync(samplePath)) return { text: "Sample not found", mimeType: "text/plain" };

        const stat = statSync(samplePath);
        if (stat.isDirectory()) {
          const readmePath = join(samplePath, "README.md");
          if (existsSync(readmePath)) return { text: readCodeFile(readmePath), mimeType: "text/markdown" };

          const codeFiles = findCodeFilesInSample(samplePath);
          if (codeFiles.length === 0) {
            const entries = readdirSync(samplePath, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
            return {
              text: entries.length ? entries.join("\n") : "Sample found, but no code files detected.",
              mimeType: "text/plain"
            };
          }

          const preferred = codeFiles.find((file) => DDV_PREFERRED_ENTRY_FILES.includes(file.filename)) || codeFiles[0];
          const content = readCodeFile(preferred.path);
          return { text: content, mimeType: getMimeTypeForExtension(preferred.extension) };
        }

        const ext = extname(samplePath).replace(".", "");
        return { text: readCodeFile(samplePath), mimeType: getMimeTypeForExtension(ext) };
      }
    });
  }

  addMarkdownDocResources({
    addResourceToIndex,
    docs: ddvDocs.articles,
    idPrefix: "ddv-doc",
    uriPrefix: "doc://ddv/web",
    product: "ddv",
    edition: "web",
    version: ddvVersion,
    majorVersion: LATEST_MAJOR.ddv,
    defaultPlatform: "web",
    defaultSummary: "Dynamsoft Document Viewer documentation",
    baseTags: ["doc", "ddv"]
  });
}

export {
  buildIndexData,
  buildResourceIndex
};
