# AGENTS.md

## Purpose
This repository hosts an MCP server for Dynamsoft SDKs with stdio as default transport and optional native Streamable HTTP mode. It provides tool-based discovery and lazy resource reads so agents do not load all resources by default.

Supported products:
- DCV (Capture Vision): core, mobile, web, server/desktop (python, dotnet, java, cpp, nodejs)
- DBR (Barcode Reader): mobile, web, server/desktop (python, dotnet, java, cpp, nodejs)
- DWT (Dynamic Web TWAIN): web
- DDV (Document Viewer): web

## Core Design
- Minimal tool surface: `get_index`, `search`, `list_samples`, `resolve_sample`, `resolve_version`, `get_quickstart`, `generate_project`.
- Resources are discovered via tools and read on demand with `resources/read`.
- `resources/list` exposes only pinned resources to keep context small.
- Resource indexing logic is split under `src/server/resource-index/` with `src/server/resource-index.js` as the composition layer.
- Dual-mode data: use local submodules when available, otherwise bootstrap pinned archives for npm/npx usage.
- Runtime profile targets:
  - `lite` (default target): lightweight retrieval path without local embedding model download.
  - `semantic-local`: local embedding retrieval path.
  - `semantic-gemini`: Gemini embedding retrieval path.
- Transport defaults to stdio and also supports native Streamable HTTP via CLI (`--transport=http`, `--host`, `--port`). Do not add an external HTTP wrapper layer in this repo.

## Version Policy
- Only the latest major version is served.
- DBR legacy docs are available only for v9 and v10; versions prior to v9 are refused.
- DCV has no legacy archive links in this server.
- DWT archived docs are available for v16.1.1+ (specific versions listed in code).
- DDV has no legacy archive links in this server.

## Key Files and Data
- `src/index.js`: entrypoint bootstrap (data init, runtime transport selection).
- `src/server/create-server.js`: MCP server factory (tool/resource registration and handlers).
- `src/server/runtime-config.js`: CLI parser and transport runtime config (`--transport`, `--host`, `--port`).
- `src/server/transports/stdio.js`: stdio transport startup.
- `src/server/transports/http.js`: native streamable HTTP transport startup (`/mcp`).
- `src/data/bootstrap.js`: runtime data resolver/downloader for npm/npx environments.
- `src/data/root.js`: shared data-root resolution (`MCP_DATA_DIR` / resolved cache root / bundled data).
- `src/data/submodule-sync.js`: optional startup sync for submodules (`DATA_SYNC_ON_START`).
- `src/rag/index.js`: search provider selection and retrieval.
- `src/rag/gemini-retry.js`: Gemini retry/backoff helpers.
- `src/server/resource-index.js`: resource index composition and exports used by the server and RAG layer.
- `src/server/resource-index/*`: modularized resource-index implementation (`config`, `paths`, docs/sample discovery, URI parsing, version policy, builders).
- `scripts/sync-submodules.mjs`: script entry used by `npm run data:sync`.
- `scripts/update-sdk-versions.mjs`: syncs latest SDK versions from docs repositories (supports strict mode for source-structure drift detection).
- `scripts/update-data-lock.mjs`: updates `data/metadata/data-manifest.json` from current submodule commits.
- `scripts/verify-data-lock.mjs`: verifies lock manifest matches current submodule heads.
- `scripts/prebuild-rag-index.mjs`: builds and writes local RAG cache artifacts for release distribution.
- `test/integration/helpers.js`: shared integration test helpers for stdio, native streamable HTTP, and package runtime.
- `test/integration/stdio.test.js`: stdio integration tests using MCP SDK client transport.
- `test/integration/http.test.js`: HTTP integration tests against native streamable HTTP mode.
- `test/integration/package-runtime.test.js`: packaged runtime test via `npm pack` + `npm exec --package`.
- `.github/workflows/ci.yml`: CI test matrix (`test_lite` + `test_local_provider` on `ubuntu-latest`).
- `.github/workflows/release.yml`: release pipeline for GitHub releases and attached artifacts.
- `data/metadata/dynamsoft_sdks.json`: product metadata and latest version info.
- `data/metadata/data-manifest.json`: pinned commit lockfile used for runtime data bootstrap.
- `data/samples/*`: sample repositories (git submodules).
- `data/documentation/barcode-reader-docs-js`: DBR web docs repository (git submodule).
- `data/documentation/barcode-reader-docs-mobile`: DBR mobile docs repository (git submodule).
- `data/documentation/barcode-reader-docs-server`: DBR server docs repository (git submodule).
- `data/documentation/capture-vision-docs`: DCV core docs repository (git submodule).
- `data/documentation/capture-vision-docs-js`: DCV web docs repository (git submodule).
- `data/documentation/capture-vision-docs-server`: DCV server docs repository (git submodule).
- `data/documentation/capture-vision-docs-mobile`: DCV mobile docs repository (git submodule).
- `data/documentation/web-twain-docs`: DWT docs repository (git submodule).
- `data/documentation/document-viewer-docs`: DDV docs repository (git submodule).

Avoid modifying `data/` submodule content unless explicitly requested.

## Resource URI Shape
- Docs: `doc://{product}/{edition}/{platform}/{version}/{slug}`
- Samples: `sample://{product}/{edition}/{platform}/{version}/...`

## Tests and Commands
- Run server: `npm start`
- Run tests: `npm test`
- Run unit tests: `npm run test:unit`
- Run lite integration suite: `npm run test:lite`
- Run local-provider integration suite: `npm run test:local`
- Run gemini-provider integration suite: `npm run test:gemini`
- Run stdio integration only: `npm run test:stdio`
- Run native streamable HTTP integration only: `npm run test:http`
- Run packaged runtime integration only: `npm run test:package`
- Init submodules: `npm run data:bootstrap`
- Sync submodules: `npm run data:sync`
- Submodule status: `npm run data:status`
- Update SDK versions from docs: `npm run data:versions`
- Strict version/source check during update: `npm run data:versions:strict`
- Verify SDK versions are synced: `npm run data:verify-versions`
- Strict verify for source-structure drift: `npm run data:verify-versions:strict`
- Update data lock manifest: `npm run data:lock`
- Verify data lock manifest: `npm run data:verify-lock`
- Verify all doc resources can be read: `npm run data:verify-docs`
- Build prebuilt local RAG index cache: `npm run rag:prebuild`
- Optional startup sync env: `DATA_SYNC_ON_START=true`, `DATA_SYNC_TIMEOUT_MS=30000`
- Optional profile env: `MCP_PROFILE=lite|semantic-local|semantic-gemini`
- Optional runtime data env: `MCP_DATA_DIR`, `MCP_DATA_AUTO_DOWNLOAD`, `MCP_DATA_CACHE_DIR`, `MCP_DATA_REFRESH_ON_START`
- Optional hydration env: `MCP_DATA_HYDRATION_MODE=lazy|eager` (default `lazy`; `lazy` hydrates repo scopes on demand)
- Optional retrieval env: `RAG_PROVIDER`, `RAG_FALLBACK` (explicit override of profile defaults)
  - `RAG_PROVIDER`: `fuse|lexical|local|gemini`
  - `RAG_FALLBACK`: `none|fuse|lexical|local`
  - `lexical` mode is hybrid lexical retrieval (BM25 keyword ranking + Fuse fuzzy ranking)
- Optional gemini retry env: `GEMINI_RETRY_MAX_ATTEMPTS`, `GEMINI_RETRY_BASE_DELAY_MS`, `GEMINI_RETRY_MAX_DELAY_MS`, `GEMINI_REQUEST_THROTTLE_MS`
- Optional test toggles: `RUN_FUSE_PROVIDER_TESTS=true|false`, `RUN_LOCAL_PROVIDER_TESTS=true|false`, `RUN_GEMINI_PROVIDER_TESTS=true|false`
- Optional prebuilt RAG env: `RAG_PREBUILT_INDEX_AUTO_DOWNLOAD`, `RAG_PREBUILT_INDEX_URL`, `RAG_PREBUILT_INDEX_URL_LOCAL`, `RAG_PREBUILT_INDEX_URL_GEMINI`, `RAG_PREBUILT_INDEX_TIMEOUT_MS`

CI notes:
- `test_lite` runs on `ubuntu-latest` for every PR/push.
- `test_lite` includes strict source-wiring validation via `npm run data:verify-versions:strict`.
- `test_local_provider` runs on `ubuntu-latest` for every PR/push.
- `test_gemini_provider` runs on `ubuntu-latest` when `GEMINI_API_KEY` secret is configured.
- `rag:prebuild` is run in the local-provider CI job before local-provider integration tests.
- `update-data-lock.yml` enables auto-merge for refresh PRs when repository settings allow auto-merge and required checks pass.

## Roadmap Notes
- Read `TODO.md` before making release automation changes.
- `TODO.md` contains deferred release workflow plan, guardrails, and handoff checklist for future agents.

## Agent Handoff Notes

### Mistakes Observed During This Refactor

- A readiness bug treated submodule stub folders (only `.git`) as valid data. This prevented runtime archive download in some clones.
- Assuming changes to `npm start` would fix `npx` behavior was incorrect. `npx` executes the package `bin` (`src/index.js`), not npm scripts.
- Lack of startup visibility slowed debugging. Data mode/path logging was added to stderr in startup.
- Including volatile timestamps in `data-manifest.json` caused noisy automation PRs even without commit changes.
- Packaging full `data/` content for npm was the wrong direction for this architecture; package now includes `data/metadata` only.

### Important Notes For Future Agents

- Do not edit `data/metadata/data-manifest.json` manually. Regenerate it with `npm run data:lock`.
- Do not edit `data/metadata/dynamsoft_sdks.json` manually for "latest" updates when docs can be used. Use `npm run data:versions`.
- Always run `npm run data:verify-lock` after lock updates and before proposing releases.
- Always run `npm run data:verify-versions:strict` when changing docs submodules, version extraction logic, or metadata workflow.
- Keep dual-mode behavior intact: dev clone should use local submodules when available, and npm/npx mode should bootstrap from manifest-pinned archives into cache.
- If users report "no download happened", first check startup stderr for the `[data] mode=...` log line.
- Be careful with package contents: ensure npm package does not include full submodule payloads.
- Avoid modifying submodule contents under `data/samples/*` and `data/documentation/*` unless explicitly requested.
- Local-provider tests create `.cache/` under repo root unless overridden by env; do not commit that directory.

### Runbook: Add New Documentation And Sample Sources

Use this sequence when onboarding a new product family or edition docs/samples.

1. Create a feature branch first.
2. Add docs/samples as git submodules under:
   - `data/documentation/<repo-name>`
   - `data/samples/<repo-name>`
3. Initialize and sync submodules:
   - `npm run data:bootstrap`
   - `npm run data:sync`
4. Inspect each added repo structure before coding:
   - Check README and scenario folders/files (MRZ, VIN, doc scan, driver license, etc.).
   - Confirm where release notes or canonical version source is stored.
5. Update indexing/config layer:
   - `src/server/resource-index/config.js` (dirs, platform candidates, preferred file types)
   - `src/server/resource-index/paths.js` (new roots)
   - `src/server/resource-index/samples.js` (discovery + resolvers)
   - `src/server/resource-index/uri.js` (URI parsing)
   - `src/server/resource-index.js` (load docs/samples, latest versions, signature data)
   - `src/server/resource-index/builders.js` (resource builders, scenario tags, pinned guidance resources)
6. Update product normalization/routing:
   - `src/server/normalizers.js` (aliases, scenario inference terms)
   - `src/server/create-server.js` (tool schema hints, resolve_version/get_quickstart/generate_project routes)
   - `src/server/resource-index/version-policy.js` (latest-major policy and legacy messaging)
7. Update metadata and public guidance:
   - `data/metadata/dynamsoft_sdks.json`
   - `README.md`
   - add/refresh pinned product-selection guidance resource so external agents see DBR-vs-DCV criteria on first connection.
8. Update/extend tests:
   - `test/server.test.js`
   - `test/integration/helpers.js`
9. Refresh lock and versions:
   - `npm run data:versions:strict`
   - `npm run data:verify-versions:strict`
   - `npm run data:lock`
   - `npm run data:verify-lock`
10. Run validation suites:
   - `node test/server.test.js`
   - `npm run test:unit`
   - `npm run test:stdio`
   - `npm test`

### Version Source Rules (Automation)

- Version sync entrypoint: `scripts/update-sdk-versions.mjs`.
- Workflow hook: `.github/workflows/update-data-lock.yml` runs:
  - `npm run data:versions:strict`
  - `npm run data:verify-versions:strict`
- Prefer product-specific canonical sources, not one generic regex:
  - DBR/DCV editions: release-note index pages.
  - DWT: `assets/js/setLatestVersion.js`.
  - DDV: `_data/product_version.yml` (fallback release notes).
  - DCV core: `_data/product_version.yml`, fallback to max edition versions when grouped labels are used.

### Pitfalls Found While Adding DCV

- Do not assume all docs repos have `/release-notes/` folders; structures differ by product.
- Some docs repos store grouped labels like `latest version` or `2.x` instead of full semantic versions.
- If core docs only expose grouped major labels, derive from concrete edition versions as fallback.
- Add scenario tags during sample indexing, otherwise sample resolution may miss best matches for MRZ/VIN/document/license queries.
- Keep DBR-vs-DCV selection guidance explicit and pinned; this affects external agent routing quality.
- After adding submodules, always regenerate `data/metadata/data-manifest.json`; stale lockfiles break runtime bootstrap expectations.

## Contribution Notes
- Prefer adding new content as resources (search + read) instead of new tools.
- Keep edits ASCII-only unless the file already uses Unicode.
- Keep code changes focused; avoid reformatting unrelated sections.
