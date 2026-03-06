import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadMarkdownDocs } from "../../src/server/resource-index/docs-loader.js";

function withTempDir(fn) {
  const root = mkdtempSync(join(tmpdir(), "mcp-docs-loader-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("loadMarkdownDocs parses multiline YAML title blocks", () => {
  withTempDir((rootDir) => {
    const filePath = join(rootDir, "guide.md");
    writeFileSync(filePath, [
      "---",
      "title: >",
      "  A Longer",
      "  Guide Title",
      "---",
      "",
      "# ignored heading",
      "body"
    ].join("\n"));

    const result = loadMarkdownDocs({
      rootDir,
      urlBase: "https://example.com/docs/"
    });

    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0].title, "A Longer Guide Title");
    assert.equal(result.articles[0].url, "https://example.com/docs/guide.html");
  });
});

test("loadMarkdownDocs respects exclude directories and files", () => {
  withTempDir((rootDir) => {
    mkdirSync(join(rootDir, "keep"), { recursive: true });
    mkdirSync(join(rootDir, "skip"), { recursive: true });
    writeFileSync(join(rootDir, "keep", "ok.md"), "# Keep Me");
    writeFileSync(join(rootDir, "skip", "hidden.md"), "# Skip Dir");
    writeFileSync(join(rootDir, "keep", "omit.md"), "# Omit File");

    const result = loadMarkdownDocs({
      rootDir,
      urlBase: "https://example.com/docs/",
      excludeDirs: ["skip"],
      excludeFiles: ["omit.md"]
    });

    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0].title, "Keep Me");
    assert.equal(result.articles[0].path, "keep/ok.md");
  });
});
