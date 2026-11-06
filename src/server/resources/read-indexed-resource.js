// Products whose versioned doc/sample URIs are subject to the latest-major policy.
const VERSION_POLICY_PRODUCTS = ["dbr", "dwt", "ddv", "mrz", "mds", "bbs"];

// Shared read path for doc:// and sample:// URIs. Used by the MCP resource
// templates (resources/read) and the read_document tool so both enforce the
// same version policy and stale-URI guidance.
export function createIndexedResourceReader({ parseResourceUri, ensureLatestMajor, readResourceContent }) {
  return async function readIndexedResource(uri) {
    const uriStr = String(uri);
    const parsed = parseResourceUri(uriStr);
    if (parsed && VERSION_POLICY_PRODUCTS.includes(parsed.product)) {
      const policy = ensureLatestMajor({
        product: parsed.product,
        version: parsed.version,
        edition: parsed.edition,
        platform: parsed.platform
      });
      if (!policy.ok) {
        throw new Error(policy.message);
      }
    }

    const resource = await readResourceContent(uriStr);
    if (!resource) {
      // Doc URIs embed a positional index + exact version, so they can go stale
      // across data refreshes. Point the agent back to search to re-discover the
      // current URI instead of dead-ending (issue #153).
      throw new Error(`Resource not found: ${uriStr}. The URI may be stale (doc URIs change across data refreshes). Call search with keywords from the title to get the current URI.`);
    }

    return resource;
  };
}
