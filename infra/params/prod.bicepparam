using '../main.bicep'

param location = 'eastus'

param logAnalyticsWorkspaceName = 'simple-dynamsoft-mcp-logs'
param containerAppsEnvironmentName = 'simple-dynamsoft-mcp-env'
param containerAppName = 'simple-dynamsoft-mcp'
param acrName = 'simpledynamsoftmcpacr'
param storageAccountName = 'simpledynamsoftmcpsa'
param cacheFileShareName = 'mcp-cache'

param containerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

param containerCpu = 1
param containerMemory = '2Gi'

// v1 deploy uses HTTP port 80 end-to-end.
param containerPort = 80
param minReplicas = 1
param maxReplicas = 1

// Placeholder to satisfy required secure parameter in .bicepparam validation.
// Always override at deploy time:
// --parameters geminiApiKey="$GEMINI_KEY"
param geminiApiKey = 'OVERRIDE_WITH_CLI'

param resourceTags = {
  app: 'simple-dynamsoft-mcp'
  environment: 'production'
  owner: 'Louie'
  cleanupGroup: 'simple-dynamsoft-mcp-v1'
}
