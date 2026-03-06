const PROFILE_DEFAULTS = {
  lite: {
    provider: "lexical",
    fallback: "none"
  },
  "semantic-gemini": {
    provider: "gemini",
    fallback: "lexical"
  }
};

const SUPPORTED_PROVIDERS = new Set(["auto", "gemini", "lexical"]);
const SUPPORTED_FALLBACKS = new Set(["none", "gemini", "lexical"]);

function normalizeEnvValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function resolveProfileConfig(env = process.env) {
  const rawProfile = normalizeEnvValue(env.MCP_PROFILE);
  const explicitProvider = normalizeEnvValue(env.RAG_PROVIDER);
  const explicitFallback = normalizeEnvValue(env.RAG_FALLBACK);

  if (rawProfile && !PROFILE_DEFAULTS[rawProfile]) {
    throw new Error(
      `Invalid MCP_PROFILE "${rawProfile}". Expected one of: ${Object.keys(PROFILE_DEFAULTS).join(", ")}.`
    );
  }

  const profile = rawProfile || "lite";
  const defaults = PROFILE_DEFAULTS[profile];
  const provider = explicitProvider || defaults.provider;
  const fallback = explicitFallback || defaults.fallback;

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(
      `Invalid RAG_PROVIDER "${provider}". Expected one of: ${Array.from(SUPPORTED_PROVIDERS).join(", ")}.`
    );
  }
  if (!SUPPORTED_FALLBACKS.has(fallback)) {
    throw new Error(
      `Invalid RAG_FALLBACK "${fallback}". Expected one of: ${Array.from(SUPPORTED_FALLBACKS).join(", ")}.`
    );
  }

  return {
    profile,
    defaults,
    provider,
    fallback,
    providerSource: explicitProvider ? "env" : "profile-default",
    fallbackSource: explicitFallback ? "env" : "profile-default"
  };
}

export {
  PROFILE_DEFAULTS,
  resolveProfileConfig
};
