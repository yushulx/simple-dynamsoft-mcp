targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string

@description('Container Apps managed environment name.')
param containerAppsEnvironmentName string

@description('Container App name.')
param containerAppName string

@description('Azure Container Registry name (globally unique, lowercase alphanumeric).')
param acrName string

@description('Storage account name for Azure Files cache (globally unique, lowercase alphanumeric).')
param storageAccountName string

@description('Azure Files share name for MCP cache data.')
param cacheFileShareName string = 'mcp-cache'

@description('Bootstrap image for initial app creation.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container CPU allocation (whole vCPU for baseline).')
@allowed([
  1
  2
])
param containerCpu int = 1

@description('Container memory allocation.')
@allowed([
  '1Gi'
  '2Gi'
  '3Gi'
  '4Gi'
])
param containerMemory string = '2Gi'

@description('Container App ingress target port.')
param containerPort int = 80

@description('Minimum replicas for the baseline deployment.')
param minReplicas int = 1

@description('Maximum replicas for the baseline deployment.')
param maxReplicas int = 1

@description('Gemini API key (stored as Container Apps secret).')
@secure()
param geminiApiKey string

@description('Tags applied to all MCP Azure resources in this template.')
param resourceTags object = {
  app: 'simple-dynamsoft-mcp'
  managedBy: 'bicep'
}

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: resourceTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

var logAnalyticsSharedKey = listKeys(logAnalyticsWorkspace.id, '2022-10-01').primarySharedKey

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' = {
  name: acrName
  location: location
  tags: resourceTags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: resourceTags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource cacheFileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  name: '${storageAccount.name}/default/${cacheFileShareName}'
  properties: {
    accessTier: 'TransactionOptimized'
    enabledProtocols: 'SMB'
  }
}

var storageAccountKey = listKeys(storageAccount.id, '2023-05-01').keys[0].value

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: resourceTags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

resource managedEnvironmentStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  name: 'mcpcache'
  parent: containerAppsEnvironment
  properties: {
    azureFile: {
      accessMode: 'ReadWrite'
      accountName: storageAccount.name
      accountKey: storageAccountKey
      shareName: cacheFileShareName
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: resourceTags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: {
        external: true
        targetPort: containerPort
        allowInsecure: false
      }
      secrets: [
        {
          name: 'gemini-api-key'
          value: geminiApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'simple-dynamsoft-mcp'
          image: containerImage
          volumeMounts: [
            {
              volumeName: 'cache-volume'
              mountPath: '/mnt/mcp-cache'
            }
          ]
          env: [
            {
              name: 'MCP_PROFILE'
              value: 'semantic-gemini'
            }
            {
              name: 'RAG_PROVIDER'
              value: 'gemini'
            }
            {
              name: 'RAG_FALLBACK'
              value: 'lexical'
            }
            {
              name: 'MCP_DATA_AUTO_DOWNLOAD'
              value: 'true'
            }
            {
              name: 'MCP_DATA_HYDRATION_MODE'
              value: 'eager'
            }
            {
              name: 'MCP_DATA_CACHE_DIR'
              value: '/mnt/mcp-cache/bootstrap/data'
            }
            {
              name: 'MCP_LOG_LEVEL'
              value: 'info'
            }
            {
              name: 'RAG_CACHE_DIR'
              value: '/mnt/mcp-cache/bootstrap/rag/cache'
            }
            {
              name: 'RAG_MODEL_CACHE_DIR'
              value: '/mnt/mcp-cache/bootstrap/rag/models'
            }
            {
              name: 'GEMINI_API_KEY'
              secretRef: 'gemini-api-key'
            }
          ]
          resources: {
            cpu: containerCpu
            memory: containerMemory
          }
        }
      ]
      volumes: [
        {
          name: 'cache-volume'
          storageType: 'AzureFile'
          storageName: managedEnvironmentStorage.name
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, containerApp.id, 'acrpull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output containerAppResourceId string = containerApp.id
output containerAppIngressFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output containerAppsEnvironmentResourceId string = containerAppsEnvironment.id
output cacheStorageAccountName string = storageAccount.name
output cacheFileShareName string = cacheFileShareName
