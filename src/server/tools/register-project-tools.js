import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { z } from "zod";
import {
  buildUnknownPublicProductResponse,
  isKnownPublicOffering,
  API_LEVEL_NOTE,
  DBR_ONLY_EDITIONS_NOTE,
  WEB_ONLY_OMIT_NOTE
} from "../public-offerings.js";
import { buildUnsupportedPublicScopeResponse } from "./public-routing.js";

export function registerProjectTools({
  server,
  ensureScopeHydrated,
  ensureLatestMajor,
  normalizeProduct,
  normalizePlatform,
  normalizeEdition,
  normalizeApiLevel,
  normalizeSampleName,
  parseResourceUri,
  parseSampleUri,
  formatScopeLabel,
  getSampleIdFromUri,
  discoverDwtSamples,
  getMobileSamplePath,
  getWebSamplePath,
  getDbrServerSamplePath,
  getDcvMobileSamplePath,
  getDcvServerSamplePath,
  getDcvWebSamplePath,
  getMrzWebSamplePath,
  getMdsWebSamplePath,
  getDwtSamplePath,
  getDdvSamplePath,
  getSampleSuggestions
}) {
  async function resolveDedicatedPublicWebSamplePath({
    product,
    platform,
    sampleName,
    getSamplePath,
    getSuggestions
  }) {
    const directPath = getSamplePath(undefined, sampleName);
    if (directPath && existsSync(directPath)) {
      return directPath;
    }

    const suggestions = await getSuggestions({
      query: sampleName,
      product,
      edition: "web",
      platform,
      limit: 10
    });

    const matchingEntry = suggestions.find((entry) => {
      if (entry.type !== "sample") return false;
      const parsed = parseSampleUri(entry.uri);
      return parsed?.product === product && parsed?.edition === "web" && parsed?.sampleName === sampleName;
    });

    if (!matchingEntry) {
      return directPath;
    }

    const parsed = parseSampleUri(matchingEntry.uri);
    return getSamplePath(parsed?.category, sampleName);
  }

  server.registerTool(
    "get_sample_files",
    {
      title: "Get Sample Files",
      description: [
        "Get the full project files for a known sample and return them inline as text.",
        "",
        "WHEN TO USE:",
        "- When you have a sample_id (from list_samples) or a sample:// resource_uri (from search) and need the complete source code.",
        "- When the user wants to see or scaffold a full sample project (multiple files, build configs, manifests).",
        "",
        "WHEN NOT TO USE:",
        "- If you do not have a sample_id or resource_uri yet, call list_samples or search first to discover one.",
        "- For doc:// URIs, use resources/read instead (this tool only handles sample:// URIs).",
        "- If the user just wants a quick code snippet, use get_quickstart instead.",
        "",
        "PARAMETERS:",
        "- product (required): dbr, dwt, ddv, mrz, or mds.",
        `- edition: mobile, web, or server. ${DBR_ONLY_EDITIONS_NOTE}`,
        `- platform: only DBR spans multiple platforms (android, ios, js, python, cpp, java, dotnet, nodejs, react, vue, angular, flutter, react-native, maui, etc.). ${WEB_ONLY_OMIT_NOTE}`,
        "- version: Version constraint. Latest major is used by default.",
        "- sample_id: Sample identifier as returned by list_samples (e.g. 'hello-world', 'ScanSingleBarcode'). Requires product/edition.",
        "- resource_uri: A sample:// URI as returned by search (e.g. 'sample://dbr/mobile/android/10/high-level/ScanSingleBarcode' or 'sample://mrz/server/python/3/mrz_scanner'). Preferred over sample_id when available.",
        `- api_level: ${API_LEVEL_NOTE}`,
        "",
        "RETURNS: A text block containing all project files inline, each under a heading with its relative path and wrapped in a fenced code block. Files larger than 50KB are excluded. No zip file is created.",
        "",
        "EXAMPLE: get_sample_files with resource_uri='sample://dbr/mobile/android/10/high-level/ScanSingleBarcode' returns all source files for the Android barcode scanning sample.",
        "",
        "RELATED TOOLS: list_samples (discover sample IDs), search (find samples by keyword), get_quickstart (quick single-file snippet)."
      ].join("\n"),
      inputSchema: {
        product: z.string().optional().describe("Product: dbr, dwt, ddv, mrz, mds. Optional when resource_uri is provided (the URI already encodes it)."),
        edition: z.string().optional().describe(`Edition: mobile, web, server/desktop. ${DBR_ONLY_EDITIONS_NOTE}`),
        platform: z.string().optional().describe(`Platform (DBR only spans multiple): android, ios, maui, react-native, flutter, js, python, cpp, java, dotnet, nodejs, angular, blazor, capacitor, electron, es6, native-ts, next, nuxt, pwa, react, requirejs, svelte, vue, webview. ${WEB_ONLY_OMIT_NOTE}`),
        version: z.string().optional().describe("Version constraint"),
        sample_id: z.string().optional().describe("Sample identifier (name or path)"),
        resource_uri: z.string().optional().describe("Resource URI returned by search"),
        api_level: z.string().optional().describe(`API level: ${API_LEVEL_NOTE}`),
        files: z.array(z.string()).optional().describe("Optional subset: exact relative paths or *.ext patterns to return (default: all files)"),
        manifest_only: z.boolean().optional().describe("If true, return only the file list (paths + sizes), not file contents")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ product, edition, platform, version, sample_id, resource_uri, api_level, files: fileFilter, manifest_only }) => {
      let sampleInfo = null;
      if (resource_uri) {
        const parsed = parseResourceUri(resource_uri);
        if (!parsed) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "resource_uri must be a sample://... URI. Use search or list_samples to get a valid sample URI."
            }]
          };
        }
        if (parsed.scheme !== "sample") {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "resource_uri must use the sample:// scheme. For doc:// URIs, use resources/read instead."
            }]
          };
        }
        sampleInfo = parseSampleUri(resource_uri);
        if (!sampleInfo) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "Invalid sample URI format. Use search or list_samples to obtain a valid sample:// URI."
            }]
          };
        }
      }

      if (!sampleInfo && !product) {
        return {
          isError: true,
          content: [{ type: "text", text: "Provide a resource_uri (from search) or a product + sample_id. Use search or list_samples to discover one." }]
        };
      }

      const normalizedProduct = normalizeProduct(sampleInfo?.product || product);
      if ((sampleInfo?.product || product) && !isKnownPublicOffering(normalizedProduct)) {
        return buildUnknownPublicProductResponse(sampleInfo?.product || product);
      }

      const normalizedPlatform = normalizePlatform(sampleInfo?.platform || platform);
      const normalizedEdition = normalizeEdition(sampleInfo?.edition || edition, normalizedPlatform, normalizedProduct);
      // A concrete sample:// URI names a hydrated sample we can serve inline, so
      // it must bypass the scope-level redirect (which is for scope-only asks).
      // Without this, search emits mrz/mds mobile/server URIs that this tool then
      // refuses, and its own serving branches below are unreachable (issue #131).
      if (!sampleInfo) {
        const unsupportedScopeResponse = buildUnsupportedPublicScopeResponse(normalizedProduct, normalizedEdition, normalizedPlatform);
        if (unsupportedScopeResponse) return unsupportedScopeResponse;
      }

      await ensureScopeHydrated({
        product: normalizedProduct,
        edition: normalizedEdition,
        platform: normalizedPlatform,
        type: "sample"
      });

      const policy = ensureLatestMajor({
        product: normalizedProduct,
        version,
        query: sample_id,
        edition: normalizedEdition,
        platform: normalizedPlatform
      });

      if (!policy.ok) {
        return { isError: true, content: [{ type: "text", text: policy.message }] };
      }

      let samplePath = null;
      let sampleLabel = "";
      let sampleQuery = "";

      if (sampleInfo) {
        sampleLabel = sampleInfo.sampleName || resource_uri;
        sampleQuery = sampleInfo.sampleName || sample_id || "";
        if (sampleInfo.product === "dbr" && sampleInfo.edition === "mobile") {
          samplePath = getMobileSamplePath(sampleInfo.platform, sampleInfo.level, sampleInfo.sampleName);
        } else if (sampleInfo.product === "dbr" && sampleInfo.edition === "web") {
          samplePath = getWebSamplePath(sampleInfo.category, sampleInfo.sampleName);
        } else if (sampleInfo.product === "dbr" && (sampleInfo.edition === "python" || sampleInfo.edition === "server")) {
          samplePath = getDbrServerSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if ((sampleInfo.product === "mrz" || sampleInfo.product === "mds") && sampleInfo.edition === "mobile") {
          samplePath = getDcvMobileSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if ((sampleInfo.product === "mrz" || sampleInfo.product === "mds") && sampleInfo.edition === "server") {
          samplePath = getDcvServerSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if ((sampleInfo.product === "mrz" || sampleInfo.product === "mds") && sampleInfo.edition === "web") {
          samplePath = sampleInfo.product === "mrz"
            ? getMrzWebSamplePath(sampleInfo.category, sampleInfo.sampleName)
            : getMdsWebSamplePath(sampleInfo.category, sampleInfo.sampleName);
        } else if (sampleInfo.product === "dcv" && sampleInfo.edition === "mobile") {
          samplePath = getDcvMobileSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if (sampleInfo.product === "dcv" && sampleInfo.edition === "server") {
          samplePath = getDcvServerSamplePath(sampleInfo.platform, sampleInfo.sampleName);
        } else if (sampleInfo.product === "dcv" && sampleInfo.edition === "web") {
          samplePath = getDcvWebSamplePath(sampleInfo.sampleName);
        } else if (sampleInfo.product === "dwt") {
          samplePath = getDwtSamplePath(sampleInfo.category, sampleInfo.sampleName);
        } else if (sampleInfo.product === "ddv") {
          samplePath = getDdvSamplePath(sampleInfo.sampleName);
        }
      } else if (sample_id) {
        if (!normalizedProduct || !normalizedEdition) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "Specify product/edition or provide resource_uri. Use list_samples or get_index to discover valid scopes."
            }]
          };
        }

        const level = normalizeApiLevel(api_level);
        const sampleName = normalizeSampleName(sample_id);
        sampleLabel = sampleName;
        sampleQuery = sampleName;

        if (normalizedProduct === "dbr" && normalizedEdition === "mobile") {
          const targetPlatform = normalizedPlatform || "android";
          const primaryPath = getMobileSamplePath(targetPlatform, level, sampleName);
          const altLevel = level === "high-level" ? "low-level" : "high-level";
          const alternatePath = getMobileSamplePath(targetPlatform, altLevel, sampleName);
          samplePath = existsSync(primaryPath) ? primaryPath : (existsSync(alternatePath) ? alternatePath : null);
        } else if ((normalizedProduct === "mrz" || normalizedProduct === "mds") && normalizedEdition === "mobile") {
          const platformCandidates = normalizedPlatform
            ? [normalizedPlatform]
            : ["android", "ios", "react-native", "flutter", "maui", "spm"];
          for (const platformCandidate of platformCandidates) {
            const candidate = getDcvMobileSamplePath(platformCandidate, sampleName);
            if (candidate && existsSync(candidate)) {
              samplePath = candidate;
              break;
            }
          }
        } else if ((normalizedProduct === "mrz" || normalizedProduct === "mds") && normalizedEdition === "web") {
          samplePath = await resolveDedicatedPublicWebSamplePath({
            product: normalizedProduct,
            platform: normalizedPlatform,
            sampleName,
            getSamplePath: normalizedProduct === "mrz" ? getMrzWebSamplePath : getMdsWebSamplePath,
            getSuggestions: getSampleSuggestions
          });
        } else if ((normalizedProduct === "mrz" || normalizedProduct === "mds") && normalizedEdition === "server") {
          samplePath = getDcvServerSamplePath(normalizedPlatform || "python", sampleName);
        } else if (normalizedProduct === "dcv" && normalizedEdition === "mobile") {
          const platformCandidates = normalizedPlatform
            ? [normalizedPlatform]
            : ["android", "ios", "react-native", "flutter", "maui", "spm"];
          for (const platformCandidate of platformCandidates) {
            const candidate = getDcvMobileSamplePath(platformCandidate, sampleName);
            if (candidate && existsSync(candidate)) {
              samplePath = candidate;
              break;
            }
          }
        } else if (normalizedProduct === "dcv" && normalizedEdition === "web") {
          samplePath = getDcvWebSamplePath(sampleName);
        } else if (normalizedProduct === "dcv" && normalizedEdition === "server") {
          samplePath = getDcvServerSamplePath(normalizedPlatform || "python", sampleName);
        } else if (normalizedProduct === "dbr" && normalizedEdition === "web") {
          // Accept both bare ("hello-world") and category-qualified
          // ("scenarios/read-a-drivers-license", "frameworks/react") sample ids.
          if (sampleName.includes("/")) {
            const slash = sampleName.indexOf("/");
            const cat = sampleName.slice(0, slash);
            const name = sampleName.slice(slash + 1);
            samplePath = getWebSamplePath(cat, name)
              || getWebSamplePath(undefined, name)
              || getWebSamplePath(undefined, sampleName);
          } else {
            samplePath = getWebSamplePath("basics", sampleName)
              || getWebSamplePath("scenarios", sampleName)
              || getWebSamplePath(undefined, sampleName);
          }
        } else if (normalizedProduct === "dbr" && normalizedEdition === "server") {
          samplePath = getDbrServerSamplePath(normalizedPlatform || "python", sampleName);
        } else if (normalizedProduct === "dwt") {
          const categories = discoverDwtSamples();
          let foundCategory = "";
          for (const [category, samples] of Object.entries(categories)) {
            if (samples.includes(sampleName)) {
              foundCategory = category;
              break;
            }
          }
          samplePath = foundCategory ? getDwtSamplePath(foundCategory, sampleName) : null;
        } else if (normalizedProduct === "ddv") {
          samplePath = getDdvSamplePath(sampleName);
        }
      } else {
        return { isError: true, content: [{ type: "text", text: "Provide sample_id or resource_uri." }] };
      }

      if (!samplePath || !existsSync(samplePath)) {
        const suggestions = await getSampleSuggestions({
          query: sampleQuery,
          product: normalizedProduct,
          edition: normalizedEdition,
          platform: normalizedPlatform,
          limit: 5
        });

        const content = [{
          type: "text",
          text: [
            `Sample not found for "${sampleLabel}".`,
            suggestions.length ? "Related samples:" : "No related samples found. Try search or get_index."
          ].join("\n")
        }];

        for (const entry of suggestions) {
          const versionLabel = entry.version ? `v${entry.version}` : "n/a";
          const scopeLabel = formatScopeLabel(entry);
          const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
          const sampleHint = sampleId ? ` | sample_id: ${sampleId}` : "";
          content.push({
            type: "resource_link",
            uri: entry.uri,
            name: entry.title,
            description: `${entry.type.toUpperCase()} | ${scopeLabel} | ${versionLabel} - ${entry.summary}${sampleHint}`,
            mimeType: entry.mimeType,
            annotations: {
              audience: ["assistant"],
              priority: 0.6
            }
          });
        }

        if (suggestions.length) {
          const plainLines = suggestions.map((entry, index) => {
            const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
            const sampleNote = sampleId ? ` sample_id=${sampleId}` : "";
            return `- ${index + 1}. ${entry.uri}${sampleNote}`;
          });
          content.push({
            type: "text",
            text: ["Plain URIs (copy/paste):", ...plainLines].join("\n")
          });
        }

        return { isError: true, content };
      }

      const textExtensions = [
        ".java", ".kt", ".swift", ".m", ".h", ".xml", ".gradle", ".properties",
        ".pro", ".json", ".plist", ".storyboard", ".xib", ".gitignore", ".md",
        ".js", ".jsx", ".ts", ".tsx", ".vue", ".cjs", ".mjs", ".html", ".css", ".py",
        // C/C++, .NET, build/project files so server samples aren't returned empty.
        ".cpp", ".cc", ".cxx", ".c", ".hpp", ".hh", ".cs", ".csproj", ".vcxproj",
        ".sln", ".txt", ".cmake", ".config", ".yaml", ".yml", ".gradlew", ".dart",
        ".rb", ".sh", ".bat", ".xaml", ".razor"
      ];

      const files = [];
      const stat = statSync(samplePath);
      const rootDir = stat.isDirectory() ? samplePath : dirname(samplePath);

      function addFile(fullPath) {
        const ext = "." + fullPath.split(".").pop();
        const baseName = fullPath.split(/[\\/]/).pop();
        if (!textExtensions.includes(ext) && !["gradlew", "Podfile"].includes(baseName)) {
          return;
        }
        try {
          const content = readFileSync(fullPath, "utf-8");
          const normalized = content.replace(/\r\n/g, "\n");
          files.push({
            path: relative(rootDir, fullPath),
            content: normalized,
            ext: ext.replace(".", "")
          });
        } catch (e) {
          // Ignore binary or unreadable files
        }
      }

      function walk(dir) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          if (["build", ".gradle", ".idea", ".git", "node_modules", "Pods", "DerivedData", "__pycache__"].includes(entry)) {
            continue;
          }
          const fullPath = join(dir, entry);
          const entryStat = statSync(fullPath);
          if (entryStat.isDirectory()) {
            walk(fullPath);
          } else {
            addFile(fullPath);
          }
        }
      }

      if (stat.isDirectory()) {
        walk(samplePath);
      } else {
        addFile(samplePath);
      }

      // Reference closure: single-file web samples (e.g. an index.html that
      // initSettingsFromFile('./read_dl.json')) are delivered without their
      // siblings by the walk above. Pull in files the payload references so the
      // project is runnable as delivered (issue #137).
      const includedPaths = new Set(files.map((f) => f.path));
      const refPattern = /(?:src|href)\s*=\s*["']([^"']+)["']|from\s+["']([^"']+)["']|initSettingsFromFile\(\s*["']([^"']+)["']|["'](\.\.?\/[^"']+\.(?:json|css|js|xml))["']/g;
      const pending = [...files];
      while (pending.length) {
        const file = pending.pop();
        const fileDir = dirname(join(rootDir, file.path));
        let match;
        refPattern.lastIndex = 0;
        while ((match = refPattern.exec(file.content)) !== null) {
          const ref = match[1] || match[2] || match[3] || match[4];
          if (!ref || /^(https?:)?\/\//.test(ref) || ref.startsWith("data:")) continue;
          if (ref.includes("node_modules")) continue;
          const resolved = join(fileDir, ref.split(/[?#]/)[0]);
          if (!existsSync(resolved)) continue;
          try {
            if (!statSync(resolved).isFile()) continue;
          } catch { continue; }
          const relPath = relative(rootDir, resolved);
          if (relPath.startsWith("..")) {
            // Out-of-tree reference (e.g. ../../CustomTemplates/x.json): include by
            // its basename so the delivered project resolves it.
            if (includedPaths.has(basename(resolved))) continue;
          } else if (includedPaths.has(relPath)) {
            continue;
          }
          try {
            const content = readFileSync(resolved, "utf-8").replace(/\r\n/g, "\n");
            const outPath = relPath.startsWith("..") ? basename(resolved) : relPath;
            const added = { path: outPath, content, ext: (extname(resolved).replace(".", "") || "text") };
            files.push(added);
            pending.push(added);
            includedPaths.add(outPath);
          } catch { /* skip unreadable */ }
        }
      }

      const MAX_FILE_BYTES = 50000;
      let selected = files;
      if (Array.isArray(fileFilter) && fileFilter.length) {
        const matchers = fileFilter.map((pat) => {
          if (pat.startsWith("*.")) {
            const ext = pat.slice(1);
            return (p) => p.endsWith(ext);
          }
          return (p) => p === pat || basename(p) === pat;
        });
        selected = files.filter((f) => matchers.some((m) => m(f.path)));
      }

      // Entry files first, then everything else (stable) (issue #154).
      const ENTRY_ORDER = ["index.html", "main.tsx", "main.ts", "main.js", "App.tsx", "App.jsx", "App.vue", "MainActivity.kt", "MainActivity.java", "ViewController.swift", "pubspec.yaml", "package.json", "pom.xml"];
      const entryRank = (p) => {
        const base = basename(p);
        const idx = ENTRY_ORDER.indexOf(base);
        return idx === -1 ? ENTRY_ORDER.length : idx;
      };
      selected = [...selected].sort((a, b) => entryRank(a.path) - entryRank(b.path));

      const excluded = selected.filter((f) => f.content.length >= MAX_FILE_BYTES);
      const validFiles = selected.filter((f) => f.content.length < MAX_FILE_BYTES);

      // Empty payload → actionable miss, never a silent empty success (issue #138).
      if (files.length === 0 || (validFiles.length === 0 && !manifest_only)) {
        const suggestions = await getSampleSuggestions({
          query: sampleQuery,
          product: normalizedProduct,
          edition: normalizedEdition,
          platform: normalizedPlatform,
          limit: 5
        });
        const content = [{
          type: "text",
          text: [
            `No readable files found for "${sampleLabel}".`,
            suggestions.length ? "Related samples:" : "Try list_samples or search to find a valid sample."
          ].join("\n")
        }];
        for (const entry of suggestions) {
          const sampleId = entry.type === "sample" ? getSampleIdFromUri(entry.uri) : "";
          content.push({
            type: "resource_link",
            uri: entry.uri,
            name: entry.title,
            description: `${entry.type.toUpperCase()} | ${formatScopeLabel(entry)} | ${entry.version ? "v" + entry.version : "n/a"} - ${entry.summary}${sampleId ? " | sample_id: " + sampleId : ""}`,
            mimeType: entry.mimeType,
            annotations: { audience: ["assistant"], priority: 0.6 }
          });
        }
        return { isError: true, content };
      }

      const totalKb = (selected.reduce((sum, f) => sum + f.content.length, 0) / 1024).toFixed(1);
      const output = [
        `# Sample Files: ${sampleLabel}`,
        "",
        `## Files (${validFiles.length}${excluded.length ? ` of ${selected.length}` : ""}, ${totalKb} KB total)`,
        ...validFiles.map((f) => `- ${f.path} (${(f.content.length / 1024).toFixed(1)} KB)`),
        excluded.length ? `Excluded (>50KB): ${excluded.map((f) => f.path).join(", ")}` : "",
        ""
      ].filter((line) => line !== "");

      if (manifest_only) {
        return { content: [{ type: "text", text: output.join("\n") }] };
      }

      output.push("", "Note: Files are returned inline and no downloadable zip is created.", "");
      for (const file of validFiles) {
        output.push(`## ${file.path}`);
        output.push("```" + (file.ext || "text"));
        output.push(file.content);
        output.push("```");
        output.push("");
      }

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
}
