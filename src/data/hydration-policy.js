const VALID_TYPES = new Set(["any", "doc", "sample"]);

function normalizeValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

function normalizeHydrationScope(scope) {
  if (!scope || typeof scope !== "object") return null;
  const product = normalizeValue(scope.product);
  if (!product) return null;

  const edition = normalizeValue(scope.edition);
  const platform = normalizeValue(scope.platform);
  const requestedType = normalizeValue(scope.type);
  const type = VALID_TYPES.has(requestedType) ? requestedType : "any";

  return {
    product,
    edition,
    platform,
    type
  };
}

function normalizeHydrationScopes(scopes = []) {
  if (!Array.isArray(scopes)) return [];
  const normalized = [];
  for (const scope of scopes) {
    const value = normalizeHydrationScope(scope);
    if (value) normalized.push(value);
  }
  return normalized;
}

export {
  normalizeHydrationScope,
  normalizeHydrationScopes
};
