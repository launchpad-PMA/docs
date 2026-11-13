function chicago(iso) {
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso))} CT`;
}

async function api(path, options = {}) {
  const headers = { accept: "application/json", ...(options.headers || {}) };
  if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request was not accepted.");
  return data;
}

function line(parent, text) {
  const p = document.createElement("p");
  p.textContent = text;
  parent.append(p);
  return p;
}

const joinForm = document.querySelector("#join-form");
if (joinForm) {
  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = document.querySelector("#result");
    result.hidden = false;
    result.className = "card";
    result.replaceChildren();
    const button = joinForm.querySelector("button");
    button.disabled = true;
    const payload = {
      pathway: joinForm.pathway.value,
      agreementVersion: joinForm.agreementVersion.value,
      fullLegalName: joinForm.fullLegalName.value,
      email: joinForm.email.value,
      region: joinForm.region.value,
      country: joinForm.country.value,
      consent: joinForm.consent.checked,
      acknowledgmentAccepted: joinForm.acknowledgmentAccepted.checked,
      signature: joinForm.signature.value,
    };
    try {
      const body = await api("/api/applications", { method: "POST", body: JSON.stringify(payload) });
      result.classList.add("ok");
      line(result, "Application received. Status: pending approval.");
      line(result, `Submitted ${body.submittedAtChicago}.`);
      line(result, body.publicationStatus === "published"
        ? "A steward still has to accept the application."
        : "This covenant is a draft. The signature is a review record and is not effective membership.");
      const link = document.createElement("a");
      link.className = "button";
      link.href = `/api/applications/${body.applicationId}/pdf?receipt=${encodeURIComponent(body.receiptToken)}`;
      link.textContent = "Download the signed PDF";
      result.append(link);
    } catch (error) {
      result.classList.add("error");
      line(result, error.message);
    } finally {
      button.disabled = false;
    }
  });
}

async function loadDashboard() {
  const root = document.querySelector("#dashboard");
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const access = params.get("access");
  if (access) {
    await api("/api/member/session", { method: "POST", body: JSON.stringify({ accessToken: access }) });
    history.replaceState({}, "", "/dashboard");
  }
  const tokenField = document.querySelector("#access-token");
  if (tokenField?.value) {
    await api("/api/member/session", { method: "POST", body: JSON.stringify({ accessToken: tokenField.value }) });
    tokenField.value = "";
  }
  const profile = await api("/api/member/me");
  root.replaceChildren();
  const status = document.createElement("p");
  status.className = profile.effective ? "ok" : "banner";
  status.textContent = profile.effective
    ? `${profile.status} · ${profile.membershipId}`
    : `${profile.status} · ${profile.membershipId} · recorded on a draft covenant and not yet effective`;
  root.append(status);
  const facts = document.createElement("dl");
  facts.className = "facts";
  for (const [dt, dd] of [
    ["Membership ID", profile.membershipId],
    ["Status", profile.status],
    ["Pathway", profile.pathway],
    ["Accepted", chicago(profile.approvedAt)],
    ["Covenant", profile.agreementVersion],
  ]) {
    const wrap = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = dt;
    const detail = document.createElement("dd");
    detail.textContent = dd;
    wrap.append(term, detail);
    facts.append(wrap);
  }
  root.append(facts);
  const pdf = document.createElement("a");
  pdf.className = "button";
  pdf.href = "/api/member/pdf";
  pdf.textContent = "Download signed covenant PDF";
  root.append(pdf);

  const benefits = document.createElement("div");
  benefits.className = "cards";
  for (const benefit of profile.benefits) {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h2");
    title.textContent = benefit.title;
    const copy = document.createElement("p");
    copy.textContent = benefit.description;
    card.append(title, copy);
    if (benefit.url) {
      const link = document.createElement("a");
      link.href = benefit.url;
      link.rel = "noopener noreferrer";
      link.textContent = benefit.kind === "hipcamp" ? "Open booking" : benefit.kind === "patreon" ? "Open Patreon" : "Open";
      card.append(link);
    } else if (benefit.kind === "hipcamp" || benefit.kind === "patreon") {
      const note = document.createElement("p");
      note.className = "meta";
      note.textContent = "The Association has not published a link for this optional benefit.";
      card.append(note);
    }
    benefits.append(card);
  }
  root.append(benefits);

  const nft = document.createElement("section");
  nft.className = "panel";
  const nftTitle = document.createElement("h2");
  nftTitle.textContent = "Sovereign AI NFT check";
  nft.append(nftTitle);
  line(nft, "Connecting a wallet is optional. The check does not create membership and does not send a private key.");
  if (profile.wallets.length) {
    line(nft, `Verified address: ${profile.wallets.map((item) => item.address).join(", ")}`);
  }
  const connect = document.createElement("button");
  connect.type = "button";
  connect.textContent = "Verify a wallet";
  connect.addEventListener("click", () => verifyWallet(nft));
  nft.append(connect);
  const nftResult = document.createElement("div");
  nftResult.id = "nft-result";
  nft.append(nftResult);
  root.append(nft);

  const sow = document.createElement("form");
  sow.className = "panel";
  const sowTitle = document.createElement("h2");
  sowTitle.textContent = "AdBongo service inquiry";
  const interest = document.createElement("input");
  interest.name = "serviceInterest";
  interest.required = true;
  interest.maxLength = 200;
  interest.placeholder = "What kind of work";
  const message = document.createElement("textarea");
  message.name = "message";
  message.required = true;
  message.maxLength = 4000;
  message.placeholder = "Describe the work. This does not hire AdBongo LLC.";
  const sowButton = document.createElement("button");
  sowButton.type = "submit";
  sowButton.textContent = "Send a separate inquiry";
  sow.append(sowTitle, interest, message, sowButton);
  sow.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = await api("/api/member/sow", {
      method: "POST",
      body: JSON.stringify({ serviceInterest: interest.value, message: message.value }),
    });
    line(sow, body.obligatesAdBongo ? "Unexpected obligation flag." : "Inquiry recorded. It does not change the covenant and does not obligate AdBongo LLC.");
    sow.reset();
  });
  root.append(sow);

  const resign = document.createElement("button");
  resign.type = "button";
  resign.className = "secondary";
  resign.textContent = "Resign membership";
  resign.addEventListener("click", async () => {
    if (!confirm("Resign this membership? Surviving obligations remain.")) return;
    const body = await api("/api/member/resign", { method: "POST", body: "{}" });
    line(root, `Status: ${body.status}. Surviving obligations remain.`);
  });
  root.append(resign);
}

async function verifyWallet(container) {
  const result = document.querySelector("#nft-result");
  result.replaceChildren();
  if (!window.ethereum) {
    line(result, "No wallet was found in this browser. Foundational membership does not need one.");
    return;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts[0];
  const nonce = await api("/api/member/wallet/nonce", { method: "POST", body: "{}" });
  const signature = await window.ethereum.request({ method: "personal_sign", params: [nonce.message, address] });
  const checked = await api("/api/member/wallet/verify", {
    method: "POST",
    body: JSON.stringify({ address, signature }),
  });
  line(result, checked.establishesMembership
    ? "Unexpected membership flag."
    : "Wallet verified. This does not create or replace membership.");
  if (!checked.nftConfigured) line(result, "No designated collection is configured for a balance check.");
  for (const check of checked.checks) {
    line(result, `${check.name}: ${check.holdsToken ? "token observed" : "no token observed"}. Membership is unchanged.`);
  }
}

async function bootDashboard() {
  const gate = document.querySelector("#member-gate");
  const root = document.querySelector("#dashboard");
  if (!root) return;
  try {
    await loadDashboard();
    gate.hidden = true;
  } catch (error) {
    gate.hidden = false;
    const message = document.querySelector("#member-message");
    if (location.search || document.querySelector("#access-token")?.value) message.textContent = error.message;
  }
}

document.querySelector("#member-gate")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await bootDashboard();
});

async function loadAdmin() {
  const table = document.querySelector("#applications");
  if (!table) return;
  const body = await api("/api/admin/applications");
  const tbody = table.querySelector("tbody");
  tbody.replaceChildren();
  for (const application of body.applications) {
    const row = document.createElement("tr");
    for (const value of [
      application.fullLegalName,
      application.email,
      application.pathway,
      application.status,
      application.submittedAtChicago,
      application.membershipId || "",
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const actions = document.createElement("td");
    if (application.status === "pending") {
      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = "Approve";
      approve.addEventListener("click", () => decide(application.id, "approve"));
      const reject = document.createElement("button");
      reject.type = "button";
      reject.className = "secondary";
      reject.textContent = "Reject";
      reject.addEventListener("click", () => decide(application.id, "reject"));
      actions.append(approve, reject);
    }
    const pdf = document.createElement("a");
    pdf.href = `/api/admin/applications/${application.id}/pdf`;
    pdf.textContent = "PDF";
    actions.append(pdf);
    row.append(actions);
    tbody.append(row);
  }
  const collections = await api("/api/admin/nft-collections");
  const list = document.querySelector("#collections");
  list.replaceChildren();
  for (const collection of collections.collections) {
    const item = document.createElement("li");
    item.textContent = `${collection.name} · chain ${collection.chainId} · ${collection.collectionAddress}`;
    list.append(item);
  }
}

async function decide(id, decision) {
  const notes = document.querySelector("#decision-notes").value;
  const result = await api(`/api/admin/applications/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, notes }),
  });
  const note = document.querySelector("#decision-result");
  note.hidden = false;
  note.replaceChildren();
  if (result.membershipId) {
    line(note, `${result.membershipId} recorded. ${result.effective ? "The covenant version is published." : "The covenant is still a draft, so this record is not effective."}`);
    const link = document.createElement("a");
    link.href = `/dashboard?access=${encodeURIComponent(result.accessToken)}`;
    link.textContent = "Open the member record";
    note.append(link);
  } else {
    line(note, "Application declined. No membership id was issued.");
  }
  await loadAdmin();
}

document.querySelector("#admin-login")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#admin-message");
  try {
    await api("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({ token: document.querySelector("#admin-token").value }),
    });
    document.querySelector("#admin-token").value = "";
    document.querySelector("#admin-login").hidden = true;
    document.querySelector("#admin-app").hidden = false;
    message.textContent = "";
    message.className = "";
    await loadAdmin();
  } catch (error) {
    message.className = "error";
    message.textContent = error.message;
  }
});

document.querySelector("#collection-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  await api("/api/admin/nft-collections", {
    method: "POST",
    body: JSON.stringify({
      name: form.name.value,
      collectionAddress: form.collectionAddress.value,
      chainId: Number(form.chainId.value),
      pathway: form.pathway.value,
      benefits: form.benefits.value,
    }),
  });
  form.reset();
  await loadAdmin();
});

if (document.body.dataset.page === "dashboard") bootDashboard();
if (document.body.dataset.page === "admin") {
  loadAdmin().catch(() => {
    document.querySelector("#admin-app").hidden = true;
  });
}
