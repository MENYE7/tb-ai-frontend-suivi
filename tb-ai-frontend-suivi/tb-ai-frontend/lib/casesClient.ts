/**
 * lib/casesClient.ts
 *
 * Client des cas suivis, côté navigateur. Choisit le serveur (déploiement
 * réel) ou les données simulées locales (mode démo) selon le drapeau posé
 * par <DemoProvider>.
 */

import { ApiError, parseJsonOrThrow } from "./api";
import type { CaseAction, TbCase } from "./cases";
import { isDemoClient } from "./demoFlag";
import { demoCaseAction, demoListCases, demoOpenCase } from "./demoRepo";

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(err instanceof Error ? err.message : "Erreur inconnue.");
}

export async function fetchCases(): Promise<{ cases: TbCase[]; persistent: boolean }> {
  if (isDemoClient()) return { cases: demoListCases(), persistent: true };
  const response = await fetch("/api/cases", { cache: "no-store" });
  return parseJsonOrThrow<{ cases: TbCase[]; persistent: boolean }>(response);
}

export async function openCaseManually(analysisId: string, by: string): Promise<TbCase> {
  if (isDemoClient()) {
    try {
      return demoOpenCase(analysisId, by);
    } catch (err) {
      throw asApiError(err);
    }
  }
  const response = await fetch("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId, by }),
  });
  return (await parseJsonOrThrow<{ case: TbCase }>(response)).case;
}

export async function sendCaseAction(id: string, action: CaseAction): Promise<TbCase> {
  if (isDemoClient()) {
    try {
      return demoCaseAction(id, action);
    } catch (err) {
      throw asApiError(err);
    }
  }
  const response = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  return (await parseJsonOrThrow<{ case: TbCase }>(response)).case;
}
