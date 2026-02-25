function normalizeEnvValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function resolveHydrationMode(env = process.env) {
  const mode = normalizeEnvValue(env.MCP_DATA_HYDRATION_MODE);
  if (!mode) return "lazy";
  if (mode === "lazy" || mode === "eager") return mode;
  return "eager";
}

export {
  resolveHydrationMode
};
