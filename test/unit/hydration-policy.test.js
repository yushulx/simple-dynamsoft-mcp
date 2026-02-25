import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHydrationScopes } from "../../src/data/hydration-policy.js";

test("normalizeHydrationScopes normalizes case and defaults type", () => {
  const scopes = normalizeHydrationScopes([
    { product: "DBR", edition: "WEB" }
  ]);

  assert.deepEqual(scopes, [
    { product: "dbr", edition: "web", platform: "", type: "any" }
  ]);
});

test("normalizeHydrationScopes removes invalid entries", () => {
  const scopes = normalizeHydrationScopes([
    null,
    { product: "" },
    { product: "dwt", type: "doc" }
  ]);

  assert.deepEqual(scopes, [
    { product: "dwt", edition: "", platform: "", type: "doc" }
  ]);
});
