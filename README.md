# Dynamsoft MCP Server

MCP (Model Context Protocol) server that enables AI assistants to write correct code with Dynamsoft SDKs. It provides actual working code snippets, documentation links, and API guidance for:

- **Dynamsoft Barcode Reader Mobile** - Android (Java/Kotlin) and iOS (Swift)
- **Dynamsoft Barcode Reader Python** - Desktop/server barcode scanning
- **Dynamsoft Barcode Reader Web** - JavaScript/TypeScript barcode scanning
- **Dynamic Web TWAIN** - Document scanning from TWAIN/WIA/ICA/SANE scanners
- **Dynamsoft Document Viewer** - Web document viewing and annotation

## Demo Video
https://github.com/user-attachments/assets/cc1c5f4b-1461-4462-897a-75abc20d62a6


## Features

- **Code Snippets**: Real, working source code from official Dynamsoft samples
- **Trial License Included**: Ready-to-use trial license for quick testing
- **Multiple SDKs**: Barcode Reader (Mobile/Python/Web) + Dynamic Web TWAIN + Document Viewer
- **Multiple API Levels**: High-level (simple) and low-level (advanced) options
- **Stdio MCP server**: Runs on stdio. Works with any MCP-capable client.
- **Resource-efficient discovery**: Resources are discovered via tools (fuzzy search + resource links). Only a small pinned set is listed by default; heavy content is fetched on-demand with `resources/read`.
- **Latest-major policy**: The server only serves the latest major versions; older major requests are refused with legacy links when available.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_index` | Compact index of products, editions, versions, samples, and docs |
| `search` | Unified search across docs and samples; returns resource links |
| `resolve_version` | Resolve a concrete latest-major version for a product/edition |
| `get_quickstart` | Opinionated quickstart for a target stack |
| `generate_project` | Assemble a project structure from a sample (no AI generation) |


## MCP Client Configuration

### OpenCode
Location: 
- **macOS**: `~/.config/opencode/opencode.json`
- **Windows**: `%USERPROFILE%\.config\opencode\opencode.json`

Configuration:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dynamsoft": {
      "type": "local",
      "command": [
        "npx",
        "simple-dynamsoft-mcp"
      ]
    }
  }
}
```

### Claude Desktop

Location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Configuration:
```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```

### VS Code with GitHub Copilot

Global Location:

- **macOS**: `~/Library/Application Support/Code/User/mcp.json`
- **Windows**: `%APPDATA%\Code\User\mcp.json`

```json
{
  "servers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```

Or create workspace-specific `.vscode/mcp.json`:

```json
{
  "servers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```

### Cursor

Location: 
- **macOS**: `~/.cursor/mcp.json`
- **Windows**: `%USERPROFILE%\.cursor\mcp.json`

Configuration:

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```

### Windsurf

Location:

- **macOS**: `~/.codeium/windsurf/mcp_config.json`
- **Windows**: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "npx",
      "args": ["-y", "simple-dynamsoft-mcp"]
    }
  }
}
```


### Alternative: Run from Local Clone

If you prefer running from source:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/simple-dynamsoft-mcp/src/index.js"]
}
```

## Supported SDKs

### Dynamsoft Barcode Reader Mobile (v11.2.5000)

**Platforms:** Android, iOS, Flutter, React Native, .NET MAUI

**API Levels:**
- **High-Level (BarcodeScanner)**: Simple ready-to-use barcode scanning UI
- **Low-Level (CaptureVisionRouter)**: Full control over the scanning pipeline

**Android Samples:**
- ScanSingleBarcode, ScanMultipleBarcodes, ScenarioOrientedSamples
- DecodeWithCameraEnhancer, DecodeWithCameraX, DecodeFromAnImage
- GeneralSettings, DriversLicenseScanner, TinyBarcodeDecoding, ReadGS1AI

**iOS Samples:**
- ScanSingleBarcode, ScanMultipleBarcodes, ScanSingleBarcodeSwiftUI
- DecodeWithCameraEnhancer, DecodeWithAVCaptureSession, DecodeFromAnImage

### Dynamsoft Barcode Reader Python (v11.2.5000)

**Installation:** `pip install dynamsoft-barcode-reader-bundle`

**Samples:**
- `read_an_image` - Decode barcodes from image files
- `video_decoding` - Real-time video decoding

### Dynamsoft Barcode Reader Web (v11.2.4000)

**Installation:** `npm install dynamsoft-barcode-reader-bundle`

**CDN:** `https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@11.2.4000/dist/dbr.bundle.min.js`

**Samples:**
- **hello-world** - Basic barcode scanning from camera
- **read-an-image** - Decode from image files
- **frameworks/** - React, Vue, Angular, Next.js, PWA samples
- **scenarios/** - Multi-image reading, localize an item, driver license parsing

### Dynamic Web TWAIN (v19.3)

**Installation:** `npm install dwt`

**CDN:** `https://cdn.jsdelivr.net/npm/dwt@latest/dist/dynamsoft.webtwain.min.js`

**Sample Categories:**
- **scan** - Basic document scanning (basic-scan, read-barcode, etc.)
- **input-options** - Load from files, URLs, local drive
- **output-options** - Save, upload, convert to PDF/Base64/Blob
- **classification** - Document classification and tagging
- **UI-customization** - Customize viewer and scan UI

### Dynamsoft Document Viewer (v3.x)

**Installation:** `npm install dynamsoft-document-viewer`

**CDN:** `https://cdn.jsdelivr.net/npm/dynamsoft-document-viewer@latest/dist/ddv.js`

**Samples:**
- **hello-world** - Basic viewer setup
- **angular**, **react-vite**, **vue**, **next** - Framework starter samples

## Trial License
https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform

## Example AI Prompts

After connecting the MCP server, you can ask your AI assistant:

### Mobile Barcode Scanner
- "Create an Android app that scans a single barcode"
- "Show me how to use CaptureVisionRouter in iOS Swift"
- "Get the Gradle configuration for Dynamsoft Barcode Reader"
- "How do I initialize the Dynamsoft license in Kotlin?"

### Python Barcode Reader
- "Show me how to read barcodes from an image in Python"
- "Get the Python sample for video decoding"

### Web Barcode Reader
- "Create a web page that scans barcodes from a camera"
- "Show me the web barcode reader hello world sample"
- "Get the React sample for web barcode scanning"
- "How do I decode barcodes from an image in JavaScript?"

### Dynamic Web TWAIN
- "Create a web page that scans documents from a TWAIN scanner"
- "Show me how to save scanned documents as PDF"
- "Get the DWT sample for reading barcodes from scanned documents"
- "Search the DWT docs for how to load images from files"
- "Get the DWT documentation about OCR"
- "How do I configure the PDF rasterizer in DWT?"

## SDK Documentation

- **Mobile Android**: https://www.dynamsoft.com/barcode-reader/docs/mobile/programming/android/user-guide.html
- **Mobile iOS**: https://www.dynamsoft.com/barcode-reader/docs/mobile/programming/objectivec-swift/user-guide.html
- **Python**: https://www.dynamsoft.com/barcode-reader/docs/server/programming/python/user-guide.html
- **Web JavaScript**: https://www.dynamsoft.com/barcode-reader/docs/web/programming/javascript/user-guide/index.html
- **Dynamic Web TWAIN**: https://www.dynamsoft.com/web-twain/docs/introduction/index.html

## Code Snippet Structure

```
code-snippet/
├── dynamsoft-barcode-reader/
│   ├── android/
│   │   ├── BarcodeScannerAPISamples/   # High-level API
│   │   └── FoundationalAPISamples/      # Low-level API
│   ├── ios/
│   │   ├── BarcodeScannerAPISamples/
│   │   └── FoundationalAPISamples/
│   ├── python/
│   │   └── Samples/
│   └── web/
└── dynamic-web-twain/
    ├── scan/
    ├── input-options/
    ├── output-options/
    ├── classification/
    └── UI-customization/

data/
├── dynamsoft_sdks.json        # SDK registry with versions and docs
└── web-twain-api-docs.json    # Full DWT API documentation (50+ articles)
```

## Using Search-Based Discovery (Recommended)

- On session start, let your client call `tools/list` and `resources/list` (pinned only, not exhaustive).
- For any query, call `search` with keywords; it returns `resource_link` entries.
- Read only the links you need via `resources/read` to avoid bloating the context window.
- If unsure what to search, call `get_index` first to see what is available.

## Version Policy

- This MCP server serves only the latest major versions (DBR v11, DWT v19).
- Requests for older major versions are refused. For select legacy versions, the server returns official archived documentation links.

## Extending the Server

### Add New Samples

Place new sample projects in the appropriate folder under `code-snippet/`.

### Update SDK Info

Edit `data/dynamsoft_sdks.json` to update versions, docs URLs, or add new platforms.

## License

MIT
