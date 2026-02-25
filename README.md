# Dynamsoft MCP Server

MCP (Model Context Protocol) server that enables AI assistants to write correct code with Dynamsoft SDKs. It provides actual working code snippets, documentation links, and API guidance for:

- **Dynamsoft Capture Vision (DCV)** - Unified workflows for VIN, MRZ, document normalization, driver license parsing, and more
- **Dynamsoft Barcode Reader Mobile** - Android (Java/Kotlin) and iOS (Swift)
- **Dynamsoft Barcode Reader Server/Desktop** - Python, .NET, Java, C++, Node.js
- **Dynamsoft Barcode Reader Web** - JavaScript/TypeScript barcode scanning
- **Dynamic Web TWAIN** - Document scanning from TWAIN/WIA/ICA/SANE scanners
- **Dynamsoft Document Viewer** - Web document viewing and annotation

## Demo Video
https://github.com/user-attachments/assets/cc1c5f4b-1461-4462-897a-75abc20d62a6


## Features

- **Code Snippets**: Real, working source code from official Dynamsoft samples
- **Trial License Included**: Ready-to-use trial license for quick testing
- **Multiple SDKs**: Capture Vision + Barcode Reader (Mobile/Web/Server) + Dynamic Web TWAIN + Document Viewer
- **Multiple API Levels**: High-level (simple) and low-level (advanced) options
- **Transport options**: `stdio` by default, plus optional native Streamable HTTP (`/mcp`) via CLI flags.
- **Resource-efficient discovery**: Resources are discovered via tools (semantic RAG search with fuzzy fallback + resource links). Only a small pinned set is listed by default; heavy content is fetched on-demand with `resources/read`.
- **Submodule-backed resources**: Samples and docs are pulled from official upstream repositories under `data/samples/` and `data/documentation/`.
- **Dual-mode data loading**: local clone uses submodules; `npx simple-dynamsoft-mcp` auto-downloads pinned archives into a local cache when submodules are unavailable.
- **Latest-major policy**: The server only serves the latest major versions; older major requests are refused with legacy links when available.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_index` | Compact index of products, editions, versions, samples, and docs |
| `search` | Unified search across docs and samples; returns resource links |
| `list_samples` | List available sample IDs and URIs for a scope |
| `resolve_sample` | Resolve a sample_id (or sample URI) to matching sample URIs |
| `resolve_version` | Resolve a concrete latest-major version for a product/edition |
| `get_quickstart` | Opinionated quickstart for a target stack |
| `generate_project` | Assemble a project structure from a sample (no AI generation) |

`npx simple-dynamsoft-mcp` is supported. If bundled submodule data is missing, the server auto-downloads pinned data archives on first run (network required).

## MCP Client Configuration

### OpenCode
Location: 
- **macOS**: `~/.config/opencode/opencode.json`
- **Windows**: `%USERPROFILE%\.config\opencode\opencode.json`

Configuration:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dynamsoft": {
      "type": "local",
      "command": [
        "npx",
        "simple-dynamsoft-mcp"
      ]
    }
  }
}
```

### Claude Desktop

Location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Configuration:
```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```

### VS Code with GitHub Copilot

Global Location:

- **macOS**: `~/Library/Application Support/Code/User/mcp.json`
- **Windows**: `%APPDATA%\Code\User\mcp.json`

```json
{
  "servers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```

Or create workspace-specific `.vscode/mcp.json`:

```json
{
  "servers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```

### Cursor

Location: 
- **macOS**: `~/.cursor/mcp.json`
- **Windows**: `%USERPROFILE%\.cursor\mcp.json`

Configuration:

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```

### Windsurf

Location:

- **macOS**: `~/.codeium/windsurf/mcp_config.json`
- **Windows**: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```


### Alternative: Run from Local Clone

If you prefer running from source:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/simple-dynamsoft-mcp/src/index.js"]
}
```

Default local run mode is stdio:

```bash
npm start
```

Optional native HTTP mode:

```bash
node src/index.js --transport=http --host=127.0.0.1 --port=3333
```

HTTP endpoint path: `/mcp`.

## Environment Variables in MCP Clients

When using `npx`, you can still configure the server by passing environment variables in your MCP client config.

Example:

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"],
      "env": {
        "MCP_PROFILE": "lite",
        "MCP_DATA_AUTO_DOWNLOAD": "true",
        "MCP_DATA_REFRESH_ON_START": "false"
      }
    }
  }
}
```

Commonly used settings:
- `MCP_PROFILE`: `lite` | `semantic-local` | `semantic-gemini`
- `RAG_PROVIDER`: `lexical` | `gemini` | `local` | `fuse` (explicit override)
- `RAG_FALLBACK`: `lexical` | `fuse` | `local` | `none`
- `RAG_PREBUILT_INDEX_AUTO_DOWNLOAD`: `true` by default; auto-fetch prebuilt index when local or gemini embeddings are selected
- `RAG_PREBUILT_INDEX_URL`: global override release asset URL for prebuilt index archive
- `RAG_PREBUILT_INDEX_URL_LOCAL`: override release asset URL for local prebuilt index archive
- `RAG_PREBUILT_INDEX_URL_GEMINI`: override release asset URL for gemini prebuilt index archive
- `RAG_PREBUILT_INDEX_TIMEOUT_MS`: download timeout for prebuilt index fetch
- `MCP_DATA_DIR`: use a preloaded local data folder (`metadata/`, `samples/`, `documentation/`)
- `MCP_DATA_AUTO_DOWNLOAD`: allow startup archive download when bundled data is unavailable
- `MCP_DATA_REFRESH_ON_START`: force re-download of pinned archives on startup
- `MCP_DATA_CACHE_DIR`: customize downloaded data cache location
- `MCP_DATA_HYDRATION_MODE`: `lazy` (metadata-first, hydrate selected repos on demand) or `eager` (download full corpus at startup)
- `MCP_DATA_DOWNLOAD_RETRY_MAX_ATTEMPTS`: retry attempts for retryable archive download failures
- `MCP_DATA_DOWNLOAD_RETRY_BASE_DELAY_MS`: exponential backoff base delay
- `MCP_DATA_DOWNLOAD_RETRY_MAX_DELAY_MS`: exponential backoff max delay

Default profile target is `MCP_PROFILE=lite` (lightweight startup, no local embedding model download).

For the complete list and defaults, see `.env.example` and the sections `Submodule Setup` and `RAG Configuration` below.

## Use Release Assets In A Local Project

Use this when you want to run from a built `.tgz` package and reuse prebuilt RAG indexes.

1. Download release assets from GitHub Releases for the same version:
- `simple-dynamsoft-mcp-<version>.tgz`
- `prebuilt-rag-index-local-<version>.tar.gz`
- `prebuilt-rag-index-gemini-<version>.tar.gz` (only needed if `RAG_PROVIDER=gemini`)
2. In your project folder, create a local tools folder, for example:
- `<project>/.tools/simple-dynamsoft-mcp/`
3. Copy assets into that folder and extract the prebuilt index you plan to use:
- Keep `simple-dynamsoft-mcp-<version>.tgz` as-is for `npx --package`.
- Extract `prebuilt-rag-index-local-<version>.tar.gz` for local embeddings.
- Extract `prebuilt-rag-index-gemini-<version>.tar.gz` for gemini embeddings.
- Expected cache output path: `<project>/.tools/simple-dynamsoft-mcp/prebuilt-rag/<provider>/cache/*.json`.
4. Configure project-local `.vscode/mcp.json` to use the local package and cache path.

Example (`.vscode/mcp.json`):

```json
{
  "servers": {
    "dynamsoft": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        ".tools/simple-dynamsoft-mcp/simple-dynamsoft-mcp-<version>.tgz",
        "simple-dynamsoft-mcp"
      ],
      "env": {
        "RAG_PROVIDER": "local",
        "RAG_FALLBACK": "local",
        "RAG_REBUILD": "false",
        "RAG_LOCAL_MODEL": "Xenova/all-MiniLM-L6-v2",
        "RAG_LOCAL_QUANTIZED": "true",
        "RAG_CACHE_DIR": ".tools/simple-dynamsoft-mcp/prebuilt-rag/local/cache"
      }
    }
  }
}
```

Notes:
- Use absolute paths if your MCP client does not resolve relative paths from workspace root.
- `RAG_REBUILD` must stay `false` to reuse prebuilt cache files.
- Runtime auto-download is enabled by default (`RAG_PREBUILT_INDEX_AUTO_DOWNLOAD=true`) when provider resolution reaches local embeddings (primary or fallback).
- Default prebuilt URL patterns:
- `https://github.com/yushulx/simple-dynamsoft-mcp/releases/download/v<version>/prebuilt-rag-index-local-<version>.tar.gz`
- `https://github.com/yushulx/simple-dynamsoft-mcp/releases/download/v<version>/prebuilt-rag-index-gemini-<version>.tar.gz`
- Downloaded prebuilt cache is accepted when package version matches (with provider/model/payload sanity checks).
- Prebuilt cache is used whenever provider execution resolves to local or gemini embeddings (primary or fallback).

## Runtime Profiles (Internal + Public)

Use profiles to keep end-user setup simple while preserving advanced internal modes.

| Profile | Intended use | Default provider/fallback | First-run cost | Network/model dependencies |
|---|---|---|---|---|
| `lite` | Public + default internal | `lexical` / `none` | Lowest | No local embedding model download |
| `semantic-local` | Internal semantic search | `local` / `none` | Higher | Downloads local embedding model + builds/loads vector cache |
| `semantic-gemini` | Advanced semantic search | `gemini` / `none` | Medium | Requires `GEMINI_API_KEY` and network access |

Precedence:
- Explicit env vars (for example `RAG_PROVIDER`) override profile defaults.
- Profile defaults apply when explicit overrides are not provided.

## Supported SDKs

### Dynamsoft Capture Vision (DCV)

DCV is a superset architecture that aggregates DBR, DLR, DDN, DCP, and DCE into one pluggable pipeline.

Use **DBR** when you only need barcode decoding.
Use **DCV** when your workflow includes VIN, MRZ/passport/ID, driver license parsing, document detection/normalization/auto-capture/cropping, or multi-task capture-vision pipelines.

**DCV editions covered in this MCP server:**
- **Core docs** - architecture and cross-product concepts
- **Web (JavaScript)**
- **Server/Desktop** - Python, .NET, Java, C++, Node.js
- **Mobile** - Android, iOS, Flutter, React Native, .NET MAUI (+ SPM package sample)

### Dynamsoft Barcode Reader Mobile (latest)

**Platforms:** Android, iOS, Flutter, React Native, .NET MAUI

**API Levels:**
- **High-Level (BarcodeScanner)**: Simple ready-to-use barcode scanning UI
- **Low-Level (CaptureVisionRouter)**: Full control over the scanning pipeline

**Android Samples:**
- ScanSingleBarcode, ScanMultipleBarcodes, ScenarioOrientedSamples
- DecodeWithCameraEnhancer, DecodeWithCameraX, DecodeFromAnImage
- GeneralSettings, DriversLicenseScanner, TinyBarcodeDecoding, ReadGS1AI

**iOS Samples:**
- ScanSingleBarcode, ScanMultipleBarcodes, ScanSingleBarcodeSwiftUI
- DecodeWithCameraEnhancer, DecodeWithAVCaptureSession, DecodeFromAnImage

### Dynamsoft Barcode Reader Server/Desktop (latest)

**Platforms:** Python, .NET, Java, C++, Node.js

**Python installation:** `pip install dynamsoft-barcode-reader-bundle`

**Server/Desktop samples:** Pulled from platform-specific sample repositories in `data/samples/`.

### Dynamsoft Barcode Reader Web (latest)

**Installation:** `npm install dynamsoft-barcode-reader-bundle`

**CDN:** `https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@latest/dist/dbr.bundle.min.js`

**Samples:**
- **hello-world** - Basic barcode scanning from camera
- **read-an-image** - Decode from image files
- **frameworks/** - React, Vue, Angular, Next.js, PWA samples
- **scenarios/** - Multi-image reading, localize an item, driver license parsing

### Dynamic Web TWAIN (latest)

**Installation:** `npm install dwt`

**CDN:** `https://cdn.jsdelivr.net/npm/dwt@latest/dist/dynamsoft.webtwain.min.js`

**Sample Categories:**
- **scan** - Basic document scanning (basic-scan, read-barcode, etc.)
- **input-options** - Load from files, URLs, local drive
- **output-options** - Save, upload, convert to PDF/Base64/Blob
- **classification** - Document classification and tagging
- **UI-customization** - Customize viewer and scan UI

### Dynamsoft Document Viewer (latest)

**Installation:** `npm install dynamsoft-document-viewer`

**CDN:** `https://cdn.jsdelivr.net/npm/dynamsoft-document-viewer@latest/dist/ddv.js`

**Samples:**
- **hello-world** - Basic viewer setup
- **angular**, **react-vite**, **vue**, **next** - Framework starter samples

## Trial License
https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform

## Example AI Prompts

After connecting the MCP server, you can ask your AI assistant:

### Mobile Barcode Scanner
- "Create an Android app that scans a single barcode"
- "Show me how to use CaptureVisionRouter in iOS Swift"
- "Get the Gradle configuration for Dynamsoft Barcode Reader"
- "How do I initialize the Dynamsoft license in Kotlin?"

### Server/Desktop Barcode Reader
- "Show me how to read barcodes from an image in Python"
- "Get me a Node.js barcode reader sample"
- "List DBR .NET samples and generate one project"

### Web Barcode Reader
- "Create a web page that scans barcodes from a camera"
- "Show me the web barcode reader hello world sample"
- "Get the React sample for web barcode scanning"
- "How do I decode barcodes from an image in JavaScript?"

### Capture Vision (DCV)
- "Find a DCV sample for MRZ scanning in Python"
- "Get a VIN scanning sample for Java or C++"
- "Show me DCV document normalization samples for mobile"
- "I need driver license parsing; should I use DBR or DCV?"
- "List DCV server samples and generate a project from MRZScanner"

### Dynamic Web TWAIN
- "Create a web page that scans documents from a TWAIN scanner"
- "Show me how to save scanned documents as PDF"
- "Get the DWT sample for reading barcodes from scanned documents"
- "Search the DWT docs for how to load images from files"
- "Get the DWT documentation about OCR"
- "How do I configure the PDF rasterizer in DWT?"

## SDK Documentation

- **DCV Core**: https://www.dynamsoft.com/capture-vision/docs/core/
- **DCV Mobile**: https://www.dynamsoft.com/capture-vision/docs/mobile/
- **DCV Server/Desktop**: https://www.dynamsoft.com/capture-vision/docs/server/
- **DCV Web**: https://www.dynamsoft.com/capture-vision/docs/web/
- **Mobile Android**: https://www.dynamsoft.com/barcode-reader/docs/mobile/programming/android/user-guide.html
- **Mobile iOS**: https://www.dynamsoft.com/barcode-reader/docs/mobile/programming/objectivec-swift/user-guide.html
- **Python**: https://www.dynamsoft.com/barcode-reader/docs/server/programming/python/user-guide.html
- **Web JavaScript**: https://www.dynamsoft.com/barcode-reader/docs/web/programming/javascript/user-guide/index.html
- **Dynamic Web TWAIN**: https://www.dynamsoft.com/web-twain/docs/introduction/index.html

## Data Repository Structure

```
data/
|-- metadata/
|   |-- dynamsoft_sdks.json
|   `-- data-manifest.json               # Pinned repo commits for runtime bootstrap
|-- samples/                             # Git submodules
|   |-- dynamsoft-barcode-reader
|   |-- dynamsoft-barcode-reader-mobile
|   |-- dynamsoft-barcode-reader-maui
|   |-- dynamsoft-barcode-reader-react-native
|   |-- dynamsoft-barcode-reader-flutter
|   |-- dynamsoft-barcode-reader-python
|   |-- dynamsoft-barcode-reader-dotnet
|   |-- dynamsoft-barcode-reader-java
|   |-- dynamsoft-barcode-reader-c-cpp
|   |-- dynamsoft-capture-vision-nodejs
|   |-- dynamsoft-capture-vision-c-cpp
|   |-- dynamsoft-capture-vision-dotnet
|   |-- dynamsoft-capture-vision-java
|   |-- dynamsoft-capture-vision-python
|   |-- dynamsoft-capture-vision-mobile
|   |-- dynamsoft-capture-vision-javascript
|   |-- dynamsoft-capture-vision-react-native
|   |-- dynamsoft-capture-vision-maui
|   |-- dynamsoft-capture-vision-flutter
|   |-- dynamsoft-capture-vision-spm
|   |-- dynamic-web-twain
|   `-- dynamsoft-document-viewer
|-- documentation/                       # Git submodules
|   |-- barcode-reader-docs-js
|   |-- barcode-reader-docs-mobile
|   |-- barcode-reader-docs-server
|   |-- capture-vision-docs
|   |-- capture-vision-docs-js
|   |-- capture-vision-docs-server
|   |-- capture-vision-docs-mobile
|   |-- web-twain-docs
|   `-- document-viewer-docs
`-- .rag-cache/
```

## Source Code Structure

```
src/
|-- index.js                            # Entry point: bootstrap + transport selection
|-- data/
|   |-- bootstrap.js                    # Runtime data resolver/downloader (npx mode)
|   |-- root.js                         # Shared resolved data root selection
|   `-- submodule-sync.js               # Optional startup fast-forward sync
|-- rag/
|   |-- index.js                        # Search provider selection and retrieval
|   `-- gemini-retry.js                 # Gemini retry/backoff helpers
|-- server/                             # MCP server builder and transports
|   |-- create-server.js                # Tool/resource registration factory
|   |-- normalizers.js                  # Product/platform/edition normalization
|   |-- resource-index.js               # Resource index composition layer
|   |-- runtime-config.js               # CLI transport/host/port parsing
|   |-- resource-index/
|   |   |-- config.js
|   |   |-- paths.js
|   |   |-- docs-loader.js
|   |   |-- samples.js
|   |   |-- uri.js
|   |   |-- version-policy.js
|   |   `-- builders.js
|   `-- transports/
|       |-- stdio.js                    # stdio startup path
|       `-- http.js                     # native Streamable HTTP startup path
scripts/
|-- sync-submodules.mjs                 # CLI wrapper for data:sync
|-- update-sdk-versions.mjs             # Sync SDK versions from docs structures
|-- update-data-lock.mjs                # Generate data-manifest from submodule HEADs
|-- verify-data-lock.mjs                # Verify manifest matches submodule HEADs
`-- prebuild-rag-index.mjs              # Build local RAG index cache artifacts
test/
`-- integration/
    |-- helpers.js                      # Shared MCP client/process helpers
    |-- stdio.test.js                   # stdio integration tests
    |-- http.test.js                    # native streamable HTTP integration tests
    `-- package-runtime.test.js         # npm pack + package runtime integration test
```

`src/` contains runtime server code. `scripts/` contains operational helpers used by npm scripts.

## Submodule Setup

- Clone with submodules:
  - `git clone --recurse-submodules <repo-url>`
- If already cloned:
  - `npm run data:bootstrap`
- Check status:
  - `npm run data:status`
- Sync submodules to configured branches (fast-forward only):
  - `npm run data:sync`
- Refresh lock manifest after submodule updates:
  - `npm run data:lock`
- Verify lock manifest matches submodule HEADs:
  - `npm run data:verify-lock`
- Sync SDK versions from docs sources:
  - `npm run data:versions`
- Strict source-structure verification (fail on unresolved sources):
  - `npm run data:verify-versions:strict`

Optional startup sync:
- `DATA_SYNC_ON_START=true`
- `DATA_SYNC_TIMEOUT_MS=30000`

Optional runtime data bootstrap (mainly for npm/npx installs):
- `MCP_DATA_DIR=<existing data root>`
- `MCP_DATA_AUTO_DOWNLOAD=true`
- `MCP_DATA_CACHE_DIR=<cache path>`
- `MCP_DATA_REFRESH_ON_START=false`
- `MCP_DATA_HYDRATION_MODE=lazy`
- `MCP_DATA_DOWNLOAD_RETRY_MAX_ATTEMPTS=3`
- `MCP_DATA_DOWNLOAD_RETRY_BASE_DELAY_MS=500`
- `MCP_DATA_DOWNLOAD_RETRY_MAX_DELAY_MS=5000`

Default cache location when `MCP_DATA_CACHE_DIR` is not set:
- Windows: `%LOCALAPPDATA%\simple-dynamsoft-mcp\data`
- Linux/macOS: `~/.cache/simple-dynamsoft-mcp/data`

Hydration modes:
- `lazy` (default): initialize metadata first, then hydrate scope-matched repos (product/edition/type) on tool calls.
- `eager`: download all repos from the lock manifest during startup bootstrap.

At startup, the server logs data mode/path to stderr:
- `[data] mode=downloaded ... source=fresh-download|cache`
- `[data] mode=downloaded-lazy ... source=cache`
- `[data] mode=bundled ...`
- `[data] mode=custom ...`

## Automation

- CI workflow: `.github/workflows/ci.yml`
- CI jobs:
- `test_lite` on `ubuntu-latest` runs `npm run test:lite` (stdio + native HTTP + package-runtime with lite defaults)
- `test_lexical_provider` on `ubuntu-latest` runs `npm run test:lexical` with `RAG_PROVIDER=lexical`
- `test_lazy_hydration` on `ubuntu-latest` runs `npm run test:lazy` with packaged runtime and isolated cache
- `test_package_runtime_windows` on `windows-latest` runs `npm run test:package`
- `test_package_runtime_macos` on `macos-latest` runs `npm run test:package`
- `test_local_provider` on `ubuntu-latest` restores RAG caches, runs `npm run rag:prebuild`, then `npm run test:local`
- `test_gemini_provider` on `ubuntu-latest` (when `GEMINI_API_KEY` secret exists) prebuilds gemini RAG cache, then runs `npm run test:gemini`
- Daily data-lock refresh workflow: `.github/workflows/update-data-lock.yml`
- Refresh schedule: daily at 08:00 UTC (`0 8 * * *`) and manual trigger supported.
- Refresh workflow runs strict source checks (`data:versions:strict`, `data:verify-versions:strict`) to fail fast when external docs/sample structures drift.
- Refresh workflow creates/updates PR `chore/daily-data-refresh` and enables auto-merge when checks pass (requires repo settings support).
- Release workflow: `.github/workflows/release.yml`
- Release behavior:
- Creates GitHub release when `package.json` version changes on `main`
- Attaches `npm pack` artifact plus separate prebuilt RAG index archives for local and gemini providers (release workflow requires `GEMINI_API_KEY` for gemini prebuild path)
- Publishes the package to npm from the release workflow (OIDC trusted publishing)

## Testing

- `npm test`: default test entry (currently `npm run test:lite`)
- `npm run test:unit`: unit tests (retry/backoff/config helpers)
- `npm run test:lite`: integration coverage for lite defaults
- `npm run test:fuse`: compatibility alias for `npm run test:lite`
- `npm run test:local`: integration coverage for local provider
- `npm run test:gemini`: integration coverage for gemini provider (requires `GEMINI_API_KEY`)
- `npm run test:stdio`: stdio transport integration tests
- `npm run test:http`: native streamable HTTP integration tests
- `npm run test:package`: `npm pack` + `npm exec --package` runtime test
- `npm run test:lexical`: lexical-provider stdio/http integration tests
- `npm run test:lazy`: lazy-hydration packaged runtime smoke test
- Optional env toggles:
- `RUN_FUSE_PROVIDER_TESTS=true|false`
- `RUN_LOCAL_PROVIDER_TESTS=true|false`
- `RUN_GEMINI_PROVIDER_TESTS=true|false`

## Using Search-Based Discovery (Recommended)

- On session start, let your client call `tools/list` and `resources/list` (pinned only, not exhaustive).
- Read pinned `doc://product-selection` first to choose DBR vs DCV correctly for the scenario.
- For any query, call `search`; retrieval behavior depends on the active profile/provider and returns `resource_link` entries.
- Read only the links you need via `resources/read` to avoid bloating the context window.
- If unsure what to search, call `get_index` first to see what is available.

## RAG Configuration

Search providers are selected at runtime via profile defaults plus environment overrides.

Profile targets:
- `MCP_PROFILE=lite`: lightweight defaults (`lexical` primary, fallback `none`)
- `MCP_PROFILE=semantic-local`: local embeddings
- `MCP_PROFILE=semantic-gemini`: Gemini embeddings

Lexical retrieval behavior:
- `RAG_PROVIDER=lexical`: use hybrid lexical ranking (BM25 keyword ranking + Fuse fuzzy ranking).
- `RAG_FALLBACK=lexical`: keep semantic providers (`gemini`/`local`) as primary but fall back to lexical when primary provider is unavailable.

Key env vars:
- `MCP_PROFILE`: `lite` | `semantic-local` | `semantic-gemini`
- `RAG_PROVIDER`: `lexical` | `gemini` | `local` | `fuse`
- `RAG_FALLBACK`: `lexical` | `fuse` | `local` | `none`
- `GEMINI_API_KEY`: required for remote embeddings
- `GEMINI_EMBED_MODEL`: e.g. `models/embedding-001` or `models/gemini-embedding-001`
- `GEMINI_RETRY_MAX_ATTEMPTS`: max retry attempts for retryable errors (default `5`)
- `GEMINI_RETRY_BASE_DELAY_MS`: exponential backoff base delay (default `500`)
- `GEMINI_RETRY_MAX_DELAY_MS`: exponential backoff max delay cap (default `10000`)
- `GEMINI_REQUEST_THROTTLE_MS`: fixed delay between Gemini requests (default `0`)
- `RAG_LOCAL_MODEL`: default `Xenova/all-MiniLM-L6-v2`
- `RAG_CACHE_DIR`: default `data/.rag-cache`
- `RAG_PREBUILT_INDEX_AUTO_DOWNLOAD`: default `true`
- `RAG_PREBUILT_INDEX_URL`: global override for release prebuilt index asset URL
- `RAG_PREBUILT_INDEX_URL_LOCAL`: override for local prebuilt index asset URL
- `RAG_PREBUILT_INDEX_URL_GEMINI`: override for gemini prebuilt index asset URL
- `RAG_PREBUILT_INDEX_TIMEOUT_MS`: default `180000`

Local embeddings download the model on first run and cache under `data/.rag-cache/models`.
Advanced tuning:
- `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_MAX_CHUNKS_PER_DOC`, `RAG_MAX_TEXT_CHARS`
- `RAG_MIN_SCORE`, `RAG_INCLUDE_SCORE`, `RAG_REBUILD`, `RAG_PREWARM`, `RAG_PREWARM_BLOCK`, `RAG_LOCAL_QUANTIZED`, `GEMINI_EMBED_BATCH_SIZE`, `RAG_MODEL_CACHE_DIR`

Gemini hardening behavior:
- Retryable responses (`429`, `503`, transient `5xx`) use exponential backoff with jitter.
- Optional throttling can pace request bursts with `GEMINI_REQUEST_THROTTLE_MS`.
- Batch embedding adaptively downgrades batch size on repeated rate-limit responses.
- Index build progress is checkpointed to disk and resumes from checkpoints after failures.

For local dev, you can also use a `.env` file (see `.env.example`).

## Version Policy

- This MCP server serves only the latest major version for each product (DCV, DBR, DWT, DDV).
- DBR legacy docs are linked for v9 and v10. Requests below v9 are refused.
- DCV has no legacy archive links in this server.
- DWT archived docs are available for v16.1.1+ (specific versions are hardcoded).
- DDV has no legacy archive links in this server.

## Roadmap

- Deferred release automation plan and implementation notes are tracked in `TODO.md`.
- If you are continuing release pipeline work, start with the checklist in `TODO.md`.

## Extending the Server

### Add New Samples

Update the corresponding submodule under `data/samples/`.

### Update SDK Info

Use `npm run data:versions` (or `npm run data:versions:strict`) to refresh SDK versions from docs sources.
Edit `data/metadata/dynamsoft_sdks.json` manually only for non-version metadata updates (for example docs URLs, installation commands, or platform definitions).

## License

MIT
