# Data Sync Azure Runbook

This runbook documents the shared Azure data/index maintenance lane:

- Trigger lane: `update-data-lock.yml`
- Writer lane: `data-sync-azure.yml`
- Scope: shared state and shared Gemini index shard references only

Use this with `docs/deployment/azure-container-apps.md`.

## Purpose

The data-sync lane keeps a single shared state document in Azure Files aligned with the latest default-branch data manifest, so all ACA revisions can consume the same deterministic shard map.

This separates concerns:

1. Data/index maintenance updates shared state.
2. Release deployment updates code/package/image and version-scoped runtime data.

## Trigger and Guardrails

`data-sync-azure.yml` runs only when:

- `Update Data Lock` finished successfully.
- The source repository is this repository.
- The workflow branch is the default branch.

Additional safety controls:

- Workflow-level concurrency serializes writers: `data-sync-azure-${repository}`.
- The workflow verifies checkout SHA matches the triggering successful `workflow_run` SHA.
- Shared-state path defaults to `shared-state/current.json` unless `AZURE_SHARED_STATE_PATH` is set.

## Permanent Shared Azure Layout

Shared artifacts live in the same Azure Files share as release data (`mcp-cache` by default):

```text
/mcp-cache/
  <version>/
    data/
      metadata/
      documentation/
      samples/
    rag/
      cache/
      models/
    tmp/
  shared/
    indexes/
      gemini/
        <repo-signature>.json
  shared-state/
    current.json
    history/
      <timestamp>-<sha>.json
```

Layout notes:

- `<version>/...` is release-lane owned and cleaned by deploy lifecycle.
- `shared/indexes/gemini/*` and `shared-state/*` are data-sync-lane owned.
- `shared-state/current.json` is the runtime pointer consumed by `RAG_SHARED_STATE_PATH`.
- `shared-state/history/*` stores previous promoted snapshots for rollback and audit.

## Atomic State Promotion Model

Promotion uses a pointer-swap model:

1. Generate next state from `data/metadata/data-manifest.json`.
2. Write plan artifact (`plan.json`) and staged next state (`next-state.json`).
3. Atomically replace local `current.json` via temp-file rename.
4. Upload the promoted `current.json` to Azure Files.

Operationally, this means workers either read the previous full state or the new full state, not a partial JSON write.

## Operational Checks

Run these checks after a sync, and before/after major releases.

### 1) Verify workflow summary

- Confirm `has_changes`, `repos_changed`, `repos_added`, `repos_removed` in the `Data Sync Azure` summary.
- Unexpected large churn usually means manifest/index-config drift and should be investigated.

### 2) Verify state pointer exists in Azure Files

```bash
az storage file exists \
  --account-name "$AZURE_CACHE_STORAGE_ACCOUNT" \
  --share-name "$AZURE_CACHE_FILE_SHARE" \
  --path "shared-state/current.json" \
  --auth-mode login
```

Expected: `true`.

### 3) Spot-check state content

```bash
az storage file download \
  --account-name "$AZURE_CACHE_STORAGE_ACCOUNT" \
  --share-name "$AZURE_CACHE_FILE_SHARE" \
  --path "shared-state/current.json" \
  --dest /tmp/shared-state-current.json \
  --auth-mode login \
  --overwrite
```

Confirm fields:

- `schemaVersion`
- `generatedAt`
- `indexVersion`
- `repos[*].signature`
- `repos[*].shardPath`

### 4) Spot-check referenced shard paths

Use one `repos[*].shardPath` from `current.json` and verify it exists.

```bash
az storage file exists \
  --account-name "$AZURE_CACHE_STORAGE_ACCOUNT" \
  --share-name "$AZURE_CACHE_FILE_SHARE" \
  --path "shared/indexes/gemini/<repo-signature>.json" \
  --auth-mode login
```

Expected: `true`.

## Runtime Degraded Fallback Behavior

If runtime cannot use Gemini shared shards (for example missing `current.json`, missing shard file, or invalid state), the service degrades to lexical fallback when configured (`RAG_FALLBACK=lexical`).

Expected behavior:

- Container starts and `/mcp` remains available.
- Search requests continue through lexical fallback.
- Logs show degraded/fallback events with stage and reason.

Treat degraded mode as an operational warning, not a healthy steady state.

## Recovery and Rollback

1. Identify the last known-good snapshot under `shared-state/history/`.
2. Copy it to `shared-state/current.json`.
3. Re-run data-sync lane to reconcile if needed.
4. Verify runtime logs no longer report degraded Gemini/shared-state load failures.

If history snapshots are not automatically generated in your environment yet, create them as part of the promotion process before overwriting `current.json`.
