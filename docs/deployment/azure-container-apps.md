# Azure Container Apps Deployment

This runbook covers production deployment on Azure with a two-lane operating model:

1. `update-data-lock` -> `data-sync-azure` for shared Azure data/index maintenance.
2. `release` for code/package/image deploys.

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

In production, set fixed mounted paths:

- `MCP_DATA_DIR=/mnt/mcp-cache/data`
- `MCP_DATA_CACHE_DIR=/mnt/mcp-cache/data`
- `RAG_CACHE_DIR=/mnt/mcp-cache/rag/cache`
- `RAG_MODEL_CACHE_DIR=/mnt/mcp-cache/rag/models`
- `RAG_SHARED_STATE_PATH=/mnt/mcp-cache/state/current.json`
- `TMPDIR=/mnt/mcp-cache/tmp`
- `TMP=/mnt/mcp-cache/tmp`
- `TEMP=/mnt/mcp-cache/tmp`

## First-Time Bootstrap

Use `infra/main.bicep` to create baseline resources in your target resource group:

- Log Analytics Workspace
- ACR
- Storage Account + Azure Files share (`mcp-cache`)
- ACA environment
- ACA app

Ingress target port stays `80` end-to-end (bootstrap and release deployment).

## Two-Lane Architecture

### Lane 1: Shared data/index maintenance

- `update-data-lock.yml` refreshes submodules and lock metadata.
- On successful default-branch completion, `data-sync-azure.yml` computes shared state updates and promotes `state/current.json`.
- This lane is the only writer for shared state metadata and shard references.

Detailed operator runbook: `docs/deployment/data-sync-azure.md`.

### Lane 2: Release deploys

- `release.yml` verifies/tests/publishes package and image, then invokes `deploy-aca.yml`.
- Release deploys upload hydrated data to `data/` and switch ACA revisions.
- Release deploys do not mutate shared state topology.

## Release Deploy Flow

On release, workflow sequence is:

1. `release.yml` publishes npm package.
2. `release.yml` calls reusable `deploy-aca.yml`.
3. `deploy-aca.yml` builds and pushes image to ACR.
4. `deploy-aca.yml` configures ACA registry auth using system-assigned identity.
5. Upload hydrated runtime data to Azure Files `data/`.
6. Ensure Azure Files readiness for `rag/`, `rag/cache/`, and `rag/models/`.
7. Deploy a new ACA revision with fixed cache/env paths.
8. Route traffic to newest ready revision.
9. Deactivate previous revisions.

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
    models/
  state/
    current.json
  tmp/
```

## Runtime Degraded Fallback Behavior

If Gemini shared state or shard loading fails at startup/query time, runtime degrades to lexical search (`RAG_FALLBACK=lexical`) instead of failing the container.

Operational expectations:

- MCP endpoint remains available.
- Search quality may degrade until state/shards are corrected.
- Logs include degraded/fallback events and the related cause.

## Endpoint

v1 public endpoint:

- `https://<app>.<hash>.<region>.azurecontainerapps.io/mcp`

TLS is provided by Azure on the default ACA domain.
