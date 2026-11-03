import { NextRequest, NextResponse } from "next/server";
import { casesPersistent, getCase, listCases, saveCase } from "@/lib/caseStore";
import { getAnalysis } from "@/lib/store";
import { isDemoMode } from "@/lib/demo";
import { openCase } from "@/lib/cases";

export const runtime = "nodejs";
// Doit s'exécuter à chaque requête (voir la note dans app/api/analyses/route.ts).
export const dynamic = "force-dynamic";

function demoDisabled() {
  return NextResponse.json({ error: "Mode démo : les données restent dans votre navigateur." }, { status: 404 });
}

/** GET /api/cases : tous les cas suivis (plus récents d'abord). */
export async function GET() {
  if (isDemoMode()) return demoDisabled();
  try {
    const cases = await listCases();
    return NextResponse.json({ cases, persistent: casesPersistent });
  } catch (error) {
    console.error("Erreur GET /api/cases :", error);
    return NextResponse.json({ error: "Impossible de charger les cas." }, { status: 500 });
  }
}

/**
 * POST /api/cases { analysisId, by } : ouvre MANUELLEMENT un cas pour une
 * analyse existante (les dépistages positifs ouvrent un cas automatiquement ;
 * ceci sert aux analyses plus anciennes ou à un score inférieur au seuil que
 * le clinicien veut tout de même suivre).
 */
export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoDisabled();
  let body: { analysisId?: unknown; by?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (typeof body.analysisId !== "string" || !body.analysisId) {
    return NextResponse.json({ error: "analysisId manquant." }, { status: 400 });
  }
  const by = typeof body.by === "string" ? body.by.trim().slice(0, 60) : "";
  if (!by) {
    return NextResponse.json({ error: "Indiquez votre nom (en haut de la page)." }, { status: 400 });
  }

  try {
    const analysis = await getAnalysis(body.analysisId);
    if (!analysis) return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
    if (await getCase(analysis.id)) {
      return NextResponse.json({ error: "Un suivi existe déjà pour cette analyse." }, { status: 409 });
    }
    const created = openCase(analysis, by);
    await saveCase(created);
    return NextResponse.json({ case: created });
  } catch (error) {
    console.error("Erreur POST /api/cases :", error);
    return NextResponse.json({ error: "Impossible d'ouvrir le cas." }, { status: 500 });
  }
}
