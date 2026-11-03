/**
 * lib/generatePdfReport.ts
 *
 * Génère un rapport PDF téléchargeable pour une analyse, ENTIÈREMENT CÔTÉ
 * CLIENT (aucun round-trip serveur) : les images (radio, Grad-CAM) sont
 * déjà en mémoire dans le navigateur juste après l'analyse, pas besoin de
 * les retransmettre. Utilise `pdf-lib` plutôt que `react-pdf` : pure JS
 * sans dépendance native, fonctionne de façon identique dans le navigateur
 * et en Node, et évite les soucis de bundling connus de react-pdf avec le
 * App Router de Next.js (son moteur de layout WASM nécessite souvent des
 * ajustements de webpack).
 *
 * ⚠️ Le PDF ne peut être généré que juste après une analyse sur /analyze,
 * PAS depuis l'historique du /dashboard : les images ne sont volontairement
 * pas conservées côté serveur (cf. lib/types.ts, minimisation des données).
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { RISK_LABELS, type DetectedZone, type ExpertStatus, type RiskLevel } from "./types";

export interface PdfReportData {
  patientId: string;
  createdAt: string; // ISO 8601
  probability: number;
  riskLevel: RiskLevel;
  originalImageBase64: string; // data URL
  gradcamImageBase64: string; // data URL
  expertStatus: ExpertStatus;
  expertName?: string;
  expertComment?: string;
  detectedZones: DetectedZone[];
  inferenceTimeMs?: number;
}

const PAGE_WIDTH = 595.28; // A4 portrait, en points (72 dpi)
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

const COLOR_BRAND = rgb(0.15, 0.39, 0.92); // bleu, cohérent avec la palette de l'app
const COLOR_TEXT = rgb(0.12, 0.16, 0.22);
const COLOR_MUTED = rgb(0.42, 0.47, 0.55);
const COLOR_BORDER = rgb(0.85, 0.87, 0.9);
const RISK_COLOR: Record<RiskLevel, RGB> = {
  low: rgb(0.02, 0.59, 0.41),
  moderate: rgb(0.85, 0.55, 0.02),
  high: rgb(0.86, 0.15, 0.15),
};

const EXPERT_STATUS_LABELS: Record<ExpertStatus, string> = {
  pending: "En attente de validation",
  confirmed: "Confirmé par l'expert",
  rejected: "Infirmé par l'expert",
};

const DISCLAIMER_TEXT =
  "Outil d'aide au dépistage à visée de recherche. Ce document ne constitue pas un " +
  "diagnostic médical et ne remplace en aucun cas le jugement clinique d'un professionnel " +
  "de santé qualifié. Le modèle sous-jacent n'est pas un dispositif médical certifié (pas de " +
  "marquage CE, pas d'autorisation FDA). Les zones suspectes indiquées sont des estimations " +
  "géométriques dérivées de l'activation du réseau de neurones, pas une localisation " +
  "anatomique validée. En cas de doute, consultez un médecin.";

// --------------------------------------------------------------------------- #
// Utilitaires internes
// --------------------------------------------------------------------------- #

/** Découpe un texte en lignes ne dépassant pas `maxWidth`, pour la police/taille donnée. */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/** Calcule les dimensions d'affichage préservant le ratio, façon `object-fit: contain`. */
function fitDimensions(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number
): { width: number; height: number } {
  const ratio = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  return { width: naturalWidth * ratio, height: naturalHeight * ratio };
}

/** Décode une data URL base64 (PNG ou JPEG) en octets bruts. */
function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isJpeg: boolean } {
  const isJpeg = dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg");
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, isJpeg };
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// --------------------------------------------------------------------------- #
// Génération du PDF
// --------------------------------------------------------------------------- #

export async function generateAnalysisPdfBytes(data: PdfReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Rapport TB-AI — ${data.patientId}`);
  // Note : pdf-lib écrase systématiquement ce champ par sa propre valeur par
  // défaut lors de save() (comportement documenté de la librairie) — appel
  // conservé pour l'intention, mais n'apparaîtra pas dans le PDF final.
  // Champ invisible pour le lecteur du rapport, sans impact fonctionnel.
  doc.setProducer("TB-AI");
  doc.setCreationDate(new Date());

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let cursorY = PAGE_HEIGHT - MARGIN;

  // --- En-tête (logo texte + titre) ---
  cursorY = drawHeader(page, fontBold, fontRegular, cursorY);

  // --- Métadonnées (date, patient, expert) ---
  cursorY -= 28;
  cursorY = drawMetadata(page, fontRegular, fontBold, data, cursorY);

  // --- Images côte à côte (radio originale + Grad-CAM) ---
  cursorY -= 20;
  cursorY = await drawImages(doc, page, fontRegular, data, cursorY);

  // --- Score et décision ---
  cursorY -= 24;
  cursorY = drawScoreSection(page, fontRegular, fontBold, data, cursorY);

  // --- Zones suspectes (si présentes) ---
  if (data.detectedZones.length > 0) {
    cursorY -= 16;
    cursorY = drawZones(page, fontRegular, fontBold, data.detectedZones, cursorY);
  }

  // --- Avertissement ---
  cursorY -= 20;
  drawDisclaimer(page, fontRegular, fontBold, cursorY);

  // --- Pied de page (sur la/les pages déjà créées) ---
  for (const [index, p] of doc.getPages().entries()) {
    drawFooter(p, fontRegular, index + 1, doc.getPageCount());
  }

  return doc.save();
}

function drawHeader(page: PDFPage, fontBold: PDFFont, fontRegular: PDFFont, y: number): number {
  // "Logo" texte — à remplacer par une vraie image de logo (doc.embedPng) le cas échéant.
  page.drawRectangle({ x: MARGIN, y: y - 28, width: 36, height: 36, color: COLOR_BRAND });
  page.drawText("TB", { x: MARGIN + 7, y: y - 20, size: 16, font: fontBold, color: rgb(1, 1, 1) });

  page.drawText("TB-AI", { x: MARGIN + 46, y: y - 10, size: 18, font: fontBold, color: COLOR_TEXT });
  page.drawText("Rapport d'analyse — dépistage assisté de la tuberculose", {
    x: MARGIN + 46,
    y: y - 26,
    size: 10,
    font: fontRegular,
    color: COLOR_MUTED,
  });

  page.drawLine({
    start: { x: MARGIN, y: y - 40 },
    end: { x: PAGE_WIDTH - MARGIN, y: y - 40 },
    thickness: 1,
    color: COLOR_BORDER,
  });

  return y - 40;
}

function drawMetadata(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  data: PdfReportData,
  y: number
): number {
  const rows: [string, string][] = [
    ["Date de l'analyse", formatDate(data.createdAt)],
    ["Identifiant patient (anonymisé)", data.patientId],
    ["Statut expert", EXPERT_STATUS_LABELS[data.expertStatus]],
  ];
  if (data.expertName) rows.push(["Validé par", data.expertName]);

  let currentY = y;
  for (const [label, value] of rows) {
    page.drawText(`${label} :`, { x: MARGIN, y: currentY, size: 10, font: fontBold, color: COLOR_TEXT });
    page.drawText(value, { x: MARGIN + 190, y: currentY, size: 10, font: fontRegular, color: COLOR_TEXT });
    currentY -= 16;
  }
  return currentY;
}

async function drawImages(
  doc: PDFDocument,
  page: PDFPage,
  fontRegular: PDFFont,
  data: PdfReportData,
  y: number
): Promise<number> {
  const boxWidth = (PAGE_WIDTH - 2 * MARGIN - 20) / 2;
  const boxHeight = 220;

  const originalEntry = dataUrlToBytes(data.originalImageBase64);
  const gradcamEntry = dataUrlToBytes(data.gradcamImageBase64);

  const originalImg = originalEntry.isJpeg ? await doc.embedJpg(originalEntry.bytes) : await doc.embedPng(originalEntry.bytes);
  const gradcamImg = gradcamEntry.isJpeg ? await doc.embedJpg(gradcamEntry.bytes) : await doc.embedPng(gradcamEntry.bytes);

  const originalDims = fitDimensions(originalImg.width, originalImg.height, boxWidth, boxHeight);
  const gradcamDims = fitDimensions(gradcamImg.width, gradcamImg.height, boxWidth, boxHeight);

  const topY = y;
  const leftX = MARGIN;
  const rightX = MARGIN + boxWidth + 20;

  // Cadres de fond (pour un rendu propre même si les deux images ont des ratios différents)
  page.drawRectangle({ x: leftX, y: topY - boxHeight, width: boxWidth, height: boxHeight, color: rgb(0.97, 0.97, 0.98) });
  page.drawRectangle({ x: rightX, y: topY - boxHeight, width: boxWidth, height: boxHeight, color: rgb(0.97, 0.97, 0.98) });

  page.drawImage(originalImg, {
    x: leftX + (boxWidth - originalDims.width) / 2,
    y: topY - boxHeight + (boxHeight - originalDims.height) / 2,
    width: originalDims.width,
    height: originalDims.height,
  });
  page.drawImage(gradcamImg, {
    x: rightX + (boxWidth - gradcamDims.width) / 2,
    y: topY - boxHeight + (boxHeight - gradcamDims.height) / 2,
    width: gradcamDims.width,
    height: gradcamDims.height,
  });

  page.drawText("Radiographie originale", { x: leftX, y: topY - boxHeight - 14, size: 9, font: fontRegular, color: COLOR_MUTED });
  page.drawText("Superposition Grad-CAM", { x: rightX, y: topY - boxHeight - 14, size: 9, font: fontRegular, color: COLOR_MUTED });

  return topY - boxHeight - 14;
}

function drawScoreSection(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  data: PdfReportData,
  y: number
): number {
  const boxHeight = 60;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxHeight,
    width: PAGE_WIDTH - 2 * MARGIN,
    height: boxHeight,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: COLOR_BORDER,
    borderWidth: 1,
  });

  page.drawText("Probabilité de tuberculose", {
    x: MARGIN + 16,
    y: y - 22,
    size: 10,
    font: fontRegular,
    color: COLOR_MUTED,
  });
  page.drawText(`${(data.probability * 100).toFixed(1)}%`, {
    x: MARGIN + 16,
    y: y - 44,
    size: 22,
    font: fontBold,
    color: RISK_COLOR[data.riskLevel],
  });

  const riskLabel = `Risque ${RISK_LABELS[data.riskLevel]}`;
  const riskLabelWidth = fontBold.widthOfTextAtSize(riskLabel, 12);
  page.drawText(riskLabel, {
    x: PAGE_WIDTH - MARGIN - 16 - riskLabelWidth,
    y: y - 34,
    size: 12,
    font: fontBold,
    color: RISK_COLOR[data.riskLevel],
  });

  if (data.inferenceTimeMs !== undefined) {
    const timingLabel = `Temps de calcul : ${Math.round(data.inferenceTimeMs)} ms`;
    const timingWidth = fontRegular.widthOfTextAtSize(timingLabel, 8);
    page.drawText(timingLabel, {
      x: PAGE_WIDTH - MARGIN - 16 - timingWidth,
      y: y - 50,
      size: 8,
      font: fontRegular,
      color: COLOR_MUTED,
    });
  }

  return y - boxHeight;
}

function drawZones(
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  zones: DetectedZone[],
  y: number
): number {
  page.drawText(`Zones suspectes détectées (${zones.length}, estimation)`, {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
    color: COLOR_TEXT,
  });
  let currentY = y - 14;
  for (const [i, zone] of zones.slice(0, 4).entries()) {
    page.drawText(
      `• Zone ${i + 1} — position (${zone.x.toFixed(2)}, ${zone.y.toFixed(2)}), ` +
        `taille ${zone.width.toFixed(2)}×${zone.height.toFixed(2)} — score ${Math.round(zone.score * 100)}%`,
      { x: MARGIN, y: currentY, size: 9, font: fontRegular, color: COLOR_MUTED }
    );
    currentY -= 13;
  }
  return currentY;
}

function drawDisclaimer(page: PDFPage, fontRegular: PDFFont, fontBold: PDFFont, y: number): void {
  const boxWidth = PAGE_WIDTH - 2 * MARGIN;
  const textMaxWidth = boxWidth - 24;
  const lines = wrapText(DISCLAIMER_TEXT, fontRegular, 8.5, textMaxWidth);
  const lineHeight = 12;
  const boxHeight = 24 + lines.length * lineHeight;

  page.drawRectangle({
    x: MARGIN,
    y: y - boxHeight,
    width: boxWidth,
    height: boxHeight,
    color: rgb(1, 0.98, 0.92),
    borderColor: rgb(0.94, 0.78, 0.4),
    borderWidth: 1,
  });

  page.drawText("Avertissement médical", {
    x: MARGIN + 12,
    y: y - 16,
    size: 9,
    font: fontBold,
    color: rgb(0.55, 0.4, 0.05),
  });

  let lineY = y - 30;
  for (const line of lines) {
    page.drawText(line, { x: MARGIN + 12, y: lineY, size: 8.5, font: fontRegular, color: rgb(0.4, 0.32, 0.1) });
    lineY -= lineHeight;
  }
}

function drawFooter(page: PDFPage, fontRegular: PDFFont, pageNumber: number, totalPages: number): void {
  const footerText =
    `Document généré automatiquement par TB-AI le ${formatDate(new Date().toISOString())} — ` +
    "outil de recherche, non certifié dispositif médical.";
  page.drawText(footerText, { x: MARGIN, y: 24, size: 7, font: fontRegular, color: COLOR_MUTED });
  page.drawText(`Page ${pageNumber}/${totalPages}`, {
    x: PAGE_WIDTH - MARGIN - 50,
    y: 24,
    size: 7,
    font: fontRegular,
    color: COLOR_MUTED,
  });
  page.drawLine({
    start: { x: MARGIN, y: 36 },
    end: { x: PAGE_WIDTH - MARGIN, y: 36 },
    thickness: 0.5,
    color: COLOR_BORDER,
  });
}

// --------------------------------------------------------------------------- #
// Déclenchement du téléchargement (navigateur uniquement)
// --------------------------------------------------------------------------- #

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  // Cast ciblé : TypeScript (>= 5.5) distingue Uint8Array<ArrayBufferLike>
  // (incluant SharedArrayBuffer) de BlobPart, qui exige un ArrayBuffer
  // classique. Le contenu binaire renvoyé par pdf-lib est toujours un
  // ArrayBuffer standard en pratique (jamais partagé) — cast sans risque.
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
