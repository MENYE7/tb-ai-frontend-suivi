/**
 * lib/caseStore.ts
 *
 * Persistance des cas suivis. Même principe que lib/store.ts : Vercel KV
 * (Upstash Redis) si KV_REST_API_URL / KV_REST_API_TOKEN existent, sinon
 * repli en mémoire.
 *
 * ⚠️ Le repli en mémoire n'est PAS fiable pour le suivi de cas sur Vercel :
 * chaque route API tourne dans sa propre fonction serverless, avec sa
 * propre mémoire, qui disparaît aussi à chaque redéploiement. Pour un usage
 * réel, configurez le stockage persistant (voir README / mode d'emploi).
 * L'interface affiche un avertissement tant que ce n'est pas fait.
 */

import { HAS_KV, kvRequest } from "./store";
import type { TbCase } from "./cases";

const KV_KEY = "tbai:cases";
const memory: Map<string, TbCase> = new Map();

export const casesPersistent: boolean = HAS_KV;

export async function listCases(): Promise<TbCase[]> {
  let cases: TbCase[];
  if (HAS_KV) {
    const result = (await kvRequest(`/hgetall/${KV_KEY}`)) as { result?: Record<string, string> | string[] };
    const raw = result.result ?? {};
    // Selon la version de l'API REST, hgetall renvoie un objet ou une liste [clé, valeur, ...].
    const values = Array.isArray(raw) ? raw.filter((_, i) => i % 2 === 1) : Object.values(raw);
    cases = values.map((v) => JSON.parse(v) as TbCase);
  } else {
    cases = Array.from(memory.values());
  }
  return cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCase(id: string): Promise<TbCase | null> {
  if (HAS_KV) {
    const result = (await kvRequest(`/hget/${KV_KEY}/${encodeURIComponent(id)}`)) as { result?: string | null };
    return result.result ? (JSON.parse(result.result) as TbCase) : null;
  }
  return memory.get(id) ?? null;
}

export async function saveCase(c: TbCase): Promise<void> {
  if (HAS_KV) {
    await kvRequest(`/hset/${KV_KEY}/${encodeURIComponent(c.id)}`, {
      method: "POST",
      body: JSON.stringify(JSON.stringify(c)),
    });
  } else {
    memory.set(c.id, c);
  }
}
