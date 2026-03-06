import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  withRetry,
  shouldRetryDownloadError,
  buildHydrationFailureMessage,
  replaceDirectoryWithRollback
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

test("withRetry reports retry attempts and capped backoff delay", async () => {
  let attempts = 0;
  const retries = [];

  await assert.rejects(
    () => withRetry(
      async () => {
        attempts += 1;
        throw new Error("HTTP 503 still failing");
      },
      {
        maxAttempts: 4,
        baseDelayMs: 1,
        maxDelayMs: 2,
        shouldRetry: shouldRetryDownloadError,
        onRetry: (retry) => {
          retries.push({ attempt: retry.attempt, delayMs: retry.delayMs });
        }
      }
    ),
    /HTTP 503/
  );

  assert.equal(attempts, 4);
  assert.deepEqual(retries, [
    { attempt: 1, delayMs: 1 },
    { attempt: 2, delayMs: 2 },
    { attempt: 3, delayMs: 2 }
  ]);
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
