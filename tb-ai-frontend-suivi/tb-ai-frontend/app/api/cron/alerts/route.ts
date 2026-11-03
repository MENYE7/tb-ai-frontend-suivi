import { NextRequest, NextResponse } from "next/server";
import { listCases, saveCase, casesPersistent } from "@/lib/caseStore";
import { isDemoMode } from "@/lib/demo";
import { computeAlerts, pendingAlertsFor, recordAlerts, type CaseAlert } from "@/lib/cases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/alerts : tâche QUOTIDIENNE (voir vercel.json).
 *
 * 1. Repère les cas en retard ou sans responsable.
 * 2. Inscrit chaque nouvelle alerte au journal du cas (une seule fois par
 *    échéance : pas de doublon d'un jour à l'autre).
 * 3. Envoie un e-mail récapitulatif à l'équipe si l'envoi est configuré
 *    (RESEND_API_KEY + ALERT_EMAIL_TO + ALERT_EMAIL_FROM). Sinon, les alertes
 *    restent visibles dans l'application et dans le journal.
 *
 * L'e-mail ne contient QUE des identifiants anonymisés et des étapes : aucune
 * donnée de patient. Aucun message n'est envoyé aux patients par cette route.
 *
 * Protection : Vercel envoie `Authorization: Bearer <CRON_SECRET>`. Sans
 * CRON_SECRET configuré, la route refuse toute requête.
 */
export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "Non disponible en mode démo." }, { status: 404 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const now = new Date();
    const cases = await listCases();
    const all = computeAlerts(cases, now);

    const fresh: CaseAlert[] = [];
    for (const c of cases) {
      const pending = pendingAlertsFor(c, all);
      if (pending.length === 0) continue;
      await saveCase(recordAlerts(c, pending, now));
      fresh.push(...pending);
    }

    const emailed = await sendDigest(all, fresh, now);

    return NextResponse.json({
      checkedCases: cases.length,
      activeAlerts: all.length,
      newAlerts: fresh.length,
      emailed,
      persistent: casesPersistent,
    });
  } catch (error) {
    console.error("Erreur GET /api/cron/alerts :", error);
    return NextResponse.json({ error: "Échec de la tâche d'alertes." }, { status: 500 });
  }
}

async function sendDigest(all: CaseAlert[], fresh: CaseAlert[], now: Date): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  if (!key || !to || !from || all.length === 0) return false;

  const escalations = all.filter((a) => a.kind === "escalation");
  const lines = all.slice(0, 50).map((a) => `- ${a.text}`);
  const text = [
    `TB-AI — récapitulatif du suivi (${now.toISOString().slice(0, 10)})`,
    "",
    `${all.length} alerte(s) active(s), dont ${fresh.length} nouvelle(s) et ${escalations.length} à remonter au superviseur.`,
    "",
    ...lines,
    all.length > 50 ? `… et ${all.length - 50} autre(s) dans l'application.` : "",
    "",
    "Ce message ne contient que des identifiants anonymisés. Ouvrez la page « Suivi des cas » pour agir.",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject: `TB-AI : ${all.length} alerte(s) de suivi${escalations.length ? ` (${escalations.length} à remonter)` : ""}`,
      text,
    }),
  });
  if (!response.ok) {
    console.error("Envoi du récapitulatif refusé :", response.status);
    return false;
  }
  return true;
}
