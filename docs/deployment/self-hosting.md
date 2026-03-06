# Self-Hosting Guide (Ubuntu/Any Server)

Use this guide when you host the server yourself and expose MCP over HTTP.

## 1) Prepare Host

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2) Clone and Install

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

## 3) Configure Environment

Create `.env` in repo root:

```dotenv
GEMINI_API_KEY=your_key_here
MCP_LOG_LEVEL=info
```

Default behavior:
- If `GEMINI_API_KEY` is set: provider is Gemini, fallback is lexical, hydration defaults to eager.
- If `GEMINI_API_KEY` is not set: provider is lexical, hydration defaults to lazy.
- Runtime RAG loading uses local cache first, and can load shared per-repo shard files when `RAG_SHARED_STATE_PATH` is set.

Optional shared-state configuration:
- Set `RAG_SHARED_STATE_PATH` to your mounted state pointer file (for example `/mnt/mcp-cache/state/current.json`).
- The server reads repo signatures from `state/current.json` and loads matching shard files (for example `rag/cache/gemini-<signature>.json`) instead of rebuilding vectors at runtime.
- If a required shared shard is missing, Gemini provider initialization fails and lexical fallback remains available for search.

## 4) Start HTTP Server

```bash
node src/index.js --transport=http --host=0.0.0.0 --port=3333
```

Endpoint:
- `http://<server-ip>:3333/mcp`

## 5) Optional: systemd Service

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

## Troubleshooting

- If startup says data is incomplete, run `npm run data:bootstrap` and `npm run data:sync`.
- For HTTP deployments, check service logs first:
  - `journalctl -u simple-dynamsoft-mcp -f`
- For Gemini mode, confirm `GEMINI_API_KEY` is present in service environment.
- Structured startup logs include `[data]`, `[transport]`, and `[rag]` event lines.
