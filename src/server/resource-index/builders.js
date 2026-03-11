import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { DDV_PREFERRED_ENTRY_FILES } from "./config.js";

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
    "## Dynamsoft Barcode Reader (DBR) vs Dynamsoft Capture Vision (DCV)",
    "",
    "Dynamsoft Capture Vision (DCV) is a superset architecture that aggregates Dynamsoft Barcode Reader (DBR), Dynamsoft Label Recognizer (DLR), Dynamsoft Document Normalizer (DDN), Dynamsoft Code Parser (DCP), and Dynamsoft Camera Enhancer (DCE).",
    "",
    "Use Dynamsoft Barcode Reader (DBR) when you only need barcode reading and do not need Dynamsoft Capture Vision (DCV) workflows.",
    "",
    "Use Dynamsoft Capture Vision (DCV) when your scenario includes:",
    "- VIN scanning",
    "- MRZ/passport/ID scanning",
    "- Driver license parsing",
    "- Document detection/normalization/auto-capture/cropping",
    "- Multi-task image processing and parsing workflows",
    "",
    "If a query includes MRZ, VIN, driver license, or document-normalization intents, prefer Dynamsoft Capture Vision (DCV) samples and docs."
  ].join("\n");
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

    addResourceToIndex({
      id: `${idPrefix}-${i}`,
      uri: `${uriPrefix}/${platform}/${version}/${slug}`,
      type: "doc",
      product,
      edition,
      platform,
      version,
      majorVersion,
      title: article.title,
      summary: article.breadcrumb || defaultSummary,
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

function buildIndexData({
  LATEST_VERSIONS,
  LATEST_MAJOR,
  dcvCoreDocs,
  dcvWebDocs,
  dcvMobileDocs,
  dcvServerDocs,
  dbrWebDocs,
  dbrMobileDocs,
  dbrServerDocs,
  dwtDocs,
  ddvDocs,
  discoverDcvWebSamples,
  getDcvWebFrameworkPlatforms,
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
  getDdvWebFrameworkPlatforms
}) {
  const dcvCoreVersion = LATEST_VERSIONS.dcv.core;
  const dcvWebVersion = LATEST_VERSIONS.dcv.web;
  const dcvMobileVersion = LATEST_VERSIONS.dcv.mobile;
  const dcvServerVersion = LATEST_VERSIONS.dcv.server;
  const dbrMobileVersion = LATEST_VERSIONS.dbr.mobile;
  const dbrWebVersion = LATEST_VERSIONS.dbr.web;
  const dbrServerVersion = LATEST_VERSIONS.dbr.server;
  const dwtVersion = LATEST_VERSIONS.dwt.web;
  const ddvVersion = LATEST_VERSIONS.ddv.web;

  const dcvWebSamples = discoverDcvWebSamples();
  const dcvWebFrameworks = getDcvWebFrameworkPlatforms();
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
    summary: "When to use DCV vs DBR (and when DWT/DDV are better fits).",
    mimeType: "text/markdown",
    tags: ["guidance", "product-selection", "dcv", "dbr", "dwt", "ddv"],
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
    addResourceToIndex({
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

  for (const platform of getDcvMobilePlatforms()) {
    for (const sampleName of discoverDcvMobileSamples(platform)) {
      const scenarioTags = getDcvScenarioTags(sampleName);
      addResourceToIndex({
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
      addResourceToIndex({
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
