import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

function parseFrontMatter(markdown) {
  if (!markdown || !markdown.startsWith("---")) {
    return { meta: {}, body: markdown || "" };
  }
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { meta: {}, body: markdown };
  }
  const metaBlock = match[1];
  const body = markdown.slice(match[0].length);
  const meta = {};
  for (const rawLine of metaBlock.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body };
}

function getHeadingTitle(markdownBody) {
  if (!markdownBody) return "";
  for (const line of markdownBody.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }
  return "";
}

function formatSegmentLabel(segment) {
  if (!segment) return "";
  const cleaned = segment.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildBreadcrumbFromPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  const directory = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
  if (!directory) return "";
  const segments = directory.split("/").filter(Boolean).map(formatSegmentLabel).filter(Boolean);
  return segments.join(" > ");
}

function collectMarkdownFiles(rootDir, options = {}) {
  const files = [];
  const excludeDirs = new Set(options.excludeDirs || []);
  const rawExcludeFiles = options.excludeFiles || [];
  // Exact names go in a Set; entries containing '*' become glob regexes so
  // configs can exclude stale/internal docs like '*-v1.1.md' or '*private*' (#144).
  const excludeFiles = new Set(rawExcludeFiles.filter((f) => !f.includes("*")));
  const excludePatterns = rawExcludeFiles
    .filter((f) => f.includes("*"))
    .map((f) => new RegExp("^" + f.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i"));
  const includeDirNames = new Set(options.includeDirNames || []);

  function isExcludedFile(name) {
    if (excludeFiles.has(name)) return true;
    return excludePatterns.some((re) => re.test(name));
  }

  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && !includeDirNames.has(entry.name)) continue;
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        if (isExcludedFile(entry.name)) continue;
        files.push(join(dir, entry.name));
      }
    }
  }

  walk(rootDir);
  return files.sort();
}

function markdownPathToUrl(baseUrl, relativePath) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/\.md$/i, ".html");
  return `${baseUrl}${normalized}`;
}

function loadMarkdownDocs({ rootDir, urlBase, includeDirNames = [], excludeDirs = [], excludeFiles = [] }) {
  if (!existsSync(rootDir)) return { articles: [] };

  const files = collectMarkdownFiles(rootDir, { includeDirNames, excludeDirs, excludeFiles });
  const articles = [];

  for (const filePath of files) {
    const relativePath = relative(rootDir, filePath).replace(/\\/g, "/");
    const raw = readFileSync(filePath, "utf8");
    const parsed = parseFrontMatter(raw);
    const title = parsed.meta.title || getHeadingTitle(parsed.body) || formatSegmentLabel(relativePath.replace(/\.md$/i, "").split("/").pop());
    if (!title) continue;
    const breadcrumb = parsed.meta.breadcrumbText || buildBreadcrumbFromPath(relativePath) || title;
    // Frontmatter description/keywords are the docs' own human summaries and
    // search vocabulary — previously parsed and discarded (issue #142).
    const description = typeof parsed.meta.description === "string" ? parsed.meta.description.trim() : "";
    const keywordsRaw = parsed.meta.keywords;
    const keywords = Array.isArray(keywordsRaw)
      ? keywordsRaw.map((k) => String(k).trim()).filter(Boolean)
      : (typeof keywordsRaw === "string" ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean) : []);
    articles.push({
      title,
      url: markdownPathToUrl(urlBase, relativePath),
      content: parsed.body.trim(),
      breadcrumb,
      description,
      keywords,
      path: relativePath
    });
  }

  return { articles };
}

export {
  loadMarkdownDocs
};
