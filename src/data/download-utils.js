import { dirname, join } from "node:path";
import { existsSync, renameSync, rmSync } from "node:fs";

function sleepMs(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseHttpStatus(message) {
  const match = String(message || "").match(/HTTP\s+(\d{3})/i);
  if (!match) return 0;
  return Number.parseInt(match[1], 10);
}

function shouldRetryDownloadError(error) {
  const message = String(error?.message || "");
  const status = parseHttpStatus(message);
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;

  if (error?.name === "AbortError") return true;
  if (/timed?\s*out/i.test(message)) return true;
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message)) return true;
  return false;
}

function getBackoffDelayMs(attempt, baseDelayMs, maxDelayMs) {
  const exp = Math.max(0, attempt - 1);
  const delay = baseDelayMs * (2 ** exp);
  return Math.min(delay, maxDelayMs);
}

async function withRetry(operation, {
  maxAttempts,
  baseDelayMs,
  maxDelayMs,
  shouldRetry,
  onRetry
}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts && shouldRetry(error);
      if (!canRetry) throw error;
      const delayMs = getBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      if (typeof onRetry === "function") {
        onRetry({ attempt, delayMs, error });
      }
      await sleepMs(delayMs);
    }
  }
  throw lastError || new Error("Retry operation failed");
}

function replaceDirectoryWithRollback(targetPath, stagedPath) {
  const parent = dirname(targetPath);
  const backupPath = join(parent, `${targetPath.split("/").pop() || "repo"}.bak-${Date.now()}`);
  let movedExisting = false;
  try {
    if (existsSync(targetPath)) {
      renameSync(targetPath, backupPath);
      movedExisting = true;
    }

    renameSync(stagedPath, targetPath);
    if (movedExisting && existsSync(backupPath)) {
      rmSync(backupPath, { recursive: true, force: true });
    }
  } catch (error) {
    if (existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true });
    }
    if (movedExisting && existsSync(backupPath)) {
      renameSync(backupPath, targetPath);
    }
    throw error;
  }
}

function buildHydrationFailureMessage({ reason, scopeSummary }) {
  const lines = [
    `Lazy hydration failed: ${reason}`,
    scopeSummary ? `Scope: ${scopeSummary}` : "",
    "Try one of the following:",
    "- retry the same request",
    "- set MCP_DATA_HYDRATION_MODE=eager to prefetch repos at startup",
    "- set MCP_DATA_DOWNLOAD_TIMEOUT_MS to a higher value in slow networks"
  ].filter(Boolean);
  return lines.join("\n");
}

export {
  shouldRetryDownloadError,
  withRetry,
  replaceDirectoryWithRollback,
  buildHydrationFailureMessage
};
