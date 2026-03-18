# Public Product Offerings Redesign

## Goal

Reposition the MCP server so its public contract exposes only `dwt`, `ddv`, `dbr`, `mrz`, and `mds`, while continuing to reuse the existing DBR/DDV/DWT/DCV-backed documentation and sample submodules internally.

## Approved Decisions

- Do not expose `dcv` as a public product anywhere in the MCP server.
- Keep the existing submodule repos, repo names, and raw source structure unchanged.
- Add one small shared public-offerings config/helper module for common rules.
- Reclassify resources once when building the public index instead of adding a separate runtime abstraction layer.
- Target the current DBR Web positioning (`v11.4` era), not unreleased `v12` behavior.
- Treat unsupported scopes as redirect-style responses with public documentation/sample URLs instead of hard validation failures.
- No backward-compatibility contract is required for public `dcv` requests because the server is a SaaS service.

## Current State

The current server is organized around `dcv`, `dbr`, `dwt`, and `ddv`.

- `get_index` publishes `dcv` as a top-level product.
- `productSelection` is framed as DBR-vs-DCV guidance.
- `search`, `list_samples`, `get_quickstart`, `get_sample_files`, and `resolve_version` accept or emit `dcv`.
- Sample URIs and doc URIs also use `dcv/...` path segments.
- Lazy hydration and repo mapping only understand the current product IDs.

## Target Public Contract

### Public Offerings

- `dwt`
- `ddv`
- `dbr`
- `mrz`
- `mds`

### Public Positioning Rules

- `DWT`: unchanged as a top-level scanning product.
- `DDV`: top-level standalone product; also positioned as the extension path for:
  - DWT users who want mobile support or PDF annotation.
  - MDS users who want multi-page support and PDF output.
- `DBR`:
  - `server`: subset of the DCV package with foundational API only, plus dedicated docs/samples/packages for C++, Python, Java, and .NET.
  - `web`: current-version positioning should emphasize the foundational API by default; keep only minimal mention of `BarcodeScanner` for users prioritizing simplicity.
  - `mobile`: officially supports both foundational API and `BarcodeScanner` (RTU) API across iOS/Android native, .NET MAUI, React Native, and Flutter.
- `MRZ`:
  - `web` and `mobile` only.
  - Solution/RTU only; do not promote foundational API.
  - `server/desktop` is not hosted in the MCP and should redirect users to public docs/sample links.
- `MDS`:
  - `web` only.
  - Solution/RTU only; do not promote foundational API.
  - `mobile` and `server/desktop` are not hosted in the MCP and should redirect users to public docs/sample links.

## Lean Architecture

### Keep Raw Sources Unchanged

- `data/documentation/*` and `data/samples/*` submodules remain unchanged.
- existing discovery code continues to load raw DBR/DCV/DDV/DWT content
- repo names, labels, and path structure stay as they are today

### Add One Shared Public-Offerings Module

Add one small shared module for the rules that truly need to be reused:

- supported public product IDs
- aliases and normalization rules
- supported-scope checks
- redirect URLs for unsupported scopes
- simple MRZ/MDS intent helpers

This is a config/helper file, not a new subsystem.

### Reclassify At Index-Build Time

Convert raw entries into public entries once while building the resource index.

- raw `dwt` docs/samples -> public `dwt`
- raw `ddv` docs/samples -> public `ddv`
- raw `dbr` docs/samples -> public `dbr`
- selected raw `dcv` MRZ web/mobile content -> public `mrz`
- selected raw `dcv` document-scan web content -> public `mds`
- remaining raw `dcv` content -> excluded from the public MCP index

The existing `resourceIndex` shape should stay intact. Do not add a parallel metadata model unless implementation proves it is needed.

## URI Strategy

All user-facing URIs should use the public offerings only.

Examples:

- `doc://mrz/mobile/react-native/3.4.1000/...`
- `sample://mrz/mobile/android/3.4.1000/MRZScanner`
- `doc://mds/web/web/3.2.5000/...`

Internally, URI parsing can still route `mrz` and `mds` back to the correct backing DCV paths.

## Tool Behavior

### `get_index`

- Publish only `dwt`, `ddv`, `dbr`, `mrz`, and `mds`.
- Remove the DBR-vs-DCV framing.
- Replace it with public-offering guidance covering:
  - when to use `dbr`
  - when to use `mrz`
  - when to use `mds`
  - when `ddv` extends `dwt` or `mds`

### `search` and `list_samples`

- Accept only the 5 public offerings as input.
- Operate on the reclassified public index.
- Never emit `dcv`-prefixed URIs or `dcv` product labels.
- Redirect unsupported direct scopes such as `mrz + server` and `mds + mobile` to public URLs.

### `get_quickstart`

- `dbr web`: default to foundational API guidance at the current version; mention `BarcodeScanner` only as a lightweight alternative.
- `mrz`: solution/RTU quickstarts only.
- `mds`: solution/RTU quickstarts only.
- unsupported scopes return redirect text plus public links.

### `resolve_version`

- Resolve public offerings only.
- Present the result using public labels.
- Internally, `mrz` and `mds` may still read from the mapped DCV version family.

### `get_sample_files`

- Accept public sample URIs and public product IDs only.
- Resolve public URIs back to the underlying raw source paths with minimal branching logic.

## Unsupported Scope Behavior

Unsupported scopes should return a friendly redirect response instead of a hard structural error.

Examples:

- `mrz + server`
- `mrz + desktop`
- `mds + mobile`
- `mds + server`

Each response should:

- explain that the scope is not an official MCP offering
- provide a public docs link and/or sample repo link
- avoid referencing `dcv` as the public product to use instead

## Testing Strategy

- `get_index` includes `dwt`, `ddv`, `dbr`, `mrz`, `mds`
- `get_index` does not include `dcv`
- hydration/repo mapping works for `mrz` and `mds`
- MRZ searches return public MRZ URIs
- public sample URIs resolve through `get_sample_files`
- unsupported scopes return redirect-style responses with public links
- DBR web quickstarts emphasize the foundational API by default
- version resolution is labeled with public offering names only
- tool descriptions and server description no longer advertise `dcv`

## Verification Notes

The clean planning worktree currently needs data bootstrapping before the integration suite can pass. The implementation flow should run `npm run data:bootstrap` in the worktree before broader verification.
