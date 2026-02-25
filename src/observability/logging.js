function normalizeEnvValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function isVerboseLoggingEnabled(env = process.env) {
  const explicit = normalizeEnvValue(env.MCP_LOG_LEVEL);
  if (["debug", "verbose", "trace"].includes(explicit)) return true;
  const toggle = normalizeEnvValue(env.MCP_VERBOSE_LOGS);
  return ["1", "true", "yes", "on"].includes(toggle);
}

function quoteValue(value) {
  const raw = String(value ?? "");
  if (raw.length === 0) return "\"\"";
  if (/\s|=/.test(raw)) return JSON.stringify(raw);
  return raw;
}

function latencyBucket(latencyMs) {
  const n = Number(latencyMs);
  if (!Number.isFinite(n) || n < 0) return "unknown";
  if (n < 100) return "lt100ms";
  if (n < 300) return "100-299ms";
  if (n < 1000) return "300-999ms";
  if (n < 3000) return "1-2s";
  return "ge3s";
}

function logEvent(component, event, fields = {}, options = {}) {
  const level = normalizeEnvValue(options.level || "info") || "info";
  const verbose = isVerboseLoggingEnabled(options.env);
  if (level === "debug" && !verbose) return;

  const parts = [`[${component}]`, `event=${quoteValue(event || "detail")}`];
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${key}=${quoteValue(value)}`);
  }

  if (level !== "info") {
    parts.push(`level=${level}`);
  }
  console.error(parts.join(" "));
}

export {
  isVerboseLoggingEnabled,
  latencyBucket,
  logEvent
};
