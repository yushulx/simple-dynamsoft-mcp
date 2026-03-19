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
  normalizePublicOffering,
  getHydrationProduct,
  isKnownPublicOffering,
  buildUnknownPublicProductResponse
};
