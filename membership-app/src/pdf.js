import PDFDocument from "pdfkit";
import { formatChicago } from "./time.js";

export function pdfSafe(value) {
  return String(value)
    .replaceAll("\u2019", "'")
    .replaceAll("\u2018", "'")
    .replaceAll("\u201c", '"')
    .replaceAll("\u201d", '"')
    .replaceAll("\u2014", "-")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2026", "...")
    .replaceAll("\u00a7", "section ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

export function renderPdf(record) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER", info: { Title: record.title } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(16).text(pdfSafe(record.title), { align: "left" });
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10);
    if (!record.publishable) {
      doc.text("DRAFT FOR LEGAL REVIEW. This signature record is not effective membership.");
    }
    doc.text(`Pathway: ${record.pathway}`);
    doc.text(`Agreement version: ${record.version}`);
    doc.text(`Agreement SHA-256: ${record.sha256}`);
    doc.text(`Application: ${record.applicationId}`);
    doc.text(`Submitted (CT): ${formatChicago(record.submittedAt)}`);
    doc.text(`Submitted (UTC): ${record.submittedAt}`);
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").text("Applicant");
    doc.font("Helvetica").text(pdfSafe(record.fullLegalName));
    doc.text(pdfSafe(record.email));
    doc.text(`${pdfSafe(record.region)}, ${pdfSafe(record.country)}`);
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").text("Electronic signature");
    doc.font("Helvetica").text(pdfSafe(record.signature));
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").text("Acknowledgment");
    doc.font("Helvetica").text(pdfSafe(record.acknowledgment), { align: "left" });
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(13).text("Covenant text shown before signing");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10).text(pdfSafe(record.body), { align: "left" });
    doc.end();
  });
}
