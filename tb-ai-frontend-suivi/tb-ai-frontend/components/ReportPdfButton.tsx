"use client";

import { useState } from "react";
import type { PdfReportData } from "@/lib/generatePdfReport";

interface ReportPdfButtonProps {
  data: PdfReportData;
}

/**
 * Génère et télécharge le rapport PDF de l'analyse courante.
 *
 * `pdf-lib` est chargé dynamiquement (import() au clic) plutôt qu'importé
 * statiquement : c'est une librairie volumineuse (~180 Ko) dont la grande
 * majorité des visiteurs de /analyze n'aura pas besoin à chaque visite —
 * inutile d'alourdir le chargement initial de la page pour tout le monde.
 *
 * ⚠️ Disponible UNIQUEMENT juste après une analyse sur /analyze (tant que
 * les images sont encore en mémoire côté navigateur) — pas depuis
 * l'historique du /dashboard, les images n'y étant volontairement pas
 * conservées (cf. lib/types.ts).
 */
export function ReportPdfButton({ data }: ReportPdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setIsGenerating(true);
    try {
      const { generateAnalysisPdfBytes, downloadPdfBytes } = await import("@/lib/generatePdfReport");
      const bytes = await generateAnalysisPdfBytes(data);
      const dateSlug = data.createdAt.slice(0, 10);
      downloadPdfBytes(bytes, `tbai_rapport_${data.patientId}_${dateSlug}.pdf`);
    } catch (err) {
      console.error("Échec de la génération du rapport PDF :", err);
      setError("Échec de la génération du rapport PDF. Réessayez.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isGenerating}
        className="flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        📄 {isGenerating ? "Génération du rapport..." : "Télécharger le rapport PDF"}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
