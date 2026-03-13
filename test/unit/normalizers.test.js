import assert from "node:assert/strict";
import test from "node:test";
import { inferProductFromQuery, normalizeProduct } from "../../src/server/normalizers.js";

test("normalizeProduct maps explicit MDS names without hijacking generic document scanning", () => {
  assert.equal(normalizeProduct("mds"), "mds");
  assert.equal(normalizeProduct("mobile document scanner"), "mds");
  assert.equal(normalizeProduct("dynamsoft mobile document scanner"), "mds");
  assert.equal(normalizeProduct("document scanner"), "document scanner");
  assert.equal(normalizeProduct("document scanning"), "document scanning");
});

test("normalizeProduct stays consistent with explicit viewer and normalizer aliases", () => {
  assert.equal(normalizeProduct("document normalizer"), "dcv");
  assert.equal(inferProductFromQuery("document normalizer workflow"), "dcv");
  assert.equal(normalizeProduct("edit viewer"), "ddv");
  assert.equal(inferProductFromQuery("edit viewer sample"), "ddv");
  assert.equal(inferProductFromQuery("mobile document scanner quickstart"), "mds");
  assert.equal(inferProductFromQuery("dynamsoft mobile document scanner sample"), "mds");
  assert.notEqual(inferProductFromQuery("document scanning workflow"), "mds");
});
