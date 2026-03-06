# Data Sync Azure Runbook

This runbook documents the shared Azure data/index maintenance lane:

- Trigger lane: `update-data-lock.yml`
- Writer lane: `data-sync-azure.yml`
- Scope: shared state and Gemini shard references only

Use this with `docs/deployment/azure-container-apps.md`.

## Purpose

The data-sync lane keeps `state/current.json` in Azure Files aligned with the latest default-branch manifest so all ACA revisions consume the same deterministic shard map.

## Trigger and Guardrails

`data-sync-azure.yml` runs only when:

- `Update Data Lock` finished successfully.
- The source repository is this repository.
- The workflow branch is the default branch.

Additional safety controls:

- Workflow-level concurrency serializes writers: `data-sync-azure-${repository}`.
- The workflow verifies checkout SHA matches the triggering `workflow_run` SHA.
- Shared state path defaults to `state/current.json` unless `AZURE_SHARED_STATE_PATH` is set.

## Azure Files Layout

```text
/mcp-cache/
  data/
    metadata/
    documentation/
    samples/
  rag/
    cache/
      gemini-<repo-signature>.json
  state/
    current.json
```

Ownership notes:

- `data/` is hydrated deployment data.
- `rag/cache/gemini-<repo-signature>.json` stores shared Gemini shard payloads.
- `state/current.json` is the runtime pointer consumed by `RAG_SHARED_STATE_PATH`.

## Atomic State Promotion Model

Promotion uses pointer-swap semantics in local staging before upload:

1. Generate next state from `data/metadata/data-manifest.json`.
2. Write `state/plan.json` and `state/next-state.json` in local staging.
3. Atomically replace local `state/current.json` via temp-file rename.
4. Upload promoted `state/current.json` to Azure Files.

This ensures workers read either the previous full state or the new full state, never a partial JSON write.

## Operational Checks

Run these checks after a sync and before/after major releases.

### 1) Verify workflow summary

- Confirm `has_changes`, `repos_changed`, `repos_added`, `repos_removed` in the `Data Sync Azure` summary.
- Unexpected large churn usually indicates manifest/index-config drift.

### 2) Verify state pointer exists in Azure Files

```bash
az storage file exists \
  --account-name "$AZURE_CACHE_STORAGE_ACCOUNT" \
  --share-name "$AZURE_CACHE_FILE_SHARE" \
  --path "state/current.json" \
  --auth-mode login
```

Expected: `true`.

### 3) Spot-check state content

```bash
az storage file download \
  --account-name "$AZURE_CACHE_STORAGE_ACCOUNT" \
  --share-name "$AZURE_CACHE_FILE_SHARE" \
  --path "state/current.json" \
  --dest /tmp/mcp-state-current.json \
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

Use one `repos[*].shardPath` value from `state/current.json` and verify it exists.

```bash
az storage file exists \
  --account-name "$AZURE_CACHE_STORAGE_ACCOUNT" \
  --share-name "$AZURE_CACHE_FILE_SHARE" \
  --path "rag/cache/gemini-<repo-signature>.json" \
  --auth-mode login
```

Expected: `true`.

## Runtime Degraded Fallback Behavior

If runtime cannot use Gemini shared shards (missing `state/current.json`, missing shard file, invalid state), the service degrades to lexical fallback when configured (`RAG_FALLBACK=lexical`).

Expected behavior:

- Container starts and `/mcp` remains available.
- Search requests continue through lexical fallback.
- Logs show degraded/fallback events with stage and reason.

Treat degraded mode as an operational warning, not a healthy steady state.

## Recovery

1. Restore a known-good `state/current.json`.
2. Re-run data-sync lane to reconcile if needed.
3. Verify runtime logs no longer report degraded Gemini/state load failures.
