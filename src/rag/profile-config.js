const PROFILE_DEFAULTS = {
  lite: {
    provider: "fuse",
    fallback: "none"
  },
  "semantic-local": {
    provider: "local",
    fallback: "none"
  },
  "semantic-gemini": {
    provider: "gemini",
    fallback: "none"
  }
};

const LEGACY_DEFAULTS = {
  provider: "auto",
  fallback: "fuse"
};

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

  const profile = rawProfile || "legacy";
  const defaults = PROFILE_DEFAULTS[profile] || LEGACY_DEFAULTS;

  return {
    profile,
    defaults,
    provider: explicitProvider || defaults.provider,
    fallback: explicitFallback || defaults.fallback,
    providerSource: explicitProvider ? "env" : "profile-default",
    fallbackSource: explicitFallback ? "env" : "profile-default"
  };
}

export {
  PROFILE_DEFAULTS,
  LEGACY_DEFAULTS,
  resolveProfileConfig
};
