import test from "node:test";
import assert from "node:assert/strict";
import { resolveSearchScope } from "../../src/server/normalizers.js";
import { runScopedSearch } from "../../src/server/helpers/search-response.js";

test("a DBR query naming exactly one edition searches that edition", () => {
  assert.equal(resolveSearchScope({ query: "Barcode Reader for my web app", product: "dbr" }).edition, "web");
  assert.equal(resolveSearchScope({ query: "React Native barcode scanner", product: "dbr" }).edition, "mobile");
  assert.equal(resolveSearchScope({ query: "decode an image in Node.js", product: "dbr" }).edition, "server");
  assert.equal(resolveSearchScope({ query: "decode with C++", product: "dbr" }).edition, "server");
});

test("an ambiguous or edition-free DBR query searches every edition", () => {
  for (const query of ["scan in a desktop browser", "driver license PDF417 parse", ".NET MAUI app", "web or Android?"]) {
    assert.deepEqual(resolveSearchScope({ query, product: "dbr" }), { edition: "", inferredFrom: "" }, query);
  }
});

test("explicit filters always win over the query", () => {
  assert.equal(resolveSearchScope({ query: "web app", product: "dbr", platform: "android" }).edition, "");
  assert.equal(resolveSearchScope({ query: "Android app", product: "dbr", edition: "web" }).edition, "web");
});

test("MRZ and MDS search the web edition by default; other products are untouched", () => {
  assert.deepEqual(resolveSearchScope({ query: "passport on iOS", product: "mrz" }), { edition: "web", inferredFrom: "" });
  assert.equal(resolveSearchScope({ query: "document scan", product: "mds" }).edition, "web");
  assert.equal(resolveSearchScope({ query: "web app", product: "dwt" }).edition, "");
  assert.equal(resolveSearchScope({ query: "web app", product: "" }).edition, "");
});

test("an edition read from the query is reported, and falls back to all editions when it finds nothing", async () => {
  const calls = [];
  const fake = (results) => async (params) => { calls.push(params.edition); return results(params); };

  const hit = await runScopedSearch(fake(() => [{ uri: "doc://w" }]), { query: "web app", product: "dbr", type: "doc" });
  assert.deepEqual(calls, ["web"]);
  assert.match(hit.scopeNote, /DBR web edition because the query names it/);

  calls.length = 0;
  const miss = await runScopedSearch(fake((p) => (p.edition === "web" ? [] : [{ uri: "doc://m" }])), { query: "web app", product: "dbr", type: "doc" });
  assert.deepEqual(calls, ["web", undefined]);
  assert.deepEqual(miss, { results: [{ uri: "doc://m" }], scopeNote: "" });
});
