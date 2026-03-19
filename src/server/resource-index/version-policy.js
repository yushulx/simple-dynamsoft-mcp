import { LEGACY_DBR_LINKS, LEGACY_DWT_LINKS } from "./config.js";
import { inferProductFromQuery, normalizeEdition, normalizePlatform } from "../normalizers.js";

const VERSION_FAMILY_BY_PRODUCT = {
  mrz: "dcv",
  mds: "dcv"
};

function parseMajorVersion(version) {
  if (!version) return null;
  const match = String(version).match(/(\d+)/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function detectMajorFromQuery(query) {
  if (!query) return null;
  const text = String(query);
  const explicit = text.match(/(?:\bv|\bversion\s*)(\d{1,2})(?:\.\d+)?/i);
  const productScoped = text.match(/(?:dbr|dcv|dwt|ddv)[^0-9]*(\d{1,2})(?:\.\d+)?/i);
  const match = explicit || productScoped;
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  return Number.isNaN(major) ? null : major;
}

function formatLegacyLinksForDBR(major) {
  const byMajor = LEGACY_DBR_LINKS[String(major)];
  if (!byMajor) return `No legacy docs are available for DBR v${major}.`;

  return [
    `Legacy docs for DBR v${major}:`,
    `- Web (JS): ${byMajor.web.web || "Not available"}`,
    `- Server/Desktop (C++): ${byMajor.cpp.desktop || "Not available"}`,
    `- Server/Desktop (Java): ${byMajor.java.desktop || "Not available"}`,
    `- Server/Desktop (.NET): ${byMajor.dotnet.desktop || "Not available"}`,
    `- Server/Desktop (Python): ${byMajor.python.desktop || "Not available"}`,
    `- Mobile (Android): ${byMajor.mobile.android || "Not available"}`,
    `- Mobile (iOS): ${byMajor.mobile.ios || "Not available"}`
  ].join("\n");
}

function getLegacyLink(product, version, edition, platform) {
  if (product === "dwt") {
    if (!version) return null;
    return LEGACY_DWT_LINKS[version] || null;
  }

  if (product !== "dbr") return null;
  const major = parseMajorVersion(version);
  if (!major) return null;

  const byMajor = LEGACY_DBR_LINKS[String(major)];
  if (!byMajor) return null;

  const normalizedEdition = normalizeEdition(edition, platform, product) || "web";
  const normalizedPlatform = normalizePlatform(platform);
  if (normalizedEdition === "mobile") {
    if (normalizedPlatform === "android") return byMajor.mobile.android;
    if (normalizedPlatform === "ios") return byMajor.mobile.ios;
    return null;
  }
  if (normalizedEdition === "web") return byMajor.web.web;
  if (normalizedEdition === "server") {
    if (normalizedPlatform === "python") return byMajor.python.desktop;
    if (normalizedPlatform === "cpp") return byMajor.cpp.desktop;
    if (normalizedPlatform === "java") return byMajor.java.desktop;
    if (normalizedPlatform === "dotnet") return byMajor.dotnet.desktop;
  }
  return null;
}

function ensureLatestMajor({ product, version, query, edition, platform, latestMajor }) {
  const inferredProduct = product || inferProductFromQuery(query);
  if (!inferredProduct) return { ok: true };

  const versionFamily = VERSION_FAMILY_BY_PRODUCT[inferredProduct] || inferredProduct;
  const currentMajor = latestMajor[versionFamily];
  const requestedMajor = parseMajorVersion(version) ?? detectMajorFromQuery(query);

  if (!requestedMajor || requestedMajor === currentMajor) {
    return { ok: true, latestMajor: currentMajor };
  }

  if (inferredProduct === "ddv") {
    return {
      ok: false,
      message: `This MCP server only serves the latest major version of DDV (v${currentMajor}).`
    };
  }

  if (versionFamily === "dcv") {
    const offeringName = inferredProduct === "dcv" ? "DCV" : inferredProduct.toUpperCase();
    return {
      ok: false,
      message: `This MCP server only serves the latest major version of ${offeringName} (DCV-backed, v${currentMajor}).`
    };
  }

  if (inferredProduct === "dbr" && requestedMajor < 9) {
    return {
      ok: false,
      message: `This MCP server only serves the latest major version of DBR (v${currentMajor}). DBR versions prior to v9 are not available.`
    };
  }

  if (inferredProduct === "dwt" && requestedMajor < 16) {
    return {
      ok: false,
      message: `This MCP server only serves the latest major version of DWT (v${currentMajor}). DWT versions prior to v16 are not available.`
    };
  }

  if (inferredProduct === "dbr") {
    const link = getLegacyLink("dbr", String(requestedMajor), edition, platform);
    const fallback = formatLegacyLinksForDBR(requestedMajor);
    return {
      ok: false,
      message: [
        `This MCP server only serves the latest major version of DBR (v${currentMajor}).`,
        link ? `Legacy docs: ${link}` : fallback
      ].join("\n")
    };
  }

  if (inferredProduct === "dwt") {
    const available = Object.keys(LEGACY_DWT_LINKS).sort();
    const link = getLegacyLink("dwt", String(version), edition, platform);
    const legacyNote = link ? `Legacy docs: ${link}` : `Available archived DWT versions: ${available.join(", ")}`;
    return {
      ok: false,
      message: [
        `This MCP server only serves the latest major version of DWT (v${currentMajor}).`,
        legacyNote
      ].join("\n")
    };
  }

  return { ok: false, message: "Unsupported version request." };
}

function buildVersionPolicyText(latestMajor) {
  const dwtLegacyVersions = Object.keys(LEGACY_DWT_LINKS).sort().join(", ");
  return [
    "# Version Policy",
    "",
    "This MCP server only serves the latest major versions of each product.",
    "",
    `- DBR latest major: v${latestMajor.dbr}`,
    `- MRZ latest major: v${latestMajor.dcv} (DCV-backed)`,
    `- MDS latest major: v${latestMajor.dcv} (DCV-backed)`,
    `- DWT latest major: v${latestMajor.dwt}`,
    `- DDV latest major: v${latestMajor.ddv}`,
    "",
    "Legacy support:",
    "- DBR v9 and v10 docs are linked when requested.",
    "- MRZ and MDS do not publish separate legacy archive links; they follow the latest DCV-backed major only.",
    `- DWT archived docs available: ${dwtLegacyVersions || "none"}.`,
    "- DDV has no legacy archive links in this server.",
    "",
    "Requests for older major versions are refused with a helpful message."
  ].join("\n");
}

export {
  parseMajorVersion,
  detectMajorFromQuery,
  formatLegacyLinksForDBR,
  getLegacyLink,
  ensureLatestMajor,
  buildVersionPolicyText
};
