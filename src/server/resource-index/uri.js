function parseResourceUri(uri) {
  if (!uri || !uri.includes("://")) return null;
  const [scheme, rest] = uri.split("://");
  const parts = rest.split("/").filter(Boolean);
  if (parts.length < 4) return { scheme, parts };
  return {
    scheme,
    product: parts[0],
    edition: parts[1],
    platform: parts[2],
    version: parts[3],
    parts
  };
}

function parseSampleUri(uri) {
  const parsed = parseResourceUri(uri);
  if (!parsed || parsed.scheme !== "sample" || !parsed.product) return null;

  if (parsed.product === "dbr" && parsed.edition === "mobile") {
    return {
      product: "dbr",
      edition: "mobile",
      platform: parsed.platform,
      version: parsed.version,
      level: parsed.parts[4],
      sampleName: parsed.parts[5]
    };
  }

  if (parsed.product === "dbr" && parsed.edition === "web") {
    return {
      product: "dbr",
      edition: "web",
      platform: parsed.platform,
      version: parsed.version,
      category: parsed.parts[4],
      sampleName: parsed.parts[5]
    };
  }

  if (parsed.product === "dbr" && (parsed.edition === "python" || parsed.edition === "server")) {
    return {
      product: "dbr",
      edition: parsed.edition,
      platform: parsed.platform,
      version: parsed.version,
      sampleName: parsed.parts[4]
    };
  }

  if (parsed.product === "dwt") {
    return {
      product: "dwt",
      edition: parsed.edition,
      platform: parsed.platform,
      version: parsed.version,
      category: parsed.parts[4],
      sampleName: parsed.parts[5]
    };
  }

  if (parsed.product === "ddv") {
    return {
      product: "ddv",
      edition: parsed.edition,
      platform: parsed.platform,
      version: parsed.version,
      sampleName: parsed.parts[4]
    };
  }

  if (parsed.product === "mds") {
    return {
      product: "mds",
      edition: parsed.edition,
      platform: parsed.platform,
      version: parsed.version,
      sampleName: parsed.parts[4]
    };
  }

  if (parsed.product === "dcv" && (parsed.edition === "mobile" || parsed.edition === "server" || parsed.edition === "web")) {
    return {
      product: "dcv",
      edition: parsed.edition,
      platform: parsed.platform,
      version: parsed.version,
      sampleName: parsed.parts[4]
    };
  }

  return null;
}

function getSampleIdFromUri(uri) {
  const parsed = parseSampleUri(uri);
  if (!parsed) return "";
  return parsed.sampleName || "";
}

export {
  parseResourceUri,
  parseSampleUri,
  getSampleIdFromUri
};
