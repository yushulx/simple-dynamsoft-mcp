# Dynamsoft Barcode Reader MCP Server

MCP (Model Context Protocol) server that enables AI assistants to write correct code with Dynamsoft Barcode Reader Mobile SDK. It provides actual working code snippets, documentation links, and API guidance for Android (Java/Kotlin) and iOS (Swift) barcode scanning apps.

## Features

- **Code Snippets**: Real, working source code from official Dynamsoft samples
- **Version 11.2.5000**: Latest SDK version with trial license included
- **Two API Levels**: 
  - **High-Level (BarcodeScanner)**: Simple ready-to-use barcode scanning UI
  - **Low-Level (CaptureVisionRouter)**: Full control over the scanning pipeline
- **Multiple Platforms**: Android and iOS with Java, Kotlin, and Swift examples

## Available Tools

| Tool | Description |
|------|-------------|
| `list_sdks` | List SDK info with version and trial license |
| `get_sdk_info` | Get detailed SDK info for a platform |
| `list_samples` | List available code samples |
| `get_code_snippet` | Get actual source code from samples |
| `get_quick_start` | Complete quick start guide with dependencies |
| `get_gradle_config` | Android Gradle configuration |
| `get_license_info` | License initialization code |
| `get_api_usage` | Usage examples for specific APIs |
| `search_samples` | Search samples by keyword |

## Quick Start

### Install and Run Locally

```bash
npm install
npm start
```

### Use with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dynamsoft": {
      "command": "node",
      "args": ["/path/to/simple-dynamsoft-mcp/src/index.js"]
    }
  }
}
```

### Use with VS Code (Copilot)

Add to your VS Code settings:

```json
{
  "mcp.servers": {
    "dynamsoft": {
      "command": "node",
      "args": ["${workspaceFolder}/src/index.js"]
    }
  }
}
```

### Use via npx

```bash
npx simple-dynamsoft-mcp
```

## Code Samples Included

### Android High-Level API (BarcodeScanner)
- `ScanSingleBarcode` - Scan one barcode (Java)
- `ScanSingleBarcodeKt` - Scan one barcode (Kotlin)
- `ScanMultipleBarcodes` - Batch scanning
- `ScenarioOrientedSamples` - Various use cases

### Android Low-Level API (CaptureVisionRouter)
- `DecodeWithCameraEnhancer` - Camera with DCE
- `DecodeWithCameraX` - Camera with CameraX
- `DecodeFromAnImage` - Decode from image file
- `GeneralSettings` - Template customization
- `DriversLicenseScanner` - Parse driver licenses
- `TinyBarcodeDecoding` - Small barcode optimization
- `ReadGS1AI` - GS1 barcode parsing
- `LocateAnItemWithBarcode` - Barcode location

### iOS High-Level API (BarcodeScanner)
- `ScanSingleBarcode` - Scan one barcode (Swift)
- `ScanSingleBarcodeSwiftUI` - SwiftUI version
- `ScanSingleBarcodeObjc` - Objective-C version
- `ScanMultipleBarcodes` - Batch scanning

### iOS Low-Level API (CaptureVisionRouter)
- `DecodeWithCameraEnhancer` - Camera with DCE
- `DecodeWithAVCaptureSession` - Camera with AVFoundation
- `DecodeFromAnImage` - Decode from image file
- `GeneralSettings` - Template customization
- And more...

## Trial License
https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform

## Example AI Prompts

After connecting the MCP server, you can ask your AI assistant:

- "Create an Android app that scans a single barcode"
- "Show me how to use CaptureVisionRouter in iOS Swift"
- "Get the Gradle configuration for Dynamsoft Barcode Reader"
- "How do I initialize the Dynamsoft license in Kotlin?"
- "Create a barcode scanner that decodes from an image file"

## SDK Documentation

- **Android User Guide**: https://www.dynamsoft.com/barcode-reader/docs/mobile/programming/android/user-guide.html
- **iOS User Guide**: https://www.dynamsoft.com/barcode-reader/docs/mobile/programming/objectivec-swift/user-guide.html

## Extending the Server

### Add New Samples

Place new sample projects in:
- `code-snippet/android/BarcodeScannerAPISamples/` (high-level)
- `code-snippet/android/FoundationalAPISamples/` (low-level)
- `code-snippet/ios/BarcodeScannerAPISamples/` (high-level)
- `code-snippet/ios/FoundationalAPISamples/` (low-level)

### Update SDK Info

Edit `data/dynamsoft_sdks.json` to update version, docs URLs, or add new platforms.

## License

MIT
