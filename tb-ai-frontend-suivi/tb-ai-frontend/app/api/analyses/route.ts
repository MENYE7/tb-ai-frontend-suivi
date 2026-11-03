import { NextRequest, NextResponse } from "next/server";
import { listAnalyses, saveAnalysis } from "@/lib/store";
import { saveCase } from "@/lib/caseStore";
import { isDemoMode } from "@/lib/demo";
import { openCase, shouldOpenCase } from "@/lib/cases";
import { computeRiskLevel, type AnalysisRecord } from "@/lib/types";
import { generateId, isLikelyAnonymizedId } from "@/lib/utils";

export const runtime = "nodejs";
// Sans ceci, Next.js détecte que cette route GET n'utilise aucune API
// dynamique (cookies, headers, searchParams...) et la rend STATIQUEMENT
// au moment du build — figeant le résultat pour toujours (confirmé par
// test : renvoyait un tableau vide en production même après des analyses
// sauvegardées). Cette route doit être exécutée à CHAQUE requête.
export const dynamic = "force-dynamic";

function demoDisabled() {
  return NextResponse.json({ error: "Mode démo : les données restent dans votre navigateur." }, { status: 404 });
}

/**
 * GET /api/analyses
 *
 * Retourne toutes les analyses enregistrées (triées par date décroissante).
 * Le filtrage/tri se fait CÔTÉ CLIENT (components/AnalysesTable.tsx) — le
 * volume attendu pour un usage expert/étude pilote reste modeste ; à
 * revoir (pagination + filtres côté serveur) si le volume grossit
 * significativement.
 */
export async function GET() {
  if (isDemoMode()) return demoDisabled();
  try {
    const analyses = await listAnalyses();
    return NextResponse.json({ analyses });
  } catch (error) {
    console.error("Erreur GET /api/analyses :", error);
    return NextResponse.json({ error: "Impossible de charger les analyses." }, { status: 500 });
  }
}

/**
 * POST /api/analyses
 *
 * Enregistre le RÉSULTAT d'une analyse déjà calculée CÔTÉ CLIENT (l'image
 * ne transite plus jamais par le serveur, cf. lib/onnxInference.ts —
 * inférence 100% navigateur depuis l'abandon du Space Hugging Face payant).
 * Ce endpoint ne reçoit que la probabilité et l'identifiant patient, jamais
 * l'image ni la carte de saillance — cohérent avec le choix initial du
 * projet de ne pas stocker d'image côté serveur.
 */
export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoDisabled();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const { patientId, probability } = (body ?? {}) as { patientId?: unknown; probability?: unknown };

  if (typeof patientId !== "string" || !isLikelyAnonymizedId(patientId)) {
    return NextResponse.json(
      { error: "Identifiant patient manquant ou invalide (attendu : anonymisé, sans espace)." },
      { status: 400 }
    );
  }
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    return NextResponse.json({ error: "Probabilité invalide (attendu : nombre entre 0 et 1)." }, { status: 400 });
  }

  const record: AnalysisRecord = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    patientId,
    probability,
    riskLevel: computeRiskLevel(probability),
    expertStatus: "pending",
  };

  try {
    await saveAnalysis(record);

    // Dépistage positif : ouverture automatique d'un cas à suivre. Un échec ici
    // ne doit pas faire perdre l'analyse déjà enregistrée.
    let caseOpened = false;
    if (shouldOpenCase(record.probability)) {
      try {
        await saveCase(openCase(record, "automatique"));
        caseOpened = true;
      } catch (caseError) {
        console.error("Erreur ouverture automatique du cas :", caseError);
      }
    }
    return NextResponse.json({ analysisId: record.id, caseOpened });
  } catch (error) {
    console.error("Erreur POST /api/analyses :", error);
    return NextResponse.json({ error: "Impossible d'enregistrer l'analyse." }, { status: 500 });
  }
}
