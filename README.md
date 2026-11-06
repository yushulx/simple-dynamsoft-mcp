# Dynamsoft MCP Server

MCP server that helps AI assistants generate accurate code and guidance for Dynamsoft SDKs.

Supported products:
- Dynamic Web TWAIN (DWT)
- Dynamsoft Document Viewer (DDV)
- Dynamsoft Barcode Reader (DBR): mobile, web, server/desktop
- Dynamsoft MRZ Scanner (MRZ)
- Dynamsoft Mobile Scanner (MDS)
- Dynamsoft Batch Barcode Scanner (BBS): Android/iOS app (documentation only, no SDK)

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

- Azure Container Apps runbook: `docs/deployment/azure-container-apps.md`
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

- `get_index` -- compact product/version/sample index with selection guidance, known capability facts (OCR, VIN, ID documents, batch scanning), and `productSelection.guideUri` pointing to the full product-selection guide
- `search` -- semantic search across docs and samples (also accepts exact sample IDs); returns `doc://` and `sample://` links plus the matched passage (up to ~1500 chars) of the top 3 results (`content: "none"` returns links and short snippets only). Without `edition`/`platform`, MRZ and MDS search their web edition, and a DBR query that names exactly one edition (for example "web app" or "Android") searches that edition and says so
- `read_document` -- read the full text (title, public docs URL, body) of a `doc://` URI returned by `search` or `get_index`
- `list_samples` -- browse available samples for a product/edition/platform
- `resolve_version` -- resolve current version for a product/edition/platform
- `get_quickstart` -- opinionated quickstart: picks a sample by scenario, returns code + install instructions
- `get_sample_files` -- get full project files for a known sample (discovered via list_samples or search)

BBS is a ready-made Android/iOS app, not an SDK: `search` and `read_document` serve its documentation, while `list_samples`, `get_quickstart`, and `get_sample_files` return its docs and integration links instead of code.

Typical doc Q&A flow: `search` -> answer from a matched passage when it covers the question, otherwise `read_document` with the exact `doc://` URI -> answer from the returned text and cite its public URL. Clients that support MCP resources can also fetch the same `doc://` / `sample://` URIs with `resources/read`.

Typical product-selection flow: `get_index` -> `read_document` with `productSelection.guideUri` (`doc://product-selection`) -> recommend from the guide's workflow questions, requirement-to-product table, driver license and VIN rules, and discovery questions.

DBR searches also cover the shared Capture Vision API pages that the DBR docs link to (for example `CaptureVisionRouter.capture()` and `getSimplifiedSettings()`/`updateSettings()`); these hits keep their official `capture-vision/docs` URL and are labelled `shared Capture Vision API used by DBR` in search results. Doc URIs are path-based (`doc://dbr/web/web/<version>/user-guide/use-in-framework`) and change only when the docs move or the SDK version changes.

## Advanced Configuration And Operator Docs

Advanced settings, CI/runbook details, and maintenance workflows live in:

- `AGENTS.md`
- `.env.example`

## License

MIT
