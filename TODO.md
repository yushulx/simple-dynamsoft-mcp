# TODO

## Purpose

This file tracks open release/data automation work.

Current state:
- `update-data-lock.yml` fast-forwards submodules, updates `data/metadata/data-manifest.json`, runs tests, and opens a PR.
- `release.yml` exists and creates GitHub releases on version changes to `main`, with attached artifacts.
- `release.yml` uses `runs-on: self-hosted` for the prebuilt local RAG index job.
- `release.yml` publishes to npm using OIDC trusted publishing after creating the GitHub Release.
- DBR server/desktop refactor and DBR docs integration are complete.
- Release orchestration decision: custom workflows only.
- Patch bump scope decision: automated data-refresh PRs only.
- Human-driven minor version bumps (e.g., `5.0.2 -> 5.1.0`) should publish a release.
- Human-driven major version bumps (e.g., `5.x.y -> 6.0.0`) should publish a release.
- Prebuilt index default decision: `RAG_PREBUILT_INDEX_AUTO_DOWNLOAD=true`.
- Prebuilt index profile decision: single model profile for now (`Xenova/all-MiniLM-L6-v2`).

## Workstream 1: Data Refresh PR Automation

Goal: turn data-refresh PRs into automatic patch release candidates.

- [x] Change `update-data-lock.yml` schedule from weekly to daily.
- [x] In the workflow, detect whether data changed (`.gitmodules`, submodule SHAs, `data/metadata/data-manifest.json`).
- [x] When data changed, auto-bump patch version in `package.json` and `package-lock.json`.
- [x] Ensure patch bumps are monotonic from `main` (e.g., `5.0.0 -> 5.0.1 -> 5.0.2`).
- [x] Skip version bump if no data change is detected.
- [x] Add clear PR title/label convention for auto data-release PRs.
- [x] Keep `npm run data:verify-lock` and `npm test` as required checks in the PR workflow.

## Workstream 2: Release Pipeline (GitHub Release + npm Publish)

Goal: publish releases automatically when version changes land on `main`.

- [x] Add a release workflow triggered by version changes (or semver tags) on `main`.
- [x] Ensure release workflow runs for:
- [x] automated patch bumps from data-refresh PRs
- [x] manual minor bumps committed by maintainers
- [x] manual major bumps committed by maintainers
- [x] Require CI-green status before release steps.
- [x] Build package artifact with `npm pack` and attach `.tgz` to the GitHub Release.
- [x] Publish package to npm from the release workflow.
- [x] Generate release notes including data/source changes.
- [x] Add workflow concurrency guard to prevent parallel releases.

## Workstream 3: Prebuilt Local RAG Index Distribution

Goal: avoid long local index build time whenever local embeddings are used (primary provider or fallback path).

- [x] Add a self-hosted runner job to prebuild local embedding index for release.
- [x] Attach prebuilt index artifact(s) to GitHub Release.
- [x] Define artifact naming convention including compatibility keys:
- [x] package version
- [x] RAG model id
- [ ] index signature/cache key
- [ ] Add runtime logic: whenever execution resolves to local embeddings (primary or fallback), try downloading matching prebuilt index before local build.
- [ ] Validate downloaded index signature before use.
- [ ] Fallback to existing local-build flow when prebuilt index is missing/incompatible/download fails.
- [ ] Add env controls:
- [ ] `RAG_PREBUILT_INDEX_AUTO_DOWNLOAD` (default `true`)
- [ ] `RAG_PREBUILT_INDEX_URL`
- [ ] `RAG_PREBUILT_INDEX_TIMEOUT_MS`
- [ ] Document this behavior in `README.md`, `AGENTS.md`, and `.env.example`.

## Post-Release Validation

- [ ] Add smoke test for npm-like install/run (`npm pack` then execute from tarball context).
- [ ] Validate `npx` first-run bootstrap path on Windows and Linux/macOS.
- [x] Validate prebuilt-index build + release-attachment path in workflow.
- [ ] Validate runtime prebuilt-index download path and fallback behavior.

## Workstream 4: Hybrid Lexical Fallback (BM25 + Fuse)

Goal: replace fuse-only fallback with lexical hybrid retrieval for no-model scenarios.

- [ ] Add a lexical provider that combines BM25 keyword ranking with Fuse fuzzy matching.
- [ ] Keep semantic providers (`gemini`/`local`) as primary, and use hybrid lexical for fallback.
- [ ] Add score fusion/rerank strategy for BM25 + Fuse results with deterministic ordering.
- [ ] Add env toggle for lexical fallback (for example `RAG_FALLBACK=lexical`).
- [ ] Keep standalone `fuse` mode available for compatibility.
- [ ] Add integration tests for lexical fallback in both stdio and HTTP gateway paths.
- [ ] Document lexical fallback behavior in `README.md`, `AGENTS.md`, and `.env.example`.

## Workstream 5: Gemini Prewarm Rate-Limit Hardening

Goal: prevent prewarm failures when embedding large corpora with Gemini API quotas/rate limits.

- [ ] Add exponential backoff with jitter for Gemini embedding requests during prewarm/index build.
- [ ] Add retry policy for retryable errors (`429`, `503`, transient `5xx`) with max-attempt cap.
- [ ] Add configurable throttling between Gemini requests/batches to reduce burst pressure.
- [ ] Add env controls for retry/backoff/throttle settings (for example `GEMINI_RETRY_MAX_ATTEMPTS`, `GEMINI_RETRY_BASE_DELAY_MS`, `GEMINI_RETRY_MAX_DELAY_MS`, `GEMINI_REQUEST_THROTTLE_MS`).
- [ ] Add adaptive batch downgrade on repeated rate-limit responses (reduce `GEMINI_EMBED_BATCH_SIZE` progressively).
- [ ] Persist partial progress/checkpoints during prewarm so retries can resume instead of restarting full corpus embedding.
- [ ] Add graceful fallback behavior when prewarm fails (continue startup and use fallback provider/search mode).
- [ ] Add structured logs/metrics for retry attempts, backoff delay, throttle events, and final prewarm outcome.
- [ ] Add tests for retry/backoff behavior and config parsing, and update docs in `README.md`, `AGENTS.md`, and `.env.example`.

## Key Points For Future Agents

- Do not manually edit `data/metadata/data-manifest.json`; regenerate via `npm run data:lock`.
- Always run `npm run data:verify-lock` and `npm test` for release/data changes.
- Keep npm package payload minimal (`data/metadata` + runtime code), not full submodule contents.
- Preserve dual-mode data behavior:
- dev/local clone uses submodules
- npm/npx mode downloads pinned archives into cache
- Avoid direct edits inside submodule trees under `data/samples/*` and `data/documentation/*` unless explicitly requested.
