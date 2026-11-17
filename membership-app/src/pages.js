import { ACKNOWLEDGMENT } from "./agreements.js";
import { renderMarkdown } from "./markdown.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const PATHWAYS = {
  adbongo: {
    name: "AdBongo",
    kicker: "Legal engineering and sovereign AI",
    lede: "This is the free foundational membership of the Advocacy Launchpad Private Membership Association, opened from the AdBongo pathway. It covers a private contractual relationship for legal engineering, technology-enabled advocacy, education, research, and sovereign AI. No religious belief is required. Membership does not create an attorney-client relationship and does not hire AdBongo LLC.",
  },
  temple: {
    name: "Temple of Roots",
    kicker: "Nature-based ministry and sanctuary",
    lede: "This is the free foundational membership of the Advocacy Launchpad Private Membership Association, opened from the Temple of Roots pathway. It is for people choosing to associate for nature-based spiritual life, sanctuary hospitality, education, and regenerative living. A stay, a class, or a rite needs its own reservation or consent.",
  },
};

function layout({ title, pathway, main }) {
  const theme = pathway ? ` data-pathway="${pathway}"` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body${theme}>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="wrap header-row">
      <a class="brand" href="/">Advocacy Launchpad PMA</a>
      <nav aria-label="Pathways">
        <a href="/adbongo">AdBongo</a>
        <a href="/temple">Temple of Roots</a>
        <a href="/dashboard">Member record</a>
      </nav>
    </div>
  </header>
  <main id="main">${main}</main>
  <footer class="site-footer">
    <div class="wrap">
      <p>Draft membership service for counsel and stewards. Foundational membership does not require a payment, a wallet, Patreon, or Hipcamp. AdBongo LLC remains a separate company. This software does not decide tax, securities, or professional-relationship questions.</p>
    </div>
  </footer>
</body>
</html>`;
}

export function renderHome(agreements) {
  const cards = agreements
    .map((agreement) => {
      const copy = PATHWAYS[agreement.pathway];
      const href = agreement.pathway === "adbongo" ? "/adbongo" : "/temple";
      return `<article class="card">
        <p class="kicker">${escapeHtml(copy.kicker)}</p>
        <h2><a href="${href}">${escapeHtml(copy.name)}</a></h2>
        <p>${escapeHtml(copy.lede)}</p>
        <p class="meta">Version ${escapeHtml(agreement.version)} · ${agreement.effective ? "Published" : "Draft, not in effect"}</p>
        <a class="button" href="${href}">Review and apply</a>
      </article>`;
    })
    .join("");
  return layout({
    title: "Advocacy Launchpad PMA membership",
    main: `<section class="wrap narrow">
      <p class="banner">Draft for legal review. These covenants are not approved and are not in effect. The live AdBongo and Temple of Roots websites are unchanged.</p>
      <h1>Foundational membership is free.</h1>
      <p class="lede">Two doors, one Association. You can read the whole covenant and apply with an electronic signature. A steward accepts or declines the application. Patreon, Hipcamp, a Sovereign AI NFT, and an AdBongo Scope of Work are optional and come after acceptance, if you want them.</p>
      <div class="cards">${cards}</div>
    </section>`,
  });
}

export function renderJoin({ pathway, agreement, covenantHtml, error = "" }) {
  const copy = PATHWAYS[pathway];
  const banner = agreement.effective
    ? ""
    : `<p class="banner">Draft for legal review. Submitting a signature creates a review record. It does not create effective membership until counsel approves the text, the Association publishes that version, and a steward accepts the application.</p>`;
  const errorHtml = error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : "";
  return layout({
    title: `${copy.name} membership`,
    pathway,
    main: `<section class="wrap narrow">
      ${banner}
      <p class="kicker">${escapeHtml(copy.kicker)}</p>
      <h1>${escapeHtml(copy.name)} membership</h1>
      <p class="lede">${escapeHtml(copy.lede)}</p>
      <p class="meta">Version ${escapeHtml(agreement.version)}</p>
      <p class="meta">Ricardian identifier <code>${escapeHtml(agreement.ricardian.proseSha256)}</code></p>
      <p class="meta">A lawyer reads the covenant below. A program reads <a href="/api/agreements/${escapeHtml(pathway)}">the same covenant</a>, divided at the same headings. The identifier is the SHA-256 of that prose. Your name, email, location, and signature are parameters bound when you sign. They are not written on a public ledger.</p>
      <article class="covenant" aria-label="Complete membership covenant">
        ${covenantHtml}
      </article>
      ${errorHtml}
      <form class="stack" method="post" action="/api/applications" id="join-form">
        <input type="hidden" name="pathway" value="${escapeHtml(pathway)}">
        <input type="hidden" name="agreementVersion" value="${escapeHtml(agreement.version)}">
        <label>Full legal name <input name="fullLegalName" id="full-legal-name" autocomplete="name" required maxlength="200"></label>
        <label>Email address <input name="email" id="email" type="email" autocomplete="email" required maxlength="320"></label>
        <div class="split">
          <label>State or province <input name="region" id="region" autocomplete="address-level1" required maxlength="120"></label>
          <label>Country <input name="country" id="country" autocomplete="country-name" required maxlength="120"></label>
        </div>
        <label class="check"><input type="checkbox" name="consent" value="true" required> I have reviewed the complete covenant above, and I consent to use an electronic signature for this application.</label>
        <label class="check"><input type="checkbox" name="acknowledgmentAccepted" value="true" required> ${escapeHtml(ACKNOWLEDGMENT)}</label>
        <label>Electronic signature <input name="signature" id="signature" autocomplete="name" required maxlength="200" placeholder="Type your legal name as your signature"></label>
        <p class="meta">No payment, donation, subscription, wallet, or NFT is required.</p>
        <button type="submit">Submit application for approval</button>
      </form>
      <div id="result" class="card" hidden></div>
    </section>
    <script src="/app.js"></script>`,
  });
}

export function joinPage(pathway, agreement, error) {
  return renderJoin({
    pathway,
    agreement,
    covenantHtml: renderMarkdown(agreement.body),
    error,
  });
}

export function renderReceived({ application, receiptToken }) {
  const effectiveNote = application.effective
    ? "A steward has accepted this application on a published covenant."
    : "Acceptance by a steward is still required. If the covenant is a draft, acceptance records the application and does not make membership effective.";
  return layout({
    title: "Application received",
    pathway: application.pathway,
    main: `<section class="wrap narrow">
      <p class="banner">Status: pending approval</p>
      <h1>Application received</h1>
      <p>${escapeHtml(effectiveNote)}</p>
      <dl class="facts">
        <div><dt>Status</dt><dd>${escapeHtml(application.status)}</dd></div>
        <div><dt>Submitted</dt><dd>${escapeHtml(application.submittedAtChicago)}</dd></div>
        <div><dt>Version</dt><dd>${escapeHtml(application.agreementVersion)}</dd></div>
        <div><dt>Ricardian identifier</dt><dd><code>${escapeHtml(application.ricardian?.proseSha256 ?? "")}</code></dd></div>
        <div><dt>Signature lock</dt><dd>${application.ricardian?.verified ? "Intact" : "Does not match the stored prose"}</dd></div>
      </dl>
      <p><a class="button" href="/api/applications/${escapeHtml(application.applicationId)}/pdf?receipt=${encodeURIComponent(receiptToken)}">Download the signed PDF</a></p>
      <p class="meta">Keep this page's address if you want the PDF again. It contains your receipt. The Association does not ask for a wallet or a payment to finish this step.</p>
    </section>`,
  });
}

export { renderMarkdown };
