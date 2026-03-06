import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import fg from "fast-glob";
import matter from "gray-matter";

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
  const excludeDirs = new Set(options.excludeDirs || []);
  const excludeFiles = new Set(options.excludeFiles || []);
  const includeDirNames = new Set(options.includeDirNames || []);

  const files = fg.sync("**/*.md", {
    cwd: rootDir,
    onlyFiles: true,
    dot: true
  });

  return files
    .filter((relativePath) => {
      const normalized = relativePath.replace(/\\/g, "/");
      const segments = normalized.split("/").filter(Boolean);
      const fileName = segments[segments.length - 1] || "";
      if (excludeFiles.has(fileName)) return false;
      for (let i = 0; i < segments.length - 1; i += 1) {
        const segment = segments[i];
        if (excludeDirs.has(segment)) return false;
        if (segment.startsWith(".") && !includeDirNames.has(segment)) return false;
      }
      if (fileName.startsWith(".") && !includeDirNames.has(fileName)) return false;
      return true;
    })
    .sort();
}

function markdownPathToUrl(baseUrl, relativePath) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/\.md$/i, ".html");
  return `${baseUrl}${normalized}`;
}

function loadMarkdownDocs({ rootDir, urlBase, includeDirNames = [], excludeDirs = [], excludeFiles = [] }) {
  if (!existsSync(rootDir)) return { articles: [] };

  const files = collectMarkdownFiles(rootDir, { includeDirNames, excludeDirs, excludeFiles });
  const articles = [];

  for (const relativePath of files) {
    const filePath = join(rootDir, relativePath);
    const raw = readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    const frontmatterTitle = typeof parsed.data?.title === "string" ? parsed.data.title.trim() : "";
    const title = frontmatterTitle || getHeadingTitle(parsed.content) || formatSegmentLabel(relativePath.replace(/\.md$/i, "").split("/").pop());
    if (!title) continue;
    const frontmatterBreadcrumb = typeof parsed.data?.breadcrumbText === "string" ? parsed.data.breadcrumbText.trim() : "";
    const breadcrumb = frontmatterBreadcrumb || buildBreadcrumbFromPath(relativePath) || title;
    articles.push({
      title,
      url: markdownPathToUrl(urlBase, relativePath),
      content: parsed.content.trim(),
      breadcrumb,
      path: relativePath
    });
  }

  return { articles };
}

export {
  loadMarkdownDocs
};
