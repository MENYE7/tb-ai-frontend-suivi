"use client";

import { useEffect, useState } from "react";
import { AuthLayout, AuthField, authInputStyle, authButtonStyle } from "@/components/AuthLayout";

interface SetupResult {
  qrDataUrl: string;
  envVars: {
    AUTH_PASSWORD_HASH: string;
    AUTH_TOTP_SECRET: string;
    AUTH_SESSION_SECRET: string;
  };
}

const PAGE_BG = { background: "#0b1220", color: "#e7ecf5" };

export default function SetupPage() {
  const [checking, setChecking] = useState(true);
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((data) => setAlreadyConfigured(Boolean(data.configured)))
      .catch(() => setAlreadyConfigured(false))
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Échec de la configuration.");
        return;
      }
      setResult(data);
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const envVarsAsText = result
    ? `AUTH_PASSWORD_HASH=${result.envVars.AUTH_PASSWORD_HASH}\nAUTH_TOTP_SECRET=${result.envVars.AUTH_TOTP_SECRET}\nAUTH_SESSION_SECRET=${result.envVars.AUTH_SESSION_SECRET}`
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(envVarsAsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center" style={PAGE_BG}>
        <p className="text-sm" style={{ color: "#7d93c2" }}>
          Vérification...
        </p>
      </main>
    );
  }

  if (alreadyConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4" style={PAGE_BG}>
        <div className="w-full max-w-sm rounded-xl p-6 text-center" style={{ background: "#101a2e", border: "1px solid #253656" }}>
          <h1 className="mb-2 text-lg font-semibold" style={{ color: "#f4f7fc" }}>
            Déjà configuré
          </h1>
          <p className="mb-4 text-sm" style={{ color: "#9fb3dd" }}>
            L&apos;authentification est déjà en place. Pour la modifier (nouveau mot de passe, nouveau secret
            TOTP), changez directement les variables d&apos;environnement sur Vercel.
          </p>
          <a href="/login" className="text-sm" style={{ color: "#5b7fd4" }}>
            Aller à la connexion →
          </a>
        </div>
      </main>
    );
  }

  if (!result) {
    return (
      <AuthLayout
        stepLabel="ÉTAPE 1/2"
        title="Créer un compte protégé"
        description="TB-AI — authentification à double facteur réelle (TOTP, RFC 6238), vérifiée côté serveur à chaque connexion, compatible Google Authenticator, Authy, 1Password."
      >
        <form onSubmit={handleSubmit}>
          <AuthField label="MOT DE PASSE">
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={authInputStyle}
            />
          </AuthField>
          <AuthField label="CONFIRMER LE MOT DE PASSE">
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={authInputStyle}
            />
          </AuthField>
          {error && (
            <p className="mb-4 text-sm" style={{ color: "#f2a3a3" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={authButtonStyle}
          >
            {isSubmitting ? "Génération..." : "Continuer vers la 2FA"}
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      stepLabel="ÉTAPE 2/2"
      title="Activer votre 2FA"
      description="Scannez le QR code puis reportez les 3 variables sur Vercel — elles ne seront plus jamais réaffichées."
    >
      <div
        className="mb-4 rounded-lg p-3 text-sm"
        style={{ background: "rgba(242,163,163,.08)", border: "1px solid rgba(242,163,163,.3)", color: "#f2c9a3" }}
      >
        ⚠️ Copiez ces valeurs avant de fermer cette page.
      </div>

      <p className="mb-2 text-[11px] font-semibold tracking-widest" style={{ color: "#7d93c2" }}>
        SCAN (GOOGLE AUTHENTICATOR, AUTHY, 1PASSWORD...)
      </p>
      <div className="mb-4 flex justify-center rounded-lg p-4" style={{ background: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.qrDataUrl} alt="QR code TOTP" width={180} height={180} />
      </div>

      <p className="mb-2 text-[11px] font-semibold tracking-widest" style={{ color: "#7d93c2" }}>
        VARIABLES POUR VERCEL (SETTINGS → ENVIRONMENT VARIABLES)
      </p>
      <pre
        className="mb-2 overflow-x-auto rounded-lg p-3 text-xs"
        style={{ background: "#101a2e", border: "1px solid #253656", color: "#c9d6f0" }}
      >
        {envVarsAsText}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="mb-4 w-full rounded-lg py-2 text-sm font-medium"
        style={{ background: "#101a2e", border: "1px solid #253656", color: "#e7ecf5" }}
      >
        {copied ? "✓ Copié" : "Copier les 3 lignes"}
      </button>

      <p className="text-xs" style={{ color: "#7d93c2" }}>
        Une fois collées sur Vercel, redéployez le site — la connexion sera active sur{" "}
        <a href="/login" style={{ color: "#5b7fd4" }}>
          /login
        </a>
        .
      </p>
    </AuthLayout>
  );
}
