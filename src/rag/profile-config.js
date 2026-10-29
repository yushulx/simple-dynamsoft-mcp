import { ALL_PROVIDERS, autoDetectProvider, isVectorProvider } from "./embedding-providers.js";

function normalizeEnvValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function resolveProvider(env) {
  const explicit = normalizeEnvValue(env?.RAG_PROVIDER);
  if (ALL_PROVIDERS.includes(explicit)) {
    return { value: explicit, source: "env" };
  }
  return {
    value: autoDetectProvider(env),
    source: "auto"
  };
}

function resolveFallback(env, provider) {
  const explicit = normalizeEnvValue(env?.RAG_FALLBACK);
  if (explicit === "none" || ALL_PROVIDERS.includes(explicit)) {
    return { value: explicit, source: "env" };
  }
  return {
    value: isVectorProvider(provider) ? "lexical" : "none",
    source: "auto"
  };
}

function resolveProfileConfig(env = process.env) {
  const provider = resolveProvider(env);
  const fallback = resolveFallback(env, provider.value);
  return {
    profile: isVectorProvider(provider.value) ? `semantic-${provider.value}` : "lite",
    defaults: {
      provider: provider.value,
      fallback: fallback.value
    },
    provider: provider.value,
    fallback: fallback.value,
    providerSource: provider.source,
    fallbackSource: fallback.source
  };
}

export {
  resolveProfileConfig
};
