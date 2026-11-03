/**
 * lib/demoRepo.ts
 *
 * Données du mode démo : simulées, gardées dans le navigateur du visiteur
 * (localStorage, avec repli en mémoire s'il est bloqué). Rien n'est envoyé
 * au serveur, donc rien n'est partagé entre visiteurs.
 */

import { applyAction, openCase, shouldOpenCase, type CaseAction, type TbCase } from "./cases";
import { buildDemoState, type DemoState } from "./demoData";
import { computeRiskLevel, type AnalysisRecord, type ExpertStatus } from "./types";
import { generateId } from "./utils";

const STORAGE_KEY = "tbai:demo:v2";
const MAX_ANALYSES = 500;

let state: DemoState | null = null;

function load(): DemoState {
  if (state) return state;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (Array.isArray(parsed.analyses) && Array.isArray(parsed.cases)) {
        state = parsed;
        return state;
      }
    }
  } catch {
    // localStorage indisponible ou corrompu : on repart de données fraîches.
  }
  state = buildDemoState();
  persist();
  return state;
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Navigation privée / stockage plein : la démo continue en mémoire.
  }
}

export function demoReset(): void {
  state = buildDemoState();
  persist();
}

export function demoListAnalyses(): AnalysisRecord[] {
  return [...load().analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function demoListCases(): TbCase[] {
  return [...load().cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function demoAddAnalysis(patientId: string, probability: number): { analysisId: string; caseOpened: boolean } {
  const s = load();
  const record: AnalysisRecord = {
    id: generateId("demo"),
    createdAt: new Date().toISOString(),
    patientId,
    probability,
    riskLevel: computeRiskLevel(probability),
    expertStatus: "pending",
    simulated: true,
  };
  s.analyses = [record, ...s.analyses].slice(0, MAX_ANALYSES);
  let caseOpened = false;
  if (shouldOpenCase(probability)) {
    s.cases = [openCase(record, "automatique"), ...s.cases];
    caseOpened = true;
  }
  persist();
  return { analysisId: record.id, caseOpened };
}

export function demoFeedback(id: string, status: ExpertStatus, expertName: string, comment?: string): AnalysisRecord {
  const s = load();
  const found = s.analyses.find((a) => a.id === id);
  if (!found) throw new Error("Analyse introuvable.");
  const updated: AnalysisRecord = {
    ...found,
    expertStatus: status,
    expertName,
    expertComment: comment,
    expertDecisionAt: new Date().toISOString(),
  };
  s.analyses = s.analyses.map((a) => (a.id === id ? updated : a));
  persist();
  return updated;
}

export function demoOpenCase(analysisId: string, by: string): TbCase {
  const s = load();
  const analysis = s.analyses.find((a) => a.id === analysisId);
  if (!analysis) throw new Error("Analyse introuvable.");
  if (s.cases.some((c) => c.id === analysisId)) throw new Error("Un suivi existe déjà pour cette analyse.");
  if (!by.trim()) throw new Error("Indiquez votre nom (en haut de la page).");
  const created = openCase(analysis, by.trim());
  s.cases = [created, ...s.cases];
  persist();
  return created;
}

export function demoCaseAction(id: string, action: CaseAction): TbCase {
  const s = load();
  const current = s.cases.find((c) => c.id === id);
  if (!current) throw new Error("Cas introuvable.");
  const result = applyAction(current, action);
  if (!result.ok) throw new Error(result.error);
  s.cases = s.cases.map((c) => (c.id === id ? result.case : c));
  persist();
  return result.case;
}
