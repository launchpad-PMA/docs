-- Postgres / Supabase shape for the membership service.
-- The tested runtime is SQLite in membership-app. Apply this only after a steward
-- chooses a Supabase project. Do not point the app at Village OS or another
-- existing database without a separate decision.
-- Member names, emails, and signatures stay in this database. Do not copy them
-- into a smart contract.

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
  agreement_version_id TEXT NOT NULL REFERENCES agreement_versions(id),
  agreement_version TEXT NOT NULL,
  agreement_sha256 TEXT NOT NULL,
  consent INTEGER NOT NULL,
  acknowledgment TEXT NOT NULL,
  status TEXT NOT NULL,
  receipt_token_hash TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  pdf_path TEXT
);

CREATE TABLE IF NOT EXISTS membership_signatures (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES membership_applications(id),
  signature_text TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  acknowledgment_text TEXT NOT NULL,
  content_sha256 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_approvals (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES membership_applications(id),
  decision TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL UNIQUE,
  application_id TEXT NOT NULL UNIQUE REFERENCES membership_applications(id),
  pathway TEXT NOT NULL,
  full_legal_name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  effective INTEGER NOT NULL,
  approved_at TEXT NOT NULL,
  access_token_hash TEXT NOT NULL
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
  member_id TEXT NOT NULL REFERENCES members(id),
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  verified_at TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  UNIQUE (member_id, address, chain_id)
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
  member_id TEXT NOT NULL REFERENCES members(id),
  collection_id TEXT NOT NULL REFERENCES nft_entitlements(id),
  address TEXT NOT NULL,
  balance TEXT NOT NULL,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_nonces (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS service_inquiries (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  service_interest TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
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

-- Supabase row level security is not a substitute for the application's steward
-- check. Enable RLS and add policies only when a logged-in Supabase role is
-- introduced. Until then, the Node service should connect with a server role
-- that is not exposed to browsers.
