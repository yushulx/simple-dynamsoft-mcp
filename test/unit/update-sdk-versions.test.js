import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  detectFromPackageJson,
  sdkVersionSources
} from "../../scripts/sdk-version-sources.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = join(TEST_DIR, "..", "..");

test("package.json detector normalizes versions and is only wired for public MRZ/MDS web", () => {
  const tempRoot = mkdtempSync(join(os.tmpdir(), "sdk-version-sync-"));
  const mrzDir = join(tempRoot, "data", "samples", "mrz-scanner-javascript");

  mkdirSync(mrzDir, { recursive: true });
  writeFileSync(
    join(mrzDir, "package.json"),
    `${JSON.stringify({ version: "03.1.0" }, null, 2)}\n`
  );

  assert.deepEqual(detectFromPackageJson(tempRoot, "data/samples/mrz-scanner-javascript/package.json"), {
    version: "3.1.0",
    detail: "parsed data/samples/mrz-scanner-javascript/package.json"
  });

  const packageJsonSources = sdkVersionSources.filter((source) =>
    source.strategies.some((strategy) => typeof strategy === "object" && strategy.type === "package-json")
  );

  assert.deepEqual(
    packageJsonSources.map((source) => ({
      sdkId: source.sdkId,
      docsPath: source.docsPath,
      packagePath: source.strategies.find((strategy) => strategy.type === "package-json").file
    })),
    [
      {
        sdkId: "mrz-web",
        docsPath: undefined,
        packagePath: "data/samples/mrz-scanner-javascript/package.json"
      },
      {
        sdkId: "mds-web",
        docsPath: undefined,
        packagePath: "data/samples/document-scanner-javascript/package.json"
      }
    ]
  );

  writeFileSync(join(mrzDir, "package.json"), "{ invalid json\n");
  assert.equal(
    detectFromPackageJson(tempRoot, "data/samples/mrz-scanner-javascript/package.json").version,
    ""
  );
});

test("update-sdk-versions script updates MRZ and MDS web from package manifests", () => {
  const tempRoot = mkdtempSync(join(os.tmpdir(), "sdk-version-script-"));
  const scriptsDir = join(tempRoot, "scripts");
  const metadataDir = join(tempRoot, "data", "metadata");
  const mrzDir = join(tempRoot, "data", "samples", "mrz-scanner-javascript");
  const mdsDir = join(tempRoot, "data", "samples", "document-scanner-javascript");

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(metadataDir, { recursive: true });
  mkdirSync(mrzDir, { recursive: true });
  mkdirSync(mdsDir, { recursive: true });

  writeFileSync(
    join(scriptsDir, "update-sdk-versions.mjs"),
    readFileSync(join(WORKTREE_ROOT, "scripts", "update-sdk-versions.mjs"), "utf8")
  );
  writeFileSync(
    join(scriptsDir, "sdk-version-sources.mjs"),
    readFileSync(join(WORKTREE_ROOT, "scripts", "sdk-version-sources.mjs"), "utf8")
  );
  writeFileSync(
    join(metadataDir, "dynamsoft_sdks.json"),
    `${JSON.stringify({
      sdks: {
        "mrz-web": { version: "0.0.0" },
        "mds-web": { version: "0.0.0" }
      }
    }, null, 2)}\n`
  );
  writeFileSync(join(mrzDir, "package.json"), `${JSON.stringify({ version: "3.1.0" }, null, 2)}\n`);
  writeFileSync(join(mdsDir, "package.json"), `${JSON.stringify({ version: "1.4.2" }, null, 2)}\n`);

  execFileSync("node", [join("scripts", "update-sdk-versions.mjs")], {
    cwd: tempRoot,
    stdio: "pipe"
  });

  const metadata = JSON.parse(readFileSync(join(metadataDir, "dynamsoft_sdks.json"), "utf8"));
  assert.equal(metadata.sdks["mrz-web"].version, "3.1.0");
  assert.equal(metadata.sdks["mds-web"].version, "1.4.2");
});

test("update-sdk-versions script reads each BBS platform's version from its own release notes", () => {
  const bbsSource = sdkVersionSources.find((source) => source.sdkId === "bbs-mobile");
  assert.equal(bbsSource.docsPath, "data/documentation/batch-barcode-scanner-docs");
  assert.deepEqual(bbsSource.strategies.map((strategy) => strategy.type), ["release-notes-headings"]);
  assert.deepEqual(Object.keys(bbsSource.strategies[0].platforms), ["android", "ios"]);

  const tempRoot = mkdtempSync(join(os.tmpdir(), "sdk-version-bbs-"));
  const scriptsDir = join(tempRoot, "scripts");
  const metadataDir = join(tempRoot, "data", "metadata");
  const notesDir = join(tempRoot, "data", "documentation", "batch-barcode-scanner-docs", "app", "release-notes");

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(metadataDir, { recursive: true });
  mkdirSync(notesDir, { recursive: true });

  for (const file of ["update-sdk-versions.mjs", "sdk-version-sources.mjs"]) {
    writeFileSync(join(scriptsDir, file), readFileSync(join(WORKTREE_ROOT, "scripts", file), "utf8"));
  }
  const metadataPath = join(metadataDir, "dynamsoft_sdks.json");
  writeFileSync(metadataPath, `${JSON.stringify({
    sdks: {
      "bbs-mobile": { version: "0.0.0", platforms: { android: { version: "0.0.0" }, ios: { version: "0.0.0" } } }
    }
  }, null, 2)}\n`);
  const readEntry = () => {
    const entry = JSON.parse(readFileSync(metadataPath, "utf8")).sdks["bbs-mobile"];
    return { version: entry.version, android: entry.platforms.android.version, ios: entry.platforms.ios.version };
  };
  const runScript = (...args) => execFileSync("node", [join("scripts", "update-sdk-versions.mjs"), ...args], { cwd: tempRoot, stdio: "pipe" });

  // Version-like text in release-note bodies and non-version headings must not count.
  writeFileSync(join(notesDir, "android.md"), [
    "# Android Release Notes",
    "",
    "## 3.1.1 (10/16/2026)",
    "",
    "Updated DBR to 11.2.5000.",
    "",
    "## 3.0.0 (05/20/2026)",
    ""
  ].join("\n"));
  writeFileSync(join(notesDir, "ios.md"), [
    "# iOS Release Notes",
    "",
    "## 3.1.0 (11/04/2026)",
    "",
    "## 2.x",
    "",
    "Updated DCV to 9.9.9000.",
    ""
  ].join("\n"));

  // Each platform takes its own file's version; the source version is the highest.
  runScript();
  assert.deepEqual(readEntry(), { version: "3.1.1", android: "3.1.1", ios: "3.1.0" });
  runScript("--check");

  // A newer iOS release moves the iOS version and the source version, not Android's.
  writeFileSync(join(notesDir, "ios.md"), "# iOS Release Notes\n\n## 3.2.0 (12/01/2026)\n");
  assert.throws(() => runScript("--check"), "iOS drift must fail the check");
  runScript();
  assert.deepEqual(readEntry(), { version: "3.2.0", android: "3.1.1", ios: "3.2.0" });

  // Android drift alone is detected too.
  writeFileSync(join(notesDir, "android.md"), "# Android Release Notes\n\n## 3.1.2 (12/02/2026)\n");
  assert.throws(() => runScript("--check"), "Android drift must fail the check");
  runScript();
  assert.deepEqual(readEntry(), { version: "3.2.0", android: "3.1.2", ios: "3.2.0" });

  // A platform whose notes have no version leaves the whole source unresolved (strict mode fails) and changes nothing.
  writeFileSync(join(notesDir, "ios.md"), "# iOS Release Notes\n");
  assert.match(runScript().toString(), /skip bbs-mobile \(no version found/);
  assert.deepEqual(readEntry(), { version: "3.2.0", android: "3.1.2", ios: "3.2.0" });
});
