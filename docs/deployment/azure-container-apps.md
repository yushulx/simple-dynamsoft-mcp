# Azure Container Apps Deployment (v1)

This runbook covers v1 deployment on Azure using:

- Docker image in Azure Container Registry (ACR)
- Azure Container Apps (ACA)
- Azure Files mounted as persistent cache
- Default ACA HTTPS domain (`*.azurecontainerapps.io`)

Custom domain and Azure managed certificate are deferred to v2.

## Runtime Profile (v1)

- `MCP_PROFILE=semantic-gemini`
- `RAG_PROVIDER=gemini`
- `RAG_FALLBACK=lexical`
- `MCP_DATA_HYDRATION_MODE=eager`

## First-Time Bootstrap

Use `infra/main.bicep` to create baseline resources in your target resource group:

- Log Analytics Workspace
- ACR
- Storage Account + Azure Files share (`mcp-cache`)
- ACA environment
- ACA app

v1 keeps ingress target port `80` end-to-end (bootstrap and release deployment).

If using a shared resource group, keep resource tags in `infra/params/prod.bicepparam` and use `cleanupGroup` for safe cleanup later.

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
10. Remove old cache version directories from Azure Files

## Version-Scoped Cache Contract

Cache paths are release-version scoped only.

For a release version `<version>`, the container uses:

- `/mnt/mcp-cache/<version>/data`
- `/mnt/mcp-cache/<version>/rag/cache`
- `/mnt/mcp-cache/<version>/rag/models`

Old versions are deleted only after traffic is moved off old revisions.

## Endpoint

v1 public endpoint:

- `https://<app>.<hash>.<region>.azurecontainerapps.io/mcp`

TLS is provided by Azure on the default ACA domain.
