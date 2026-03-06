# Azure Infrastructure Bootstrap (v1)

This directory provisions the initial Azure resources for Container Apps deployment.

## Resources Created

- Resource Group (created by CLI bootstrap command)
- Log Analytics Workspace
- Azure Container Registry (Basic)
- Azure Storage Account + Azure Files share (persistent cache)
- Azure Container Apps Environment
- Azure Container App (external ingress on port `80`)

All resources are tagged through `resourceTags` in `infra/params/prod.bicepparam` so they can be identified and cleaned up safely in a shared resource group.

## Prerequisites

- Azure CLI logged in (`az login`)
- Target subscription selected (`az account set --subscription <id-or-name>`)
- Bicep support in Azure CLI (`az bicep version`)

## 1) Resource group setup

If you have permission to create a dedicated resource group:

```bash
az group create --name <resource-group> --location <region>
```

Example:

```bash
az group create --name rg-simple-dynamsoft-mcp-prod --location eastus
```

If you are using an existing shared resource group, skip creation and make sure `location` passed at deploy time matches the RG location.

## 2) Review planned changes

Pass `geminiApiKey` at deploy time; do not commit it to `prod.bicepparam`.

If you are deploying into a shared resource group, update `resourceTags` first (owner/environment/cleanupGroup).

```bash
az deployment group what-if \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters infra/params/prod.bicepparam \
  --parameters geminiApiKey='<gemini-api-key>'
```

## 3) Apply infrastructure

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters infra/params/prod.bicepparam \
  --parameters geminiApiKey='<gemini-api-key>'
```

## 4) Verify outputs

```bash
az deployment group show \
  --resource-group <resource-group> \
  --name <deployment-name> \
  --query properties.outputs
```

The Container App is created with baseline settings (`minReplicas=1`, `maxReplicas=1`) and a bootstrap image. Release deployment updates it to this repository image later.

## Shared RG Cleanup By Tag

List resources created for this app (example uses `cleanupGroup=simple-dynamsoft-mcp-v1`):

```bash
az resource list \
  --resource-group <resource-group> \
  --tag cleanupGroup=simple-dynamsoft-mcp-v1 \
  -o table
```

Delete tagged resources one-by-one (safer than deleting shared RG):

```bash
for id in $(az resource list --resource-group <resource-group> --tag cleanupGroup=simple-dynamsoft-mcp-v1 --query "[].id" -o tsv); do
  az resource delete --ids "$id"
done
```

Important: delete Container Apps resources first (app/env), then ACR and storage account, to avoid dependency errors.
