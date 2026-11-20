import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getRepoSourceUrl } from "../../src/server/resource-index/paths.js";
import { getSampleSourceUrl } from "../../src/server/resource-index/sample-source.js";

function createDataRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "sample-source-url-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifestPath = join(root, "metadata", "data-manifest.json");
  mkdirSync(join(root, "metadata"), { recursive: true });
  mkdirSync(join(root, "samples", "mobile", "Android", "Scan VIN"), { recursive: true });
  mkdirSync(join(root, "samples", "mobile-ios", "Swift"), { recursive: true });
  mkdirSync(join(root, "samples", "mirror", "demo"), { recursive: true });
  writeFileSync(join(root, "samples", "mobile", "Android", "Scan VIN", "Main.kt"), "");
  writeFileSync(manifestPath, JSON.stringify({
    repos: [
      { path: "samples/mobile", url: "https://github.com/Dynamsoft/mobile-samples.git", owner: "Dynamsoft", repo: "mobile-samples", branch: "main", commit: "a" },
      { path: "samples/mobile-ios", url: "https://github.com/Dynamsoft/ios-samples.git", owner: "Dynamsoft", repo: "ios-samples", branch: "master", commit: "b" },
      { path: "samples/mirror", url: "https://example.com/mirror.git", owner: "Dynamsoft", repo: "mirror", branch: "main", commit: "c" }
    ]
  }));
  return { root, options: { dataRootPath: root, manifestPath } };
}

test("sample source URLs point at the repo branch, tree for folders and blob for files", (t) => {
  const { root, options } = createDataRoot(t);
  const sample = join(root, "samples", "mobile", "Android", "Scan VIN");

  assert.equal(
    getRepoSourceUrl(sample, options),
    "https://github.com/Dynamsoft/mobile-samples/tree/main/Android/Scan%20VIN"
  );
  assert.equal(
    getRepoSourceUrl(join(sample, "Main.kt"), options),
    "https://github.com/Dynamsoft/mobile-samples/blob/main/Android/Scan%20VIN/Main.kt"
  );
  assert.equal(getRepoSourceUrl(join(root, "samples", "mobile"), options), "https://github.com/Dynamsoft/mobile-samples");
});

test("sample source URLs match the whole repo path segment, never a name prefix", (t) => {
  const { root, options } = createDataRoot(t);

  assert.equal(
    getRepoSourceUrl(join(root, "samples", "mobile-ios", "Swift"), options),
    "https://github.com/Dynamsoft/ios-samples/tree/master/Swift"
  );
});

test("paths outside the data root or outside a GitHub repo have no source URL", (t) => {
  const { root, options } = createDataRoot(t);

  assert.equal(getRepoSourceUrl(join(root, "samples", "mirror", "demo"), options), "");
  assert.equal(getRepoSourceUrl(join(root, "samples", "unlisted"), options), "");
  assert.equal(getRepoSourceUrl(join(root, "..", "elsewhere"), options), "");
});

test("file-backed samples link their folder when they own it, otherwise the file", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sample-source-owner-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text = "") => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write("scenarios/scan-qr-code/index.html", "<link href=\"index.css\">");
  write("scenarios/scan-qr-code/index.css");
  write("output-options/upload/upload.html");
  write("basics/read-a-license.html", "initSettingsFromFile(\"./read_dl.json\")");
  write("basics/read_dl.json", "{}");
  write("basics/hello-world.html", "<script src=\"https://cdn.example.com/dbr.js\"></script><a href=\"../other.html\">");
  write("other.html");
  const resolveRepoUrl = (path) => path;
  const source = (path) => getSampleSourceUrl(join(root, path), { resolveRepoUrl });

  assert.equal(source("scenarios/scan-qr-code/index.html"), join(root, "scenarios/scan-qr-code"));
  assert.equal(source("output-options/upload/upload.html"), join(root, "output-options/upload"));
  assert.equal(source("basics/read-a-license.html"), join(root, "basics"));
  // CDN and out-of-folder references do not make a shared folder the sample's own.
  assert.equal(source("basics/hello-world.html"), join(root, "basics/hello-world.html"));
  assert.equal(source("basics/missing.html"), "");
});
