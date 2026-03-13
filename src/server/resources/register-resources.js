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
    if (parsed && ["dcv", "dbr", "dwt", "ddv", "mds"].includes(parsed.product)) {
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
      throw new Error(`Resource not found: ${uriStr}`);
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
