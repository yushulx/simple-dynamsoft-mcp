# Azure Container Apps Deployment

This runbook covers production deployment on Azure with a two-lane operating model:

1. `update-data-lock` -> `data-sync-azure` for shared Azure data/index maintenance.
2. `release` for code/package/image deploys only.

Core platform pieces:

- Docker image in Azure Container Registry (ACR)
- Azure Container Apps (ACA)
- Azure Files mounted as persistent cache (`mcp-cache`)
- Default ACA HTTPS domain (`*.azurecontainerapps.io`)

## Runtime Profile

- `MCP_PROFILE=semantic-gemini`
- `RAG_PROVIDER=gemini`
- `RAG_FALLBACK=lexical`
- `MCP_DATA_HYDRATION_MODE=eager`

In production, set `RAG_SHARED_STATE_PATH` to the mounted shared state file so workers load shared Gemini shard metadata:

- `RAG_SHARED_STATE_PATH=/mnt/mcp-cache/shared-state/current.json`

## First-Time Bootstrap

Use `infra/main.bicep` to create baseline resources in your target resource group:

- Log Analytics Workspace
- ACR
- Storage Account + Azure Files share (`mcp-cache`)
- ACA environment
- ACA app

Ingress target port stays `80` end-to-end (bootstrap and release deployment).

If using a shared resource group, keep resource tags in `infra/params/prod.bicepparam` and use `cleanupGroup` for safe cleanup later.

## Two-Lane Architecture

### Lane 1: Shared data/index maintenance

- `update-data-lock.yml` refreshes submodules and lock metadata.
- On successful default-branch completion, `data-sync-azure.yml` computes shared state updates and promotes a new `shared-state/current.json`.
- This lane is the only writer for shared state metadata and shard index references.

Detailed operator runbook: `docs/deployment/data-sync-azure.md`.

### Lane 2: Release deploys

- `release.yml` verifies/tests/publishes package and image, then invokes `deploy-aca.yml`.
- Release deploys upload versioned runtime data and switch ACA revisions.
- Release deploys do not mutate shared state topology; they consume it at runtime via `RAG_SHARED_STATE_PATH`.

## Release Deploy Flow

On release, workflow sequence is:

1. `release.yml` publishes npm package
2. `release.yml` calls reusable `deploy-aca.yml`
3. `deploy-aca.yml` builds and pushes image to ACR
4. `deploy-aca.yml` configures ACA registry auth using system-assigned identity
5. Deploy warm-up revision with `minReplicas=1`, `maxReplicas=1`
6. Wait for warm-up revision to become ready
7. Set steady-state scale to `minReplicas=0`, `maxReplicas=1`
8. Route traffic to newest ready revision
9. Deactivate previous revisions
10. Remove old cache version directories from Azure Files (keep current plus one previous)

## Permanent Azure Files Layout

The Azure Files share keeps release-scoped data and shared-state data side by side:

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

`data-sync-azure` promotes `shared-state/current.json` after new shard outputs are ready. Keep `shared-state/history/` for rollback and audit snapshots.

## Version-Scoped Cache Contract

Cache paths are release-version scoped only.

For a release version `<version>`, the container uses:

- `/mnt/mcp-cache/<version>/data`
- `/mnt/mcp-cache/<version>/tmp`
- `/mnt/mcp-cache/<version>/rag/cache`
- `/mnt/mcp-cache/<version>/rag/models`

Temporary directories (`TMPDIR`, `TMP`, `TEMP`) are pinned to `/mnt/mcp-cache/<version>/tmp` so hydration staging and final cache paths are on the same filesystem.

Old versions are deleted only after traffic is moved off old revisions.

## Runtime Degraded Fallback Behavior

If Gemini shared state or shard loading fails at startup/query time, runtime degrades to lexical search (`RAG_FALLBACK=lexical`) instead of failing the container.

Operational expectations:

- MCP endpoint remains available.
- Search quality may degrade until shared state/shards are corrected.
- Logs include degraded/fallback events and the related shared-state cause.

## Endpoint

v1 public endpoint:

- `https://<app>.<hash>.<region>.azurecontainerapps.io/mcp`

TLS is provided by Azure on the default ACA domain.
