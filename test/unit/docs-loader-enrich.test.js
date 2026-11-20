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

test("redirect stubs are skipped and {{ site.* }} links resolve to absolute URLs", () => {
  const dir = makeDir();
  try {
    writeFileSync(join(dir, "_config.yml"), "dcvb_js_api: /capture-vision/docs/web/programming/javascript/api-reference/\nsite_name: Docs\n");
    writeFileSync(join(dir, "capture-vision-router.md"), "---\nredirect_to: https://example.com/elsewhere.html\nsitemap: false\n---\n");
    writeFileSync(join(dir, "guide.md"), "---\ntitle: Guide\n---\nSee [capture]({{ site.dcvb_js_api }}capture-vision-router/single-image-processing.html) and {{ site.unknown_key }}.");
    const { articles } = loadMarkdownDocs({ rootDir: dir, urlBase: "https://x/" });
    assert.deepEqual(articles.map((a) => a.path), ["guide.md"], "redirect stub must not be indexed");
    assert.match(
      articles[0].content,
      /\(https:\/\/www\.dynamsoft\.com\/capture-vision\/docs\/web\/programming\/javascript\/api-reference\/capture-vision-router\/single-image-processing\.html\)/
    );
    assert.match(articles[0].content, /\{\{ site\.unknown_key \}\}/, "unknown site keys stay untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("VitePress root-relative links resolve to published pages under the docs base", () => {
  const dir = makeDir();
  try {
    writeFileSync(
      join(dir, "index.md"),
      "# Intro\nSee [scan](/api/classes/DocumentScanner.md#scan), [guide](/guide/index.md \"Guide\"), [up](#self-host) and [ext](https://example.com/a.md)."
    );
    const base = "https://www.dynamsoft.com/mobile-document-scanner/docs/web/";
    const [resolved] = loadMarkdownDocs({ rootDir: dir, urlBase: base, resolveRootLinks: true }).articles;
    assert.match(resolved.content, /\[scan\]\(https:\/\/www\.dynamsoft\.com\/mobile-document-scanner\/docs\/web\/api\/classes\/DocumentScanner\.html#scan\)/);
    assert.match(resolved.content, /\[guide\]\(https:\/\/www\.dynamsoft\.com\/mobile-document-scanner\/docs\/web\/guide\/index\.html "Guide"\)/);
    assert.match(resolved.content, /\[up\]\(#self-host\)/, "in-page anchors stay local");
    assert.match(resolved.content, /\[ext\]\(https:\/\/example\.com\/a\.md\)/, "absolute URLs stay untouched");

    const [raw] = loadMarkdownDocs({ rootDir: dir, urlBase: base }).articles;
    assert.match(raw.content, /\]\(\/api\/classes\/DocumentScanner\.md#scan\)/, "other doc sets keep their links");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
