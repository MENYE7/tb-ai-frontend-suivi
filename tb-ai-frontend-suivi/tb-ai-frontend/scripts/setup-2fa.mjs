#!/usr/bin/env node
/**
 * scripts/setup-2fa.mjs
 *
 * ⚠️ À EXÉCUTER UNE SEULE FOIS, EN LOCAL — jamais sur Vercel, jamais commité.
 * Génère tout ce qu'il faut pour activer la 2FA :
 *   1. Un secret TOTP (compatible Google Authenticator / Authy / 1Password)
 *   2. Un QR code affiché directement dans le terminal pour l'ajouter à
 *      votre application d'authentification
 *   3. Le hash bcrypt de votre mot de passe (jamais le mot de passe en clair)
 *   4. Un secret de session aléatoire
 *
 * Usage :
 *   node scripts/setup-2fa.mjs "votre-mot-de-passe-choisi"
 */

import { generateSecret, generateURI } from "otplib";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import crypto from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error("Usage : node scripts/setup-2fa.mjs \"votre-mot-de-passe-choisi\"");
  process.exit(1);
}
if (password.length < 8) {
  console.error("❌ Choisissez un mot de passe d'au moins 8 caractères.");
  process.exit(1);
}

async function main() {
  console.log("Génération en cours...\n");

  const totpSecret = generateSecret();
  const passwordHash = await bcrypt.hash(password, 12);
  const sessionSecret = crypto.randomBytes(32).toString("hex");

  const uri = generateURI({
    issuer: "TB-AI",
    label: "TB-AI Expert",
    secret: totpSecret,
  });

  const qrTerminal = await QRCode.toString(uri, { type: "terminal", small: true });

  console.log("=".repeat(70));
  console.log("1. SCANNEZ CE QR CODE avec Google Authenticator, Authy, 1Password...");
  console.log("=".repeat(70));
  console.log(qrTerminal);

  console.log("=".repeat(70));
  console.log("2. VARIABLES D'ENVIRONNEMENT à ajouter sur Vercel");
  console.log("   (Project Settings > Environment Variables)");
  console.log("=".repeat(70));
  console.log(`AUTH_PASSWORD_HASH=${passwordHash}`);
  console.log(`AUTH_TOTP_SECRET=${totpSecret}`);
  console.log(`AUTH_SESSION_SECRET=${sessionSecret}`);
  console.log("=".repeat(70));
  console.log(
    "\n⚠️  Notez ces 3 lignes maintenant — le secret TOTP ne sera plus jamais\n" +
      "réaffiché. Si vous le perdez, relancez ce script pour en générer un\n" +
      "nouveau (il faudra alors re-scanner un nouveau QR code)."
  );
}

main();
