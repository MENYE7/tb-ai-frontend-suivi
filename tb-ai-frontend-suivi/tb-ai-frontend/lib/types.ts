/**
 * lib/types.ts
 *
 * Types partagés entre les pages, composants et routes API.
 *
 * ✅ CONTRAT AVEC LE SPACE HUGGING FACE (à jour avec app.py — POST /run/predict) :
 *   Requête  : { "image_base64": "data:image/png;base64,...." }
 *   Réponse  : {
 *     "probabilite_tb": float,       -> mappé vers `probability`
 *     "image_gradcam": str,          -> mappé vers `gradcamImageBase64`
 *     "zones_suspectes": [{x,y,width,height,score}, ...] -> `detectedZones`
 *     "temps_inference_ms": float,   -> mappé vers `inferenceTimeMs`
 *   }
 *   Le mapping français -> anglais se fait dans app/api/predict/route.ts,
 *   pour garder des identifiants cohérents dans tout le reste du frontend.
 *
 * ⚠️ Le Space NE renvoie PLUS l'image originale : elle est déjà disponible
 * côté client (le fichier uploadé) et encodée directement dans le
 * navigateur (voir lib/api.ts) — évite un aller-retour inutile.
 */

/** Décision experte enregistrée sur une analyse (préparation au ré-entraînement). */
export type ExpertStatus = "pending" | "confirmed" | "rejected";

/** Niveau de risque dérivé de la probabilité, pour l'affichage et le tri. */
export type RiskLevel = "low" | "moderate" | "high";

/**
 * Bounding box d'une zone suspecte, calculée CÔTÉ SERVEUR (app.py) par
 * seuillage de la carte Grad-CAM BRUTE (avant colorisation) — beaucoup
 * plus fiable qu'une estimation par analyse de pixels colorés côté client.
 * Coordonnées normalisées [0, 1], indépendantes de la résolution
 * d'affichage (x/y = coin haut-gauche, width/height = dimensions).
 *
 * ⚠️ Reste une approximation géométrique de l'activation du réseau, PAS
 * une segmentation anatomique ni une détection d'objet validée cliniquement.
 */
export interface DetectedZone {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number; // 0-1, activation moyenne de la région
}

/**
 * Résultat retourné par POST /api/predict (proxy vers le Space HF), déjà
 * mappé vers des identifiants anglais cohérents avec le reste du frontend.
 */
export interface PredictionResult {
  probability: number; // 0-1
  riskLevel: RiskLevel;
  originalImageBase64: string; // assemblée CÔTÉ CLIENT depuis le fichier uploadé (lib/api.ts)
  gradcamImageBase64: string; // data URL, renvoyée par le Space
  detectedZones: DetectedZone[]; // bounding boxes, renvoyées par le Space
  inferenceTimeMs: number; // temps de calcul côté Space (probabilité + Grad-CAM)
}

/**
 * Enregistrement persisté d'une analyse (table du /dashboard).
 * Le patientId est un identifiant ANONYMISÉ fourni par le médecin
 * (ex. "P-2026-014") — ce champ n'accepte jamais un nom réel côté UI
 * (cf. validation dans app/analyze/page.tsx).
 */
export interface AnalysisRecord {
  id: string;
  createdAt: string; // ISO 8601
  patientId: string; // identifiant anonymisé, PAS un nom
  probability: number;
  riskLevel: RiskLevel;
  expertStatus: ExpertStatus;
  expertName?: string;
  expertComment?: string;
  expertDecisionAt?: string;
  /** Vrai pour les données du mode démonstration (jamais de vraies données de patients). */
  simulated?: boolean;
  // Les images ne sont volontairement PAS stockées dans le store des
  // analyses (lib/store.ts) : elles ne transitent que dans la réponse
  // ponctuelle de /api/predict, pour limiter le volume de données de
  // santé conservées côté serveur.
}

/** Entrée du tableau de résultats sur /batch (une par image uploadée). */
export interface BatchItem {
  id: string;
  fileName: string;
  patientId: string;
  status: "queued" | "processing" | "done" | "error";
  probability?: number;
  riskLevel?: RiskLevel;
  errorMessage?: string;
}

export function computeRiskLevel(probability: number): RiskLevel {
  if (probability >= 0.7) return "high";
  if (probability >= 0.4) return "moderate";
  return "low";
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Faible",
  moderate: "Modéré",
  high: "Élevé — priorité",
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-900",
  moderate: "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-900",
  high: "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-900",
};
