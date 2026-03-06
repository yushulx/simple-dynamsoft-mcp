import test from "node:test";
import assert from "node:assert/strict";

import { buildReposState, parseArgs } from "../../scripts/compute-repo-signatures.mjs";

test("parseArgs accepts integer signature options", () => {
  const args = parseArgs([
    "--index-version",
    "2",
    "--chunk-size",
    "1800",
    "--chunk-overlap",
    "250",
    "--max-chunks-per-doc",
    "30",
    "--max-text-chars",
    "12000"
  ]);

  assert.equal(args.indexVersion, 2);
  assert.equal(args.indexConfig.chunkSize, 1800);
  assert.equal(args.indexConfig.chunkOverlap, 250);
  assert.equal(args.indexConfig.maxChunksPerDoc, 30);
  assert.equal(args.indexConfig.maxTextChars, 12000);
});

test("parseArgs rejects non-integer numeric options", () => {
  assert.throws(() => parseArgs(["--index-version", "1.5"]), /--index-version/);
  assert.throws(() => parseArgs(["--chunk-size", "ten"]), /--chunk-size/);
  assert.throws(() => parseArgs(["--chunk-overlap", "2.4"]), /--chunk-overlap/);
  assert.throws(() => parseArgs(["--max-text-chars", "12abc"]), /--max-text-chars/);
});

test("parseArgs enforces lower bounds for numeric options", () => {
  assert.throws(() => parseArgs(["--index-version", "0"]), />= 1/);
  assert.throws(() => parseArgs(["--chunk-size", "-1"]), />= 0/);
  assert.throws(() => parseArgs(["--chunk-overlap", "-1"]), />= 0/);
  assert.throws(() => parseArgs(["--max-text-chars", "-1"]), />= 0/);
  assert.throws(() => parseArgs(["--max-chunks-per-doc", "0"]), />= 1/);
});

test("buildReposState throws when two repos collide on normalized key", () => {
  assert.throws(
    () => {
      buildReposState(
        [
          {
            path: "documentation/capture-vision-docs-js",
            commit: "1111111111111111111111111111111111111111"
          },
          {
            path: "documentation/capture_vision_docs_js",
            commit: "2222222222222222222222222222222222222222"
          }
        ],
        {
          embeddingModel: "text-embedding-3-large",
          indexVersion: 1,
          schemaVersion: 1,
          indexConfig: {}
        }
      );
    },
    /Repo key collision/
  );
});
