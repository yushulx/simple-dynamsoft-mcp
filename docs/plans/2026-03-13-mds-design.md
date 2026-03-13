# MDS First-Class Product Design

**Goal:** Add Dynamsoft Mobile Document Scanner JavaScript Edition (MDS) to the MCP server as a first-class product with its own documentation and sample repositories.

## Architecture

Model MDS as a standalone web product, parallel to `dwt` and `ddv`, rather than folding it into `dcv` or introducing product-specific shortcuts. The server should expose MDS through the same product-aware surfaces already used elsewhere: metadata registry, compact index, resource URIs, search/listing filters, version resolution, and RAG signature inputs.

## Components

- `Submodules`: add `data/samples/mobile-document-scanner-javascript` from `https://github.com/Dynamsoft/document-scanner-javascript` and `data/documentation/mobile-document-scanner-docs-js` from `https://github.com/dynamsoft-docs/mobile-document-scanner-docs-js` in `.gitmodules`.
- `Metadata`: add an `mds` SDK entry in `data/metadata/dynamsoft_sdks.json`, following the standalone web-product shape used by `dwt` and `ddv`, using:
  - user guide: `https://www.dynamsoft.com/mobile-document-scanner/docs/web/guide/index.html`
  - api reference: `https://www.dynamsoft.com/mobile-document-scanner/docs/web/api/index.html`
- `Path/config wiring`: extend `src/server/resource-index/config.js` and `src/server/resource-index/paths.js` so MDS docs and samples are addressable through the existing discovery code.
- `Docs and sample discovery`: add MDS doc loading in `src/server/resource-index.js` and MDS sample discovery helpers in `src/server/resource-index/samples.js`.
- `Index/resources`: add `products.mds` to `doc://index` and register MDS docs/resources under stable `doc://mds/...` and `sample://mds/...` URIs in `src/server/resource-index/builders.js`.
- `Product-aware tools`: extend normalization and product allowlists so `search`, `list_samples`, `get_index`, `resolve_version`, and resource reads all accept `mds` naturally.

## Data Flow

At startup, the server should load MDS markdown docs from the new documentation submodule, discover MDS web samples from the new sample repo, and merge both into the resource index alongside existing products. `get_index` should report MDS as a compact top-level product with a `web` edition and computed doc/sample counts. Search and sample listing should then filter MDS resources using the same normalized `product`/`edition`/`platform` path used for current products.

## Error Handling

- Missing MDS submodules should degrade the same way current optional data roots do: zero discovered docs/samples rather than product-specific crashes during discovery.
- Version and resource policy checks should treat `mds` as a latest-major web product, like `dwt` and `ddv`.
- Data-manifest-backed signature checks must include the new MDS sample/docs roots so cache invalidation stays correct when submodule commits change.

## Testing

- Extend integration coverage in `test/server.test.js` so `get_index` includes `mds`, `list_samples` can enumerate MDS samples, and `resolve_version` returns an MDS web version.
- Extend unit coverage anywhere product allowlists are hard-coded, especially `src/server/normalizers.js`, `src/server/tools/register-version-tools.js`, and `src/server/resources/register-resources.js`.
- After implementation, regenerate and verify manifest metadata with `npm run data:lock` and `npm run data:verify-lock`, then run targeted server tests and the broader `npm run test:unit` / `npm run test:lite` suite.
