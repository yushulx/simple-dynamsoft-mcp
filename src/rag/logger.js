import { logEvent } from "../observability/logging.js";

const ragLogState = {
  config: false,
  providerChain: false,
  degradedNotices: new Set(),
  providerReady: new Set(),
  providerFirstUse: new Set(),
  fallbackUse: new Set()
};

const DEPRECATED_PREBUILT_ENV_KEYS = [
  "RAG_PREBUILT_INDEX_AUTO_DOWNLOAD",
  "RAG_PREBUILT_INDEX_URL",
  "RAG_PREBUILT_INDEX_URL_GEMINI",
  "RAG_PREBUILT_INDEX_TIMEOUT_MS"
];

function logRag(eventOrMessage, fields = {}, options = {}) {
  if (fields && typeof fields === "object" && Object.keys(fields).length > 0) {
    logEvent("rag", eventOrMessage, fields, options);
    return;
  }
  logEvent("rag", "detail", { message: String(eventOrMessage || "") }, { ...options, level: options.level || "debug" });
}

function logRagConfigOnce(ragConfig) {
  if (ragLogState.config) return;
  ragLogState.config = true;
  const deprecatedKeys = DEPRECATED_PREBUILT_ENV_KEYS.filter((key) => {
    const value = process.env[key];
    return value !== undefined && value !== "";
  });
  if (deprecatedKeys.length > 0) {
    logRag("deprecated_prebuilt_env_vars", {
      keys: deprecatedKeys.join(","),
      recommendation: "Use RAG_SHARED_STATE_PATH for shared shard loading."
    }, { level: "warn" });
  }
  logRag(
    `config provider=${ragConfig.provider} fallback=${ragConfig.fallback} prewarm=${ragConfig.prewarm} rebuild=${ragConfig.rebuild} ` +
    `cache_dir=${ragConfig.cacheDir} shared_state_path=${ragConfig.sharedStatePath ? "set" : "empty"} ` +
    `gemini_retry_max_attempts=${ragConfig.geminiRetryMaxAttempts} ` +
    `gemini_retry_base_delay_ms=${ragConfig.geminiRetryBaseDelayMs} gemini_retry_max_delay_ms=${ragConfig.geminiRetryMaxDelayMs} ` +
    `gemini_request_throttle_ms=${ragConfig.geminiRequestThrottleMs}`
  );
}

function resetRagProviderLogState() {
  ragLogState.degradedNotices.clear();
  ragLogState.providerReady.clear();
  ragLogState.providerFirstUse.clear();
  ragLogState.fallbackUse.clear();
  ragLogState.providerChain = false;
}

export {
  ragLogState,
  logRag,
  logRagConfigOnce,
  resetRagProviderLogState
};
