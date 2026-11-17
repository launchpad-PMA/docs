# Advocacy Launchpad membership service

Shared signing and approval for the AdBongo pathway and the Temple of Roots pathway. Both use the drafts in `../agreements`. Foundational membership does not call Patreon, Hipcamp, an NFT network, or Hats Protocol.

This service is for review. It does not publish the covenants. Leave `AGREEMENT_PUBLICATION=draft` until counsel resolves `../agreements/legal-issues-for-approval.md` and a covenant file's front matter says `status: approved`.

Each covenant is a Ricardian contract. A lawyer reads the prose on the membership page. A program reads the same prose at `/api/agreements/adbongo` or `/api/agreements/temple`, divided into the same sections, with the SHA-256 of that prose. The signer's name, email, location, and signature are parameters of that signing. The signature record stores a second hash that binds those parameters to the prose. Reading the record back recomputes both hashes. A wallet is not required, and the parameters stay in the membership record.

The live sites were not changed:

- `Adbongo-Group-LLC/website`
- `Temple-of-Roots-508-c-1-a/website`
- `Temple-of-Roots-508-c-1-a/village-os`

No Supabase project is connected to those sites or to this docs repository. The tested database is a local SQLite file. `supabase/migrations/001_membership.sql` is the same shape for Postgres when a steward chooses a project.

## Run the tests

```bash
cd membership-app
npm install
npm test
```

Node.js 22 or newer is required. The tests use SQLite, generate PDFs, and do not call a live chain.

## Run it locally

```bash
cd membership-app
cp .env.example .env
# Put a long random value in ADMIN_TOKEN. Leave AGREEMENT_PUBLICATION=draft.
npm start
```

Open:

- http://127.0.0.1:8787/adbongo
- http://127.0.0.1:8787/temple
- http://127.0.0.1:8787/admin
- http://127.0.0.1:8787/dashboard

The covenant is on the page before the form. The form asks for the legal name, email, state or province, country, agreement version, consent, the acknowledgment, and an electronic signature. Submit creates a pending application, a PDF, an outbox email, and an audit row. A steward approves or rejects it. Approval returns a membership id. While the covenant is a draft, `effective` stays false.

Applicant PDF links use a receipt token. Member pages use an access token stored only as a hash. Steward routes require `ADMIN_TOKEN`.

## What stays optional

After acceptance, the member record can show:

- the Patreon link, if one is configured
- the Hipcamp link, if one is configured
- an NFT balance check for a collection a steward saved
- an AdBongo Scope of Work inquiry, which does not modify the covenant and does not require AdBongo LLC to do the work

Empty `HIPCAMP_URL` or `PATREON_URL_ADBONGO` leaves the benefit visible and unpublished. Do not invent a booking URL.

`NFT_RPC_URL` must be `https`, or `http` on localhost. The server calls `balanceOf` for a saved collection. It refuses private keys and seed phrases. It does not write names, emails, or signatures on-chain. An NFT balance never inserts a member.

Hats Protocol is not called. See `../agreements/hats-protocol-review.md`.

## Publish a covenant later

1. Counsel decides the items in the legal-issues report.
2. Put the accepted text in a new versioned file. Set its front matter `status: approved`. Do not overwrite `membership-covenant`.
3. Point `AGREEMENT_FILES` in `src/agreements.js` at that file if the filename changes.
4. Set `AGREEMENT_PUBLICATION=published` and restart. Both the file status and this flag are required before a steward's approval is marked effective.
5. Serve the app on the same host as the page that links to it, over HTTPS. Do not turn on cross-origin browser access; the records should stay first-party.
6. Only then add a link from adbongo.io and templeofroots.com. The current Temple membership page is a different offer (Genesis Sigil and Patreon) and should not be replaced by this draft.

Applications signed while the banner says draft remain non-effective. They are not upgraded when a later version is published. Those applicants need to sign the accepted version.

## Supabase

There is no project to reuse here. To use a new one:

1. Create a project the Association controls.
2. Run `supabase/migrations/001_membership.sql` in its SQL editor.
3. Keep the service role on the server. Do not ship it to the browser. Add row-level security before any browser client can read the tables.
4. Store PDFs in a private bucket, not a public one. The SQLite build stores them under `data/pdfs`, which is gitignored.
5. Do not attach this schema to Village OS.

The Node process in this repository reads and writes SQLite. Switching the process to Postgres is a later adapter change; the migration is here so the tables are settled before that work.

## Environment

| Variable | Purpose |
| --- | --- |
| `ADMIN_TOKEN` | Steward credential. Empty disables approval. |
| `AGREEMENT_PUBLICATION` | `draft` or `published`. Published does nothing until the covenant file is `approved`. |
| `DATA_DIR` | SQLite file, PDFs, and the email outbox. |
| `PUBLIC_BASE_URL` | Used in acceptance email links. Use https in a real deployment. |
| `PATREON_URL_TEMPLE` | Optional. Defaults to the Temple page already published on templeofroots.com. |
| `PATREON_URL_ADBUNGO` | Optional. Empty until a page exists. |
| `HIPCAMP_URL` | Optional. Empty until a listing exists. |
| `NFT_RPC_URL` | Optional balance checks. |
| `HOST`, `PORT` | Bind address. The default is `127.0.0.1:8787`. |

Email is written to `data/outbox` as JSON. That is enough for review. A steward can forward those files through their own mailer; do not put SMTP passwords in the repository.

## Phase 3, not in this build

Token-gated benefit automation, governance automation, and a Hats fork are not implemented. Foundational enrollment, signatures, PDFs, steward approval, the member record, and the optional links and NFT check are. The free path works with every external URL and RPC left blank.

## License

GPL-3.0-only, matching this repository. Hats Protocol is AGPL-3.0 and is not vendored.
