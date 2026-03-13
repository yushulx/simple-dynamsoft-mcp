import { normalizeHydrationScopes } from "./hydration-policy.js";

const REPO_MAP = {
  dbr: {
    docs: {
      web: ["documentation/barcode-reader-docs-js"],
      mobile: ["documentation/barcode-reader-docs-mobile"],
      server: ["documentation/barcode-reader-docs-server"],
      any: [
        "documentation/barcode-reader-docs-js",
        "documentation/barcode-reader-docs-mobile",
        "documentation/barcode-reader-docs-server"
      ]
    },
    samples: {
      web: ["samples/dynamsoft-barcode-reader"],
      mobile: [
        "samples/dynamsoft-barcode-reader-mobile",
        "samples/dynamsoft-barcode-reader-maui",
        "samples/dynamsoft-barcode-reader-react-native",
        "samples/dynamsoft-barcode-reader-flutter"
      ],
      server: [
        "samples/dynamsoft-barcode-reader-python",
        "samples/dynamsoft-barcode-reader-dotnet",
        "samples/dynamsoft-barcode-reader-java",
        "samples/dynamsoft-barcode-reader-c-cpp",
        "samples/dynamsoft-capture-vision-nodejs"
      ],
      any: [
        "samples/dynamsoft-barcode-reader",
        "samples/dynamsoft-barcode-reader-mobile",
        "samples/dynamsoft-barcode-reader-python",
        "samples/dynamsoft-barcode-reader-dotnet",
        "samples/dynamsoft-barcode-reader-java",
        "samples/dynamsoft-barcode-reader-c-cpp",
        "samples/dynamsoft-barcode-reader-maui",
        "samples/dynamsoft-barcode-reader-react-native",
        "samples/dynamsoft-barcode-reader-flutter",
        "samples/dynamsoft-capture-vision-nodejs"
      ]
    }
  },
  dcv: {
    docs: {
      core: ["documentation/capture-vision-docs"],
      web: ["documentation/capture-vision-docs-js"],
      mobile: ["documentation/capture-vision-docs-mobile"],
      server: ["documentation/capture-vision-docs-server"],
      any: [
        "documentation/capture-vision-docs",
        "documentation/capture-vision-docs-js",
        "documentation/capture-vision-docs-mobile",
        "documentation/capture-vision-docs-server"
      ]
    },
    samples: {
      web: ["samples/dynamsoft-capture-vision-javascript"],
      mobile: [
        "samples/dynamsoft-capture-vision-mobile",
        "samples/dynamsoft-capture-vision-maui",
        "samples/dynamsoft-capture-vision-react-native",
        "samples/dynamsoft-capture-vision-flutter",
        "samples/dynamsoft-capture-vision-spm"
      ],
      server: [
        "samples/dynamsoft-capture-vision-python",
        "samples/dynamsoft-capture-vision-dotnet",
        "samples/dynamsoft-capture-vision-java",
        "samples/dynamsoft-capture-vision-c-cpp",
        "samples/dynamsoft-capture-vision-nodejs"
      ],
      any: [
        "samples/dynamsoft-capture-vision-javascript",
        "samples/dynamsoft-capture-vision-mobile",
        "samples/dynamsoft-capture-vision-python",
        "samples/dynamsoft-capture-vision-dotnet",
        "samples/dynamsoft-capture-vision-java",
        "samples/dynamsoft-capture-vision-c-cpp",
        "samples/dynamsoft-capture-vision-maui",
        "samples/dynamsoft-capture-vision-react-native",
        "samples/dynamsoft-capture-vision-flutter",
        "samples/dynamsoft-capture-vision-nodejs",
        "samples/dynamsoft-capture-vision-spm"
      ]
    }
  },
  dwt: {
    docs: {
      any: ["documentation/web-twain-docs"]
    },
    samples: {
      any: ["samples/dynamic-web-twain"]
    }
  },
  ddv: {
    docs: {
      any: ["documentation/document-viewer-docs"]
    },
    samples: {
      any: ["samples/dynamsoft-document-viewer"]
    }
  },
  mds: {
    docs: {
      web: ["documentation/mobile-document-scanner-docs-js"],
      any: ["documentation/mobile-document-scanner-docs-js"]
    },
    samples: {
      web: ["samples/mobile-document-scanner-javascript"],
      any: ["samples/mobile-document-scanner-javascript"]
    }
  }
};

function getMappedPaths(product, edition, sourceType) {
  const productMap = REPO_MAP[product];
  if (!productMap) return [];
  const typeMap = productMap[sourceType];
  if (!typeMap) return [];
  if (edition && typeMap[edition]) return typeMap[edition];
  return typeMap.any || [];
}

function resolveRepoPathsForScopes(scopes = [], manifest = null) {
  const manifestPaths = new Set(
    Array.isArray(manifest?.repos) ? manifest.repos.map((repo) => String(repo.path || "")) : []
  );

  const normalizedScopes = normalizeHydrationScopes(scopes);
  if (normalizedScopes.length === 0) {
    if (manifestPaths.size === 0) return [];
    return Array.from(manifestPaths).sort((a, b) => a.localeCompare(b));
  }

  const resolved = new Set();
  for (const scope of normalizedScopes) {
    const includeDocs = scope.type === "any" || scope.type === "doc";
    const includeSamples = scope.type === "any" || scope.type === "sample";

    if (includeDocs) {
      for (const path of getMappedPaths(scope.product, scope.edition, "docs")) {
        resolved.add(path);
      }
    }
    if (includeSamples) {
      for (const path of getMappedPaths(scope.product, scope.edition, "samples")) {
        resolved.add(path);
      }
    }
  }

  const filtered = Array.from(resolved).filter((path) => manifestPaths.size === 0 || manifestPaths.has(path));
  return filtered.sort((a, b) => a.localeCompare(b));
}

export {
  resolveRepoPathsForScopes
};
