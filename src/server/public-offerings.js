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
  "document normalizer": "mds"
};

const PUBLIC_OFFERING_PRODUCTS = ["dwt", "ddv", "dbr", "mrz", "mds"];

const HYDRATION_PRODUCT_MAP = {
  mrz: "dcv",
  mds: "dcv"
};

const PUBLIC_OFFERINGS_TEXT = "dbr, dwt, ddv, mrz, or mds";

// Shared lineup-policy wording for tool descriptions and input-schema notes.
// Single source: when the lineup changes (e.g. a product gains an edition),
// edit here and the long-form server `instructions` in create-server.js.
const WEB_ONLY_OMIT_NOTE = "DWT/DDV/MRZ/MDS are web/JS-only (omit for them).";
const DBR_ONLY_EDITIONS_NOTE = `Only DBR has multiple editions; ${WEB_ONLY_OMIT_NOTE}`;
const API_LEVEL_NOTE = "high-level or low-level. DBR mobile ONLY; ignored for web/server/other products.";
const PRODUCT_SELECTION_GUIDANCE = "DBR is the only product with multiple editions (mobile/web/server). DWT, DDV, MRZ, and MDS are web/JavaScript-only here, so do not ask the user which platform or language for them. api_level (high-level/low-level) applies only to DBR mobile.";

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
  normalizePublicOffering,
  getHydrationProduct,
  isKnownPublicOffering,
  buildUnknownPublicProductResponse
};
