const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

const SECRET_FIELDS = ["privateKey", "private_key", "mnemonic", "seed", "seedPhrase", "secretKey"];

export function rejectSecrets(body) {
  if (!body || typeof body !== "object") return null;
  for (const field of SECRET_FIELDS) {
    if (Object.hasOwn(body, field) && body[field]) {
      return "Private keys and seed phrases are not accepted and are not stored.";
    }
  }
  return null;
}

export function validateApplication(body, agreement) {
  const errors = [];
  const secret = rejectSecrets(body);
  if (secret) errors.push(secret);
  const fullLegalName = String(body.fullLegalName ?? "").trim().replace(/\s+/g, " ");
  const email = String(body.email ?? "").trim().toLowerCase();
  const region = String(body.region ?? "").trim().replace(/\s+/g, " ");
  const country = String(body.country ?? "").trim().replace(/\s+/g, " ");
  const signature = String(body.signature ?? "").trim().replace(/\s+/g, " ");
  const pathway = String(body.pathway ?? "").trim();
  if (pathway !== "adbongo" && pathway !== "temple") errors.push("Choose a membership pathway.");
  if (agreement && pathway && pathway !== agreement.pathway) errors.push("The pathway does not match the covenant.");
  if (fullLegalName.length < 3 || fullLegalName.length > 200) errors.push("Enter your full legal name.");
  if (!EMAIL.test(email) || email.length > 320) errors.push("Enter a valid email address.");
  if (region.length < 2 || region.length > 120) errors.push("Enter your state or province.");
  if (country.length < 2 || country.length > 120) errors.push("Enter your country.");
  if (!agreement) errors.push("This pathway does not have a covenant on file.");
  if (agreement && String(body.agreementVersion ?? "") !== agreement.version) {
    errors.push("The covenant on the page is out of date. Review the current version and sign again.");
  }
  if (body.consent !== true) errors.push("Consent is required.");
  if (body.acknowledgmentAccepted !== true) errors.push("The acknowledgment is required.");
  if (signature.length < 2 || signature.length > 200) errors.push("Enter your electronic signature.");
  return {
    errors,
    value: { pathway, fullLegalName, email, region, country, signature, agreementVersion: agreement?.version ?? "" },
  };
}

export function validateDecision(body) {
  const decision = String(body.decision ?? "");
  const notes = String(body.notes ?? "").trim();
  const errors = [];
  if (decision !== "approve" && decision !== "reject") errors.push("Decision must be approve or reject.");
  if (notes.length > 2000) errors.push("Notes are too long.");
  return { errors, value: { decision, notes } };
}

export function validateWallet(body) {
  const errors = [];
  const secret = rejectSecrets(body);
  if (secret) errors.push(secret);
  const address = String(body.address ?? "").trim();
  const signature = String(body.signature ?? "").trim();
  if (!ADDRESS.test(address)) errors.push("Enter a compatible wallet address.");
  if (signature.length < 2 || signature.length > 1000) errors.push("The wallet signature is missing.");
  return { errors, value: { address: address.toLowerCase(), signature } };
}

export function validateCollection(body) {
  const errors = [];
  const name = String(body.name ?? "").trim();
  const collectionAddress = String(body.collectionAddress ?? "").trim().toLowerCase();
  const chainId = Number(body.chainId);
  const pathway = String(body.pathway ?? "all");
  const benefits = String(body.benefits ?? "").trim();
  if (name.length < 2 || name.length > 160) errors.push("Name the collection.");
  if (!ADDRESS.test(collectionAddress)) errors.push("Enter the collection contract address.");
  if (!Number.isInteger(chainId) || chainId <= 0) errors.push("Enter the chain id.");
  if (!["all", "adbongo", "temple"].includes(pathway)) errors.push("Pathway must be all, adbongo, or temple.");
  if (benefits.length > 2000) errors.push("The benefits note is too long.");
  return { errors, value: { name, collectionAddress, chainId, pathway, benefits } };
}

export function validateInquiry(body) {
  const serviceInterest = String(body.serviceInterest ?? "").trim();
  const message = String(body.message ?? "").trim();
  const errors = [];
  if (serviceInterest.length < 2 || serviceInterest.length > 200) errors.push("Name the service you want to discuss.");
  if (message.length < 10 || message.length > 4000) errors.push("Write a short description of the work.");
  return { errors, value: { serviceInterest, message } };
}

export function isAddress(value) {
  return ADDRESS.test(String(value ?? ""));
}
