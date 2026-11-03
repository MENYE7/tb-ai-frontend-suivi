/**
 * lib/generateSummaryPdf.ts
 *
 * PDF récapitulatif pour une analyse déjà enregistrée dans le tableau de
 * bord — PAS un rapport complet comme lib/generatePdfReport.ts : les
 * images (radiographie, Grad-CAM) ne sont jamais stockées côté serveur
 * (choix de confidentialité assumé depuis le début de ce projet), donc
 * elles n'existent plus une fois la page d'analyse fermée. Ce résumé
 * contient uniquement ce qui est réellement conservé : date, identifiant
 * patient, score, niveau de risque, statut expert.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RISK_LABELS, type AnalysisRecord } from "./types";

const EXPERT_STATUS_LABELS: Record<AnalysisRecord["expertStatus"], string> = {
  pending: "En attente de validation",
  confirmed: "Confirmé par l'expert",
  rejected: "Infirmé par l'expert",
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function generateSummaryPdfBytes(record: AnalysisRecord): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Résumé TB-AI — ${record.patientId}`);

  const page = doc.addPage([420, 520]);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 36;
  let y = 520 - margin;

  page.drawText("TB-AI — Résumé d'analyse archivée", { x: margin, y, size: 14, font: fontBold });
  y -= 28;

  const rows: [string, string][] = [
    ["Date de l'analyse", formatDate(record.createdAt)],
    ["Identifiant patient (anonymisé)", record.patientId],
    ["Probabilité de tuberculose", `${(record.probability * 100).toFixed(1)}%`],
    ["Niveau de risque", RISK_LABELS[record.riskLevel]],
    ["Statut expert", EXPERT_STATUS_LABELS[record.expertStatus]],
  ];
  if (record.expertName) rows.push(["Validé par", record.expertName]);
  if (record.expertComment) rows.push(["Commentaire expert", record.expertComment]);

  for (const [label, value] of rows) {
    page.drawText(`${label} :`, { x: margin, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(value, { x: margin + 180, y, size: 10, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    y -= 20;
  }

  y -= 16;
  page.drawRectangle({
    x: margin,
    y: y - 70,
    width: 420 - 2 * margin,
    height: 70,
    color: rgb(1, 0.98, 0.92),
    borderColor: rgb(0.94, 0.78, 0.4),
    borderWidth: 1,
  });
  const noticeLines = [
    "Avertissement — Ce résumé ne contient pas la radiographie ni la carte",
    "de saillance : ces images ne sont jamais conservées après l'analyse",
    "(choix de confidentialité du projet). Il ne remplace pas un diagnostic médical.",
  ];
  let noticeY = y - 16;
  for (const line of noticeLines) {
    page.drawText(line, { x: margin + 10, y: noticeY, size: 8.5, font: fontRegular, color: rgb(0.45, 0.35, 0.1) });
    noticeY -= 13;
  }

  return doc.save();
}
