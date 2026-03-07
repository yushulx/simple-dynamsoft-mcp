import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, win32 } from "node:path";
import { tmpdir } from "node:os";
import {
  withRetry,
  shouldRetryDownloadError,
  buildHydrationFailureMessage,
  replaceDirectoryWithRollback,
  buildBackupPath
} from "../../src/data/download-utils.js";

test("withRetry retries retryable failures and succeeds", async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("HTTP 503 temporary outage");
      }
      return "ok";
    },
    {
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 2,
      shouldRetry: shouldRetryDownloadError
    }
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("withRetry does not retry non-retryable failures", async () => {
  let attempts = 0;
  await assert.rejects(
    () => withRetry(
      async () => {
        attempts += 1;
        throw new Error("HTTP 404 not found");
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 2,
        shouldRetry: shouldRetryDownloadError
      }
    ),
    /HTTP 404/
  );
  assert.equal(attempts, 1);
});

test("replaceDirectoryWithRollback swaps directory content", () => {
  const root = mkdtempSync(join(tmpdir(), "mcp-atomic-replace-"));
  const target = join(root, "target");
  const staged = join(root, "staged");
  mkdirSync(target, { recursive: true });
  mkdirSync(staged, { recursive: true });
  writeFileSync(join(target, "old.txt"), "old");
  writeFileSync(join(staged, "new.txt"), "new");

  replaceDirectoryWithRollback(target, staged);
  assert.equal(readFileSync(join(target, "new.txt"), "utf8"), "new");

  rmSync(root, { recursive: true, force: true });
});

test("buildHydrationFailureMessage returns actionable guidance", () => {
  const message = buildHydrationFailureMessage({
    reason: "HTTP 503 for docs repo",
    scopeSummary: "product=dbr edition=web type=doc"
  });

  assert.match(message, /Lazy hydration failed/);
  assert.match(message, /MCP_DATA_HYDRATION_MODE=eager/);
  assert.match(message, /product=dbr edition=web type=doc/);
});

test("buildBackupPath handles Windows absolute target paths", () => {
  const targetPath = "C:\\Users\\zly20\\AppData\\Local\\simple-dynamsoft-mcp\\data\\documentation\\web-twain-docs";
  const backupPath = buildBackupPath(targetPath, {
    pathApi: win32,
    now: () => 1772844864041
  });

  assert.equal(
    backupPath,
    "C:\\Users\\zly20\\AppData\\Local\\simple-dynamsoft-mcp\\data\\documentation\\web-twain-docs.bak-1772844864041"
  );
});
