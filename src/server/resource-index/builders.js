import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { DDV_PREFERRED_ENTRY_FILES } from "./config.js";
import { shortDocPath } from "./docs-loader.js";
import {
  CAPABILITY_FACTS,
  PRODUCT_SELECTION_GUIDANCE,
  PRODUCT_SELECTION_GUIDE_URI,
  PUBLIC_OFFERING_PRODUCTS
} from "../public-offerings.js";

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
  if (normalized.includes("mrz") || normalized.includes("passport")) {
    tags.push("mrz", "passport", "id-card", "machine-readable-zone");
  }
  if (normalized.includes("driver") || normalized.includes("license") || normalized.includes("licence") || normalized.includes("dl")) {
    tags.push("driver-license", "id-card", "dl", "aamva");
  }
  if (normalized.includes("document") || normalized.includes("normaliz") || normalized.includes("deskew") || normalized.includes("scan-a-document")) {
    tags.push("document-scan", "document-normalization", "auto-capture", "cropping", "deskew");
  }
  if (normalized.includes("gs1")) {
    tags.push("gs1", "application-identifiers", "ai");
  }
  if (normalized.includes("qr")) {
    tags.push("qr", "qrcode", "qr-code");
  }
  if (normalized.includes("pdf417") || normalized.includes("pdf-417")) {
    tags.push("pdf417");
  }
  if (normalized.includes("datamatrix") || normalized.includes("data-matrix")) {
    tags.push("datamatrix", "data-matrix");
  }
  if (normalized.includes("vin")) {
    tags.push("vin", "vehicle-identification");
  }
  if (normalized.includes("pdf")) {
    tags.push("pdf", "multi-page");
  }
  if (normalized.includes("image") || normalized.includes("file")) {
    tags.push("image", "still-image", "file", "upload");
  }
  if (normalized.includes("camera") || normalized.includes("video") || normalized.includes("webcam") || normalized.includes("scan-a-single") || normalized.includes("scan-single")) {
    tags.push("camera", "webcam", "video", "live");
  }
  if (normalized.includes("hello") || normalized.includes("getting-started") || normalized.includes("quickstart")) {
    tags.push("hello-world", "getting-started", "quickstart");
  }
  if (normalized.includes("multiple") || normalized.includes("batch")) {
    tags.push("multiple", "batch");
  }
  return Array.from(new Set(tags));
}

function buildProductSelectionGuidanceText() {
  return [
    "# Product Selection Guidance",
    "",
    "## Public Product Offerings",
    "",
    "The public MCP catalog exposes six first-tier products: Dynamic Web TWAIN (DWT), Dynamsoft Document Viewer (DDV), Dynamsoft Barcode Reader (DBR), MRZ Scanner (MRZ), Mobile Document Scanner (MDS), and Batch Barcode Scanner (BBS).",
    "",
    "- Dynamic Web TWAIN (DWT): use for browser-based document acquisition and scanner control.",
    "- Dynamsoft Document Viewer (DDV): use as a standalone viewer. It is the extension path for DWT users who need mobile support or PDF annotation, and for MDS users who need multi-page support or PDF output.",
    "- Dynamsoft Barcode Reader (DBR): use for barcode workflows. On server/desktop, it is the foundational subset with dedicated docs, samples, and packages for C++, Python, Java, and .NET. On web, start with the foundational API by default, with only minimal use of BarcodeScanner RTU when utter simplicity matters. On mobile, both the foundational API and BarcodeScanner RTU remain official.",
    "- MRZ Scanner (MRZ): use for passport and machine-readable-zone workflows. Public guidance is web/mobile solution/RTU only. Do not default to a foundational API path here; handle server/desktop separately through contact-driven guidance.",
    "- Mobile Document Scanner (MDS): use for document scan and normalization workflows. Public guidance is web-only solution/RTU. Do not default to a foundational API path here; handle mobile and server/desktop separately through contact-driven guidance.",
    "- Dynamsoft Batch Barcode Scanner (BBS): use when a ready-made Android or iOS app that scans many barcodes at once (inventory boxes, lab tubes) fits the workflow. It is an app, not an SDK: there is no code to embed, no quickstart, and no samples, so do not ask for a programming language. Results leave the app by export (CSV and images, sharing, cloud). To build batch or multi-barcode scanning into your own app, use DBR instead.",
    "",
    "Choose DBR when you want direct barcode capabilities, MRZ when you want passport/MRZ flows, MDS when you want document scanning flows, DWT when you need browser acquisition, DDV when you need viewing, annotation, multi-page handling, or PDF-oriented extension paths, and BBS when a ready-made Android/iOS app for scanning many barcodes at once meets the need.",
    "",
    "## Known Capability Facts",
    "",
    CAPABILITY_FACTS.note,
    "",
    `- OCR: ${CAPABILITY_FACTS.ocr}`,
    `- VIN: ${CAPABILITY_FACTS.vin}`,
    `- ID documents: ${CAPABILITY_FACTS.idDocuments}`,
    `- Batch scanning: ${CAPABILITY_FACTS.batchScanning}`,
    "",
    "## Choosing by Workflow",
    "",
    "Start from the customer's workflow, not the product catalog. Recommend the smallest practical set of products, prefer one packaged product when it fully covers the use case, and do not list every potentially relevant product.",
    "",
    "1. Identify the input source: physical scanner, mobile camera, webcam, uploaded image, PDF, server-side file, or existing image stream.",
    "2. Identify the target: barcode, MRZ, complete document image, text in known regions, printed VIN, general page text, structured payload, or a combination.",
    "3. Identify the deployment environment: web, mobile web, native mobile, desktop, server, hybrid, or embedded.",
    "4. Clarify the capture flow: single item, continuous scanning, multi-page, many barcodes, document plus data extraction, local processing, or server processing.",
    "5. For identity documents, keep data extraction, image capture, visible-text recognition, authenticity verification, and identity verification separate.",
    "6. Prefer a packaged product when one primary task dominates and its standard workflow is acceptable. Recommend Dynamsoft Capture Vision (DCV) components only when no packaged product covers the workflow, or when it combines recognition tasks or needs customized camera behavior, processing order, UI, or intermediate results.",
    "7. Separate essential products, add-ons, or components from optional ones, and explain why each one is included.",
    "8. Ask only the unresolved questions that could change the recommendation, no more than five at once.",
    "9. Recommend a proof of concept when samples, capture conditions, platform support, or accuracy remain uncertain.",
    "",
    "## Requirement to Product",
    "",
    "| Requirement | Recommendation |",
    "|---|---|",
    "| Scan paper documents from a physical scanner into a browser | DWT |",
    "| Scan documents and read their barcodes | DWT with its Barcode Reader add-on |",
    "| Process PDF pages as images in a DWT workflow | DWT with its PDF Rasterizer add-on, subject to validation |",
    "| Send scanned images to an OCR engine | DWT with its OCR Connector add-on on a PC or workstation, subject to integration validation |",
    "| Capture from a webcam inside a DWT workflow | DWT with its Webcam Capture add-on |",
    "| View, annotate, or assemble multi-page documents and output PDF in the browser | DDV; add DWT when pages come from a physical scanner |",
    "| Read barcodes as the primary task (camera, image, PDF; web, mobile, or server) | DBR, edition matching the platform |",
    "| Customized camera barcode workflow (own UI, camera control, intermediate results) | DBR foundational API rather than BarcodeScanner RTU |",
    "| Scan many barcodes at once (inventory boxes, lab tubes) with a ready-made Android/iOS app | BBS; integrate through its export |",
    "| Embed batch or multi-barcode scanning in your own app | DBR (multi-barcode scanning; web sample batch-inventory) |",
    "| North American AAMVA driver license data | DBR, which decodes the PDF417 and parses the fields |",
    "| Driver license acquired from a physical scanner | DWT with its Barcode Reader add-on; confirm field parsing with Dynamsoft |",
    "| Passport, visa, or ID card MRZ data | MRZ |",
    "| Capture and normalize documents from a mobile browser | MDS; add DDV for multi-page handling or PDF output |",
    "| VIN encoded in a barcode | DBR |",
    "| Printed VIN text on a door-frame label or on paperwork | DCV: Camera Enhancer + Label Recognizer + Code Parser (VIN text template); add Barcode Reader when the VIN may be a barcode or text |",
    "| Text in a known region (labels, tags, cards, short fields next to a barcode) | DCV: Label Recognizer, with Camera Enhancer for live capture; add Barcode Reader for nearby barcodes |",
    "| General full-page OCR | Not offered as an SDK; in a DWT workflow use the OCR Connector add-on |",
    "| Capture a full driver license image and its PDF417 data | DCV: Camera Enhancer + Document Normalizer + Barcode Reader + Code Parser |",
    "| Capture a document image and read its barcode | DCV: Camera Enhancer + Document Normalizer + Barcode Reader |",
    "| Parse a supported barcode payload into fields | DBR when the packaged parsing covers it; otherwise DCV: Barcode Reader + Code Parser |",
    "",
    "Recommend DWT add-ons only when the workflow requires them.",
    "",
    "## Dynamsoft Capture Vision (DCV) Components",
    "",
    "DCV is the framework behind the packaged products. Its components can be combined into one pipeline when no packaged product covers the use case. DCV is not a selectable product in this MCP's tools; DBR search covers the shared Capture Vision API pages. Confirm platform support for a combination in current documentation or with Dynamsoft.",
    "",
    "- Dynamsoft Camera Enhancer (DCE): camera preview, camera selection, focus and zoom, frame supply to other components, and capture UI. Include it only when camera input is required. Docs: https://www.dynamsoft.com/camera-enhancer/docs/core/introduction/",
    "- Barcode Reader (DBR) component: barcode decoding inside a combined pipeline. When barcode reading is the only task, recommend the DBR product instead.",
    "- Dynamsoft Label Recognizer (DLR): text in known or structured regions, such as labels, tags, cards, short fields next to barcodes, and printed VINs. Confirm layout, fonts, languages, field locations, and capture conditions. It is not unrestricted full-page OCR. Docs: https://www.dynamsoft.com/capture-vision/docs/core/introduction/dlr.html",
    "- Dynamsoft Document Normalizer (DDN): document boundary detection, perspective correction, cropping, and normalization. Add it when the complete document image must be detected, corrected, or saved. Docs: https://www.dynamsoft.com/capture-vision/docs/core/introduction/ddn.html",
    "- Dynamsoft Code Parser (DCP): converts supported decoded payloads, such as AAMVA driver license data, VINs, and MRZ, into named fields. Barcode Reader or Label Recognizer reads the code; Code Parser interprets it. Docs: https://www.dynamsoft.com/capture-vision/docs/core/introduction/dcp.html",
    "",
    "Common combinations:",
    "",
    "- Camera Enhancer + Barcode Reader + Code Parser: scan and structure supported encoded data.",
    "- Camera Enhancer + Barcode Reader + Label Recognizer: decode a barcode and read nearby text.",
    "- Camera Enhancer + Document Normalizer + Barcode Reader: capture a document and decode its barcode.",
    "- Camera Enhancer + Document Normalizer + Barcode Reader + Label Recognizer + Code Parser: custom document, barcode, text, and structured-data workflow.",
    "",
    "Framework overview: https://www.dynamsoft.com/capture-vision/docs/core/introduction/",
    "",
    "## Driver Licenses",
    "",
    "- Ask the jurisdictions, the capture method, the desired output (barcode data, named fields, normalized image, visible front-side text), and whether verification is required.",
    "- Do not assume every driver license uses AAMVA PDF417 or MRZ. Some use MRZ (MRZ applies), another barcode, a chip, or only visible text (Label Recognizer may read known fields; confirm with Dynamsoft).",
    "- For AAMVA licenses: DBR for barcode data and named fields; add Document Normalizer (DCV) only when the complete license image must be detected, corrected, cropped, or saved; DWT with its Barcode Reader add-on when acquisition is from a physical scanner.",
    "- Data extraction does not establish authenticity or identity.",
    "",
    "## VINs",
    "",
    "- Ask whether the VIN is a barcode, printed text, or both, and where it is captured. Barcode: DBR. Printed text: DCV Camera Enhancer + Label Recognizer + Code Parser. Both: add Barcode Reader to that pipeline.",
    "- Printed VINs on door-frame labels and paperwork read well. Known limitation: VINs read through the windshield on the dashboard are not well supported; say so, and require representative samples and a proof of concept before committing.",
    "- Length, character, and check-digit validation does not prove vehicle authenticity.",
    "",
    "## Discovery Questions",
    "",
    "Ask only questions whose answers could change the recommendation, no more than five at once.",
    "",
    "- General, in priority order: input source; target (barcode formats, MRZ, complete document image, text in a known region, or a combination); application platform; capture flow (single, continuous, multi-page, batch, many barcodes per view); required output (raw text, named fields, normalized image); whether processing must stay on-device or offline; whether authenticity or identity verification is required.",
    "- Driver license scanning: jurisdictions in scope; browser camera, uploaded image, or physical scanner; barcode data, named fields, normalized image, visible text, or a combination; data capture only or verification; availability of representative or synthetic samples.",
    "- VIN reading: barcode, printed text, or both; where the VIN is captured (door-frame label, paperwork, or through the windshield on the dashboard); target platform; barcode formats in the samples; availability of representative images and videos.",
    "- Web document scanning: scanner interfaces and operating systems; multi-page scanning; loading or rasterizing PDFs; barcode reading, OCR, or webcam capture; browsers and deployment environment.",
    "- Batch barcode scanning: ready-made app or embedded in your own app; Android or iOS; how results reach your system (CSV, sharing, cloud); barcode formats and count per scene.",
    "",
    "## Cautions and Validation",
    "",
    "- Do not state platform or browser support, barcode formats, parsing specifications, offline operation, packaging, licensing, pricing, accuracy, or performance unless current documentation confirms it; search first.",
    "- Do not present any product as unrestricted full-page OCR.",
    "- Do not imply that barcode, MRZ, OCR, or format validation authenticates a document, vehicle, or person.",
    "- For a proof of concept, use representative and difficult samples (images and videos from the intended devices, failed samples, PDFs, synthetic IDs from the target jurisdictions) and measure recognition and field accuracy, capture completion rate, time to successful capture, duplicate or false-positive rate, image quality, browser and device compatibility, and behavior under blur, glare, low light, or perspective."
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

function encodeDocSlug(slug) {
  return String(slug).split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

// One doc:// slug per article: its short path, or (on a collision within the
// same URI prefix + platform, e.g. `user-guide.md` vs `user-guide/index.md`)
// its full source path. Shared pages keep their `slugPrefix` namespace
// (`dcv`, `dcv-core`) in both forms.
function assignDocSlugs(docs, defaultPlatform) {
  const withPrefix = (article, slug) => (article.slugPrefix ? `${article.slugPrefix}/${slug}` : slug);
  const keyFor = (article, slug) => `${article.platform || defaultPlatform}/${slug}`;
  const shortSlugs = docs.map((article) => withPrefix(article, shortDocPath(article.path || article.title)));
  const counts = new Map();
  docs.forEach((article, i) => {
    const key = keyFor(article, shortSlugs[i]);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return docs.map((article, i) => {
    if (counts.get(keyFor(article, shortSlugs[i])) === 1) return shortSlugs[i];
    return withPrefix(article, String(article.path || article.title).replace(/\\/g, "/").replace(/\.md$/i, ""));
  });
}

function addMarkdownDocResources({
  addResourceToIndex,
  docs,
  idPrefix,
  uriPrefix,
  product,
  edition,
  version,
  resolveVersion,
  majorVersion,
  defaultPlatform = "web",
  defaultSummary,
  baseTags
}) {
  const slugs = assignDocSlugs(docs, defaultPlatform);
  for (let i = 0; i < docs.length; i++) {
    const article = docs[i];
    if (!article?.title) continue;
    const slug = encodeDocSlug(slugs[i]);
    const platform = article.platform || defaultPlatform;
    const tags = [...baseTags, platform];
    if (Array.isArray(article.platforms)) {
      for (const extra of article.platforms) {
        if (!tags.includes(extra)) tags.push(extra);
      }
    }
    if (article.breadcrumb) tags.push(...article.breadcrumb.toLowerCase().split(/\s*>\s*/));
    // Fold frontmatter keywords into tags so domain-vocabulary search hits (#142).
    if (Array.isArray(article.keywords)) {
      for (const kw of article.keywords) {
        const norm = String(kw).toLowerCase().trim();
        if (norm && !tags.includes(norm)) tags.push(norm);
      }
    }
    // Prefer the frontmatter description as the summary (distinct per doc) over
    // the breadcrumb (identical across sibling docs) (#142).
    const baseSummary = article.description || article.breadcrumb || defaultSummary;
    // Pages tied to one platform's release (BBS release notes) carry that platform's version.
    const articleVersion = resolveVersion ? resolveVersion(article) : version;

    addPublicResourceToIndex(addResourceToIndex, {
      id: `${idPrefix}-${i}`,
      uri: `${uriPrefix}/${platform}/${articleVersion}/${slug}`,
      type: "doc",
      product,
      edition,
      platform,
      ...(Array.isArray(article.platforms) ? { platforms: article.platforms } : {}),
      version: articleVersion,
      ...(article.sourceVersion ? { sourceVersion: article.sourceVersion } : {}),
      majorVersion,
      url: article.url,
      title: product === "mrz" || product === "mds"
        ? rewritePublicTitle(article.title, product)
        : article.title,
      summary: product === "mrz" || product === "mds"
        ? rewritePublicSummary(baseSummary, product)
        : baseSummary,
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

// BBS ships Android and iOS apps with their own versions; list them for the
// platforms an edition covers.
function getBbsPlatformVersions(bbsVersions, platforms) {
  return Object.fromEntries(
    platforms.filter((platform) => bbsVersions[platform]).map((platform) => [platform, bbsVersions[platform]])
  );
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
  bbsMobileDocs,
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
      // A page that serves several platforms (BBS app pages, shared Capture
      // Vision pages) lists those rather than its edition-level label.
      const servedPlatforms = Array.isArray(entry.platforms) && entry.platforms.length > 0
        ? entry.platforms
        : [entry.platform];
      for (const servedPlatform of servedPlatforms) {
        if (servedPlatform) platforms.add(servedPlatform);
      }
      if (entry.edition === "web" && entry.platform === "web") {
        platforms.add("js");
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

    // The BBS edition version is the docs-set label; platformVersions says where each app is.
    const bbsEdition = products.bbs.editions.mobile;
    if (bbsEdition) {
      bbsEdition.version = LATEST_VERSIONS.bbs.mobile;
      bbsEdition.platformVersions = getBbsPlatformVersions(LATEST_VERSIONS.bbs, bbsEdition.platforms);
    }

    return {
      productSelection: {
        guidance: PRODUCT_SELECTION_GUIDANCE,
        guideUri: PRODUCT_SELECTION_GUIDE_URI,
        publicOfferings: [...PUBLIC_OFFERING_PRODUCTS],
        capabilities: { ...CAPABILITY_FACTS },
        offerings: {
          dwt: {
            name: "Dynamic Web TWAIN",
            abbreviation: "DWT",
            webOnly: true,
            platforms: ["js"],
            whenToUse: ["Browser-based document acquisition and scanner control. Web/JavaScript only."]
          },
          ddv: {
            name: "Dynamsoft Document Viewer",
            abbreviation: "DDV",
            webOnly: true,
            platforms: ["js"],
            whenToUse: ["Standalone viewing plus annotation, multi-page handling, and PDF output. Web/JavaScript only."]
          },
          dbr: {
            name: "Dynamsoft Barcode Reader",
            abbreviation: "DBR",
            webOnly: false,
            editions: ["mobile", "web", "server"],
            whenToUse: [
              "Barcode workflows across server/desktop, web, and mobile. The only product with multiple editions.",
              "Web uses a foundational-first flow (BarcodeScanner RTU also available); this is not selected via api_level.",
              "api_level (high-level = BarcodeScanner RTU, low-level = foundational) applies only to DBR mobile."
            ]
          },
          mrz: {
            name: "MRZ Scanner",
            abbreviation: "MRZ",
            webOnly: true,
            platforms: ["js"],
            whenToUse: ["Passport and machine-readable-zone workflows. Served here as web/JavaScript only; mobile/server scopes return official reference links."]
          },
          mds: {
            name: "Mobile Document Scanner",
            abbreviation: "MDS",
            webOnly: true,
            platforms: ["js"],
            whenToUse: ["Document scan and normalization workflows. Served here as web/JavaScript only; mobile/server scopes return official reference links."]
          },
          bbs: {
            name: "Dynamsoft Batch Barcode Scanner",
            abbreviation: "BBS",
            webOnly: false,
            editions: ["mobile"],
            platforms: ["android", "ios"],
            whenToUse: ["Ready-made Android/iOS app for scanning many barcodes at once (inventory boxes, lab tubes). It is an app, not an SDK: docs only, with no samples or quickstart; integrate by exporting results. To embed multi-barcode scanning in your own app, use DBR."]
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
  const bbsVersion = LATEST_VERSIONS.bbs.mobile;

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
      guidance: PRODUCT_SELECTION_GUIDANCE,
      guideUri: PRODUCT_SELECTION_GUIDE_URI,
      publicOfferings: [...PUBLIC_OFFERING_PRODUCTS],
      capabilities: { ...CAPABILITY_FACTS },
      dcvSupersetSummary: "Dynamsoft Capture Vision (DCV) aggregates Dynamsoft Barcode Reader (DBR), Dynamsoft Label Recognizer (DLR), Dynamsoft Document Normalizer (DDN), Dynamsoft Code Parser (DCP), and Dynamsoft Camera Enhancer (DCE) into one pipeline. DCV is internal only and is not a selectable public product.",
      useDbrWhen: [
        "Barcode-only workflows where DCV-specific workflows are not required."
      ],
      useDcvWhen: [
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
      },
      bbs: {
        latestMajor: LATEST_MAJOR.bbs,
        editions: {
          mobile: {
            version: bbsVersion,
            platforms: ["android", "ios"],
            platformVersions: getBbsPlatformVersions(LATEST_VERSIONS.bbs, ["android", "ios"]),
            docCount: bbsMobileDocs.length,
            sampleCount: 0
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
  dbrSharedDocs,
  dwtDocs,
  ddvDocs,
  bbsMobileDocs,
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
    uri: PRODUCT_SELECTION_GUIDE_URI,
    type: "policy",
    title: "Product Selection Guidance",
    summary: "When to use Dynamic Web TWAIN (DWT), Dynamsoft Document Viewer (DDV), Dynamsoft Barcode Reader (DBR), MRZ Scanner (MRZ), Mobile Document Scanner (MDS), and Batch Barcode Scanner (BBS).",
    mimeType: "text/markdown",
    tags: ["guidance", "product-selection", "dbr", "dwt", "ddv", "mrz", "mds", "bbs"],
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
  const bbsVersion = LATEST_VERSIONS.bbs.mobile;

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

  const sharedEditions = [
    ["web", dbrWebVersion, "Web"],
    ["mobile", dbrMobileVersion, "Mobile"],
    ["server", dbrServerVersion, "Server/Desktop"]
  ];
  for (const [edition, version, label] of sharedEditions) {
    addMarkdownDocResources({
      addResourceToIndex,
      docs: dbrSharedDocs?.[edition] || [],
      idPrefix: `dbr-${edition}-shared-doc`,
      uriPrefix: `doc://dbr/${edition}`,
      product: "dbr",
      edition,
      version,
      majorVersion: LATEST_MAJOR.dbr,
      defaultPlatform: edition,
      defaultSummary: `Shared Capture Vision API used by Dynamsoft Barcode Reader ${label}`,
      baseTags: ["doc", "dbr", edition, "shared", "capture-vision"]
    });
  }

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
        summary: `DBR web ${category} sample: ${sampleName.replace(/[-_]/g, " ")}.`,
        mimeType: "text/html",
        tags: ["sample", "dbr", "web", category, sampleName, ...getDcvScenarioTags(sampleName)],
        embedText: `DBR web ${category} sample ${sampleName.replace(/[-_]/g, " ")} ${getDcvScenarioTags(sampleName).join(" ")}`,
        loadContent: async () => {
          const samplePath = getWebSamplePath(category, sampleName);
          let content = "Sample not found";
          if (samplePath && existsSync(samplePath)) {
            // Full-project samples (frameworks/*) resolve to a directory; point
            // to get_sample_files rather than reading a directory as a file.
            content = statSync(samplePath).isDirectory()
              ? `This is a multi-file ${category} project. Use get_sample_files with sample_id ${category}/${sampleName} to retrieve all files.`
              : readCodeFile(samplePath);
          }
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

  addMarkdownDocResources({
    addResourceToIndex,
    docs: bbsMobileDocs,
    idPrefix: "bbs-mobile-doc",
    uriPrefix: "doc://bbs/mobile",
    product: "bbs",
    edition: "mobile",
    version: bbsVersion,
    resolveVersion: (article) => LATEST_VERSIONS.bbs[article.platform] || bbsVersion,
    majorVersion: LATEST_MAJOR.bbs,
    defaultPlatform: "mobile",
    defaultSummary: "Dynamsoft Batch Barcode Scanner app documentation",
    baseTags: ["doc", "bbs", "mobile"]
  });
}

export {
  assignDocSlugs,
  buildIndexData,
  buildResourceIndex
};
