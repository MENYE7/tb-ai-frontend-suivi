/**
 * lib/store.ts
 *
 * Persistance des enregistrements d'analyse (dashboard, feedback expert).
 *
 * ⚠️ LIMITATION IMPORTANTE : les fonctions serverless Vercel sont sans
 * état et n'ont pas de disque persistant entre invocations. Ce module
 * utilise Vercel KV (Upstash Redis) si les variables d'environnement
 * `KV_REST_API_URL` / `KV_REST_API_TOKEN` sont présentes ; SINON, il se
 * rabat sur un Map en mémoire, qui ne survit PAS à un redéploiement, un
 * cold start, ou plusieurs instances serverless en parallèle.
 *
 * Le repli en mémoire est utile pour développer/démontrer immédiatement
 * sans configuration, mais NE DOIT PAS être utilisé pour une vraie étude
 * de validation clinique — les données seraient perdues silencieusement.
 * Pour la production : provisionner Vercel KV (ou Postgres/Supabase) et
 * définir les variables d'environnement correspondantes.
 */

import type { AnalysisRecord, ExpertStatus } from "./types";

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
export const HAS_KV = Boolean(KV_URL && KV_TOKEN);
const KV_KEY = "tbai:analyses";

if (!HAS_KV) {
  // eslint-disable-next-line no-console
  console.warn(
    "[lib/store] KV_REST_API_URL / KV_REST_API_TOKEN absents — utilisation " +
      "d'un stockage EN MÉMOIRE, non persistant entre redéploiements. " +
      "Ne pas utiliser en production pour une étude de validation réelle."
  );
}

// --------------------------------------------------------------------------- #
// Repli en mémoire (dev / démonstration uniquement)
// --------------------------------------------------------------------------- #

const memoryStore: Map<string, AnalysisRecord> = new Map();

// --------------------------------------------------------------------------- #
// Client Vercel KV minimal (appels REST directs, pas de dépendance ajoutée)
// --------------------------------------------------------------------------- #

export async function kvRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${KV_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KV_TOKEN}`, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Erreur Vercel KV (${response.status}) sur ${path}`);
  }
  return response.json();
}

async function kvGetAll(): Promise<AnalysisRecord[]> {
  const result = (await kvRequest(`/hgetall/${KV_KEY}`)) as { result?: Record<string, string> | string[] };
  const raw = result.result ?? {};
  // Selon la version de l'API REST, hgetall renvoie un objet ou une liste [clé, valeur, ...].
  const values = Array.isArray(raw) ? raw.filter((_, i) => i % 2 === 1) : Object.values(raw);
  return values.map((v) => JSON.parse(v) as AnalysisRecord);
}

async function kvSet(record: AnalysisRecord): Promise<void> {
  await kvRequest(`/hset/${KV_KEY}/${record.id}`, {
    method: "POST",
    body: JSON.stringify(JSON.stringify(record)),
  });
}

// --------------------------------------------------------------------------- #
// API publique du module (identique quel que soit le backend utilisé)
// --------------------------------------------------------------------------- #

export async function saveAnalysis(record: AnalysisRecord): Promise<void> {
  if (HAS_KV) {
    await kvSet(record);
  } else {
    memoryStore.set(record.id, record);
  }
}

export async function listAnalyses(): Promise<AnalysisRecord[]> {
  const records = HAS_KV ? await kvGetAll() : Array.from(memoryStore.values());
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAnalysis(id: string): Promise<AnalysisRecord | null> {
  if (HAS_KV) {
    const result = (await kvRequest(`/hget/${KV_KEY}/${encodeURIComponent(id)}`)) as { result?: string | null };
    return result.result ? (JSON.parse(result.result) as AnalysisRecord) : null;
  }
  return memoryStore.get(id) ?? null;
}

export async function updateExpertStatus(
  id: string,
  status: ExpertStatus,
  expertName: string,
  comment?: string
): Promise<AnalysisRecord | null> {
  const all = await listAnalyses();
  const record = all.find((r) => r.id === id);
  if (!record) return null;

  const updated: AnalysisRecord = {
    ...record,
    expertStatus: status,
    expertName,
    expertComment: comment,
    expertDecisionAt: new Date().toISOString(),
  };

  await saveAnalysis(updated);
  return updated;
}

export const storeBackend: "kv" | "memory" = HAS_KV ? "kv" : "memory";
