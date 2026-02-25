# Task 9 Server Modularization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `src/server/create-server.js` into focused modules while preserving existing MCP behavior, schemas, and outputs.

**Architecture:** Keep `create-server.js` as a thin composition root. Move tool registrations into grouped modules and resource registrations into a resource module. Use shared helpers for repeated formatting/hydration logic. Do not alter runtime semantics.

**Tech Stack:** Node.js ESM, MCP SDK (`@modelcontextprotocol/sdk`), Zod, existing test suites (`node:test`).

---

### Task 1: Add a regression guard for tool surface and handler wiring

**Files:**
- Modify: `test/unit/create-server.test.js` (new)
- Modify: `src/server/create-server.js`

**Step 1: Write the failing test**

Create `test/unit/create-server.test.js` with a focused test that constructs a server via `createMcpServerInstance` using minimal fakes and asserts all seven tool names are registered (`get_index`, `search`, `list_samples`, `resolve_sample`, `resolve_version`, `get_quickstart`, `generate_project`).

**Step 2: Run test to verify it fails**

Run: `node --test test/unit/create-server.test.js`
Expected: FAIL because the test file or setup is not yet complete.

**Step 3: Write minimal implementation/setup for testability**

Add any minimal exports or test scaffolding needed so `createMcpServerInstance` can be instantiated with faked `resourceIndexApi` and `ragApi` dependencies.

**Step 4: Run test to verify it passes**

Run: `node --test test/unit/create-server.test.js`
Expected: PASS with registered tool names verified.

**Step 5: Commit**

```bash
git add test/unit/create-server.test.js src/server/create-server.js
git commit -m "test: add create-server registration regression guard"
```

### Task 2: Extract common server helper utilities

**Files:**
- Create: `src/server/helpers/server-helpers.js`
- Modify: `src/server/create-server.js`
- Test: `test/unit/create-server.test.js`

**Step 1: Write the failing test**

Add/extend tests asserting helper behavior for score formatting and hydration-trigger refresh behavior.

**Step 2: Run test to verify it fails**

Run: `node --test test/unit/create-server.test.js`
Expected: FAIL on missing helper module/function exports.

**Step 3: Write minimal implementation**

Create `src/server/helpers/server-helpers.js` with:
- `formatScoreLabel(entry)`
- `formatScoreNote(entry)`
- `createScopeHydrator({ ensureDataScopesHydrated, refreshResourceIndex, refreshRagIndexes })`

Update `create-server.js` to import and use these helpers.

**Step 4: Run test to verify it passes**

Run: `node --test test/unit/create-server.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/helpers/server-helpers.js src/server/create-server.js test/unit/create-server.test.js
git commit -m "refactor: extract shared server helpers"
```

### Task 3: Extract tool registrations into focused modules

**Files:**
- Create: `src/server/tools/register-index-tools.js`
- Create: `src/server/tools/register-sample-tools.js`
- Create: `src/server/tools/register-version-tools.js`
- Create: `src/server/tools/register-quickstart-tools.js`
- Create: `src/server/tools/register-project-tools.js`
- Modify: `src/server/create-server.js`
- Test: `test/unit/create-server.test.js`

**Step 1: Write the failing test**

Extend regression test to validate that all expected tools remain registered after extraction.

**Step 2: Run test to verify it fails**

Run: `node --test test/unit/create-server.test.js`
Expected: FAIL while modules are partially extracted.

**Step 3: Write minimal implementation**

Move tool registration blocks from `create-server.js` into modules grouped by concern. Each module should export one registration function that receives dependency bag (`server`, normalizers, resource index functions, rag functions, helpers).

**Step 4: Run test to verify it passes**

Run: `node --test test/unit/create-server.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/tools/*.js src/server/create-server.js test/unit/create-server.test.js
git commit -m "refactor: split MCP tool registrations by concern"
```

### Task 4: Extract resource registration to a dedicated module

**Files:**
- Create: `src/server/resources/register-resources.js`
- Modify: `src/server/create-server.js`
- Test: `test/unit/create-server.test.js`

**Step 1: Write the failing test**

Add assertions that resource handlers for `resources/list` and `resources/read` still return data in the same shape for pinned resources.

**Step 2: Run test to verify it fails**

Run: `node --test test/unit/create-server.test.js`
Expected: FAIL until resource module wiring is complete.

**Step 3: Write minimal implementation**

Move MCP resource registration and request-handler wiring to `src/server/resources/register-resources.js`.

**Step 4: Run test to verify it passes**

Run: `node --test test/unit/create-server.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/resources/register-resources.js src/server/create-server.js test/unit/create-server.test.js
git commit -m "refactor: move resource handlers into dedicated module"
```

### Task 5: Final verification and cleanup

**Files:**
- Modify: `src/server/create-server.js`
- Optional update: `AGENTS.md` (only if structure notes need refresh)

**Step 1: Ensure composition root is thin**

Keep `create-server.js` focused on dependency unpacking + module wiring only.

**Step 2: Run targeted verification**

Run:
- `node --test test/unit/create-server.test.js`
- `npm run test:unit`
- `npm run test:stdio`

Expected: PASS (or document known local data limitations if only integration fails due environment/submodules).

**Step 3: Run full suite if feasible**

Run: `npm test`
Expected: PASS locally when environment supports full integration prerequisites.

**Step 4: Commit final cleanup**

```bash
git add src/server/create-server.js src/server/tools/*.js src/server/resources/register-resources.js test/unit/create-server.test.js AGENTS.md
git commit -m "refactor: modularize server assembly while preserving behavior"
```
