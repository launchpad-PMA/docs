import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ACKNOWLEDGMENT, currentAgreement } from "./agreements.js";
import { isPublishable } from "./config.js";
import { writeMail } from "./mail.js";
import { erc721BalanceOf, recoverPersonalSign } from "./nft.js";
import { renderPdf } from "./pdf.js";
import { chicagoYear, formatChicago, nowIso } from "./time.js";
import { hashToken, newToken } from "./tokens.js";
import {
  validateApplication,
  validateCollection,
  validateDecision,
  validateInquiry,
  validateWallet,
} from "./validate.js";

function fail(status, error, extra = {}) {
  return { status, body: { error, ...extra } };
}

function audit(db, event) {
  db.prepare(
    `INSERT INTO membership_audit_events
      (id, actor, action, entity, entity_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    event.actor,
    event.action,
    event.entity,
    event.entityId,
    JSON.stringify(event.metadata ?? {}),
    event.at ?? nowIso(),
  );
}

function publicAgreement(row, config) {
  const publishable = isPublishable(row.file_status, config);
  return {
    id: row.id,
    pathway: row.pathway,
    version: row.version,
    title: row.title,
    sha256: row.content_sha256,
    fileStatus: row.file_status,
    publicationStatus: publishable ? "published" : "draft",
    effective: publishable,
    body: row.body,
    acknowledgment: ACKNOWLEDGMENT,
  };
}

export function listAgreements(db, config) {
  const rows = db
    .prepare(
      `SELECT id, pathway, version, title, content_sha256, body, file_status, created_at
       FROM agreement_versions ORDER BY pathway`,
    )
    .all();
  return rows.map((row) => {
    const pub = publicAgreement(row, config);
    return {
      id: pub.id,
      pathway: pub.pathway,
      version: pub.version,
      title: pub.title,
      sha256: pub.sha256,
      publicationStatus: pub.publicationStatus,
      effective: pub.effective,
    };
  });
}

export function getAgreement(db, config, pathway) {
  const row = currentAgreement(db, pathway);
  if (!row) return null;
  return publicAgreement(row, config);
}

function baseUrl(config) {
  return config.publicBaseUrl || `http://127.0.0.1:${config.port}`;
}

export async function submitApplication(db, config, body, meta) {
  const agreementRow = currentAgreement(db, String(body.pathway ?? ""));
  const { errors, value } = validateApplication(body, agreementRow);
  if (errors.length) return fail(400, errors[0], { errors });

  const existingMember = db
    .prepare(`SELECT membership_id, status FROM members WHERE email = ? AND status = 'active'`)
    .get(value.email);
  if (existingMember) {
    return fail(409, "This email already has an active membership. Use the member dashboard.");
  }
  const pending = db
    .prepare(
      `SELECT id FROM membership_applications WHERE email = ? AND status = 'pending'`,
    )
    .get(value.email);
  if (pending) return fail(409, "An application for this email is already pending approval.");

  const submittedAt = nowIso();
  const applicationId = crypto.randomUUID();
  const signatureId = crypto.randomUUID();
  const receiptToken = newToken();
  const publishable = isPublishable(agreementRow.file_status, config);
  const pdfDir = path.join(config.dataDir, "pdfs");
  fs.mkdirSync(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, `${applicationId}.pdf`);
  const pdf = await renderPdf({
    title: agreementRow.title,
    pathway: value.pathway,
    version: agreementRow.version,
    sha256: agreementRow.content_sha256,
    applicationId,
    submittedAt,
    fullLegalName: value.fullLegalName,
    email: value.email,
    region: value.region,
    country: value.country,
    signature: value.signature,
    acknowledgment: ACKNOWLEDGMENT,
    body: agreementRow.body,
    publishable,
  });
  fs.writeFileSync(pdfPath, pdf);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO membership_applications
        (id, pathway, full_legal_name, email, region, country, agreement_version_id, agreement_version,
         agreement_sha256, consent, acknowledgment, status, receipt_token_hash, submitted_at, ip, user_agent, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending', ?, ?, ?, ?, ?)`,
    ).run(
      applicationId,
      value.pathway,
      value.fullLegalName,
      value.email,
      value.region,
      value.country,
      agreementRow.id,
      agreementRow.version,
      agreementRow.content_sha256,
      ACKNOWLEDGMENT,
      hashToken(receiptToken),
      submittedAt,
      meta.ip ?? "",
      (meta.userAgent ?? "").slice(0, 300),
      pdfPath,
    );
    db.prepare(
      `INSERT INTO membership_signatures
        (id, application_id, signature_text, signed_at, agreement_version, acknowledgment_text, content_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      signatureId,
      applicationId,
      value.signature,
      submittedAt,
      agreementRow.version,
      ACKNOWLEDGMENT,
      agreementRow.content_sha256,
    );
    audit(db, {
      actor: "applicant",
      action: "application.submitted",
      entity: "membership_applications",
      entityId: applicationId,
      metadata: {
        pathway: value.pathway,
        agreementVersion: agreementRow.version,
        agreementSha256: agreementRow.content_sha256,
        publicationStatus: publishable ? "published" : "draft",
        signatureId,
      },
      at: submittedAt,
    });
  });

  writeMail(config, {
    to: value.email,
    subject: "Advocacy Launchpad PMA application received",
    text: [
      `${value.fullLegalName},`,
      "",
      "Your application for foundational membership is pending approval.",
      `Pathway: ${value.pathway}`,
      `Agreement version: ${agreementRow.version}`,
      `Submitted: ${formatChicago(submittedAt)}`,
      `UTC: ${submittedAt}`,
      publishable
        ? "The Association still has to accept the application before membership begins."
        : "This covenant version is a draft. The signature is a review record and is not effective membership.",
      "No payment and no wallet were required.",
      "",
      "A PDF copy is available from the membership service with your application receipt.",
    ].join("\n"),
  });

  return {
    status: 201,
    body: {
      applicationId,
      status: "pending",
      receiptToken,
      submittedAt,
      submittedAtChicago: formatChicago(submittedAt),
      agreementVersion: agreementRow.version,
      agreementSha256: agreementRow.content_sha256,
      publicationStatus: publishable ? "published" : "draft",
      effective: false,
      pdfPath: `/api/applications/${applicationId}/pdf`,
    },
  };
}

function applicationByReceipt(db, applicationId, receiptToken) {
  if (!receiptToken) return null;
  const row = db.prepare(`SELECT * FROM membership_applications WHERE id = ?`).get(applicationId);
  if (!row) return null;
  if (row.receipt_token_hash !== hashToken(receiptToken)) return null;
  return row;
}

export function readApplicationStatus(db, applicationId, receiptToken) {
  const row = applicationByReceipt(db, applicationId, receiptToken);
  if (!row) return fail(401, "That application receipt does not match.");
  const member = db.prepare(`SELECT membership_id, status, effective FROM members WHERE application_id = ?`).get(row.id);
  return {
    status: 200,
    body: {
      applicationId: row.id,
      pathway: row.pathway,
      status: row.status,
      agreementVersion: row.agreement_version,
      submittedAt: row.submitted_at,
      submittedAtChicago: formatChicago(row.submitted_at),
      membershipId: member?.membership_id ?? null,
      memberStatus: member?.status ?? null,
      effective: Boolean(member?.effective),
    },
  };
}

export function readApplicationPdf(db, applicationId, receiptToken) {
  const row = applicationByReceipt(db, applicationId, receiptToken);
  if (!row || !row.pdf_path || !fs.existsSync(row.pdf_path)) return fail(401, "That application receipt does not match.");
  return { status: 200, file: row.pdf_path, filename: `${row.pathway}-membership-application.pdf` };
}

function nextMembershipId(db, at) {
  const year = chicagoYear(at);
  const row = db.prepare(`SELECT last_value FROM membership_counters WHERE year = ?`).get(year);
  const next = (row?.last_value ?? 0) + 1;
  if (row) db.prepare(`UPDATE membership_counters SET last_value = ? WHERE year = ?`).run(next, year);
  else db.prepare(`INSERT INTO membership_counters (year, last_value) VALUES (?, ?)`).run(year, next);
  return `ALP-${year}-${String(next).padStart(4, "0")}`;
}

export function decideApplication(db, config, applicationId, body, steward) {
  const { errors, value } = validateDecision(body);
  if (errors.length) return fail(400, errors[0], { errors });
  const application = db.prepare(`SELECT * FROM membership_applications WHERE id = ?`).get(applicationId);
  if (!application) return fail(404, "Application not found.");
  if (application.status !== "pending") return fail(409, "This application has already been decided.");

  const decidedAt = nowIso();
  const agreement = db.prepare(`SELECT file_status FROM agreement_versions WHERE id = ?`).get(application.agreement_version_id);
  const effective = value.decision === "approve" && isPublishable(agreement?.file_status, config) ? 1 : 0;
  let membershipId = null;
  let accessToken = null;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO membership_approvals (id, application_id, decision, decided_by, decided_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), application.id, value.decision, steward, decidedAt, value.notes);
    if (value.decision === "approve") {
      membershipId = nextMembershipId(db, decidedAt);
      accessToken = newToken();
      const memberId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO members
          (id, membership_id, application_id, pathway, full_legal_name, email, status, effective, approved_at, access_token_hash)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      ).run(
        memberId,
        membershipId,
        application.id,
        application.pathway,
        application.full_legal_name,
        application.email,
        effective,
        decidedAt,
        hashToken(accessToken),
      );
      db.prepare(`UPDATE membership_applications SET status = 'approved' WHERE id = ?`).run(application.id);
      audit(db, {
        actor: steward,
        action: "application.approved",
        entity: "members",
        entityId: memberId,
        metadata: { membershipId, effective: Boolean(effective), agreementVersion: application.agreement_version },
        at: decidedAt,
      });
    } else {
      db.prepare(`UPDATE membership_applications SET status = 'rejected' WHERE id = ?`).run(application.id);
      audit(db, {
        actor: steward,
        action: "application.rejected",
        entity: "membership_applications",
        entityId: application.id,
        metadata: { agreementVersion: application.agreement_version },
        at: decidedAt,
      });
    }
  });

  const accessUrl = accessToken ? `${baseUrl(config)}/dashboard?access=${encodeURIComponent(accessToken)}` : "";
  writeMail(config, {
    to: application.email,
    subject:
      value.decision === "approve"
        ? "Advocacy Launchpad PMA membership decision"
        : "Advocacy Launchpad PMA application decision",
    text:
      value.decision === "approve"
        ? [
            `${application.full_legal_name},`,
            "",
            `A steward accepted your application.`,
            `Membership ID: ${membershipId}`,
            `Status: ${effective ? "active and tied to a published covenant" : "recorded against a draft covenant, not yet effective"}`,
            `Decided: ${formatChicago(decidedAt)}`,
            accessUrl ? `Dashboard: ${accessUrl}` : "",
            "Foundational membership does not require payment, Patreon, Hipcamp, or a wallet.",
          ]
            .filter(Boolean)
            .join("\n")
        : [
            `${application.full_legal_name},`,
            "",
            "A steward did not accept this application.",
            value.notes ? `Note: ${value.notes}` : "",
            `Decided: ${formatChicago(decidedAt)}`,
          ]
            .filter(Boolean)
            .join("\n"),
  });

  return {
    status: 200,
    body: {
      applicationId: application.id,
      decision: value.decision,
      membershipId,
      effective: Boolean(effective),
      accessToken,
      decidedAt,
      decidedAtChicago: formatChicago(decidedAt),
    },
  };
}

export function listApplications(db) {
  return db
    .prepare(
      `SELECT a.id, a.pathway, a.full_legal_name, a.email, a.region, a.country, a.agreement_version,
              a.status, a.submitted_at, m.membership_id, m.effective, m.status AS member_status
       FROM membership_applications a
       LEFT JOIN members m ON m.application_id = a.id
       ORDER BY a.submitted_at DESC
       LIMIT 200`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      pathway: row.pathway,
      fullLegalName: row.full_legal_name,
      email: row.email,
      region: row.region,
      country: row.country,
      agreementVersion: row.agreement_version,
      status: row.status,
      submittedAt: row.submitted_at,
      submittedAtChicago: formatChicago(row.submitted_at),
      membershipId: row.membership_id ?? null,
      memberStatus: row.member_status ?? null,
      effective: row.effective == null ? null : Boolean(row.effective),
    }));
}

export function adminPdf(db, applicationId) {
  const row = db.prepare(`SELECT pdf_path, pathway FROM membership_applications WHERE id = ?`).get(applicationId);
  if (!row?.pdf_path || !fs.existsSync(row.pdf_path)) return fail(404, "PDF not found.");
  return { status: 200, file: row.pdf_path, filename: `${row.pathway}-membership-application.pdf` };
}

export function memberFromAccessToken(db, accessToken) {
  if (!accessToken) return null;
  return db.prepare(`SELECT * FROM members WHERE access_token_hash = ?`).get(hashToken(accessToken)) ?? null;
}

function benefitsFor(db, pathway) {
  return db
    .prepare(
      `SELECT id, pathway, kind, title, description, url
       FROM membership_benefits
       WHERE active = 1 AND (pathway = 'all' OR pathway = ?)
       ORDER BY kind, title`,
    )
    .all(pathway)
    .map((row) => ({
      id: row.id,
      pathway: row.pathway,
      kind: row.kind,
      title: row.title,
      description: row.description,
      url: row.url,
    }));
}

export function memberProfile(db, member) {
  const application = db.prepare(`SELECT agreement_version, agreement_sha256, submitted_at FROM membership_applications WHERE id = ?`).get(member.application_id);
  const wallets = db
    .prepare(`SELECT address, chain_id, verified_at, verification_method FROM wallet_connections WHERE member_id = ?`)
    .all(member.id);
  return {
    membershipId: member.membership_id,
    status: member.status,
    effective: Boolean(member.effective),
    pathway: member.pathway,
    fullLegalName: member.full_legal_name,
    email: member.email,
    agreementVersion: application?.agreement_version ?? "",
    agreementSha256: application?.agreement_sha256 ?? "",
    submittedAt: application?.submitted_at ?? member.approved_at,
    approvedAt: member.approved_at,
    approvedAtChicago: formatChicago(member.approved_at),
    wallets: wallets.map((row) => ({
      address: row.address,
      chainId: row.chain_id,
      verifiedAt: row.verified_at,
      verificationMethod: row.verification_method,
    })),
    benefits: benefitsFor(db, member.pathway),
    establishesMembershipByNft: false,
  };
}

export function memberPdf(db, member) {
  return adminPdf(db, member.application_id);
}

export function issueWalletNonce(db, member) {
  const nonce = newToken();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const message = [
    "Advocacy Launchpad PMA wallet check",
    `Membership ID: ${member.membership_id}`,
    `Nonce: ${nonce}`,
    "This signature only proves control of this wallet.",
    "It does not sign the covenant again and does not create membership.",
  ].join("\n");
  db.prepare(
    `INSERT INTO wallet_nonces (id, member_id, nonce, message, expires_at, used) VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(crypto.randomUUID(), member.id, nonce, message, expires);
  return { status: 200, body: { message, expiresAt: expires } };
}

export async function verifyWallet(db, config, member, body) {
  const { errors, value } = validateWallet(body);
  if (errors.length) return fail(400, errors[0], { errors });
  const nonce = db
    .prepare(
      `SELECT * FROM wallet_nonces
       WHERE member_id = ? AND used = 0 AND expires_at > ?
       ORDER BY expires_at DESC LIMIT 1`,
    )
    .get(member.id, nowIso());
  if (!nonce) return fail(400, "Request a new wallet check before signing.");
  const recover = config.recoverAddress ?? recoverPersonalSign;
  let recovered;
  try {
    recovered = String(await recover(nonce.message, value.signature)).toLowerCase();
  } catch {
    return fail(400, "The wallet signature could not be checked.");
  }
  if (recovered !== value.address) return fail(400, "The wallet signature does not match that address.");

  const checkedAt = nowIso();
  const connectionId = crypto.randomUUID();
  db.transaction(() => {
    db.prepare(`UPDATE wallet_nonces SET used = 1 WHERE id = ?`).run(nonce.id);
    db.prepare(
      `INSERT INTO wallet_connections (id, member_id, address, chain_id, verified_at, verification_method)
       VALUES (?, ?, ?, 0, ?, 'eip-191')
       ON CONFLICT(member_id, address, chain_id) DO UPDATE SET
        verified_at = excluded.verified_at,
        verification_method = excluded.verification_method`,
    ).run(connectionId, member.id, value.address, checkedAt);
    audit(db, {
      actor: member.membership_id,
      action: "wallet.verified",
      entity: "wallet_connections",
      entityId: member.id,
      metadata: { address: value.address },
      at: checkedAt,
    });
  });

  const collections = db
    .prepare(
      `SELECT * FROM nft_entitlements
       WHERE active = 1 AND (pathway = 'all' OR pathway = ?)`,
    )
    .all(member.pathway);
  const checks = [];
  if (config.rpcUrl && collections.length) {
    for (const collection of collections) {
      try {
        const balance = await erc721BalanceOf({
          rpcUrl: config.rpcUrl,
          collection: collection.collection_address,
          holder: value.address,
          fetchImpl: config.rpcFetch ?? undefined,
        });
        db.prepare(
          `INSERT INTO nft_checks (id, member_id, collection_id, address, balance, checked_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), member.id, collection.id, value.address, balance, checkedAt);
        checks.push({
          collectionId: collection.id,
          name: collection.name,
          collectionAddress: collection.collection_address,
          chainId: collection.chain_id,
          balance,
          holdsToken: BigInt(balance) > 0n,
          benefits: JSON.parse(collection.benefits_json || '""'),
          establishesMembership: false,
        });
      } catch {
        checks.push({
          collectionId: collection.id,
          name: collection.name,
          collectionAddress: collection.collection_address,
          chainId: collection.chain_id,
          balance: null,
          holdsToken: false,
          error: "This collection could not be checked.",
          establishesMembership: false,
        });
      }
    }
  }

  return {
    status: 200,
    body: {
      address: value.address,
      verified: true,
      keyStored: false,
      nftConfigured: Boolean(config.rpcUrl) && collections.length > 0,
      checks,
      establishesMembership: false,
    },
  };
}

export function addCollection(db, body, steward) {
  const { errors, value } = validateCollection(body);
  if (errors.length) return fail(400, errors[0], { errors });
  const id = crypto.randomUUID();
  const at = nowIso();
  db.prepare(
    `INSERT INTO nft_entitlements
      (id, collection_address, chain_id, name, benefits_json, pathway, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(collection_address, chain_id) DO UPDATE SET
      name = excluded.name,
      benefits_json = excluded.benefits_json,
      pathway = excluded.pathway,
      active = 1`,
  ).run(id, value.collectionAddress, value.chainId, value.name, JSON.stringify(value.benefits), value.pathway);
  audit(db, {
    actor: steward,
    action: "nft.collection_saved",
    entity: "nft_entitlements",
    entityId: value.collectionAddress,
    metadata: { chainId: value.chainId, pathway: value.pathway },
    at,
  });
  return { status: 201, body: { collectionAddress: value.collectionAddress, chainId: value.chainId, name: value.name } };
}

export function listCollections(db) {
  return db
    .prepare(
      `SELECT id, collection_address, chain_id, name, benefits_json, pathway, active
       FROM nft_entitlements ORDER BY name`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      collectionAddress: row.collection_address,
      chainId: row.chain_id,
      name: row.name,
      benefits: JSON.parse(row.benefits_json || '""'),
      pathway: row.pathway,
      active: Boolean(row.active),
    }));
}

export function createInquiry(db, config, member, body) {
  const { errors, value } = validateInquiry(body);
  if (errors.length) return fail(400, errors[0], { errors });
  const id = crypto.randomUUID();
  const at = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO service_inquiries (id, member_id, service_interest, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, member.id, value.serviceInterest, value.message, at);
    audit(db, {
      actor: member.membership_id,
      action: "sow.inquiry",
      entity: "service_inquiries",
      entityId: id,
      metadata: { serviceInterest: value.serviceInterest },
      at,
    });
  });
  writeMail(config, {
    to: "info@adbongo.io",
    subject: "AdBongo Scope of Work inquiry",
    text: [
      `Membership ID: ${member.membership_id}`,
      `Pathway: ${member.pathway}`,
      `Interest: ${value.serviceInterest}`,
      `Submitted: ${formatChicago(at)}`,
      "",
      value.message,
      "",
      "This inquiry does not modify the membership covenant and does not obligate AdBongo LLC.",
    ].join("\n"),
  });
  return {
    status: 201,
    body: {
      inquiryId: id,
      createdAt: at,
      modifiesCovenant: false,
      obligatesAdBongo: false,
    },
  };
}

export function resignMembership(db, member) {
  if (member.status !== "active") return fail(409, "This membership is not active.");
  const at = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE members SET status = 'resigned' WHERE id = ?`).run(member.id);
    audit(db, {
      actor: member.membership_id,
      action: "member.resigned",
      entity: "members",
      entityId: member.id,
      metadata: { survivingObligations: ["confidentiality", "indemnification", "non-circumvention", "dispute-resolution"] },
      at,
    });
  });
  return {
    status: 200,
    body: {
      membershipId: member.membership_id,
      status: "resigned",
      resignedAt: at,
      survivingObligationsRemain: true,
    },
  };
}

export function listAudit(db) {
  return db
    .prepare(
      `SELECT id, actor, action, entity, entity_id, metadata_json, created_at
       FROM membership_audit_events ORDER BY created_at DESC LIMIT 200`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      metadata: JSON.parse(row.metadata_json),
      createdAt: row.created_at,
    }));
}
