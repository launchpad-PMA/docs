import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseAgreementFile } from "../src/agreements.js";
import { canonicalParameters, canonicalProse, ricardianDocument, ricardianInstance, verifyRicardianInstance } from "../src/ricardian.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fields(overrides = {}) {
  return {
    acknowledgment: "I agree.",
    agreementVersion: "1.0-draft",
    country: "United States",
    email: "ada@example.com",
    fullLegalName: "Ada Applicant",
    pathway: "adbongo",
    region: "Texas",
    signature: "Ada Applicant",
    submittedAt: "2026-11-13T20:00:00.000Z",
    ...overrides,
  };
}

test("each covenant is one Ricardian prose document", () => {
  const hashes = new Set();
  for (const file of [
    "agreements/adbongo-pma-membership-covenant-v1.0-draft.md",
    "agreements/temple-of-roots-pma-membership-covenant-v1.0-draft.md",
  ]) {
    const parsed = parseAgreementFile(fs.readFileSync(path.join(root, file), "utf8"));
    const document = ricardianDocument(parsed.body);
    assert.equal(document.form, "ricardian-v2");
    assert.match(document.proseSha256, /^[a-f0-9]{64}$/);
    assert.ok(document.clauses.some((clause) => clause.id === "ricardian-form"));
    assert.equal(document.clauses.map((clause) => clause.text).join(""), canonicalProse(parsed.body));
    hashes.add(document.proseSha256);
    assert.equal(canonicalProse(parsed.body).includes("ada@example.com"), false);
  }
  assert.equal(hashes.size, 2);
});

test("parameters bind to the prose without entering its hash", () => {
  const body = "## 1. Promise\n\nThe association admits the member.\n";
  const first = ricardianInstance(body, fields());
  const renamed = ricardianInstance(body, fields({ fullLegalName: "Bea Applicant", signature: "Bea Applicant" }));
  const padded = ricardianInstance(`${body}   \n`, fields());
  assert.equal(first.proseSha256, renamed.proseSha256);
  assert.equal(first.proseSha256, padded.proseSha256);
  assert.notEqual(first.parametersSha256, renamed.parametersSha256);
  assert.notEqual(first.ricardianHash, renamed.ricardianHash);
  const parsed = JSON.parse(first.parameters);
  assert.deepEqual(Object.keys(parsed), Object.keys(parsed).slice().sort());
  assert.equal(parsed.proseSha256, first.proseSha256);
  assert.equal(canonicalParameters({ ...fields(), proseSha256: first.proseSha256 }), first.parameters);
  const check = verifyRicardianInstance(body, {
    ...fields(),
    proseSha256: first.proseSha256,
    parametersSha256: first.parametersSha256,
    ricardianHash: first.ricardianHash,
  });
  assert.equal(check.verified, true);
  const tampered = verifyRicardianInstance(`${body}\nOne extra sentence.\n`, {
    ...fields(),
    proseSha256: first.proseSha256,
    parametersSha256: first.parametersSha256,
    ricardianHash: first.ricardianHash,
  });
  assert.equal(tampered.verified, false);
});