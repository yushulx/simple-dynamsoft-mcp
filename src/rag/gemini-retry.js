function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function sleepMs(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function isRetryableGeminiStatus(status) {
  if (!Number.isFinite(status)) return false;
  if (status === 429 || status === 503) return true;
  return status >= 500 && status < 600;
}

function isRateLimitGeminiStatus(status) {
  if (!Number.isFinite(status)) return false;
  return status === 429 || status === 503;
}

function parseRetryAfterMs(retryAfterHeader, nowMs = Date.now()) {
  const raw = String(retryAfterHeader || "").trim();
  if (!raw) return 0;

  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - nowMs);
}

function normalizeGeminiRetryConfig(config = {}) {
  const maxAttempts = toPositiveInt(config.maxAttempts, 5);
  const baseDelayMs = toPositiveInt(config.baseDelayMs, 500);
  const maxDelayMs = Math.max(baseDelayMs, toPositiveInt(config.maxDelayMs, 10000));
  const requestThrottleMs = toNonNegativeInt(config.requestThrottleMs, 0);
  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    requestThrottleMs
  };
}

function computeBackoffDelayMs({
  attempt,
  baseDelayMs,
  maxDelayMs,
  retryAfterMs = 0,
  jitterRatio = 0.2,
  random = Math.random
}) {
  const retryAfter = Math.max(0, Number(retryAfterMs) || 0);
  if (retryAfter > 0) {
    return Math.min(maxDelayMs, retryAfter);
  }

  const exponent = Math.max(0, Number(attempt) - 1);
  const base = Math.min(maxDelayMs, baseDelayMs * (2 ** exponent));
  const jitterWindow = Math.max(0, base * jitterRatio);
  const jitter = (Number(random()) * 2 - 1) * jitterWindow;
  return Math.max(0, Math.min(maxDelayMs, Math.round(base + jitter)));
}

class GeminiHttpError extends Error {
  constructor(message, { status, retryAfterMs = 0, detail = "" } = {}) {
    super(message);
    this.name = "GeminiHttpError";
    this.status = Number.isFinite(status) ? status : 0;
    this.retryAfterMs = Math.max(0, Number(retryAfterMs) || 0);
    this.detail = detail;
    this.retryable = isRetryableGeminiStatus(this.status);
    this.rateLimited = isRateLimitGeminiStatus(this.status);
  }
}

async function executeWithGeminiRetry({
  operation,
  requestFn,
  retryConfig,
  logger = () => {},
  sleep = sleepMs,
  random = Math.random,
  onRetry = () => {}
}) {
  const config = normalizeGeminiRetryConfig(retryConfig);
  let lastError = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      return await requestFn(attempt);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status);
      const retryable = Boolean(error?.retryable) || isRetryableGeminiStatus(status);
      const rateLimited = Boolean(error?.rateLimited) || isRateLimitGeminiStatus(status);
      if (!retryable || attempt >= config.maxAttempts) {
        throw error;
      }

      const delayMs = computeBackoffDelayMs({
        attempt,
        baseDelayMs: config.baseDelayMs,
        maxDelayMs: config.maxDelayMs,
        retryAfterMs: Number(error?.retryAfterMs) || 0,
        random
      });
      logger(
        `gemini retry op=${operation} attempt=${attempt}/${config.maxAttempts} status=${status || "n/a"} ` +
        `retryable=${retryable} rate_limited=${rateLimited} delay_ms=${delayMs}`
      );
      onRetry({
        attempt,
        maxAttempts: config.maxAttempts,
        status: Number.isFinite(status) ? status : 0,
        retryable,
        rateLimited,
        delayMs
      });
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError || new Error(`Gemini request failed op=${operation}`);
}

export {
  sleepMs,
  isRetryableGeminiStatus,
  isRateLimitGeminiStatus,
  parseRetryAfterMs,
  normalizeGeminiRetryConfig,
  computeBackoffDelayMs,
  GeminiHttpError,
  executeWithGeminiRetry
};
