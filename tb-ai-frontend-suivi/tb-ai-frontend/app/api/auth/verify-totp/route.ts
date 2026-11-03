import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  verifyPending2faToken,
  verifyTotpCode,
} from "@/lib/auth";

export const runtime = "nodejs"; // otplib + vérifications ont besoin du runtime Node

/**
 * Étape 2/2 de la connexion : vérifie le code TOTP à 6 chiffres.
 * N'accepte cette vérification QUE si le cookie temporaire posé par
 * /api/auth/login (étape 1, mot de passe) est présent et valide — sans
 * quoi cet endpoint refuse tout, même avec un code TOTP par ailleurs correct.
 */
export async function POST(request: NextRequest) {
  const pendingToken = request.cookies.get(PENDING_COOKIE_NAME)?.value;
  const pendingValid = pendingToken ? await verifyPending2faToken(pendingToken) : false;

  if (!pendingValid) {
    return NextResponse.json(
      { error: "Session d'authentification expirée ou invalide. Recommencez depuis le mot de passe." },
      { status: 401 }
    );
  }

  let code: unknown;
  try {
    const body = await request.json();
    code = body?.code;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Code à 6 chiffres attendu." }, { status: 400 });
  }

  let valid: boolean;
  try {
    valid = await verifyTotpCode(code);
  } catch (err) {
    console.error("Erreur de configuration auth :", err);
    return NextResponse.json({ error: "Authentification non configurée côté serveur." }, { status: 500 });
  }

  if (!valid) {
    return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
  }

  const sessionToken = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
  // Le pending token a rempli son rôle, on le supprime.
  response.cookies.delete(PENDING_COOKIE_NAME);
  return response;
}
