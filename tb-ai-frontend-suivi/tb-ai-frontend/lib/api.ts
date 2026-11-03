/**
 * lib/api.ts
 *
 * Client API centralisé côté navigateur. Toutes les pages/composants
 * passent par ces fonctions plutôt que d'appeler `fetch` directement.
 */

import { analyzeImageClientSide } from "./onnxInference";
import { isDemoClient } from "./demoFlag";
import { demoAddAnalysis, demoFeedback, demoListAnalyses } from "./demoRepo";
import { computeRiskLevel, type AnalysisRecord, type ExpertStatus, type PredictionResult } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("Réponse du serveur illisible.", response.status);
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "Erreur inconnue.";
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Impossible de lire le fichier image."));
    reader.readAsDataURL(file);
  });
}

/**
 * Analyse une image unique : inférence ONNX 100% CÔTÉ CLIENT (l'image ne
 * quitte jamais le navigateur), puis enregistrement du seul RÉSULTAT
 * (probabilité + identifiant patient, jamais l'image) sur le serveur pour
 * historique du tableau de bord.
 *
 * ⚠️ Remplace l'ancien appel à /api/predict (qui proxyait vers un Space
 * Hugging Face nécessitant désormais un abonnement payant) — cf.
 * lib/onnxInference.ts pour le détail de l'inférence.
 */
export async function analyzeImage(
  file: File,
  patientId: string,
  onProgress?: (step: number, total: number) => void
): Promise<PredictionResult & { analysisId: string; caseOpened?: boolean }> {
  const [inferenceResult, originalImageBase64] = await Promise.all([
    analyzeImageClientSide(file, onProgress),
    readFileAsDataUrl(file),
  ]);

  const riskLevel = computeRiskLevel(inferenceResult.probability);

  // Sauvegarde du résultat pour le tableau de bord — ne bloque pas
  // l'affichage du résultat en cas d'échec (ex. réseau coupé), l'analyse
  // reste consultable/imprimable localement même si l'historique serveur
  // n'a pas pu être mis à jour.
  let analysisId = `local_${Date.now()}`;
  let caseOpened = false;
  if (isDemoClient()) {
    // Mode démo : le résultat reste dans le navigateur (données simulées).
    const saved = demoAddAnalysis(patientId, inferenceResult.probability);
    analysisId = saved.analysisId;
    caseOpened = saved.caseOpened;
  } else try {
    const response = await fetch("/api/analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, probability: inferenceResult.probability }),
    });
    const saved = await parseJsonOrThrow<{ analysisId: string; caseOpened?: boolean }>(response);
    analysisId = saved.analysisId;
    caseOpened = Boolean(saved.caseOpened);
  } catch (err) {
    console.error("Échec de l'enregistrement de l'analyse (résultat conservé localement) :", err);
  }

  return {
    probability: inferenceResult.probability,
    riskLevel,
    originalImageBase64,
    gradcamImageBase64: inferenceResult.gradcamImageBase64,
    detectedZones: inferenceResult.detectedZones,
    inferenceTimeMs: inferenceResult.inferenceTimeMs,
    analysisId,
    caseOpened,
  };
}

export async function fetchAnalyses(): Promise<AnalysisRecord[]> {
  if (isDemoClient()) return demoListAnalyses();
  const response = await fetch("/api/analyses", { cache: "no-store" });
  const payload = await parseJsonOrThrow<{ analyses: AnalysisRecord[] }>(response);
  return payload.analyses;
}

export async function submitFeedback(
  analysisId: string,
  status: ExpertStatus,
  expertName: string,
  comment?: string
): Promise<AnalysisRecord> {
  if (isDemoClient()) {
    try {
      return demoFeedback(analysisId, status, expertName, comment);
    } catch (err) {
      throw new ApiError(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId, status, expertName, comment }),
  });
  const payload = await parseJsonOrThrow<{ analysis: AnalysisRecord }>(response);
  return payload.analysis;
}
