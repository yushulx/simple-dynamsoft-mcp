# AGENTS.md

## Purpose
This file is the operational guide for coding agents working in `simple-dynamsoft-mcp`.
Use it as the default source for build/test workflows and coding conventions.

## Project Snapshot
- Runtime: Node.js ESM (`"type": "module"`), Node >= 18 required.
- Main entrypoint: `src/index.js`.
- Server factory: `src/server/create-server.js`.
- Test framework: built-in `node:test` + `node:assert/strict`.
- Key domains: MCP tool registration, resource indexing, RAG providers, data bootstrap/submodule sync.
- Public MCP surface: `dwt`, `ddv`, `dbr`, `mrz`, `mds`; `dcv` may still appear in internal resource or version wiring, but do not expose it as a public product.
- Shared Capture Vision docs: DCV pages that DBR docs or DBR sidebars (`_includes/`) link to are indexed under `dbr` (tags `shared`, `capture-vision`; real `capture-vision/docs` URL; `sourceVersion` = DCV version). Selection lives in `src/server/resource-index/shared-docs.js`; a DCV source whose minor/build does not match the DBR edition is skipped with a `shared_docs_version_mismatch` warning.
- Doc URIs are `doc://{product}/{edition}/{platform}/{version}/{path}`, where `path` is the source file path without `.md`, without the `programming/<lang>/` prefix, and with trailing `/index` dropped (full source path on collision). Shared DCV pages use `dcv/...` or `dcv-core/...` paths.
- Embedding providers: `gemini`, `openai`, `azure-openai` (registry in `src/rag/embedding-providers.js`; adapters in `src/rag/providers.js` share one HTTP client with retry/backoff). Each provider has its own cache files (`rag-<provider>-<model>-*`) and release asset (`prebuilt-rag-index-<provider>-<version>.tar.gz`). The repository variable `RAG_EMBED_PROVIDER` (default `gemini`) selects the provider for release prebuild, deploy, and CI; OpenAI/Azure keys are GitHub secrets (`OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`), other settings repository variables (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_EMBED_DEPLOYMENT`, …). Switching provider or dimensions means one full re-embed.
- Index builds are incremental: every cached chunk carries a hash of the embedding identity (provider/model/dimensions) + text, and a build reuses vectors from any cache, checkpoint, or seeded previous release in `RAG_CACHE_DIR`, embedding only new or changed chunks (`RAG_REBUILD=true` forces a full re-embed). `scripts/seed-rag-cache.sh <dir> <provider>` seeds from the latest release; release and CI use it. CI's vector-provider job runs only on pull requests that change retrieval code, index building, `data/`, or the golden set; it uses no Actions cache and seeds from the latest release instead.

## Repository Rules Discovery
Checked for repository-level editor-agent policy files:
- `.cursor/rules/**`: not found
- `.cursorrules`: not found
- `.github/copilot-instructions.md`: not found

If any of these files are added later, treat them as higher-priority guidance and update this file.

## Install / Build / Run
- Install dependencies: `npm ci`
- Start server (stdio transport): `npm start`
- Start server directly: `node src/index.js`
- Start HTTP transport: `node src/index.js --transport=http --host=127.0.0.1 --port=3333`

Notes:
- There is no dedicated `build` script right now.
- There is no dedicated `lint` script right now.

## Test Commands (Canonical)
High-signal test entrypoints from `package.json`:
- Full default suite: `npm test`
- Unit tests: `npm run test:unit`
- Lite integration pack: `npm run test:lite`
- Stdio integration: `npm run test:stdio`
- HTTP integration: `npm run test:http`
- Package runtime integration: `npm run test:package`
- Lazy hydration integration: `npm run test:lazy`
- Lexical-provider integration: `npm run test:lexical`
- Vector-provider integration: `npm run test:gemini` (uses `RAG_EMBED_PROVIDER`, default `gemini`, and needs that provider's credentials)
- Regression pack: `npm run test:regression`
- Retrieval-quality gate (real data, lexical, golden set): `npm run test:retrieval`
- Retrieval metrics report: `npm run eval:retrieval -- --show` (`--provider=gemini|openai|azure-openai` needs that provider's credentials; `--json=<path>` writes the report)

## Running A Single Test
Prefer direct `node --test` for single-file and single-test targeting.

Run one test file:
- `node --test test/unit/create-server.test.js`
- `node --test test/integration/stdio.test.js`

Run one named test (substring or regex pattern):
- `node --test --test-name-pattern "registers expected tool surface" test/unit/create-server.test.js`
- `node --test --test-name-pattern "\\[lexical\\] stdio integration works" test/integration/stdio.test.js`

Run multiple specific files:
- `node --test test/unit/create-server.test.js test/unit/server-helpers.test.js`

Useful debug variants:
- Keep sequential execution when needed: `node --test --test-concurrency=1 <file>`
- Show test isolation issues faster: run the exact file repeatedly before broad suites.

## Data / Metadata Commands
- Bootstrap submodules: `npm run data:bootstrap`
- Sync submodules: `npm run data:sync`
- Check submodule status: `npm run data:status`
- Update SDK versions: `npm run data:versions`
- Strict update validation: `npm run data:versions:strict`
- Verify SDK versions only: `npm run data:verify-versions`
- Strict verify wiring: `npm run data:verify-versions:strict`
- Regenerate lock manifest: `npm run data:lock`
- Verify lock manifest: `npm run data:verify-lock`
- Verify doc resources: `npm run data:verify-docs`
- Prebuild RAG cache artifacts: `npm run rag:prebuild`

## CI Reality (What Must Stay Green)
From `.github/workflows/ci.yml`, core jobs are:
- `test_lite` (includes strict version wiring + lite tests)
- `test_lexical_provider`
- `test_lazy_hydration`
- `test_package_runtime_windows`
- `test_package_runtime_macos`
- `test_gemini_provider` (pull requests with retrieval-relevant changes; uses `RAG_EMBED_PROVIDER`)

When modifying server behavior, at minimum run:
1. `npm run test:unit`
2. `npm run test:lite`

When modifying indexing, ranking, or `test/fixtures/retrieval-golden.json`, also run `npm run eval:retrieval` and compare against the previous numbers; `npm run test:retrieval` enforces floors in the lexical CI job.

When modifying data/version logic, also run:
1. `npm run data:verify-versions:strict`
2. `npm run data:verify-lock`

## Code Style Guidelines

### Language / Modules
- Use plain JavaScript ESM (`import`/`export`), not TypeScript.
- Keep file extensions explicit in imports (example: `./module.js`).
- Prefer named exports for shared utilities; keep APIs explicit.

### Imports
- Keep imports grouped in this order when possible:
  1) Node built-ins (`node:*`)
  2) External packages
  3) Local project modules
- Within groups, keep ordering stable and readable (usually alphabetical or logical usage order).
- Avoid unused imports; do not leave commented-out imports.

### Formatting
- Match existing style: 2-space indentation, semicolons, double quotes.
- Keep lines reasonably compact; split long object literals and call args over multiple lines.
- Prefer trailing newline at EOF.
- Do not run broad reformatting on unrelated files.

### Naming
- `camelCase`: variables, functions, local helpers.
- `PascalCase`: classes and constructor-like entities.
- `UPPER_SNAKE_CASE`: module-level constants (especially defaults and limits).
- Use descriptive names tied to MCP/resource/RAG domain terms.

### Types And Validation
- Runtime validation is preferred over static typing in this repo.
- Use `zod` schemas for MCP tool inputs (`inputSchema`) where applicable.
- Normalize and sanitize external/user-provided inputs before use.

### Error Handling
- Throw `Error` for invalid runtime config and unrecoverable setup failures.
- In `catch`, normalize unknown errors with `error instanceof Error ? error.message : String(error)`.
- For MCP tool failures, return structured error payloads (for example `{ isError: true, content: [...] }`) instead of crashing.
- Log meaningful diagnostics through observability helpers (`logEvent`, RAG logger functions).

### Async / Control Flow
- Use `async`/`await` over raw promise chains for readability.
- Keep startup flow explicit (data readiness -> server start -> optional prewarm).
- Avoid hidden side effects in utility functions; return explicit data.

### Testing Conventions
- Use `node:test` and `node:assert/strict`.
- Keep test names behavior-focused and specific.
- Add unit tests for pure logic and integration tests for transport/runtime paths.
- Gate provider-specific behavior with existing env toggles rather than hard-coding.

## File / Change Boundaries
- Do not edit submodule payloads under `data/documentation/*` or `data/samples/*` unless explicitly requested.
- Avoid manual edits to generated metadata files when scripts exist:
  - `data/metadata/dynamsoft_sdks.json` -> update via `npm run data:versions`
  - `data/metadata/data-manifest.json` -> update via `npm run data:lock`
- Keep PRs/task changes narrowly scoped; do not mix refactors with behavior changes unless required.

## Agent Completion Checklist
Before handing off work:
1. Run targeted tests for changed areas (single-file or named-test runs are fine first).
2. Run broader suite(s) that match risk (`test:unit`, `test:lite`, etc.).
3. Run data verification commands when touching metadata/data bootstrap/version sync.
4. Confirm no accidental edits in submodule content.
5. Summarize commands run and outcomes in the handoff.
