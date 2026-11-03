"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLayout, AuthField, authInputStyle, authButtonStyle } from "@/components/AuthLayout";

type Step = "password" | "totp";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/analyze";

  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Mot de passe incorrect.");
        return;
      }
      setStep("totp");
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTotpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/verify-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Code incorrect.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      stepLabel={step === "password" ? "ÉTAPE 1/2" : "ÉTAPE 2/2"}
      title={step === "password" ? "Connexion sécurisée" : "Code de vérification"}
      description={
        step === "password"
          ? "TB-AI — authentification à double facteur réelle (TOTP, RFC 6238), vérifiée côté serveur à chaque connexion."
          : "Ouvrez votre application d'authentification (Google Authenticator, Authy, 1Password...) et saisissez le code à 6 chiffres."
      }
    >
      {step === "password" ? (
        <form onSubmit={handlePasswordSubmit}>
          <AuthField label="MOT DE PASSE">
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Votre mot de passe"
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
            {isSubmitting ? "Vérification..." : "Continuer vers la 2FA"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleTotpSubmit}>
          <AuthField label="CODE À 6 CHIFFRES">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-lg px-3 py-2.5 text-center text-lg tracking-[0.3em] outline-none"
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
            disabled={isSubmitting || code.length !== 6}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={authButtonStyle}
          >
            {isSubmitting ? "Vérification..." : "Se connecter"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("password");
              setCode("");
              setError(null);
            }}
            className="mt-3 w-full text-center text-xs"
            style={{ color: "#7d93c2" }}
          >
            ← Revenir au mot de passe
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
