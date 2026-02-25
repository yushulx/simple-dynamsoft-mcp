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

## Two Supported Usage Scenarios

This project is intentionally documented for two real-world usage paths:

1. Local usage with `npx -y simple-dynamsoft-mcp@latest` and minimal config
2. HTTP deployment on Ubuntu with full data + prebuilt indexes + Gemini embeddings

If you need deep operator/dev settings, see `AGENTS.md` and `.env.example`.

## Scenario 1: Local Usage (Recommended Default)

For most users, this is enough.

Command:

```bash
npx -y simple-dynamsoft-mcp@latest
```

Notes:
- No explicit environment variables are required for the default path.
- Default profile is lightweight (`lite`) and avoids local embedding model downloads.
- If local data is missing, the package can bootstrap pinned data from cache/download sources.

## Scenario 2: Ubuntu HTTP Deployment (Full Data + Gemini)

Use this when you host the server remotely and expose MCP over HTTP.

### 1) Prepare host

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 2) Clone and install

```bash
git clone --recurse-submodules https://github.com/yushulx/simple-dynamsoft-mcp.git
cd simple-dynamsoft-mcp
npm ci
```

If you did not clone with submodules:

```bash
npm run data:bootstrap
npm run data:sync
```

### 3) Configure environment

Create `.env` in repo root:

```dotenv
GEMINI_API_KEY=your_key_here

MCP_PROFILE=semantic-gemini
RAG_PROVIDER=gemini
RAG_FALLBACK=lexical

MCP_DATA_HYDRATION_MODE=eager
MCP_DATA_AUTO_DOWNLOAD=true
MCP_DATA_REFRESH_ON_START=false

RAG_PREBUILT_INDEX_AUTO_DOWNLOAD=true

MCP_LOG_LEVEL=info
```

### 4) Start HTTP server

```bash
node src/index.js --transport=http --host=0.0.0.0 --port=3333
```

Endpoint:
- `http://<server-ip>:3333/mcp`

### 5) Optional: systemd service

Example `/etc/systemd/system/simple-dynamsoft-mcp.service`:

```ini
[Unit]
Description=Simple Dynamsoft MCP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/simple-dynamsoft-mcp
ExecStart=/usr/bin/node /opt/simple-dynamsoft-mcp/src/index.js --transport=http --host=0.0.0.0 --port=3333
EnvironmentFile=/opt/simple-dynamsoft-mcp/.env
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable simple-dynamsoft-mcp
sudo systemctl start simple-dynamsoft-mcp
sudo systemctl status simple-dynamsoft-mcp
```

## MCP Client Configuration

Use one of the following client configs.

### OpenCode

Location:
- macOS: `~/.config/opencode/opencode.json`
- Windows: `%USERPROFILE%\.config\opencode\opencode.json`

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

### Claude Desktop

Location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

### VS Code with GitHub Copilot

Global location:
- macOS: `~/Library/Application Support/Code/User/mcp.json`
- Windows: `%APPDATA%\Code\User\mcp.json`

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

Workspace alternative: `.vscode/mcp.json`

### Cursor

Location:
- macOS: `~/.cursor/mcp.json`
- Windows: `%USERPROFILE%\.cursor\mcp.json`

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

### Windsurf

Location:
- macOS: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

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

## Available Tools

The server exposes this minimal tool surface:

- `get_index`
- `search`
- `list_samples`
- `resolve_sample`
- `resolve_version`
- `get_quickstart`
- `generate_project`

## Quick Troubleshooting

- If startup says data is incomplete, run `npm run data:bootstrap` and `npm run data:sync` in clone-based deployments.
- For HTTP deployments, check service logs first:
  - `journalctl -u simple-dynamsoft-mcp -f`
- For Gemini mode, confirm `GEMINI_API_KEY` is present in service environment.
- Structured startup logs include `[data]`, `[transport]`, and `[rag]` event lines.

## Advanced Configuration And Operator Docs

Advanced settings, CI/runbook details, and maintenance workflows live in:

- `AGENTS.md`
- `.env.example`

## License

MIT
