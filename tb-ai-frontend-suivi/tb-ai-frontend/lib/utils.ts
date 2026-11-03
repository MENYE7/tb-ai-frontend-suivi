/**
 * lib/utils.ts — utilitaires partagés (CSV, dates, validation).
 */

import type { AnalysisRecord } from "./types";
import { RISK_LABELS } from "./types";

/**
 * Valide qu'un identifiant patient RESSEMBLE à un identifiant anonymisé
 * (ex. "P-2026-014") plutôt qu'à un nom réel — vérification de surface
 * uniquement (ne peut pas garantir l'absence de nom), pensée comme un
 * garde-fou pédagogique dans l'UI, PAS comme une protection RGPD à elle
 * seule (voir docs/federated_compliance_checklist.md du projet).
 */
export function isLikelyAnonymizedId(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return false;
  // Rejette les valeurs contenant des espaces (souvent signe d'un nom/prénom).
  if (/\s/.test(trimmed)) return false;
  // Attendu : lettres/chiffres/tirets/underscores uniquement.
  return /^[A-Za-z0-9_-]+$/.test(trimmed);
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Échappe une valeur pour insertion sûre dans un champ CSV (RFC 4180). */
function csvEscape(value: string | number | undefined): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function analysesToCsv(records: AnalysisRecord[]): string {
  const header = [
    "id",
    "date",
    "patient_id",
    "probabilite",
    "niveau_risque",
    "statut_expert",
    "expert",
    "commentaire_expert",
  ];

  const rows = records.map((r) =>
    [
      r.id,
      r.createdAt,
      r.patientId,
      (r.probability * 100).toFixed(1) + "%",
      RISK_LABELS[r.riskLevel],
      r.expertStatus,
      r.expertName ?? "",
      r.expertComment ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csvContent: string): void {
  // Préfixe BOM UTF-8 : garantit que les accents s'affichent correctement
  // à l'ouverture dans Excel (sinon souvent mal interprété en Windows-1252).
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Génère un identifiant court, unique côté client (pas besoin d'UUID complet ici). */
export function generateId(prefix = "an"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
