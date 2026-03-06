import { createHash } from "node:crypto";

const SHARED_STATE_SCHEMA_VERSION = 1;

function normalizeRepoPath(input) {
  if (input === undefined || input === null) return "";
  const normalized = String(input)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
  return normalized;
}

function normalizeRepoKey(input) {
  const path = normalizeRepoPath(input).toLowerCase();
  if (!path) return "";
  return path
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "");
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }
  if (value && typeof value === "object") {
    const out = {};
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      out[key] = stableValue(value[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function normalizeRepoEntry(key, entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const normalizedPath = normalizeRepoPath(source.path || key);

  return {
    path: normalizedPath,
    commit: String(source.commit || "").trim(),
    signature: String(source.signature || "").trim(),
    shardPath: normalizeRepoPath(source.shardPath),
    updatedAt: source.updatedAt ? String(source.updatedAt).trim() : undefined
  };
}

function normalizeReposMap(repos) {
  const input = repos && typeof repos === "object" ? repos : {};
  const normalized = {};

  for (const [repoKey, entry] of Object.entries(input)) {
    const normalizedEntry = normalizeRepoEntry(repoKey, entry);
    const key = normalizeRepoKey(normalizedEntry.path || repoKey);
    if (!key) continue;
    normalized[key] = normalizedEntry;
  }

  return Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)));
}

function computeRepoSignature({
  repo,
  embeddingModel,
  indexConfig,
  indexVersion,
  schemaVersion = SHARED_STATE_SCHEMA_VERSION
}) {
  const normalizedRepoPath = normalizeRepoPath(repo?.path);
  const commit = String(repo?.commit || "").trim();
  const model = String(embeddingModel || "").trim();
  const marker = String(indexVersion || "").trim();

  if (!normalizedRepoPath) throw new Error("repo.path is required to compute repo signature");
  if (!commit) throw new Error("repo.commit is required to compute repo signature");
  if (!model) throw new Error("embeddingModel is required to compute repo signature");
  if (!marker) throw new Error("indexVersion is required to compute repo signature");

  const payload = {
    schemaVersion,
    indexVersion: marker,
    embeddingModel: model,
    repo: {
      path: normalizedRepoPath,
      commit
    },
    indexConfig: stableValue(indexConfig && typeof indexConfig === "object" ? indexConfig : {})
  };

  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function createSharedState({
  generatedAt = new Date().toISOString(),
  indexVersion,
  repos = {},
  schemaVersion = SHARED_STATE_SCHEMA_VERSION
} = {}) {
  return {
    schemaVersion,
    generatedAt: String(generatedAt || "").trim(),
    indexVersion: String(indexVersion || "").trim(),
    repos: normalizeReposMap(repos)
  };
}

function validateSharedState(state) {
  const errors = [];

  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { ok: false, errors: ["state must be an object"] };
  }

  if (state.schemaVersion !== SHARED_STATE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SHARED_STATE_SCHEMA_VERSION}`);
  }
  if (!String(state.generatedAt || "").trim()) {
    errors.push("generatedAt is required");
  }
  if (!String(state.indexVersion || "").trim()) {
    errors.push("indexVersion is required");
  }
  if (!state.repos || typeof state.repos !== "object" || Array.isArray(state.repos)) {
    errors.push("repos must be an object map");
  }

  if (state.repos && typeof state.repos === "object" && !Array.isArray(state.repos)) {
    for (const [key, repo] of Object.entries(state.repos)) {
      if (!String(key || "").trim()) {
        errors.push("repo key must be a non-empty string");
      }
      if (!repo || typeof repo !== "object" || Array.isArray(repo)) {
        errors.push(`repo entry '${key}' must be an object`);
        continue;
      }

      const path = normalizeRepoPath(repo.path);
      if (!path) errors.push(`repo entry '${key}' is missing path`);
      if (!String(repo.commit || "").trim()) errors.push(`repo entry '${key}' is missing commit`);
      if (!String(repo.signature || "").trim()) errors.push(`repo entry '${key}' is missing signature`);
      if (!normalizeRepoPath(repo.shardPath)) errors.push(`repo entry '${key}' is missing shardPath`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function loadSharedState(input) {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const state = {
    schemaVersion: parsed?.schemaVersion,
    generatedAt: parsed?.generatedAt,
    indexVersion: parsed?.indexVersion,
    repos: normalizeReposMap(parsed?.repos)
  };

  const validation = validateSharedState(state);
  if (!validation.ok) {
    throw new Error(`Invalid shared state: ${validation.errors.join("; ")}`);
  }

  return state;
}

export {
  SHARED_STATE_SCHEMA_VERSION,
  normalizeRepoPath,
  normalizeRepoKey,
  computeRepoSignature,
  createSharedState,
  validateSharedState,
  loadSharedState
};
