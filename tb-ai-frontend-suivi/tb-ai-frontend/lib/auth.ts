/**
 * lib/auth.ts
 *
 * Vérifications nécessitant le runtime Node (bcryptjs, otplib) — jamais
 * importé par middleware.ts (Edge). Pour les jetons de session, utilisés
 * à la fois ici et dans le middleware, voir lib/auth-edge.ts.
 */

export {
  SESSION_COOKIE_NAME,
  PENDING_COOKIE_NAME,
  SESSION_DURATION_MS,
  PENDING_DURATION_MS,
  createSessionToken,
  verifySessionToken,
  createPending2faToken,
  verifyPending2faToken,
} from "./auth-edge";

/**
 * Vérifie le mot de passe (premier facteur) contre son hash bcrypt stocké
 * en variable d'environnement — jamais le mot de passe en clair.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!hash) {
    throw new Error("AUTH_PASSWORD_HASH non configurée — générez-la avec scripts/setup-2fa.mjs.");
  }
  // bcryptjs est un module CommonJS : avec un import dynamique en contexte
  // ESM, ses fonctions se retrouvent sous `.default`, pas directement sur
  // l'objet module (confirmé par test — mod.compare est undefined,
  // mod.default.compare existe).
  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default ?? bcryptModule;
  return bcrypt.compare(password, hash);
}

/**
 * Vérifie le code TOTP à 6 chiffres (second facteur) contre le secret
 * partagé stocké en variable d'environnement. Tolérance de ±30s pour
 * absorber un léger décalage d'horloge entre le téléphone et le serveur.
 */
export async function verifyTotpCode(code: string): Promise<boolean> {
  const secret = process.env.AUTH_TOTP_SECRET;
  if (!secret) {
    throw new Error("AUTH_TOTP_SECRET non configurée — générez-la avec scripts/setup-2fa.mjs.");
  }
  const { verify } = await import("otplib");
  const result = await verify({ secret, token: code, epochTolerance: 30 });
  return result.valid;
}
