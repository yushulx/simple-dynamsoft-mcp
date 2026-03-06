# Dynamsoft MCP Server

MCP server that helps AI assistants generate accurate code and guidance for Dynamsoft SDKs.

Supported products:
- Dynamsoft Capture Vision (DCV)
- Dynamsoft Barcode Reader (DBR): mobile, web, server/desktop
- Dynamic Web TWAIN (DWT)
- Dynamsoft Document Viewer (DDV)

Default transport is `stdio`. Native Streamable HTTP is also supported at `/mcp`.

## Demo Video

https://github.com/user-attachments/assets/cc1c5f4b-1461-4462-897a-75abc20d62a6

## Two Core Usage Modes

1. Remote MCP over HTTP (recommended)
2. Local MCP via `npx`

### 1) Remote (Recommended)

Use this endpoint directly:

- `https://simple-dynamsoft-mcp.wonderfulwave-69908b91.eastus2.azurecontainerapps.io/mcp`

### 2) Local

```bash
npx -y simple-dynamsoft-mcp@latest
```

## Deployment Guides

- Azure Container Apps runbook (two-lane release/data architecture): `docs/deployment/azure-container-apps.md`
- Shared Azure data/index sync runbook: `docs/deployment/data-sync-azure.md`
- Self-hosting (Ubuntu/any server): `docs/deployment/self-hosting.md`

## MCP Client Configuration

Use one of the following client configs. Remote is recommended.

### OpenCode

<details>
<summary>OpenCode Config</summary>

Remote (recommended):

Location:
- macOS: `~/.config/opencode/opencode.json`
- Windows: `%USERPROFILE%\.config\opencode\opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dynamsoft": {
      "type": "remote",
      "url": "https://simple-dynamsoft-mcp.wonderfulwave-69908b91.eastus2.azurecontainerapps.io/mcp"
    }
  }
}
```

Local:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dynamsoft": {
      "type": "local",
      "command": ["npx", "-y", "simple-dynamsoft-mcp@latest"]
    }
  }
}
```

</details>

### Claude Desktop

<details>
<summary>Claude Desktop Config</summary>

Location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Remote (recommended):

```json
{
  "mcpServers": {
    "dynamsoft": {
      "url": "https://simple-dynamsoft-mcp.wonderfulwave-69908b91.eastus2.azurecontainerapps.io/mcp"
    }
  }
}
```

Local:

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp@latest"]
    }
  }
}
```

</details>

### VS Code with GitHub Copilot

<details>
<summary>VS Code MCP Config</summary>

Global location:
- macOS: `~/Library/Application Support/Code/User/mcp.json`
- Windows: `%APPDATA%\Code\User\mcp.json`

Workspace alternative: `.vscode/mcp.json`

Remote (recommended):

```json
{
  "servers": {
    "dynamsoft": {
      "url": "https://simple-dynamsoft-mcp.wonderfulwave-69908b91.eastus2.azurecontainerapps.io/mcp"
    }
  }
}
```

Local:

```json
{
  "servers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp@latest"]
    }
  }
}
```

</details>

### Cursor

<details>
<summary>Cursor MCP Config</summary>

Location:
- macOS: `~/.cursor/mcp.json`
- Windows: `%USERPROFILE%\.cursor\mcp.json`

Remote (recommended):

```json
{
  "mcpServers": {
    "dynamsoft": {
      "url": "https://simple-dynamsoft-mcp.wonderfulwave-69908b91.eastus2.azurecontainerapps.io/mcp"
    }
  }
}
```

Local:

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp@latest"]
    }
  }
}
```

</details>

### Windsurf

<details>
<summary>Windsurf MCP Config</summary>

Location:
- macOS: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

Remote (recommended):

```json
{
  "mcpServers": {
    "dynamsoft": {
      "url": "https://simple-dynamsoft-mcp.wonderfulwave-69908b91.eastus2.azurecontainerapps.io/mcp"
    }
  }
}
```

Local:

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp@latest"]
    }
  }
}
```

</details>

### Cline

<details>
<summary>Cline MCP Config</summary>

Location:
- VS Code settings JSON for Cline MCP integration

Remote (recommended):

```json
{
  "mcpServers": {
    "dynamsoft": {
      "url": "https://simple-dynamsoft-mcp.wonderfulwave-69908b91.eastus2.azurecontainerapps.io/mcp"
    }
  }
}
```

Local:

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp@latest"]
    }
  }
}
```

</details>

### Continue

<details>
<summary>Continue MCP Config</summary>

Location:
- `~/.continue/config.yaml` (or workspace Continue config)

Remote (recommended):

```yaml
mcpServers:
  dynamsoft:
    transport: streamable-http
    url: https://simple-dynamsoft-mcp.wonderfulwave-69908b91.eastus2.azurecontainerapps.io/mcp
```

Local:

```yaml
mcpServers:
  dynamsoft:
    command: npx
    args:
      - -y
      - simple-dynamsoft-mcp@latest
```
 
</details>

## Available Tools

The server exposes this minimal tool surface:

- `get_index` -- compact product/version/sample index with selection guidance
- `search` -- semantic search across docs and samples (also accepts exact sample IDs)
- `list_samples` -- browse available samples for a product/edition/platform
- `resolve_version` -- resolve current version for a product/edition/platform
- `get_quickstart` -- opinionated quickstart: picks a sample by scenario, returns code + install instructions
- `get_sample_files` -- get full project files for a known sample (discovered via list_samples or search)

## Advanced Configuration And Operator Docs

Advanced settings, CI/runbook details, and maintenance workflows live in:

- `AGENTS.md`
- `.env.example`

## License

MIT
