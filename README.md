# Dynamsoft MCP Server

MCP (Model Context Protocol) server that enables AI assistants to write correct code with Dynamsoft SDKs. It provides actual working code snippets, documentation links, and API guidance for:

- **Dynamsoft Barcode Reader Mobile** - Android (Java/Kotlin) and iOS (Swift)
- **Dynamsoft Barcode Reader Python** - Desktop/server barcode scanning
- **Dynamsoft Barcode Reader Web** - JavaScript/TypeScript barcode scanning
- **Dynamic Web TWAIN** - Document scanning from TWAIN/WIA/ICA/SANE scanners

## Features

- **Code Snippets**: Real, working source code from official Dynamsoft samples
- **Trial License Included**: Ready-to-use trial license for quick testing
- **Multiple SDKs**: Barcode Reader (Mobile/Python/Web) + Dynamic Web TWAIN
- **Multiple API Levels**: High-level (simple) and low-level (advanced) options

## Available Tools

| Tool | Description |
|------|-------------|
| `list_sdks` | List all SDKs with versions and platforms |
| `get_sdk_info` | Get detailed SDK info for a specific platform |
| `list_samples` | List mobile code samples |
| `list_python_samples` | List Python SDK samples |
| `list_dwt_categories` | List Dynamic Web TWAIN sample categories |
| `get_code_snippet` | Get mobile sample source code |
| `get_python_sample` | Get Python sample code |
| `get_dwt_sample` | Get Dynamic Web TWAIN sample |
| `get_quick_start` | Complete quick start guide with dependencies |
| `get_gradle_config` | Android Gradle configuration |
| `get_license_info` | License initialization code |
| `get_api_usage` | Usage examples for specific APIs |
| `search_samples` | Search samples by keyword |
| `generate_project` | Generate a complete project structure based on a sample |


## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

### VS Code (GitHub Copilot)

Add to your VS Code `settings.json` (Ctrl+Shift+P → "Preferences: Open User Settings (JSON)"):

```json
{
  "mcp": {
    "servers": {
      "dynamsoft": {
        "command": "npx",
        "args": ["-y", "simple-dynamsoft-mcp"]
      }
    }
  }
}
```

Or use the workspace `.vscode/mcp.json`:

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

### OpenCode

Add to your `~/.config/opencode/opencode.json` (or `%USERPROFILE%\.config\opencode\opencode.json` on Windows):

```json
{
  "mcp": {
    "servers": {
      "dynamsoft": {
        "command": "npx",
        "args": ["-y", "simple-dynamsoft-mcp"]
      }
    }
  }
}
```

### Cursor

Add to your Cursor settings (`~/.cursor/mcp.json`):

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

Add to your Windsurf MCP config (`~/.codeium/windsurf/mcp_config.json`):

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

### Cline (VS Code Extension)

Add via Cline settings in VS Code or edit `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`:

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

### Dynamic Web TWAIN (v19.3)

**Installation:** `npm install dwt`

**CDN:** `https://cdn.jsdelivr.net/npm/dwt@latest/dist/dynamsoft.webtwain.min.js`

**Sample Categories:**
- **scan** - Basic document scanning (basic-scan, read-barcode, etc.)
- **input-options** - Load from files, URLs, local drive
- **output-options** - Save, upload, convert to PDF/Base64/Blob
- **classification** - Document classification and tagging
- **UI-customization** - Customize viewer and scan UI

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

### Dynamic Web TWAIN
- "Create a web page that scans documents from a TWAIN scanner"
- "Show me how to save scanned documents as PDF"
- "Get the DWT sample for reading barcodes from scanned documents"

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
```

## Extending the Server

### Add New Samples

Place new sample projects in the appropriate folder under `code-snippet/`.

### Update SDK Info

Edit `data/dynamsoft_sdks.json` to update versions, docs URLs, or add new platforms.

## License

MIT
