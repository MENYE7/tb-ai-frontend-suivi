/**
 * lib/demo.ts
 *
 * Le MODE DÉMO sert une démonstration publique (projet Vercel séparé) :
 * aucune authentification, données entièrement SIMULÉES, gardées dans le
 * navigateur du visiteur (aucune écriture serveur).
 *
 * Garde-fou : le mode démo ne s'active que si DEMO_MODE=1 ET qu'AUCUN mot
 * de passe n'est configuré. Le déploiement réel (qui a AUTH_PASSWORD_HASH)
 * ne peut donc jamais devenir public par erreur en ajoutant DEMO_MODE.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1" && !process.env.AUTH_PASSWORD_HASH;
}
