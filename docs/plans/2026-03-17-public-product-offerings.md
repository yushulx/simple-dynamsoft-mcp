# Public Product Offerings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the MCP server so it exposes only `dwt`, `ddv`, `dbr`, `mrz`, and `mds`, while internally reusing the existing DBR/DDV/DWT/DCV-backed docs and sample sources.

**Architecture:** Add one small shared public-offerings config/helper module, then reclassify resources once when building the index. Keep the existing raw submodule layout, discovery logic, and `resourceIndex` shape; avoid adding a separate source-metadata layer unless implementation proves it is necessary.

**Tech Stack:** Node.js ESM, built-in `node:test`, `zod`, MCP server handlers, existing resource-index modules

---

## Preflight

- Work in `.worktrees/product-offerings-restructure` on branch `plan/product-offerings-restructure`.
- Run `npm run data:bootstrap` before broader test runs. The clean worktree currently fails integration startup because `data/` is incomplete.
- Collect the final public redirect URLs for unsupported `mrz` and `mds` scopes before implementation.

## Expected Code Changes

These files should change in the lean implementation:

- Create: `src/server/public-offerings.js`
- Modify: `src/data/repo-map.js`
- Modify: `src/server/normalizers.js`
- Modify: `src/server/resource-index/builders.js`
- Modify: `src/server/resource-index.js`
- Modify: `src/server/resource-index/uri.js`
- Modify: `src/server/resource-index/version-policy.js`
- Modify: `src/server/resources/register-resources.js`
- Modify: `src/server/create-server.js`
- Modify: `src/server/tools/register-index-tools.js`
- Modify: `src/server/tools/register-sample-tools.js`
- Modify: `src/server/tools/register-version-tools.js`
- Modify: `src/server/tools/register-quickstart-tools.js`
- Modify: `src/server/tools/register-project-tools.js`
- Modify: `test/server.test.js`
- Modify: `test/unit/create-server.test.js`
- Modify: `test/unit/repo-map.test.js`

Not expected in the lean implementation unless debugging proves otherwise:

- `src/rag/index.js`
- `package.json`
- new standalone unit-test files

### Task 1: Add the shared public-offerings config and hydration mapping

**Files:**
- Create: `src/server/public-offerings.js`
- Modify: `src/server/normalizers.js`
- Modify: `src/data/repo-map.js`
- Test: `test/unit/repo-map.test.js`

**Step 1: Write the failing test**

Extend `test/unit/repo-map.test.js` so the new public products map to the existing DCV-backed repos.

```js
test("resolveRepoPathsForScopes maps MRZ web docs to capture-vision docs", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mrz", edition: "web", type: "doc" }],
    manifest
  );

  assert.deepEqual(paths, ["documentation/capture-vision-docs-js"]);
});

test("resolveRepoPathsForScopes maps MDS web samples to capture-vision samples", () => {
  const paths = resolveRepoPathsForScopes(
    [{ product: "mds", edition: "web", type: "sample" }],
    manifest
  );

  assert.deepEqual(paths, ["samples/dynamsoft-capture-vision-javascript"]);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/unit/repo-map.test.js`
Expected: FAIL because `repo-map` does not know `mrz` or `mds`.

**Step 3: Write minimal implementation**

Create `src/server/public-offerings.js` with only the shared data and helpers that multiple modules actually need:

- `PUBLIC_PRODUCTS`
- alias normalization for `dwt`, `ddv`, `dbr`, `mrz`, `mds`
- supported scope checks for `mrz` and `mds`
- redirect URL lookup
- simple intent helpers for `mrz` and `mds`

Then update:

- `src/server/normalizers.js` to normalize public products and public intent terms
- `src/data/repo-map.js` so `mrz` and `mds` hydrate the correct DCV-backed repos

Do not add a separate validation helper or any extra abstraction unless it removes duplication immediately.

**Step 4: Run test to verify it passes**

Run: `node --test test/unit/repo-map.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/public-offerings.js src/server/normalizers.js src/data/repo-map.js test/unit/repo-map.test.js
git commit -m "refactor: add public product config"
```

### Task 2: Reclassify the resource index into public offerings

**Files:**
- Modify: `src/server/resource-index/builders.js`
- Modify: `src/server/resource-index.js`
- Modify: `src/server/resource-index/uri.js`
- Modify: `src/server/resources/register-resources.js`
- Modify: `src/server/resource-index/version-policy.js`
- Test: `test/server.test.js`

**Step 1: Write the failing test**

Update `test/server.test.js` so the public contract is enforced.

```js
await test("get_index returns only public product offerings", async () => {
  const response = await sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "get_index", arguments: {} }
  });

  const parsed = JSON.parse(response.result.content[0].text);
  assert(parsed.products.dwt);
  assert(parsed.products.ddv);
  assert(parsed.products.dbr);
  assert(parsed.products.mrz);
  assert(parsed.products.mds);
  assert.equal(parsed.products.dcv, undefined);
});

await test("search returns public MRZ URIs", async () => {
  const response = await sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "search", arguments: { query: "mrz", product: "mrz", type: "sample" } }
  });

  const link = response.result.content.find((item) => item.type === "resource_link");
  assert(link);
  assert.match(link.uri, /^sample:\/\/mrz\//);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js --test-name-pattern "get_index returns only public product offerings|search returns public MRZ URIs"`
Expected: FAIL because the server still exposes `dcv` and DCV-backed URIs.

**Step 3: Write minimal implementation**

Reclassify entries at index-build time, not per-tool.

- direct pass-through: `dwt`, `ddv`, `dbr`
- map selected DCV-backed MRZ content to public `mrz`
- map selected DCV-backed document-scan web content to public `mds`
- drop remaining DCV-only entries from the public index

Keep this simple:

- use deterministic title/tag/path predicates in `builders.js`
- rewrite public product IDs and URIs there
- do not add a new source-metadata layer unless URI/path resolution truly requires it

Then update:

- `src/server/resource-index.js` so filtering and display work with the public products
- `src/server/resource-index/uri.js` so public `mrz` and `mds` URIs parse correctly
- `src/server/resources/register-resources.js` so resource reads recognize the new public products
- `src/server/resource-index/version-policy.js` so pinned version policy text no longer publishes DCV as a product

**Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js --test-name-pattern "get_index returns only public product offerings|search returns public MRZ URIs"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/resource-index/builders.js src/server/resource-index.js src/server/resource-index/uri.js src/server/resources/register-resources.js src/server/resource-index/version-policy.js test/server.test.js
git commit -m "refactor: publish public offerings in resource index"
```

### Task 3: Update tool handlers, copy, redirects, and public routing

**Files:**
- Modify: `src/server/create-server.js`
- Modify: `src/server/tools/register-index-tools.js`
- Modify: `src/server/tools/register-sample-tools.js`
- Modify: `src/server/tools/register-version-tools.js`
- Modify: `src/server/tools/register-quickstart-tools.js`
- Modify: `src/server/tools/register-project-tools.js`
- Test: `test/unit/create-server.test.js`
- Test: `test/server.test.js`

**Step 1: Write the failing test**

Update `test/unit/create-server.test.js` and `test/server.test.js` to enforce the new public behavior.

```js
get_index: {
  minLines: 10,
  requiredPhrases: ["products", "editions", "versions", "DBR", "MRZ", "MDS", "search"]
},
resolve_version: {
  minLines: 10,
  requiredPhrases: ["version", "product", "dbr", "mrz", "mds", "ddv", "dwt"]
}

await test("unsupported MRZ server requests return redirect links", async () => {
  const response = await sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "list_samples", arguments: { product: "mrz", edition: "server" } }
  });

  const text = response.result.content[0].text;
  assert.match(text, /https?:\/\//i);
});

await test("resolve_version returns MRZ public labeling", async () => {
  const response = await sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "resolve_version", arguments: { product: "mrz", edition: "mobile" } }
  });

  assert.match(response.result.content[0].text, /MRZ Version Resolution/);
});

await test("get_quickstart defaults DBR web to foundational messaging", async () => {
  const response = await sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "get_quickstart", arguments: { product: "dbr", edition: "web" } }
  });

  assert.match(response.result.content[0].text, /foundational/i);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/unit/create-server.test.js test/server.test.js --test-name-pattern "tool descriptions are comprehensive|unsupported MRZ server requests return redirect links|resolve_version returns MRZ public labeling|get_quickstart defaults DBR web to foundational messaging"`
Expected: FAIL because handlers and copy still advertise `dcv`.

**Step 3: Write minimal implementation**

Update handlers to use the shared public-offerings config and the already-reclassified index.

- `create-server.js`: server description must stop advertising DCV as a product
- `register-index-tools.js`: publish only the 5 public offerings and update selection guidance
- `register-sample-tools.js`: public product descriptions, public validation, redirect handling for unsupported scopes
- `register-version-tools.js`: public-only product labels, with `mrz` and `mds` resolved from the backing DCV version family internally
- `register-quickstart-tools.js`: `dbr web` defaults to foundational messaging; `mrz` and `mds` are RTU/solution only; unsupported scopes redirect
- `register-project-tools.js`: accept public sample URIs and route `mrz`/`mds` file requests back to the correct backing sample paths

Keep redirect handling as one small shared formatter or shared lookup, not a new subsystem.

Do not modify `src/rag/index.js` unless testing proves search still leaks `dcv` after Task 2.

**Step 4: Run test to verify it passes**

Run: `node --test test/unit/create-server.test.js test/server.test.js --test-name-pattern "tool descriptions are comprehensive|unsupported MRZ server requests return redirect links|resolve_version returns MRZ public labeling|get_quickstart defaults DBR web to foundational messaging"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/create-server.js src/server/tools/register-index-tools.js src/server/tools/register-sample-tools.js src/server/tools/register-version-tools.js src/server/tools/register-quickstart-tools.js src/server/tools/register-project-tools.js test/unit/create-server.test.js test/server.test.js
git commit -m "feat: expose public offerings in tool handlers"
```

### Task 4: Verify the full lean implementation

**Files:**
- Verify: `test/unit/repo-map.test.js`
- Verify: `test/unit/create-server.test.js`
- Verify: `test/server.test.js`

**Step 1: Refresh data in the worktree**

Run: `npm run data:bootstrap`
Expected: submodules initialize successfully.

**Step 2: Run targeted and broad verification**

Run: `npm run test:unit && npm run test:lite`
Expected: PASS

If `version-policy.js` or hydration wiring changed in a way that touches metadata assumptions, also run:

Run: `npm run data:verify-versions:strict && npm run data:verify-lock`
Expected: PASS

**Step 3: Inspect final diff**

Run: `git status --short`
Expected: only the planned source, test, and docs files are changed.

**Step 4: Final regression spot-check**

Run: `node --test test/server.test.js --test-name-pattern "get_index returns only public product offerings|unsupported MRZ server requests return redirect links|resolve_version returns MRZ public labeling"`
Expected: PASS

**Step 5: Commit**

```bash
git add src test docs/plans
git commit -m "feat: expose public product offerings in MCP"
```
