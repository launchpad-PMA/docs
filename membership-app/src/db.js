import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agreement_versions (
  id TEXT PRIMARY KEY,
  pathway TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  body TEXT NOT NULL,
  file_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (pathway, version)
);

CREATE TABLE IF NOT EXISTS membership_applications (
  id TEXT PRIMARY KEY,
  pathway TEXT NOT NULL,
  full_legal_name TEXT NOT NULL,
  email TEXT NOT NULL,
  region TEXT NOT NULL,
  country TEXT NOT NULL,
  agreement_version_id TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  agreement_sha256 TEXT NOT NULL,
  consent INTEGER NOT NULL,
  acknowledgment TEXT NOT NULL,
  status TEXT NOT NULL,
  receipt_token_hash TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  pdf_path TEXT,
  FOREIGN KEY (agreement_version_id) REFERENCES agreement_versions(id)
);

CREATE TABLE IF NOT EXISTS membership_signatures (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  signature_text TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  acknowledgment_text TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  prose_sha256 TEXT NOT NULL DEFAULT '',
  parameters_sha256 TEXT NOT NULL DEFAULT '',
  ricardian_hash TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (application_id) REFERENCES membership_applications(id)
);

CREATE TABLE IF NOT EXISTS membership_approvals (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (application_id) REFERENCES membership_applications(id)
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL UNIQUE,
  application_id TEXT NOT NULL UNIQUE,
  pathway TEXT NOT NULL,
  full_legal_name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  effective INTEGER NOT NULL,
  approved_at TEXT NOT NULL,
  access_token_hash TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES membership_applications(id)
);

CREATE TABLE IF NOT EXISTS membership_benefits (
  id TEXT PRIMARY KEY,
  pathway TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_connections (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  verified_at TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  UNIQUE (member_id, address, chain_id),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS nft_entitlements (
  id TEXT PRIMARY KEY,
  collection_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  benefits_json TEXT NOT NULL,
  pathway TEXT NOT NULL DEFAULT 'all',
  active INTEGER NOT NULL,
  UNIQUE (collection_address, chain_id)
);

CREATE TABLE IF NOT EXISTS nft_checks (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  address TEXT NOT NULL,
  balance TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (collection_id) REFERENCES nft_entitlements(id)
);

CREATE TABLE IF NOT EXISTS wallet_nonces (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS service_inquiries (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  service_interest TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS membership_audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_counters (
  year INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_email ON membership_applications (email, status);
CREATE INDEX IF NOT EXISTS idx_members_email ON members (email, status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON membership_audit_events (entity, entity_id);
`;

export class MembershipDb {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
    const signatureColumns = this.db.prepare("PRAGMA table_info(membership_signatures)").all().map((column) => column.name);
    for (const name of ["prose_sha256", "parameters_sha256", "ricardian_hash"]) {
      if (!signatureColumns.includes(name)) {
        this.db.exec(`ALTER TABLE membership_signatures ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
      }
    }
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  transaction(fn) {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}
