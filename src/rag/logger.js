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
    `cache_dir=${ragConfig.cacheDir} prebuilt_auto_download=${ragConfig.prebuiltIndexAutoDownload} ` +
    `prebuilt_url_override=${ragConfig.prebuiltIndexUrl ? "set" : "empty"} ` +
    `prebuilt_url_gemini=${ragConfig.prebuiltIndexUrlGemini ? "set" : "empty"} ` +
    `prebuilt_timeout_ms=${ragConfig.prebuiltIndexTimeoutMs}`
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
