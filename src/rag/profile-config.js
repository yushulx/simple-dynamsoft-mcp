function normalizeEnvValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function hasGeminiKey(env) {
  return normalizeEnvValue(env?.GEMINI_API_KEY) !== "";
}

function resolveProvider(env) {
  const explicit = normalizeEnvValue(env?.RAG_PROVIDER);
  if (explicit === "gemini" || explicit === "lexical") {
    return { value: explicit, source: "env" };
  }
  return {
    value: hasGeminiKey(env) ? "gemini" : "lexical",
    source: "auto"
  };
}

function resolveFallback(env, provider) {
  const explicit = normalizeEnvValue(env?.RAG_FALLBACK);
  if (explicit === "none" || explicit === "gemini" || explicit === "lexical") {
    return { value: explicit, source: "env" };
  }
  return {
    value: provider === "gemini" ? "lexical" : "none",
    source: "auto"
  };
}

function resolveProfileConfig(env = process.env) {
  const provider = resolveProvider(env);
  const fallback = resolveFallback(env, provider.value);
  return {
    profile: provider.value === "gemini" ? "semantic-gemini" : "lite",
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
