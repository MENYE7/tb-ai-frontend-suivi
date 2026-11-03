import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

/**
 * app/api/setup/route.ts
 *
 * Génère les identifiants 2FA (mot de passe hashé, secret TOTP, QR code,
 * secret de session) DEPUIS LE NAVIGATEUR — remplace le script
 * scripts/setup-2fa.mjs qui nécessitait d'installer Node.js et d'ouvrir un
 * terminal en local. La seule étape qui reste hors de l'app : copier les 3
 * variables affichées dans le dashboard Vercel (Vercel n'offre aucun autre
 * moyen de définir des variables d'environnement).
 *
 * ⚠️ Se désactive AUTOMATIQUEMENT dès que AUTH_PASSWORD_HASH est déjà
 * configurée — sans quoi n'importe qui connaissant l'URL /setup pourrait
 * régénérer de nouveaux identifiants et prendre le contrôle de l'accès
 * après la configuration initiale. Avant cette configuration, l'app n'a
 * de toute façon aucun mot de passe valide à protéger — cette fenêtre
 * d'ouverture est la même que celle de n'importe quel assistant
 * d'installation auto-hébergé (WordPress, Nextcloud...).
 */

function isAlreadyConfigured(): boolean {
  return Boolean(process.env.AUTH_PASSWORD_HASH);
}

export async function GET() {
  return NextResponse.json({ configured: isAlreadyConfigured() });
}

export async function POST(request: NextRequest) {
  if (isAlreadyConfigured()) {
    return NextResponse.json(
      { error: "Déjà configuré — pour changer le mot de passe ou régénérer la 2FA, modifiez directement les variables sur Vercel." },
      { status: 403 }
    );
  }

  let password: unknown;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Mot de passe d'au moins 8 caractères requis." }, { status: 400 });
  }

  const [{ generateSecret, generateURI }, bcryptModule, QRCodeModule] = await Promise.all([
    import("otplib"),
    import("bcryptjs"),
    import("qrcode"),
  ]);
  const bcrypt = bcryptModule.default ?? bcryptModule;
  const QRCode = QRCodeModule.default ?? QRCodeModule;

  const totpSecret = generateSecret();
  const passwordHash = await bcrypt.hash(password, 12);
  const sessionSecret = crypto.randomBytes(32).toString("hex");

  const uri = generateURI({ issuer: "TB-AI", label: "TB-AI Expert", secret: totpSecret });
  const qrDataUrl: string = await QRCode.toDataURL(uri);

  return NextResponse.json({
    qrDataUrl,
    envVars: {
      AUTH_PASSWORD_HASH: passwordHash,
      AUTH_TOTP_SECRET: totpSecret,
      AUTH_SESSION_SECRET: sessionSecret,
    },
  });
}
