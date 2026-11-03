"use client";

import { demoReset } from "@/lib/demoRepo";

/** Bandeau permanent du mode démo : rappelle que tout est simulé. */
export function DemoBanner() {
  const handleReset = () => {
    demoReset();
    window.location.reload();
  };

  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <strong>MODE DÉMONSTRATION</strong> — toutes les données de cette page sont <strong>simulées</strong> et restent dans
      votre navigateur. N&apos;utilisez aucune radiographie de patient réel.{" "}
      <button type="button" onClick={handleReset} className="ml-1 underline underline-offset-2 hover:no-underline">
        Réinitialiser la démo
      </button>
      <div className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        Aucun identifiant requis. Parcours conseillé : 1) <strong>Analyse</strong> — importez une radio ; 2){" "}
        <strong>Suivi des cas</strong> — le cas positif s&apos;ouvre, ajoutez responsable, rappel patient, étapes et
        clôture ; 3) <strong>Tableau de bord</strong>.
      </div>
    </div>
  );
}
