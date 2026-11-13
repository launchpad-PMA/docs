import { sha256 } from "./tokens.js";

export const PARAMETER_KEYS = [
  "acknowledgment",
  "agreementVersion",
  "country",
  "email",
  "fullLegalName",
  "pathway",
  "proseSha256",
  "region",
  "signature",
  "submittedAt",
];

export function canonicalProse(body) {
  const normalized = String(body)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
  return `${normalized}\n`;
}

function clauseSlug(heading) {
  return heading
    .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function clauseIndex(body) {
  const prose = canonicalProse(body);
  const parts = prose.split(/(?=^## )/m).filter((part) => part.length > 0);
  const seen = new Map();
  return parts.map((part) => {
    const firstLine = part.slice(0, part.indexOf("\n"));
    const isClause = firstLine.startsWith("## ");
    const heading = isClause ? firstLine.slice(3).trim() : "Preamble";
    let id = isClause ? clauseSlug(heading) : "preamble";
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;
    const text = part.endsWith("\n") ? part : `${part}\n`;
    return { id, heading, sha256: sha256(text), text };
  });
}

export function canonicalParameters(fields) {
  const ordered = {};
  for (const key of PARAMETER_KEYS) {
    if (!Object.hasOwn(fields, key)) throw new Error(`Missing Ricardian parameter ${key}.`);
    ordered[key] = String(fields[key]);
  }
  return JSON.stringify(ordered);
}

export function ricardianDocument(body) {
  const prose = canonicalProse(body);
  const clauses = clauseIndex(body);
  const joined = clauses.map((clause) => clause.text).join("");
  if (joined !== prose) throw new Error("Ricardian clauses do not reconstruct the prose.");
  return {
    form: "ricardian-v2",
    proseSha256: sha256(prose),
    clauses: clauses.map(({ id, heading, sha256: clauseSha, text }) => ({
      id,
      heading,
      sha256: clauseSha,
      text,
    })),
  };
}

export function ricardianInstance(body, fields) {
  const document = ricardianDocument(body);
  const parameters = canonicalParameters({ ...fields, proseSha256: document.proseSha256 });
  const parametersSha256 = sha256(parameters);
  return {
    form: "ricardian-v2",
    proseSha256: document.proseSha256,
    parametersSha256,
    ricardianHash: sha256(`${document.proseSha256}\n${parametersSha256}`),
    parameters,
  };
}

export function verifyRicardianInstance(body, stored) {
  const again = ricardianInstance(body, {
    acknowledgment: stored.acknowledgment,
    agreementVersion: stored.agreementVersion,
    country: stored.country,
    email: stored.email,
    fullLegalName: stored.fullLegalName,
    pathway: stored.pathway,
    region: stored.region,
    signature: stored.signature,
    submittedAt: stored.submittedAt,
  });
  const verified =
    again.proseSha256 === stored.proseSha256 &&
    again.parametersSha256 === stored.parametersSha256 &&
    again.ricardianHash === stored.ricardianHash;
  return { ...again, verified };
}
