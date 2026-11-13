import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACKNOWLEDGMENT } from "./agreements.js";
import { tokenEquals } from "./tokens.js";
import { joinPage, renderHome, renderReceived } from "./pages.js";
import {
  addCollection,
  adminPdf,
  createInquiry,
  decideApplication,
  getAgreement,
  issueWalletNonce,
  listAgreements,
  listApplications,
  listAudit,
  listCollections,
  memberFromAccessToken,
  memberPdf,
  memberProfile,
  readApplicationPdf,
  readApplicationStatus,
  resignMembership,
  submitApplication,
  verifyWallet,
} from "./service.js";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy":
      "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "cache-control": "no-store",
  };
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    ...extraHeaders,
  });
  res.end(payload);
}

function sendHtml(res, status, html) {
  const payload = Buffer.from(html);
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "text/html; charset=utf-8",
    "content-length": payload.length,
  });
  res.end(payload);
}

function sendFile(res, file, contentType, filename) {
  const payload = fs.readFileSync(file);
  const headers = {
    ...securityHeaders(),
    "content-type": contentType,
    "content-length": payload.length,
  };
  if (filename) headers["content-disposition"] = `attachment; filename="${filename}"`;
  res.writeHead(200, headers);
  res.end(payload);
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join("="));
  }
  return out;
}

function clientIp(req) {
  return req.socket?.remoteAddress ?? "";
}

function wantsHtml(req) {
  const type = String(req.headers["content-type"] ?? "");
  if (type.includes("application/x-www-form-urlencoded")) return true;
  const accept = String(req.headers.accept ?? "");
  return accept.includes("text/html") && !accept.includes("application/json");
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readRaw(req, limit = 32768) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("The submission is too large.");
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseBody(raw, contentType) {
  if (!raw) return {};
  if (String(contentType ?? "").includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const body = Object.fromEntries(params.entries());
    body.consent = body.consent === "true" || body.consent === "on";
    body.acknowledgmentAccepted = body.acknowledgmentAccepted === "true" || body.acknowledgmentAccepted === "on";
    return body;
  }
  return JSON.parse(raw);
}

function stewardOk(req, config) {
  if (!config.adminToken) return false;
  const header = String(req.headers.authorization ?? "");
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const cookie = cookies(req).admin_session ?? "";
  return tokenEquals(config.adminToken, bearer) || tokenEquals(config.adminToken, cookie);
}

function memberAuth(req, db) {
  const header = String(req.headers.authorization ?? "");
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const cookie = cookies(req).member_session ?? "";
  return memberFromAccessToken(db, bearer || cookie);
}

function cookieHeader(name, value, config) {
  const secure = config.publicBaseUrl.startsWith("https://") ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`;
}

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 30;
}

function staticFile(pathname) {
  const relative = pathname.replace(/^\/+/, "");
  const full = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!full.startsWith(PUBLIC_DIR)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
};

export async function handleRequest(req, res, { db, config }) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;
  try {
    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        publication: config.publication,
        acknowledgment: ACKNOWLEDGMENT,
      });
    }
    if (req.method === "GET" && pathname === "/api/agreements") {
      return sendJson(res, 200, { agreements: listAgreements(db, config) });
    }
    const agreementMatch = pathname.match(/^\/api\/agreements\/(adbongo|temple)$/);
    if (req.method === "GET" && agreementMatch) {
      const agreement = getAgreement(db, config, agreementMatch[1]);
      if (!agreement) return sendJson(res, 404, { error: "Covenant not found." });
      return sendJson(res, 200, agreement);
    }
    if (req.method === "GET" && (pathname === "/" || pathname === "")) {
      return sendHtml(res, 200, renderHome(listAgreements(db, config)));
    }
    if (req.method === "GET" && (pathname === "/adbongo" || pathname === "/adbongo/" || pathname === "/temple" || pathname === "/temple/")) {
      const pathway = pathname.includes("temple") ? "temple" : "adbongo";
      const agreement = getAgreement(db, config, pathway);
      return sendHtml(res, 200, joinPage(pathway, agreement));
    }
    if (req.method === "GET" && pathname === "/received") {
      const result = readApplicationStatus(db, url.searchParams.get("application") ?? "", url.searchParams.get("receipt") ?? "");
      if (result.status !== 200) return sendHtml(res, 401, renderHome(listAgreements(db, config)));
      return sendHtml(res, 200, renderReceived({ application: result.body, receiptToken: url.searchParams.get("receipt") }));
    }

    const pdfMatch = pathname.match(/^\/api\/applications\/([0-9a-f-]{36})\/pdf$/);
    if (req.method === "GET" && pdfMatch) {
      const result = readApplicationPdf(db, pdfMatch[1], url.searchParams.get("receipt") ?? "");
      if (result.status !== 200) return sendJson(res, result.status, result.body);
      return sendFile(res, result.file, "application/pdf", result.filename);
    }
    const statusMatch = pathname.match(/^\/api\/applications\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && statusMatch) {
      const result = readApplicationStatus(db, statusMatch[1], url.searchParams.get("receipt") ?? "");
      return sendJson(res, result.status, result.body);
    }

    if (req.method === "POST" && !sameOrigin(req)) {
      return sendJson(res, 403, { error: "Cross-site submission was refused." });
    }

    if (req.method === "POST" && pathname === "/api/applications") {
      if (config.rateLimit && rateLimited(clientIp(req))) {
        return sendJson(res, 429, { error: "Too many applications from this network. Wait a minute and try again." });
      }
      const body = parseBody(await readRaw(req), req.headers["content-type"]);
      const result = await submitApplication(db, config, body, {
        ip: clientIp(req),
        userAgent: req.headers["user-agent"] ?? "",
      });
      if (wantsHtml(req)) {
        const agreement = getAgreement(db, config, String(body.pathway ?? "adbongo"));
        if (result.status !== 201) return sendHtml(res, result.status, joinPage(agreement?.pathway ?? "adbongo", agreement, result.body.error));
        res.writeHead(303, {
          ...securityHeaders(),
          location: `/received?application=${encodeURIComponent(result.body.applicationId)}&receipt=${encodeURIComponent(result.body.receiptToken)}`,
        });
        return res.end();
      }
      return sendJson(res, result.status, result.body);
    }

    if (pathname.startsWith("/api/admin")) {
      if (!config.adminToken) return sendJson(res, 503, { error: "Steward access is not configured." });
      if (req.method === "POST" && pathname === "/api/admin/session") {
        const body = parseBody(await readRaw(req), req.headers["content-type"]);
        if (!tokenEquals(config.adminToken, String(body.token ?? ""))) return sendJson(res, 401, { error: "Steward credential was refused." });
        return sendJson(res, 200, { ok: true }, { "set-cookie": cookieHeader("admin_session", String(body.token), config) });
      }
      if (!stewardOk(req, config)) return sendJson(res, 401, { error: "Steward credential was refused." });
      if (req.method === "GET" && pathname === "/api/admin/applications") return sendJson(res, 200, { applications: listApplications(db) });
      if (req.method === "GET" && pathname === "/api/admin/audit") return sendJson(res, 200, { events: listAudit(db) });
      if (req.method === "GET" && pathname === "/api/admin/nft-collections") return sendJson(res, 200, { collections: listCollections(db) });
      const adminPdfMatch = pathname.match(/^\/api\/admin\/applications\/([0-9a-f-]{36})\/pdf$/);
      if (req.method === "GET" && adminPdfMatch) {
        const result = adminPdf(db, adminPdfMatch[1]);
        if (result.status !== 200) return sendJson(res, result.status, result.body);
        return sendFile(res, result.file, "application/pdf", result.filename);
      }
      const decisionMatch = pathname.match(/^\/api\/admin\/applications\/([0-9a-f-]{36})\/decision$/);
      if (req.method === "POST" && decisionMatch) {
        const body = parseBody(await readRaw(req), req.headers["content-type"]);
        const steward = String(req.headers["x-steward-name"] ?? "steward").slice(0, 120);
        const result = decideApplication(db, config, decisionMatch[1], body, steward);
        return sendJson(res, result.status, result.body);
      }
      if (req.method === "POST" && pathname === "/api/admin/nft-collections") {
        const body = parseBody(await readRaw(req), req.headers["content-type"]);
        const result = addCollection(db, body, "steward");
        return sendJson(res, result.status, result.body);
      }
      return sendJson(res, 404, { error: "Not found." });
    }

    if (pathname.startsWith("/api/member")) {
      if (req.method === "POST" && pathname === "/api/member/session") {
        const body = parseBody(await readRaw(req), req.headers["content-type"]);
        const member = memberFromAccessToken(db, String(body.accessToken ?? ""));
        if (!member) return sendJson(res, 401, { error: "That member link does not match." });
        return sendJson(res, 200, { ok: true, membershipId: member.membership_id }, {
          "set-cookie": cookieHeader("member_session", String(body.accessToken), config),
        });
      }
      const member = memberAuth(req, db);
      if (!member) return sendJson(res, 401, { error: "Sign in with the member link from the acceptance email." });
      if (req.method === "GET" && pathname === "/api/member/me") return sendJson(res, 200, memberProfile(db, member));
      if (req.method === "GET" && pathname === "/api/member/pdf") {
        const result = memberPdf(db, member);
        if (result.status !== 200) return sendJson(res, result.status, result.body);
        return sendFile(res, result.file, "application/pdf", result.filename);
      }
      if (req.method === "POST" && pathname === "/api/member/wallet/nonce") return sendJson(res, 200, issueWalletNonce(db, member).body);
      if (req.method === "POST" && pathname === "/api/member/wallet/verify") {
        const body = parseBody(await readRaw(req), req.headers["content-type"]);
        const result = await verifyWallet(db, config, member, body);
        return sendJson(res, result.status, result.body);
      }
      if (req.method === "POST" && pathname === "/api/member/sow") {
        const body = parseBody(await readRaw(req), req.headers["content-type"]);
        const result = createInquiry(db, config, member, body);
        return sendJson(res, result.status, result.body);
      }
      if (req.method === "POST" && pathname === "/api/member/resign") {
        const result = resignMembership(db, member);
        return sendJson(res, result.status, result.body);
      }
      return sendJson(res, 404, { error: "Not found." });
    }

    if (req.method === "GET") {
      const page = pathname === "/dashboard" ? "/dashboard.html" : pathname === "/admin" ? "/admin.html" : pathname;
      const file = staticFile(page);
      if (file) return sendFile(res, file, TYPES[path.extname(file)] ?? "application/octet-stream");
    }
    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const status = error.status ?? (error instanceof SyntaxError ? 400 : 500);
    const message = status === 400 ? "The submission could not be read." : error.status ? error.message : "The membership service could not finish that request.";
    if (status === 500) console.error(error);
    return sendJson(res, status, { error: message });
  }
}
