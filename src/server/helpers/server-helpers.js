function formatScoreLabel(entry) {
  if (!Number.isFinite(entry?.score)) return "";
  return ` | score: ${entry.score.toFixed(3)}`;
}

function formatScoreNote(entry) {
  if (!Number.isFinite(entry?.score)) return "";
  return ` score=${entry.score.toFixed(3)}`;
}

function createScopeHydrator({ ensureDataScopesHydrated, refreshResourceIndex, refreshRagIndexes }) {
  if (typeof ensureDataScopesHydrated !== "function") {
    throw new TypeError("ensureDataScopesHydrated must be a function");
  }

  return async function ensureScopeHydrated(scope) {
    const result = await ensureDataScopesHydrated([scope]);
    if (!Array.isArray(result?.hydrated) || result.hydrated.length === 0) return;

    if (typeof refreshResourceIndex === "function") {
      refreshResourceIndex();
    }
    if (typeof refreshRagIndexes === "function") {
      refreshRagIndexes();
    }
  };
}

export {
  formatScoreLabel,
  formatScoreNote,
  createScopeHydrator
};
