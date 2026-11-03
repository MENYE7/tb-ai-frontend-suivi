import { NextRequest, NextResponse } from "next/server";
import { getCase, saveCase } from "@/lib/caseStore";
import { isDemoMode } from "@/lib/demo";
import { applyAction, type CaseAction } from "@/lib/cases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["assign", "set_due", "advance", "close", "note", "contact"];

/**
 * PATCH /api/cases/[id] : applique UNE action humaine sur un cas
 * (assign | set_due | advance | close | note | contact). Toutes les règles
 * (ordre des étapes, motif obligatoire, détection de coordonnées) sont dans
 * lib/cases.ts — le même code que celui du mode démo.
 *
 * ⚠️ `by` est un nom saisi dans l'interface, pas une authentification
 * individuelle (voir lib/useExpertName.ts).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "Mode démo : les données restent dans votre navigateur." }, { status: 404 });
  }
  let body: Partial<CaseAction> & { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!body.action || !ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }

  try {
    const current = await getCase(params.id);
    if (!current) return NextResponse.json({ error: "Cas introuvable." }, { status: 404 });

    const result = applyAction(current, body as CaseAction);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

    await saveCase(result.case);
    return NextResponse.json({ case: result.case });
  } catch (error) {
    console.error("Erreur PATCH /api/cases/[id] :", error);
    return NextResponse.json({ error: "Impossible d'enregistrer l'action." }, { status: 500 });
  }
}
