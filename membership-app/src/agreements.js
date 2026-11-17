import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./tokens.js";
import { nowIso } from "./time.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const AGREEMENT_FILES = [
  {
    pathway: "adbongo",
    file: path.join(root, "agreements/adbongo-pma-membership-covenant-v1.0-draft.md"),
  },
  {
    pathway: "temple",
    file: path.join(root, "agreements/temple-of-roots-pma-membership-covenant-v1.0-draft.md"),
  },
];

export const ACKNOWLEDGMENT =
  "By signing and submitting this application, I voluntarily apply for membership in the Advocacy Launchpad Private Membership Association, acknowledge that I have reviewed the applicable Membership Covenant, and intend my electronic signature to bind me to its terms upon acceptance by the Association.";

export function parseAgreementFile(text) {
  if (!text.startsWith("---\n")) throw new Error("Agreement is missing front matter.");
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Agreement front matter does not close.");
  const meta = {};
  for (const line of text.slice(4, end).split("\n")) {
    const splitAt = line.indexOf(":");
    if (splitAt === -1) continue;
    meta[line.slice(0, splitAt).trim()] = line.slice(splitAt + 1).trim();
  }
  return { meta, body: text.slice(end + 5).replace(/^\n/, ""), full: text };
}

export function syncAgreements(db) {
  const synced = [];
  for (const entry of AGREEMENT_FILES) {
    const full = fs.readFileSync(entry.file, "utf8");
    const parsed = parseAgreementFile(full);
    if (parsed.meta.pathway !== entry.pathway) {
      throw new Error(`Pathway mismatch in ${entry.file}`);
    }
    const record = {
      id: parsed.meta.id,
      pathway: parsed.meta.pathway,
      version: parsed.meta.version,
      title: parsed.meta.title,
      contentSha256: sha256(full),
      body: parsed.body,
      fileStatus: parsed.meta.status,
      createdAt: nowIso(),
    };
    db.prepare(
      `INSERT INTO agreement_versions
        (id, pathway, version, title, content_sha256, body, file_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        content_sha256 = excluded.content_sha256,
        body = excluded.body,
        file_status = excluded.file_status,
        version = excluded.version,
        pathway = excluded.pathway`,
    ).run(
      record.id,
      record.pathway,
      record.version,
      record.title,
      record.contentSha256,
      record.body,
      record.fileStatus,
      record.createdAt,
    );
    synced.push(record);
  }
  return synced;
}

export function currentAgreement(db, pathway) {
  return db
    .prepare(
      `SELECT id, pathway, version, title, content_sha256, body, file_status, created_at
       FROM agreement_versions WHERE pathway = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(pathway);
}

export function seedBenefits(db, config) {
  const rows = [
    [
      "foundational-record",
      "all",
      "foundational",
      "Foundational membership",
      "The private contractual relationship, a membership identifier after acceptance, and a copy of the signed covenant. No purchase, donation, subscription, or NFT is required.",
      "",
    ],
    [
      "program-notices",
      "all",
      "program",
      "Published member programs",
      "Notices of programs the Association actually offers to members. A notice is not a separate paid product.",
      "",
    ],
    [
      "patreon-temple",
      "temple",
      "patreon",
      "Patreon supporting membership",
      "Optional. Tiers, prices, and benefits are defined on Patreon. A pledge is not the covenant and is not required.",
      config.patreonUrlTemple,
    ],
    [
      "patreon-adbongo",
      "adbongo",
      "patreon",
      "Patreon supporting membership",
      "Optional. A Patreon page for this pathway is shown here when the Association publishes one. A pledge is not required.",
      config.patreonUrlAdbongo,
    ],
    [
      "hipcamp-all",
      "all",
      "hipcamp",
      "Hipcamp sanctuary reservations",
      "Optional. Reservations follow the booking platform's terms, fees, availability, and sanctuary rules. Foundational membership does not reserve a stay.",
      config.hipcampUrl,
    ],
    [
      "nft-all",
      "all",
      "nft",
      "Sovereign AI NFT verification",
      "Optional. After acceptance, a member may connect a wallet and check a designated collection. Ownership does not create membership, equity, or a financial return.",
      "",
    ],
    [
      "sow-adbongo",
      "all",
      "sow",
      "AdBongo service inquiry",
      "Optional and separate. An inquiry does not hire AdBongo LLC and does not change the covenant. AdBongo LLC's ownership and management are not stated here.",
      "mailto:info@adbongo.io?subject=AdBongo%20Scope%20of%20Work%20inquiry",
    ],
  ];
  const statement = db.prepare(
    `INSERT INTO membership_benefits (id, pathway, kind, title, description, url, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
      pathway = excluded.pathway,
      kind = excluded.kind,
      title = excluded.title,
      description = excluded.description,
      url = excluded.url,
      active = 1`,
  );
  for (const row of rows) statement.run(...row);
}
