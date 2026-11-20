import { statSync } from "node:fs";
import { join, relative } from "node:path";

// Kept free of data-root imports: tool modules load before lazy hydration
// resolves the data root, and resource-index/paths.js captures it at import.
const SAMPLE_REF_PATTERN = /(?:src|href)\s*=\s*["']([^"']+)["']|from\s+["']([^"']+)["']|initSettingsFromFile\(\s*["']([^"']+)["']|["'](\.\.?\/[^"']+\.(?:json|css|js|xml))["']/g;

// Files a sample file references that exist inside rootDir. Absolute URLs,
// data URIs, node_modules, filesystem-absolute paths, and references that leave
// rootDir are never followed, so host files outside the sample are never read.
function findLocalSampleRefs(content, fileDir, rootDir) {
  const refs = [];
  const pattern = new RegExp(SAMPLE_REF_PATTERN.source, "g");
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const ref = match[1] || match[2] || match[3] || match[4];
    if (!ref) continue;
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:") || ref.startsWith("/") || ref.includes("node_modules")) continue;
    const resolved = join(fileDir, ref.split(/[?#]/)[0]);
    const relPath = relative(rootDir, resolved);
    if (!relPath || relPath.startsWith("..")) continue;
    try {
      if (!statSync(resolved).isFile()) continue;
    } catch {
      continue;
    }
    refs.push({ resolved, relPath });
  }
  return refs;
}

export { findLocalSampleRefs };
