// Embedding (vector) providers the RAG layer can use, and how each is detected
// from its credentials. `lexical` is the non-vector provider.
const VECTOR_PROVIDERS = ["gemini", "openai", "azure-openai"];
const ALL_PROVIDERS = [...VECTOR_PROVIDERS, "lexical"];

function envValue(env, key) {
  const value = env?.[key];
  return value === undefined || value === null ? "" : String(value).trim();
}

function isVectorProvider(name) {
  return VECTOR_PROVIDERS.includes(name);
}

function hasProviderCredentials(name, env = process.env) {
  if (name === "gemini") return envValue(env, "GEMINI_API_KEY") !== "";
  if (name === "openai") return envValue(env, "OPENAI_API_KEY") !== "";
  if (name === "azure-openai") {
    return ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_EMBED_DEPLOYMENT"]
      .every((key) => envValue(env, key) !== "");
  }
  return name === "lexical";
}

// Auto mode: the first vector provider with credentials, in VECTOR_PROVIDERS
// order, otherwise lexical.
function autoDetectProvider(env = process.env) {
  return VECTOR_PROVIDERS.find((name) => hasProviderCredentials(name, env)) || "lexical";
}

export {
  ALL_PROVIDERS,
  VECTOR_PROVIDERS,
  autoDetectProvider,
  hasProviderCredentials,
  isVectorProvider
};
