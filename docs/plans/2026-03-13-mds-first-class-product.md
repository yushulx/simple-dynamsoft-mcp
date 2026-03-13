# MDS First-Class Product Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Dynamsoft Mobile Document Scanner JavaScript Edition (MDS) as a first-class MCP product with submodule-backed docs, samples, index entries, search/listing support, and version resolution.

**Architecture:** Treat MDS as a standalone web SDK, parallel to `dwt` and `ddv`. Wire it through the existing product catalog flow: submodules -> metadata/config/paths -> docs/sample discovery -> resource index -> product-aware tools and tests, without refactoring unrelated products.

**Tech Stack:** Node.js ESM, built-in `node:test`, MCP resource/tool registration, git submodules, JSON metadata.

---

### Task 1: Create the MDS data roots

**Files:**
- Modify: `.gitmodules`
- Modify: `data/metadata/dynamsoft_sdks.json`
- Modify: `test/server.test.js`

**Step 1: Write the failing test**

Add a new assertion block in `test/server.test.js` that expects `get_index` to contain `parsed.products.mds` with a `web` edition.

```js
assert(parsed.products.mds, "Should include MDS");
assert(parsed.products.mds.editions.web, "Should include MDS web edition");
```

**Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js --test-name-pattern "get_index returns product data"`
Expected: FAIL because `products.mds` is missing.

**Step 3: Write minimal implementation**

- Add an MDS samples submodule entry to `.gitmodules`:

```ini
[submodule "data/samples/mobile-document-scanner-javascript"]
	path = data/samples/mobile-document-scanner-javascript
	url = https://github.com/Dynamsoft/document-scanner-javascript
	branch = main
```

- Add an MDS docs submodule entry to `.gitmodules`:

```ini
[submodule "data/documentation/mobile-document-scanner-docs-js"]
	path = data/documentation/mobile-document-scanner-docs-js
	url = https://github.com/dynamsoft-docs/mobile-document-scanner-docs-js
	branch = main
```

- Add an `mds` top-level SDK entry to `data/metadata/dynamsoft_sdks.json`, modeled after the standalone web product shape:

```json
"mds": {
  "name": "Dynamsoft Mobile Document Scanner JavaScript Edition",
  "description": "Web SDK for scanning documents, capturing document images, and enhancing them to professional quality.",
  "version": "<fill from docs/product_version or approved source>",
  "default_platform": "web",
  "snippet_path": "mobile-document-scanner-javascript",
  "platforms": {
    "web": {
      "languages": ["JavaScript", "TypeScript"],
      "docs": {
        "user-guide": "https://www.dynamsoft.com/mobile-document-scanner/docs/web/guide/index.html",
        "api-reference": "https://www.dynamsoft.com/mobile-document-scanner/docs/web/api/index.html"
      },
      "samples": {
        "repo": "https://github.com/Dynamsoft/document-scanner-javascript"
      }
    }
  }
}
```

**Step 4: Run test to verify partial progress**

Run: `node --test test/server.test.js --test-name-pattern "get_index returns product data"`
Expected: still FAIL until index wiring exists, but metadata parsing should remain valid.

**Step 5: Commit**

```bash
git add .gitmodules data/metadata/dynamsoft_sdks.json test/server.test.js
git commit -m "feat: add MDS catalog metadata"
```

### Task 2: Wire MDS config, paths, and documentation loading

**Files:**
- Modify: `src/server/resource-index/config.js`
- Modify: `src/server/resource-index/paths.js`
- Modify: `src/server/resource-index.js`
- Test: `test/server.test.js`

**Step 1: Write the failing test**

Add expectations in `test/server.test.js` that `parsed.products.mds.editions.web.version` is a string and `docCount` is numeric.

```js
assert.equal(typeof parsed.products.mds.editions.web.version, "string");
assert(Number.isFinite(parsed.products.mds.editions.web.docCount));
```

**Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js --test-name-pattern "get_index returns product data"`
Expected: FAIL because `LATEST_VERSIONS.mds` and MDS docs are not loaded.

**Step 3: Write minimal implementation**

- In `src/server/resource-index/config.js`, add:

```js
const SAMPLE_DIRS = {
  // ...existing entries...
  mds: "mobile-document-scanner-javascript"
};

const DOC_DIRS = {
  // ...existing entries...
  mds: "mobile-document-scanner-docs-js"
};

const DOCS_CONFIG = {
  // ...existing entries...
  mds: {
    urlBase: "https://www.dynamsoft.com/mobile-document-scanner/docs/web/",
    excludeDirs: [".git", ".github", ".vscode", ".vs", "_data", "_includes", "_layouts", "assets"],
    excludeFiles: ["README.md", "search.md", "error.md"]
  }
};
```

- In `src/server/resource-index/paths.js`, add `SAMPLE_ROOTS.mds` and `DOC_ROOTS.mds`.
- In `src/server/resource-index.js`:
  - add `let mdsDocs = { articles: [] };`
  - load MDS docs in `loadDocumentationSets()` using `loadMarkdownDocs()`
  - add `LATEST_VERSIONS.mds = { web: registry.sdks.mds.version }`
  - add `LATEST_MAJOR.mds = parseMajorVersion(registry.sdks.mds.version)`
  - pass `mdsDocs` and future MDS sample discovery helpers into `buildIndexDataFromBuilders()` / `buildResourceIndexFromBuilders()`

**Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js --test-name-pattern "get_index returns product data"`
Expected: PASS once the MDS edition metadata is emitted.

**Step 5: Commit**

```bash
git add src/server/resource-index/config.js src/server/resource-index/paths.js src/server/resource-index.js test/server.test.js
git commit -m "feat: load MDS documentation metadata"
```

### Task 3: Add MDS sample discovery and resource registration

**Files:**
- Modify: `src/server/resource-index/samples.js`
- Modify: `src/server/resource-index/builders.js`
- Modify: `src/server/resource-index.js`
- Test: `test/server.test.js`

**Step 1: Write the failing test**

Add a server test that `list_samples` returns at least one sample for `product: "mds", edition: "web"`.

```js
const response = await sendRequest({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "list_samples",
    arguments: { product: "mds", edition: "web" }
  }
});
const parsed = JSON.parse(response.result.content[0].text);
assert(parsed.samples.length > 0, "Should return MDS web samples");
```

**Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js --test-name-pattern "MDS web samples"`
Expected: FAIL because no MDS samples are discovered yet.

**Step 3: Write minimal implementation**

- In `src/server/resource-index/samples.js`, add MDS helpers similar to the standalone web products:

```js
function discoverMdsSamples() {
  const sampleSet = new Set();
  if (!existsSync(SAMPLE_ROOTS.mds)) return [];

  for (const entry of readdirSync(SAMPLE_ROOTS.mds, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) sampleSet.add(entry.name.replace(".html", ""));
    else if (entry.isDirectory() && !entry.name.startsWith(".")) sampleSet.add(entry.name);
  }

  return Array.from(sampleSet).sort();
}
```

- Add `getMdsSamplePath(sampleName)` with the same directory-or-HTML fallback used by `getDdvSamplePath()` / `getDcvWebSamplePath()`.
- Export the new helpers and thread them through `src/server/resource-index.js` into the builders.
- In `src/server/resource-index/builders.js`:
  - add `products.mds.web` in `buildIndexData()`
  - register MDS sample resources with URIs like `sample://mds/web/web/${mdsVersion}/${sampleName}`
  - register MDS doc resources with URIs like `doc://mds/web/${platform}/${mdsVersion}/${slug}`

**Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js --test-name-pattern "MDS web samples"`
Expected: PASS and returned samples should all have `product === "mds"` and `platform === "web"`.

**Step 5: Commit**

```bash
git add src/server/resource-index/samples.js src/server/resource-index/builders.js src/server/resource-index.js test/server.test.js
git commit -m "feat: index MDS docs and samples"
```

### Task 4: Extend product normalization, policies, and version resolution

**Files:**
- Modify: `src/server/normalizers.js`
- Modify: `src/server/tools/register-version-tools.js`
- Modify: `src/server/resources/register-resources.js`
- Modify: `src/server/tools/register-index-tools.js`
- Test: `test/server.test.js`
- Test: `test/unit/create-server.test.js`

**Step 1: Write the failing tests**

- In `test/server.test.js`, add a `resolve_version` test for `product: "mds"` expecting the MDS web version.
- In `test/unit/create-server.test.js`, extend any product-name documentation assertions to mention `mds`.

```js
assert.match(text, /MDS Version Resolution/);
assert.match(text, /Resolved version:/);
```

**Step 2: Run tests to verify they fail**

Run: `node --test test/server.test.js --test-name-pattern "resolve_version" test/unit/create-server.test.js`
Expected: FAIL because product normalization/allowlists reject `mds`.

**Step 3: Write minimal implementation**

- In `src/server/normalizers.js`:
  - add MDS aliases to `sdkAliases`
  - update `normalizeProduct()` to return `mds` for phrases like `mds`, `mobile document scanner`, and `dynamsoft mobile document scanner`
  - update `inferProductFromQuery()` only if you want MDS-specific queries to auto-scope; keep it minimal and avoid weakening current DCV document-scan behavior without tests
- In `src/server/tools/register-version-tools.js`:
  - update product descriptions to include `mds`
  - expand the allowlist to `mds`
  - add a standalone web-product branch parallel to `dwt`/`ddv`
- In `src/server/resources/register-resources.js`, include `mds` in the resource-policy allowlist.
- In `src/server/tools/register-index-tools.js`, update human-facing descriptions that enumerate known products.

**Step 4: Run tests to verify they pass**

Run: `node --test test/server.test.js --test-name-pattern "resolve_version" test/unit/create-server.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/normalizers.js src/server/tools/register-version-tools.js src/server/resources/register-resources.js src/server/tools/register-index-tools.js test/server.test.js test/unit/create-server.test.js
git commit -m "feat: support MDS product normalization and versioning"
```

### Task 5: Extend RAG signature and manifest-backed data tracking

**Files:**
- Modify: `src/server/resource-index.js`
- Modify: `data/metadata/data-manifest.json` (generated)
- Test: `test/unit/rag-signature-manifest.test.js`

**Step 1: Write the failing test**

Add a unit test or extend existing signature assertions so MDS sample/docs roots are represented in manifest-backed signature data.

```js
assert.equal(signature.dataSources.mdsSamplesHead, sampleCommit);
assert.equal(signature.dataSources.mdsDocsHead, docsCommit);
```

**Step 2: Run test to verify it fails**

Run: `node --test test/unit/rag-signature-manifest.test.js`
Expected: FAIL or remain incomplete because MDS roots are not referenced.

**Step 3: Write minimal implementation**

- In `src/server/resource-index.js`, add:

```js
mdsDocCount: mdsDocs.articles.length,
```

and new `dataSources` entries:

```js
mdsSamplesHead: readManifestRepoCommit(SAMPLE_ROOTS.mds),
mdsDocsHead: readManifestRepoCommit(DOC_ROOTS.mds),
```

- Regenerate `data/metadata/data-manifest.json` instead of editing it manually:

Run: `npm run data:lock`

**Step 4: Run test to verify it passes**

Run: `node --test test/unit/rag-signature-manifest.test.js && npm run data:verify-lock`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/resource-index.js data/metadata/data-manifest.json test/unit/rag-signature-manifest.test.js
git commit -m "chore: track MDS data sources in manifest signature"
```

### Task 6: Verify end-to-end behavior and refresh generated metadata

**Files:**
- Modify: `data/metadata/data-manifest.json` (generated if needed)
- Modify: `docs/plans/2026-03-13-mds-design.md` only if implementation realities differ

**Step 1: Initialize the new data sources**

Run:

```bash
git submodule update --init --recursive
```

Expected: the MDS docs and samples repositories exist under `data/`.

**Step 2: Run targeted tests first**

Run:

```bash
node --test test/server.test.js --test-name-pattern "get_index|MDS|resolve_version"
node --test test/unit/create-server.test.js
node --test test/unit/rag-signature-manifest.test.js
```

Expected: PASS.

**Step 3: Run repo-required verification**

Run:

```bash
npm run data:verify-lock
npm run test:unit
npm run test:lite
```

Expected: PASS. If `test:lite` fails in a fresh worktree because `MCP_DATA_DIR` is incomplete, bootstrap the data tree first and rerun:

```bash
npm run data:bootstrap
npm run test:lite
```

**Step 4: Inspect the final git diff**

Run: `git status && git diff --stat`
Expected: only MDS-related config, metadata, generated manifest, and test updates are present.

**Step 5: Commit the verification-safe result**

```bash
git add .
git commit -m "feat: add MDS as a first-class MCP product"
```
