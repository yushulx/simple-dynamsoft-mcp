import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResourceHandlers({
  server,
  getPinnedResources,
  parseResourceUri,
  ensureLatestMajor,
  readResourceContent
}) {
  for (const entry of getPinnedResources()) {
    server.registerResource(
      entry.title,
      entry.uri,
      {
        description: entry.summary,
        mimeType: entry.mimeType
      },
      async (uri) => {
        const resource = await readResourceContent(uri.toString());
        if (!resource) {
          throw new Error(`Resource not found: ${uri}`);
        }
        return { contents: [resource] };
      }
    );
  }

  async function templateReadHandler(uri) {
    const uriStr = uri.toString();
    const parsed = parseResourceUri(uriStr);
    if (parsed && ["dbr", "dwt", "ddv", "mrz", "mds"].includes(parsed.product)) {
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

    return { contents: [resource] };
  }

  server.registerResource(
    "doc-resource",
    new ResourceTemplate("doc://{product}/{edition}/{platform}/{version}/{+slug}", {}),
    { description: "Dynamsoft documentation resource" },
    templateReadHandler
  );

  server.registerResource(
    "sample-resource",
    new ResourceTemplate("sample://{product}/{edition}/{platform}/{version}/{+rest}", {}),
    { description: "Dynamsoft sample code resource" },
    templateReadHandler
  );
}
