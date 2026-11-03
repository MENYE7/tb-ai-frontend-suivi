import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth-edge";

/**
 * middleware.ts
 *
 * Tourne AVANT toute page ou route API (sauf celles explicitement
 * exclues via `matcher` ci-dessous). Redirige vers /login si aucune
 * session valide n'est présente.
 *
 * ⚠️ Ce fichier tourne sur le runtime Edge de Next.js par défaut — c'est
 * pour ça que lib/auth.ts n'utilise que `crypto.subtle` (Web standard),
 * jamais le module `crypto` de Node, qui n'existe pas dans ce runtime.
 */

// /api/cron/ est public pour le middleware, mais la route elle-même exige le jeton CRON_SECRET.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/verify-totp", "/setup", "/api/setup", "/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Mode démo (projet public séparé) : pas de connexion, données simulées dans le
  // navigateur. Ne s'active que sans mot de passe configuré (voir lib/demo.ts).
  // /setup reste fermé : une démo publique ne doit pas générer de secrets.
  if (process.env.DEMO_MODE === "1" && !process.env.AUTH_PASSWORD_HASH) {
    if (pathname.startsWith("/setup") || pathname.startsWith("/api/setup") || pathname.startsWith("/api/auth")) {
      return NextResponse.json({ error: "Non disponible en mode démo." }, { status: 404 });
    }
    if (pathname === "/login") return NextResponse.redirect(new URL("/cases", request.url));
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"))) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValid = sessionCookie ? await verifySessionToken(sessionCookie) : false;

  if (!isValid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Exclut les fichiers statiques Next.js (_next/*) et les favicons du
  // contrôle d'authentification — inutile de les protéger, et les
  // protéger casserait le chargement des assets de la page /login elle-même.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
