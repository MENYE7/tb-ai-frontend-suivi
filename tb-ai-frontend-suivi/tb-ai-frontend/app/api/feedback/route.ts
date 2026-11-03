import { NextRequest, NextResponse } from "next/server";
import { updateExpertStatus } from "@/lib/store";
import type { ExpertStatus } from "@/lib/types";
import { isDemoMode } from "@/lib/demo";

export const runtime = "nodejs";

interface FeedbackBody {
  analysisId: string;
  status: ExpertStatus;
  expertName: string;
  comment?: string;
}

const VALID_STATUSES: ExpertStatus[] = ["confirmed", "rejected"];

/**
 * POST /api/feedback
 *
 * Enregistre la décision d'un expert (confirme/infirme le résultat IA) sur
 * une analyse existante. C'est la donnée qui, agrégée dans le temps,
 * permettrait un futur ré-entraînement ou un audit de performance réel
 * (cf. src/evaluate_external.py du dépôt principal pour ce type d'usage).
 *
 * ⚠️ `expertName` est actuellement un champ texte libre saisi dans l'UI
 * (voir components/Navbar.tsx), PAS une authentification réelle. Pour une
 * étude de validation qui doit tracer de façon fiable "qui a validé quoi",
 * il faudra remplacer ça par une vraie authentification (ex. NextAuth +
 * base d'utilisateurs) avant de considérer ces données comme un audit trail
 * opposable.
 */
export async function POST(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "Mode démo : les données restent dans votre navigateur." }, { status: 404 });
  }
  try {
    const body = (await request.json()) as Partial<FeedbackBody>;

    if (!body.analysisId || typeof body.analysisId !== "string") {
      return NextResponse.json({ error: "analysisId manquant." }, { status: 400 });
    }
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "status invalide (attendu : confirmed | rejected)." }, { status: 400 });
    }
    if (!body.expertName || typeof body.expertName !== "string" || body.expertName.trim().length === 0) {
      return NextResponse.json({ error: "Nom de l'expert requis." }, { status: 400 });
    }

    const updated = await updateExpertStatus(
      body.analysisId,
      body.status,
      body.expertName.trim(),
      body.comment?.trim()
    );

    if (!updated) {
      return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
    }

    return NextResponse.json({ analysis: updated });
  } catch (error) {
    console.error("Erreur POST /api/feedback :", error);
    return NextResponse.json({ error: "Impossible d'enregistrer le feedback." }, { status: 500 });
  }
}
