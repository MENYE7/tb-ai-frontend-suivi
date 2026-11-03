/**
 * lib/auth-edge.ts
 *
 * ⚠️ CORRECTIF — sous-ensemble d'auth.ts contenant UNIQUEMENT ce qui doit
 * tourner sur le runtime Edge (middleware.ts). Séparé de lib/auth.ts après
 * que `next build` a révélé que bcryptjs (utilisé par verifyPassword) tire
 * des API Node (`process.nextTick`, `setImmediate`) non supportées par
 * l'Edge Runtime — même importées dynamiquement à l'intérieur d'une
 * fonction jamais appelée depuis le middleware, le bundler Edge de Next.js
 * les détecte et les inclut quand même dans l'analyse du fichier entier.
 * En import du bundle Edge, cela ne fait qu'avertir aujourd'hui, mais reste
 * un risque réel si bcryptjs venait à être réellement invoqué sur ce
 * runtime. Séparer les fichiers élimine le problème à la source plutôt que
 * de compter sur le fait que le code mort ne s'exécute jamais.
 *
 * Ne JAMAIS importer bcryptjs ou otplib dans ce fichier.
 */

const SESSION_PURPOSE = "session";
const PENDING_2FA_PURPOSE = "pending-2fa";

export const SESSION_COOKIE_NAME = "tbai_session";
export const PENDING_COOKIE_NAME = "tbai_pending_2fa";

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
export const PENDING_DURATION_MS = 5 * 60 * 1000; // 5 minutes pour saisir le code TOTP

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function createToken(purpose: string, secret: string, durationMs: number): Promise<string> {
  const expiry = Date.now() + durationMs;
  const payload = `${purpose}:${expiry}`;
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToHex(signature)}`;
}

async function verifyToken(token: string, expectedPurpose: string, secret: string): Promise<boolean> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return false;

  const payload = token.slice(0, lastDot);
  const sigHex = token.slice(lastDot + 1);
  const colonIdx = payload.indexOf(":");
  if (colonIdx === -1) return false;

  const purpose = payload.slice(0, colonIdx);
  const expiryStr = payload.slice(colonIdx + 1);
  if (purpose !== expectedPurpose) return false;

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;

  const sigBytes = hexToBytes(sigHex);
  if (!sigBytes) return false;

  const key = await getHmacKey(secret);
  // Cast ciblé : TypeScript (>= 5.5) distingue Uint8Array<ArrayBufferLike>
  // de BufferSource ; les octets produits ici sont toujours un buffer
  // classique en pratique (jamais un SharedArrayBuffer) — cast sans risque,
  // même limitation déjà rencontrée avec pdf-lib plus tôt dans ce projet.
  return crypto.subtle.verify("HMAC", key, sigBytes as unknown as BufferSource, new TextEncoder().encode(payload));
}

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SESSION_SECRET manquante ou trop courte (>=16 caractères) — générez-en une avec scripts/setup-2fa.mjs."
    );
  }
  return secret;
}

/** Jeton de session complet (émis après succès du mot de passe ET du TOTP). */
export async function createSessionToken(): Promise<string> {
  return createToken(SESSION_PURPOSE, getSessionSecret(), SESSION_DURATION_MS);
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    return await verifyToken(token, SESSION_PURPOSE, getSessionSecret());
  } catch {
    return false;
  }
}

/** Jeton intermédiaire : mot de passe déjà vérifié, code TOTP encore attendu. */
export async function createPending2faToken(): Promise<string> {
  return createToken(PENDING_2FA_PURPOSE, getSessionSecret(), PENDING_DURATION_MS);
}

export async function verifyPending2faToken(token: string): Promise<boolean> {
  try {
    return await verifyToken(token, PENDING_2FA_PURPOSE, getSessionSecret());
  } catch {
    return false;
  }
}
