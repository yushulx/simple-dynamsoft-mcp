# AGENTS.md

## Purpose
This repository hosts a stdio-only MCP server for Dynamsoft SDKs. It provides tool-based discovery and lazy resource reads so agents do not load all resources by default.

Supported products:
- DBR (Barcode Reader): mobile, web, python
- DWT (Dynamic Web TWAIN): web
- DDV (Document Viewer): web

## Core Design
- Minimal tool surface: `get_index`, `search`, `resolve_version`, `get_quickstart`, `generate_project`.
- Resources are discovered via tools and read on demand with `resources/read`.
- `resources/list` exposes only pinned resources to keep context small.
- Transport is stdio only. Do not add an HTTP wrapper in this repo.

## Version Policy
- Only the latest major version is served.
- DBR legacy docs are available only for v9 and v10; versions prior to v9 are refused.
- DWT archived docs are available for v16.1.1+ (specific versions listed in code).
- DDV has no legacy archive links in this server.

## Key Files and Data
- `src/index.js`: server implementation, tools, resource routing, version policy.
- `data/dynamsoft_sdks.json`: product metadata and latest version info.
- `data/web-twain-api-docs.json`: DWT docs index/content.
- `data/ddv-api-docs.json`: DDV docs index/content.
- `code-snippet/`: local sample sources used for resources and project generation.

Avoid modifying `data/` or `code-snippet/` unless explicitly requested.

## Resource URI Shape
- Docs: `doc://{product}/{edition}/{platform}/{version}/{slug}`
- Samples: `sample://{product}/{edition}/{platform}/{version}/...`

## Tests and Commands
- Run server: `npm start`
- Run tests: `npm test`

## Contribution Notes
- Prefer adding new content as resources (search + read) instead of new tools.
- Keep edits ASCII-only unless the file already uses Unicode.
- Keep code changes focused; avoid reformatting unrelated sections.
