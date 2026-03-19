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
