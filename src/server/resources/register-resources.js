import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

export function registerResourceHandlers({
  server,
  getPinnedResources,
  parseResourceUri,
  ensureLatestMajor,
  readResourceContent
}) {
  server.server.registerCapabilities({
    resources: {
      listChanged: false,
      subscribe: true
    }
  });

  server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = getPinnedResources().map((entry) => ({
      uri: entry.uri,
      name: entry.title,
      description: entry.summary,
      mimeType: entry.mimeType
    }));
    return { resources };
  });

  server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const parsed = parseResourceUri(request.params.uri);
    if (parsed && ["dcv", "dbr", "dwt", "ddv"].includes(parsed.product)) {
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

    const resource = await readResourceContent(request.params.uri);
    if (!resource) {
      throw new Error(`Resource not found: ${request.params.uri}`);
    }

    return { contents: [resource] };
  });

  server.server.setRequestHandler(SubscribeRequestSchema, async () => ({}));
  server.server.setRequestHandler(UnsubscribeRequestSchema, async () => ({}));
}
