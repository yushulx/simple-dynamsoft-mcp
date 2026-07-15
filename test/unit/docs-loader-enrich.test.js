import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMarkdownDocs } from "../../src/server/resource-index/docs-loader.js";

function makeDir() {
  return mkdtempSync(join(tmpdir(), "docs-loader-"));
}

test("#142: frontmatter description and keywords are captured", () => {
  const dir = makeDir();
  try {
    writeFileSync(join(dir, "a.md"), "---\ntitle: Enable Barcode Format\ndescription: How to enable a specific barcode format.\nkeywords: barcode format, no license found\n---\n\nBody text.");
    const { articles } = loadMarkdownDocs({ rootDir: dir, urlBase: "https://x/" });
    const a = articles.find((x) => x.title === "Enable Barcode Format");
    assert.ok(a, "article should load");
    assert.equal(a.description, "How to enable a specific barcode format.");
    assert.deepEqual(a.keywords, ["barcode format", "no license found"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("#144: glob excludeFiles patterns drop stale/private docs", () => {
  const dir = makeDir();
  try {
    writeFileSync(join(dir, "guide.md"), "---\ntitle: Current Guide\n---\nbody");
    writeFileSync(join(dir, "mrz-scanner-v2.1.md"), "---\ntitle: Legacy v2.1\n---\nbody");
    writeFileSync(join(dir, "document-scanner-private.md"), "---\ntitle: Private Draft\n---\nbody");
    const { articles } = loadMarkdownDocs({
      rootDir: dir,
      urlBase: "https://x/",
      excludeFiles: ["*-v2.1.md", "*private*"]
    });
    const titles = articles.map((a) => a.title);
    assert.ok(titles.includes("Current Guide"), "current doc kept");
    assert.ok(!titles.includes("Legacy v2.1"), "legacy version excluded");
    assert.ok(!titles.includes("Private Draft"), "private draft excluded");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
