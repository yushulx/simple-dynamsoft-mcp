import assert from "node:assert/strict";
import test from "node:test";
import {
  LATEST_MAJOR,
  ensureLatestMajor,
  normalizeApiLevel,
  normalizeEdition,
  normalizePlatform,
  normalizeProduct,
  registry
} from "../../src/server/resource-index.js";
import { registerQuickstartTools } from "../../src/server/tools/register-quickstart-tools.js";

function registerQuickstart() {
  const handlers = new Map();
  const hydrated = [];
  registerQuickstartTools({
    server: { registerTool: (name, _definition, handler) => handlers.set(name, handler) },
    ensureScopeHydrated: async (scope) => {
      hydrated.push(scope);
      throw new Error("lazy download failed");
    },
    ensureLatestMajor,
    normalizeProduct,
    normalizePlatform,
    normalizeEdition,
    normalizeApiLevel,
    registry
  });
  return { quickstart: handlers.get("get_quickstart"), hydrated };
}

test("MDS quickstart returns reference links without waiting on a lazy download", async () => {
  const { quickstart, hydrated } = registerQuickstart();

  const result = await quickstart({ product: "mds", platform: "js" });
  const text = result.content[0].text;
  assert.equal(result.isError, undefined, text);
  assert.ok(text.includes("https://www.dynamsoft.com/mobile-document-scanner/docs/web/"), text);
  assert.ok(text.includes("https://github.com/Dynamsoft/document-scanner-javascript-samples"), text);
  assert.deepEqual(hydrated, []);
});

test("MDS quickstart still enforces the latest-major version policy", async () => {
  const { quickstart } = registerQuickstart();

  const result = await quickstart({ product: "mds", version: String(LATEST_MAJOR.mds - 1) });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /MDS/);
});

test("MRZ quickstart still hydrates its inline samples", async () => {
  const { quickstart, hydrated } = registerQuickstart();

  await assert.rejects(quickstart({ product: "mrz", platform: "js" }), /lazy download failed/);
  assert.equal(hydrated[0].product, "mrz");
});
