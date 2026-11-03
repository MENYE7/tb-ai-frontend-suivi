import { NextRequest, NextResponse } from "next/server";
import { createPending2faToken, PENDING_COOKIE_NAME, PENDING_DURATION_MS, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs"; // bcryptjs a besoin du runtime Node, pas Edge

/**
 * Étape 1/2 de la connexion : vérifie le mot de passe.
 * Si correct, pose un cookie temporaire (5 min) attestant que cette étape
 * est passée — nécessaire pour que /api/auth/verify-totp accepte ensuite
 * le code TOTP (empêche d'appeler directement la vérification TOTP sans
 * être passé par le mot de passe).
 */
export async function POST(request: NextRequest) {
  let password: unknown;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Mot de passe manquant." }, { status: 400 });
  }

  let valid: boolean;
  try {
    valid = await verifyPassword(password);
  } catch (err) {
    console.error("Erreur de configuration auth :", err);
    return NextResponse.json({ error: "Authentification non configurée côté serveur." }, { status: 500 });
  }

  if (!valid) {
    // Message volontairement générique : ne pas confirmer/infirmer
    // l'existence d'un compte ou distinguer les causes d'échec.
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  const pendingToken = await createPending2faToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PENDING_COOKIE_NAME, pendingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_DURATION_MS / 1000,
  });
  return response;
}
