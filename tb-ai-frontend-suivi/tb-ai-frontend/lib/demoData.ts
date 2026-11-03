/**
 * lib/demoData.ts
 *
 * Génère des données ENTIÈREMENT SIMULÉES pour la démonstration publique :
 * identifiants « SIM-001 », agents « Agent A/B/C », dates calculées par
 * rapport à aujourd'hui, avec un déroulé réaliste (étapes, retards,
 * cas perdus de vue). Rien ici ne provient de patients réels.
 *
 * Générateur pseudo-aléatoire à graine fixe : mêmes cas à chaque réinitialisation.
 */

import {
  applyAction,
  computeAlerts,
  openCase,
  pendingAlertsFor,
  recordAlerts,
  type CaseAction,
  type LostReason,
  type TbCase,
} from "./cases";
import { computeRiskLevel, type AnalysisRecord } from "./types";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const AGENTS = ["Agent A", "Agent B", "Agent C"];

export interface DemoState {
  analyses: AnalysisRecord[];
  cases: TbCase[];
}

export function buildDemoState(now: Date = new Date()): DemoState {
  const rand = mulberry32(2026);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const chance = (p: number) => rand() < p;
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];

  const analyses: AnalysisRecord[] = [];
  const cases: TbCase[] = [];

  // 14 analyses à score bas : visibles au tableau de bord, sans cas ouvert.
  for (let i = 0; i < 14; i += 1) {
    const probability = between(0.02, 0.45);
    const createdAt = new Date(now.getTime() - between(0.2, 70) * DAY);
    analyses.push({
      id: `demo_low_${i + 1}`,
      createdAt: createdAt.toISOString(),
      patientId: `SIM-L${String(i + 1).padStart(3, "0")}`,
      probability,
      riskLevel: computeRiskLevel(probability),
      expertStatus: chance(0.5) ? "confirmed" : "pending",
      simulated: true,
    });
  }

  // 44 dépistages positifs : un cas chacun, plus ou moins avancé.
  for (let i = 0; i < 44; i += 1) {
    const probability = between(0.5, 0.98);
    const start = new Date(now.getTime() - between(1, 75) * DAY);
    const analysis: AnalysisRecord = {
      id: `demo_pos_${i + 1}`,
      createdAt: start.toISOString(),
      patientId: `SIM-${String(i + 1).padStart(3, "0")}`,
      probability,
      riskLevel: computeRiskLevel(probability),
      expertStatus: chance(0.6) ? "confirmed" : chance(0.15) ? "rejected" : "pending",
      simulated: true,
    };
    analyses.push(analysis);

    let c = openCase(analysis, "automatique", start);
    let cursor = start.getTime();
    const step = (action: CaseAction, afterDays: number): boolean => {
      const when = cursor + afterDays * DAY;
      if (when > now.getTime()) return false; // cet événement n'a pas encore eu lieu
      const result = applyAction(c, action, new Date(when));
      if (!result.ok) return false;
      c = result.case;
      cursor = when;
      return true;
    };

    // Responsable : 78 % des cas sont attribués rapidement.
    if (chance(0.78)) step({ action: "assign", by: "Agent A", owner: pick(AGENTS) }, between(0.1, 1.5));

    const lostReasons: LostReason[] = ["unreachable", "unreachable", "declined", "moved", "died", "other"];
    const abandon = (): boolean => {
      const reason = pick(lostReasons);
      if (reason === "unreachable") {
        // Règle de l'outil : deux tentatives sans réponse documentées avant « injoignable ».
        step({ action: "contact", by: pick(AGENTS), channel: "sms", reached: false, note: "Message envoyé (simulé)" }, between(0.5, 3));
        step({ action: "contact", by: pick(AGENTS), channel: "call", reached: false, note: "Pas de réponse (simulé)" }, between(0.5, 3));
      }
      return step(
        { action: "close", by: pick(AGENTS), outcome: "lost", lostReason: reason, note: reason === "other" ? "Motif simulé" : undefined },
        between(2, 14)
      );
    };

    if (chance(0.2) && abandon()) {
      cases.push(c);
      continue;
    }
    if (chance(0.15)) { cases.push(c); continue; } // cas qui n'avance pas : il finira en retard

    if (!step({ action: "advance", by: pick(AGENTS), to: "test_ordered" }, between(1, 6))) { cases.push(c); continue; }
    if (chance(0.12)) { cases.push(c); continue; }

    const roll = rand();
    const testResult = roll < 0.72 ? "positive" : roll < 0.93 ? "negative" : "not_done";
    const recorded = step(
      { action: "advance", by: pick(AGENTS), to: "result_recorded", testResult, note: testResult === "not_done" ? "Crachat non fourni (simulé)" : undefined },
      between(2, 12)
    );
    if (!recorded) { cases.push(c); continue; }

    if (testResult === "negative") {
      if (chance(0.8)) step({ action: "close", by: pick(AGENTS), outcome: "excluded" }, between(0.5, 4));
    } else if (testResult === "positive") {
      if (chance(0.2) && abandon()) { cases.push(c); continue; }
      if (step({ action: "advance", by: pick(AGENTS), to: "treatment", note: "Traitement initié (simulé)" }, between(1, 10))) {
        if (chance(0.6)) step({ action: "close", by: pick(AGENTS), outcome: "treated" }, between(1, 6));
      }
    } else if (chance(0.5)) {
      abandon();
    }
    cases.push(c);
  }

  // Rappels patient simulés sur une partie des cas en retard, puis passage
  // « automatique » des alertes (comme le ferait la tâche quotidienne).
  const withActivity = cases.map((c) => {
    if (c.stage === "closed") return c;
    let out = c;
    const due = c.dueDate ? Date.parse(`${c.dueDate}T23:59:59.999Z`) : Number.NaN;
    if (Number.isFinite(due) && due < now.getTime() && chance(0.45)) {
      const when = new Date(Math.min(now.getTime(), due + between(0.2, 3) * DAY));
      const reached = chance(0.4);
      const r = applyAction(
        out,
        { action: "contact", by: pick(AGENTS), channel: pick(["sms", "whatsapp", "call"] as const), reached, note: reached ? "Rendez-vous reprogrammé (simulé)" : "Pas de réponse (simulé)" },
        when
      );
      if (r.ok) out = r.case;
    }
    return recordAlerts(out, pendingAlertsFor(out, computeAlerts([out], now)), now);
  });

  analyses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  withActivity.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { analyses, cases: withActivity };
}
