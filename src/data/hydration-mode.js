import { ALL_PROVIDERS, autoDetectProvider, isVectorProvider } from "../rag/embedding-providers.js";

function normalizeEnvValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function resolveEffectiveProvider(env = process.env) {
  const explicitProvider = normalizeEnvValue(env.RAG_PROVIDER);
  if (ALL_PROVIDERS.includes(explicitProvider)) {
    return explicitProvider;
  }
  return autoDetectProvider(env);
}

// Vector providers embed the whole corpus, so they need all data up front.
function resolveHydrationMode(env = process.env) {
  const mode = normalizeEnvValue(env.MCP_DATA_HYDRATION_MODE);
  if (!mode) {
    return isVectorProvider(resolveEffectiveProvider(env)) ? "eager" : "lazy";
  }
  if (mode === "lazy" || mode === "eager") return mode;
  return "eager";
}

export {
  resolveHydrationMode
};
