import test from "node:test";
import assert from "node:assert/strict";
import { ensureLatestMajor } from "../../src/server/resource-index/version-policy.js";
import { validatePlatform, validateEdition } from "../../src/server/normalizers.js";

const latestMajor = { dbr: 11, dcv: 4, dwt: 19, ddv: 3, mrz: 3, mds: 1 };

test("#139a: version-like tokens in query text do NOT trigger the legacy guard", () => {
  // "I am on DBR 9.6 and setLicenseKey stopped working" must not be blocked.
  const policy = ensureLatestMajor({
    product: "dbr",
    query: "I am on DBR 9.6 and setLicenseKey stopped working",
    latestMajor
  });
  assert.equal(policy.ok, true, "query-text version must not block the search");
});

test("#139a: query text alone (no product) is not blocked by an embedded version", () => {
  const policy = ensureLatestMajor({
    query: "migrate from dbr v9 to v11",
    latestMajor
  });
  assert.equal(policy.ok, true);
});

test("#139a: an explicit version parameter still triggers the guard", () => {
  const policy = ensureLatestMajor({
    product: "dbr",
    version: "9.6.0",
    latestMajor
  });
  assert.equal(policy.ok, false, "explicit legacy version parameter must be refused");
});

test("#139b: DBR legacy refusal is actionable (retry hint + licensing note)", () => {
  const policy = ensureLatestMajor({ product: "dbr", version: "9.6.0", latestMajor });
  assert.match(policy.message, /Retry without the version parameter to get v11 content\./);
  assert.match(policy.message, /setLicenseKey was replaced by LicenseManager\.initLicense/);
});

test("#139b: non-DBR refusals include the retry-without-version hint", () => {
  for (const product of ["ddv", "mrz", "mds", "dwt"]) {
    const policy = ensureLatestMajor({ product, version: "2.0.0", latestMajor });
    assert.equal(policy.ok, false, `${product} legacy version should be refused`);
    assert.match(policy.message, /Retry without the version parameter/, `${product} refusal must be actionable`);
  }
});

test("#152: validatePlatform accepts known + alias, rejects unknown with suggestion", () => {
  assert.deepEqual(validatePlatform("android"), { ok: true, normalized: "android" });
  assert.deepEqual(validatePlatform("kotlin"), { ok: true, normalized: "android" });
  assert.deepEqual(validatePlatform(undefined), { ok: true, normalized: "" });

  const bad = validatePlatform("reactnative");
  assert.equal(bad.ok, true, "reactnative is a known alias for react-native");
  assert.equal(bad.normalized, "react-native");

  const unknown = validatePlatform("kotlinx");
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /Unknown platform "kotlinx"/);
  assert.match(unknown.message, /Valid:/);
});

test("#152: validateEdition validates the four known editions", () => {
  assert.deepEqual(validateEdition("web"), { ok: true, normalized: "web" });
  assert.deepEqual(validateEdition("MOBILE"), { ok: true, normalized: "mobile" });
  assert.deepEqual(validateEdition(""), { ok: true, normalized: "" });

  const unknown = validateEdition("desktop-ish");
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /Unknown edition "desktop-ish"/);
});
