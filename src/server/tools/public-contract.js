function buildDeprecatedProductResponse(requestedProduct) {
  const normalized = String(requestedProduct || "").trim().toLowerCase();
  if (![
    "dcv",
    "capture vision",
    "capture-vision",
    "dynamsoft capture vision",
    "dynamsoft capture vision sdk",
    "capture vision bundle",
    "vin scanner",
    "driver license scanner"
  ].includes(normalized)) {
    return null;
  }

  return {
    isError: true,
    content: [{
      type: "text",
      text: [
        'The public MCP contract no longer accepts product="dcv".',
        "Use the public products dbr, dwt, ddv, mrz, and mds instead.",
        "- Use mrz for passport and machine-readable-zone workflows.",
        "- Use mds for document scan and normalization workflows.",
        "- Internal DCV-backed routing is still used automatically for MRZ and MDS."
      ].join("\n")
    }]
  };
}

export {
  buildDeprecatedProductResponse
};
