import test from "node:test";
import assert from "node:assert/strict";
import { resolveHydrationMode } from "../../src/data/hydration-mode.js";

test("resolveHydrationMode defaults to lazy when GEMINI_API_KEY is unset", () => {
  assert.equal(resolveHydrationMode({}), "lazy");
});

test("resolveHydrationMode defaults to eager when GEMINI_API_KEY is set", () => {
  assert.equal(resolveHydrationMode({ GEMINI_API_KEY: "demo-key" }), "eager");
});

test("resolveHydrationMode accepts eager and lazy", () => {
  assert.equal(resolveHydrationMode({ MCP_DATA_HYDRATION_MODE: "eager" }), "eager");
  assert.equal(resolveHydrationMode({ MCP_DATA_HYDRATION_MODE: "lazy" }), "lazy");
});

test("resolveHydrationMode falls back to eager for unknown mode", () => {
  assert.equal(resolveHydrationMode({ MCP_DATA_HYDRATION_MODE: "something-else" }), "eager");
});
