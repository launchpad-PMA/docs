import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Wallet } from "ethers";
import { ACKNOWLEDGMENT } from "../src/agreements.js";
import { createApp, listen } from "../src/app.js";
import { balanceOfData, erc721BalanceOf, recoverPersonalSign } from "../src/nft.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

async function start(overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pma-membership-"));
  const app = createApp({
    dataDir,
    adminToken: "steward-test-token",
    port: 0,
    host: "127.0.0.1",
    rateLimit: false,
    publicBaseUrl: "http://127.0.0.1",
    publication: "draft",
    rpcUrl: "",
    patreonUrlAdbongo: "",
    hipcampUrl: "",
    ...overrides,
  });
  const address = await listen(app);
  return { app, base: `http://127.0.0.1:${address.port}`, dataDir };
}

async function api(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json();
  return { response, data };
}

function application(overrides = {}) {
  return {
    pathway: "adbongo",
    agreementVersion: "1.0-draft",
    fullLegalName: "Ada Applicant",
    email: "ada@example.com",
    region: "Texas",
    country: "United States",
    consent: true,
    acknowledgmentAccepted: true,
    signature: "Ada Applicant",
    ...overrides,
  };
}

test("drafts keep the required clauses and leave the source covenant in place", () => {
  const source = read("membership-covenant");
  const adbongo = read("agreements/adbongo-pma-membership-covenant-v1.0-draft.md");
  const temple = read("agreements/temple-of-roots-pma-membership-covenant-v1.0-draft.md");
  const redline = read("agreements/redline-against-source-covenant.md");
  assert.match(source, /minimum of \*\*100 years\*\*/);
  assert.match(source, /exclusive jurisdiction under private membership law/);
  for (const text of [adbongo, temple]) {
    assert.match(text, /DRAFT FOR LEGAL REVIEW/);
    assert.match(text, /Foundational membership is free/);
    assert.match(text, /It is not a 100-year commitment/);
    assert.ok(text.includes(ACKNOWLEDGMENT));
    assert.match(text, /Membership does not, by itself, alter citizenship or other legal status or displace mandatory law/);
    assert.match(text, /exclusive jurisdiction under private membership law, separate from statutory or maritime jurisdictions/);
    assert.match(text, /not to disclose Association matters or fellow members' information to non-members or public authorities/);
    assert.match(text, /Lex Mercatoria/);
    assert.match(text, /public person to a private member/);
    assert.match(text, /U\.S\. SEC Code/);
    assert.match(text, /The parties may mutually agree in writing to the appointment of an independent arbitrator or alternative arbitration forum/);
    assert.match(text, /Kleros/);
    assert.match(text, /Prospera/);
    assert.match(text, /Proposed fallback — not adopted/);
    assert.match(text, /Each member indemnifies and holds harmless/);
    assert.match(text, /Membership in the Advocacy Launchpad Private Membership Association establishes a private contractual relationship/);
    assert.match(text, /does not take custody of private keys/);
    assert.doesNotMatch(text, /minimum of \*\*100 years\*\*/);
  }
  assert.match(adbongo, /No religious belief is required/);
  assert.match(adbongo, /does not create an attorney-client relationship/);
  assert.match(adbongo, /AdBongo LLC is a separate limited liability company/);
  assert.match(temple, /freedom of association and religious exercise/i);
  assert.match(temple, /sanctuary/i);
  assert.match(temple, /informed consent/i);
  assert.match(redline, /100 years/);
  assert.match(read("agreements/optional-indemnification-alternative.md"), /not adopted/);
  assert.match(read("agreements/hats-protocol-review.md"), /AGPL/);
  assert.match(read("agreements/hats-protocol-review.md"), /not be a prerequisite/);
});

test("wallet recovery and balance encoding do not need a live network", async () => {
  const wallet = Wallet.createRandom();
  const message = "Advocacy Launchpad PMA wallet check";
  const signature = await wallet.signMessage(message);
  assert.equal(await recoverPersonalSign(message, signature), wallet.address.toLowerCase());
  const data = balanceOfData(wallet.address);
  assert.equal(data.slice(0, 10), "0x70a08231");
  assert.equal(data.length, 74);
  const balance = await erc721BalanceOf({
    rpcUrl: "http://127.0.0.1:8545",
    collection: `0x${"ab".repeat(20)}`,
    holder: wallet.address,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.method, "eth_call");
      assert.equal(JSON.stringify(body).includes("@"), false);
      return { ok: true, json: async () => ({ result: "0x02" }) };
    },
  });
  assert.equal(balance, "2");
});

test("enrollment, approval, dashboard, and NFT checks", async () => {
  const started = await start();
  try {
    const health = await api(started.base, "/api/health");
    assert.equal(health.data.acknowledgment, ACKNOWLEDGMENT);

    const adbongoPage = await fetch(`${started.base}/adbongo`);
    const adbongoHtml = await adbongoPage.text();
    assert.equal(adbongoPage.status, 200);
    assert.match(adbongoHtml, /Full legal name/);
    assert.match(adbongoHtml, /Email address/);
    assert.match(adbongoHtml, /State or province/);
    assert.match(adbongoHtml, /Country/);
    assert.match(adbongoHtml, /Electronic signature/);
    assert.ok(adbongoHtml.includes(ACKNOWLEDGMENT));
    assert.match(adbongoHtml, /No religious belief is required/);
    assert.match(adbongoHtml, /complete membership covenant/i);
    assert.match(adbongoHtml, /Optional Blockchain Credentials/);
    assert.ok(adbongoHtml.indexOf("Optional Blockchain Credentials") < adbongoHtml.indexOf("join-form"));

    const templeHtml = await (await fetch(`${started.base}/temple`)).text();
    assert.match(templeHtml, /Temple of Roots membership/);
    assert.match(templeHtml, /sanctuary/i);
    assert.ok(templeHtml.includes("1.0-draft"));

    const missing = await api(started.base, "/api/applications", {
      method: "POST",
      body: JSON.stringify(application({ consent: false, email: "missing@example.com" })),
    });
    assert.equal(missing.response.status, 400);

    const secret = await api(started.base, "/api/applications", {
      method: "POST",
      body: JSON.stringify(application({ email: "secret@example.com", privateKey: "0xabc" })),
    });
    assert.equal(secret.response.status, 400);
    assert.match(secret.data.error, /not stored/);

    const stale = await api(started.base, "/api/applications", {
      method: "POST",
      body: JSON.stringify(application({ email: "stale@example.com", agreementVersion: "1999" })),
    });
    assert.equal(stale.response.status, 400);

    const created = await api(started.base, "/api/applications", {
      method: "POST",
      body: JSON.stringify(application()),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.status, "pending");
    assert.equal(created.data.effective, false);
    assert.equal(created.data.publicationStatus, "draft");
    assert.match(created.data.submittedAtChicago, /CT$/);

    const pdf = await fetch(`${started.base}${created.data.pdfPath}?receipt=${created.data.receiptToken}`);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    assert.equal(pdf.status, 200);
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    const hiddenPdf = await fetch(`${started.base}${created.data.pdfPath}`);
    assert.equal(hiddenPdf.status, 401);

    const locked = await api(started.base, "/api/admin/applications");
    assert.equal(locked.response.status, 401);
    const queue = await api(started.base, "/api/admin/applications", {
      headers: { authorization: "Bearer steward-test-token" },
    });
    assert.equal(queue.data.applications.length, 1);

    const duplicate = await api(started.base, "/api/applications", {
      method: "POST",
      body: JSON.stringify(application({ pathway: "temple" })),
    });
    assert.equal(duplicate.response.status, 409);

    const approved = await api(started.base, `/api/admin/applications/${created.data.applicationId}/decision`, {
      method: "POST",
      headers: { authorization: "Bearer steward-test-token" },
      body: JSON.stringify({ decision: "approve", notes: "Review copy" }),
    });
    assert.equal(approved.response.status, 200);
    assert.match(approved.data.membershipId, /^ALP-\d{4}-\d{4}$/);
    assert.equal(approved.data.effective, false);
    assert.ok(approved.data.accessToken);

    const denied = await api(started.base, "/api/member/me");
    assert.equal(denied.response.status, 401);
    const me = await api(started.base, "/api/member/me", {
      headers: { authorization: `Bearer ${approved.data.accessToken}` },
    });
    assert.equal(me.data.membershipId, approved.data.membershipId);
    assert.equal(me.data.effective, false);
    assert.equal(me.data.establishesMembershipByNft, false);
    assert.ok(me.data.benefits.some((benefit) => benefit.kind === "foundational"));
    assert.ok(me.data.benefits.some((benefit) => benefit.kind === "patreon"));
    const hipcamp = me.data.benefits.find((benefit) => benefit.kind === "hipcamp");
    assert.equal(hipcamp.url, "");

    const memberPdf = await fetch(`${started.base}/api/member/pdf`, {
      headers: { authorization: `Bearer ${approved.data.accessToken}` },
    });
    assert.equal(memberPdf.status, 200);

    const inquiry = await api(started.base, "/api/member/sow", {
      method: "POST",
      headers: { authorization: `Bearer ${approved.data.accessToken}` },
      body: JSON.stringify({
        serviceInterest: "Governance architecture",
        message: "Please send a separate scope of work for a workshop.",
      }),
    });
    assert.equal(inquiry.response.status, 201);
    assert.equal(inquiry.data.modifiesCovenant, false);
    assert.equal(inquiry.data.obligatesAdBongo, false);

    const membersBeforeNft = started.app.db.prepare("SELECT COUNT(*) AS n FROM members").get().n;
    const stranger = await api(started.base, "/api/nft/claim", {
      method: "POST",
      body: JSON.stringify({ address: `0x${"11".repeat(20)}` }),
    });
    assert.equal(stranger.response.status, 404);
    assert.equal(started.app.db.prepare("SELECT COUNT(*) AS n FROM members").get().n, membersBeforeNft);

    const walletAddress = `0x${"22".repeat(20)}`;
    await api(started.base, "/api/admin/nft-collections", {
      method: "POST",
      headers: { authorization: "Bearer steward-test-token" },
      body: JSON.stringify({
        name: "Sovereign AI sample",
        collectionAddress: `0x${"ab".repeat(20)}`,
        chainId: 1,
        pathway: "all",
        benefits: "Optional digital resource access",
      }),
    });
    const nonce = await api(started.base, "/api/member/wallet/nonce", {
      method: "POST",
      headers: { authorization: `Bearer ${approved.data.accessToken}` },
      body: "{}",
    });
    const unauthenticatedWallet = await api(started.base, "/api/member/wallet/verify", {
      method: "POST",
      body: JSON.stringify({ address: walletAddress, signature: "nope" }),
    });
    assert.equal(unauthenticatedWallet.response.status, 401);

    started.app.config.rpcUrl = "http://127.0.0.1:8545";
    started.app.config.recoverAddress = async () => walletAddress;
    let rpcSawEmail = false;
    started.app.config.rpcFetch = async (_url, options) => {
      rpcSawEmail = options.body.includes("ada@example.com") || options.body.includes("Ada Applicant");
      return { ok: true, json: async () => ({ result: "0x01" }) };
    };
    const verified = await api(started.base, "/api/member/wallet/verify", {
      method: "POST",
      headers: { authorization: `Bearer ${approved.data.accessToken}` },
      body: JSON.stringify({ address: walletAddress, signature: "signed-in-test" }),
    });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.data.keyStored, false);
    assert.equal(verified.data.establishesMembership, false);
    assert.equal(verified.data.checks[0].holdsToken, true);
    assert.equal(verified.data.checks[0].establishesMembership, false);
    assert.equal(rpcSawEmail, false);
    assert.equal(started.app.db.prepare("SELECT COUNT(*) AS n FROM members").get().n, membersBeforeNft);

    const columns = started.app.db.prepare("PRAGMA table_info(wallet_connections)").all();
    assert.equal(columns.some((column) => /private|mnemonic|seed|secret/i.test(column.name)), false);

    const resigned = await api(started.base, "/api/member/resign", {
      method: "POST",
      headers: { authorization: `Bearer ${approved.data.accessToken}` },
      body: "{}",
    });
    assert.equal(resigned.data.status, "resigned");
    assert.equal(resigned.data.survivingObligationsRemain, true);

    const rejectedApplication = await api(started.base, "/api/applications", {
      method: "POST",
      body: JSON.stringify(application({ email: "reject@example.com", fullLegalName: "Ree Ject", signature: "Ree Ject" })),
    });
    const rejected = await api(started.base, `/api/admin/applications/${rejectedApplication.data.applicationId}/decision`, {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
      body: JSON.stringify({ decision: "reject" }),
    });
    assert.equal(rejected.response.status, 401);
    const realRejection = await api(started.base, `/api/admin/applications/${rejectedApplication.data.applicationId}/decision`, {
      method: "POST",
      headers: { authorization: "Bearer steward-test-token" },
      body: JSON.stringify({ decision: "reject", notes: "Not accepted" }),
    });
    assert.equal(realRejection.response.status, 200);
    assert.equal(realRejection.data.membershipId, null);

    const outbox = fs.readdirSync(path.join(started.dataDir, "outbox"));
    assert.ok(outbox.length >= 2);
    const audit = started.app.db.prepare("SELECT action FROM membership_audit_events").all().map((row) => row.action);
    assert.ok(audit.includes("application.submitted"));
    assert.ok(audit.includes("application.approved"));
    assert.ok(audit.includes("wallet.verified"));
    assert.ok(audit.includes("sow.inquiry"));
  } finally {
    await started.app.close();
  }
});

test("a published flag does not make a draft covenant effective", async () => {
  const draftFlag = await start({ publication: "published" });
  try {
    const created = await api(draftFlag.base, "/api/applications", {
      method: "POST",
      body: JSON.stringify(application({ email: "draft-flag@example.com" })),
    });
    const approved = await api(draftFlag.base, `/api/admin/applications/${created.data.applicationId}/decision`, {
      method: "POST",
      headers: { authorization: "Bearer steward-test-token" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(approved.data.effective, false);

    draftFlag.app.db.prepare("UPDATE agreement_versions SET file_status = 'approved'").run();
    const second = await api(draftFlag.base, "/api/applications", {
      method: "POST",
      body: JSON.stringify(application({ email: "approved-text@example.com", fullLegalName: "Ann Proved", signature: "Ann Proved" })),
    });
    const live = await api(draftFlag.base, `/api/admin/applications/${second.data.applicationId}/decision`, {
      method: "POST",
      headers: { authorization: "Bearer steward-test-token" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(live.data.effective, true);
    assert.match(live.data.membershipId, /^ALP-/);
  } finally {
    await draftFlag.app.close();
  }
});

test("an HTML form post can submit without script", async () => {
  const started = await start();
  try {
    const params = new URLSearchParams(application({
      email: "form@example.com",
      fullLegalName: "Form User",
      signature: "Form User",
      consent: "true",
      acknowledgmentAccepted: "true",
    }));
    const response = await fetch(`${started.base}/api/applications`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
      body: params,
      redirect: "manual",
    });
    assert.equal(response.status, 303);
    assert.match(response.headers.get("location"), /^\/received\?/);
  } finally {
    await started.app.close();
  }
});
