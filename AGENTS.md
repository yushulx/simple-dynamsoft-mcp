# AGENTS.md

## Purpose
This repository hosts a stdio-only MCP server for Dynamsoft SDKs. It provides tool-based discovery and lazy resource reads so agents do not load all resources by default.

Supported products:
- DBR (Barcode Reader): mobile, web, server/desktop (python, dotnet, java, cpp, nodejs)
- DWT (Dynamic Web TWAIN): web
- DDV (Document Viewer): web

## Core Design
- Minimal tool surface: `get_index`, `search`, `list_samples`, `resolve_sample`, `resolve_version`, `get_quickstart`, `generate_project`.
- Resources are discovered via tools and read on demand with `resources/read`.
- `resources/list` exposes only pinned resources to keep context small.
- Resource indexing logic is split under `src/resource-index/` with `src/resource-index.js` as the composition layer.
- Dual-mode data: use local submodules when available, otherwise bootstrap pinned archives for npm/npx usage.
- Transport is stdio only. Do not add an HTTP wrapper in this repo.

## Version Policy
- Only the latest major version is served.
- DBR legacy docs are available only for v9 and v10; versions prior to v9 are refused.
- DWT archived docs are available for v16.1.1+ (specific versions listed in code).
- DDV has no legacy archive links in this server.

## Key Files and Data
- `src/index.js`: server implementation, tools, resource routing, version policy.
- `src/data-bootstrap.js`: runtime data resolver/downloader for npm/npx environments.
- `src/data-root.js`: shared data-root resolution (`MCP_DATA_DIR` / resolved cache root / bundled data).
- `src/resource-index.js`: resource index composition and exports used by the server and RAG layer.
- `src/resource-index/*`: modularized resource-index implementation (`config`, `paths`, docs/sample discovery, URI parsing, version policy, builders).
- `src/submodule-sync.js`: optional startup sync for submodules (`DATA_SYNC_ON_START`).
- `scripts/sync-submodules.mjs`: script entry used by `npm run data:sync`.
- `scripts/update-data-lock.mjs`: updates `data/metadata/data-manifest.json` from current submodule commits.
- `scripts/verify-data-lock.mjs`: verifies lock manifest matches current submodule heads.
- `scripts/prebuild-rag-index.mjs`: builds and writes local RAG cache artifacts for release distribution.
- `test/integration/helpers.js`: shared integration test helpers for stdio, streamable HTTP gateway, and package runtime.
- `test/integration/stdio.test.js`: stdio integration tests using MCP SDK client transport.
- `test/integration/http-gateway.test.js`: HTTP integration tests through `supergateway`.
- `test/integration/package-runtime.test.js`: packaged runtime test via `npm pack` + `npm exec --package`.
- `.github/workflows/ci.yml`: CI test matrix (`test_fuse` + `test_local_provider` on `ubuntu-latest`).
- `.github/workflows/release.yml`: release pipeline for GitHub releases and attached artifacts.
- `data/metadata/dynamsoft_sdks.json`: product metadata and latest version info.
- `data/metadata/data-manifest.json`: pinned commit lockfile used for runtime data bootstrap.
- `data/samples/*`: sample repositories (git submodules).
- `data/documentation/barcode-reader-docs-js`: DBR web docs repository (git submodule).
- `data/documentation/barcode-reader-docs-mobile`: DBR mobile docs repository (git submodule).
- `data/documentation/barcode-reader-docs-server`: DBR server docs repository (git submodule).
- `data/documentation/web-twain-docs`: DWT docs repository (git submodule).
- `data/documentation/document-viewer-docs`: DDV docs repository (git submodule).

Avoid modifying `data/` submodule content unless explicitly requested.

## Resource URI Shape
- Docs: `doc://{product}/{edition}/{platform}/{version}/{slug}`
- Samples: `sample://{product}/{edition}/{platform}/{version}/...`

## Tests and Commands
- Run server: `npm start`
- Run tests: `npm test`
- Run fuse integration suite: `npm run test:fuse`
- Run local-provider integration suite: `npm run test:local`
- Run stdio integration only: `npm run test:stdio`
- Run streamable HTTP gateway integration only: `npm run test:http`
- Run packaged runtime integration only: `npm run test:package`
- Init submodules: `npm run data:bootstrap`
- Sync submodules: `npm run data:sync`
- Submodule status: `npm run data:status`
- Update data lock manifest: `npm run data:lock`
- Verify data lock manifest: `npm run data:verify-lock`
- Build prebuilt local RAG index cache: `npm run rag:prebuild`
- Optional startup sync env: `DATA_SYNC_ON_START=true`, `DATA_SYNC_TIMEOUT_MS=30000`
- Optional runtime data env: `MCP_DATA_DIR`, `MCP_DATA_AUTO_DOWNLOAD`, `MCP_DATA_CACHE_DIR`, `MCP_DATA_REFRESH_ON_START`
- Optional test toggles: `RUN_FUSE_PROVIDER_TESTS=true|false`, `RUN_LOCAL_PROVIDER_TESTS=true|false`

CI notes:
- `test_fuse` runs on `ubuntu-latest` for every PR/push.
- `test_local_provider` runs on `ubuntu-latest` for every PR/push.
- `rag:prebuild` is run in the local-provider CI job before local-provider integration tests.

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
- Always run `npm run data:verify-lock` after lock updates and before proposing releases.
- Keep dual-mode behavior intact: dev clone should use local submodules when available, and npm/npx mode should bootstrap from manifest-pinned archives into cache.
- If users report "no download happened", first check startup stderr for the `[data] mode=...` log line.
- Be careful with package contents: ensure npm package does not include full submodule payloads.
- Avoid modifying submodule contents under `data/samples/*` and `data/documentation/*` unless explicitly requested.
- Local-provider tests create `.cache/` under repo root unless overridden by env; do not commit that directory.

## Contribution Notes
- Prefer adding new content as resources (search + read) instead of new tools.
- Keep edits ASCII-only unless the file already uses Unicode.
- Keep code changes focused; avoid reformatting unrelated sections.
