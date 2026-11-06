const PUBLIC_OFFERING_ALIASES = {
  dwt: "dwt",
  "dynamic web twain": "dwt",
  "web twain": "dwt",
  webtwain: "dwt",
  twain: "dwt",
  ddv: "ddv",
  "document viewer": "ddv",
  "document-viewer": "ddv",
  "dynamsoft document viewer": "ddv",
  "doc viewer": "ddv",
  "pdf viewer": "ddv",
  "edit viewer": "ddv",
  dbr: "dbr",
  "barcode reader": "dbr",
  "barcode-reader": "dbr",
  "dynamsoft barcode reader": "dbr",
  mrz: "mrz",
  "mrz scanner": "mrz",
  "machine readable zone": "mrz",
  mds: "mds",
  "document scanner": "mds",
  "document scanning": "mds",
  "document scan": "mds",
  "document normalization": "mds",
  "document normalizer": "mds",
  bbs: "bbs",
  "batch barcode scanner": "bbs",
  "batch-barcode-scanner": "bbs",
  "dynamsoft batch barcode scanner": "bbs",
  "batch scanner": "bbs"
};

const PUBLIC_OFFERING_PRODUCTS = ["dwt", "ddv", "dbr", "mrz", "mds", "bbs"];

const HYDRATION_PRODUCT_MAP = {
  mrz: "dcv",
  mds: "dcv"
};

const PUBLIC_OFFERINGS_TEXT = "dbr, dwt, ddv, mrz, mds, or bbs";

// Shared lineup-policy wording for tool descriptions and input-schema notes.
// Single source: when the lineup changes (e.g. a product gains an edition),
// edit here and the long-form server `instructions` in create-server.js.
const WEB_ONLY_OMIT_NOTE = "DWT/DDV/MRZ/MDS are web/JS-only (omit for them); BBS is an Android/iOS app (omit edition; pass platform android or ios only for version or release-note questions).";
const DBR_ONLY_EDITIONS_NOTE = `Only DBR has multiple editions; ${WEB_ONLY_OMIT_NOTE}`;
const API_LEVEL_NOTE = "high-level or low-level. DBR mobile ONLY; ignored for web/server/other products.";
const PRODUCT_SELECTION_GUIDANCE = "DBR is the only product with multiple editions (mobile/web/server). DWT, DDV, MRZ, and MDS are web/JavaScript-only here, so do not ask the user which platform or language for them. BBS is an Android/iOS app (docs only, no SDK): never ask for a programming language, and ask Android or iOS only when the answer differs by app, such as versions or release notes. api_level (high-level/low-level) applies only to DBR mobile.";
// Pinned workflow-based selection guide (resource and read_document target),
// advertised to tool-only clients as get_index productSelection.guideUri.
const PRODUCT_SELECTION_GUIDE_URI = "doc://product-selection";

// Capability facts confirmed by Dynamsoft that the docs do not state outright
// (especially what is NOT offered). Served by get_index and the pinned
// product-selection guidance so agents answer "do you support X?" correctly.
const CAPABILITY_FACTS = {
  note: "Known capability facts. They take precedence over inference; for anything not listed here, search before concluding that a capability is unsupported.",
  ocr: "There is no standalone general (full-page) OCR SDK. The OCR Connector is an add-on of Dynamic Web TWAIN (DWT) and is used only together with DWT, typically on a PC or workstation; do not recommend it for mobile or non-DWT workflows. Short text in known regions (labels, cards, printed VINs) is read by Dynamsoft Label Recognizer, a Dynamsoft Capture Vision (DCV) component.",
  vin: "VIN barcodes: DBR (web sample: read-vin; mobile samples: ScanVIN). Printed VIN text: DCV components Camera Enhancer + Label Recognizer + Code Parser (VIN text template); it reads VINs on door-frame labels and paperwork well. Known limitation: VINs read through the windshield on the dashboard are not well supported.",
  idDocuments: "Passports and ID cards with an MRZ zone: MRZ. AAMVA driver licenses: DBR, which decodes the PDF417 barcode and parses the driver-license fields (web sample: read-a-drivers-license).",
  batchScanning: "Dynamsoft Batch Barcode Scanner (BBS) is a ready-to-use Android/iOS app for scanning many barcodes at once (inventory, lab tubes); there is no BBS SDK. Integrate by exporting results (CSV/images, sharing, cloud). To embed multi-barcode scanning in your own app, use DBR."
};

function normalizePublicOffering(product) {
  if (!product) return "";
  const normalized = product.trim().toLowerCase();
  return PUBLIC_OFFERING_ALIASES[normalized] || "";
}

function getHydrationProduct(product) {
  const normalized = normalizePublicOffering(product) || String(product || "").trim().toLowerCase();
  return HYDRATION_PRODUCT_MAP[normalized] || normalized;
}

function isKnownPublicOffering(product) {
  return PUBLIC_OFFERING_PRODUCTS.includes(product);
}

function buildUnknownPublicProductResponse(requestedProduct) {
  const value = String(requestedProduct || "").trim();
  return {
    isError: true,
    content: [{
      type: "text",
      text: `Unknown public product "${value}". Use ${PUBLIC_OFFERINGS_TEXT}.`
    }]
  };
}

export {
  PUBLIC_OFFERING_PRODUCTS,
  PUBLIC_OFFERINGS_TEXT,
  WEB_ONLY_OMIT_NOTE,
  DBR_ONLY_EDITIONS_NOTE,
  API_LEVEL_NOTE,
  PRODUCT_SELECTION_GUIDANCE,
  PRODUCT_SELECTION_GUIDE_URI,
  CAPABILITY_FACTS,
  normalizePublicOffering,
  getHydrationProduct,
  isKnownPublicOffering,
  buildUnknownPublicProductResponse
};
