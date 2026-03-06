import { logEvent } from "../observability/logging.js";

const ragLogState = {
  config: false,
  providerChain: false,
  degradedNotices: new Set(),
  providerReady: new Set(),
  providerFirstUse: new Set(),
  fallbackUse: new Set()
};

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
