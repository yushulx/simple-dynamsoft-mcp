function normalizeEnvValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function resolveEffectiveProvider(env = process.env) {
  const explicitProvider = normalizeEnvValue(env.RAG_PROVIDER);
  const hasGeminiKey = normalizeEnvValue(env.GEMINI_API_KEY) !== "";
  if (explicitProvider === "gemini" || explicitProvider === "lexical") {
    return explicitProvider;
  }
  if (explicitProvider === "auto") {
    return hasGeminiKey ? "gemini" : "lexical";
  }
  return hasGeminiKey ? "gemini" : "lexical";
}

function resolveHydrationMode(env = process.env) {
  const mode = normalizeEnvValue(env.MCP_DATA_HYDRATION_MODE);
  if (!mode) {
    return resolveEffectiveProvider(env) === "gemini" ? "eager" : "lazy";
  }
  if (mode === "lazy" || mode === "eager") return mode;
  return "eager";
}

export {
  resolveHydrationMode
};
