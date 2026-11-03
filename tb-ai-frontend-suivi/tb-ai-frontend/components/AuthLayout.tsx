"use client";

import type { ReactNode } from "react";

interface AuthLayoutProps {
  stepLabel: string; // ex. "ÉTAPE 1/2"
  title: string;
  description: string;
  secondary?: ReactNode; // bloc secondaire sous le formulaire (ex. lien "déjà un compte")
  children: ReactNode; // le formulaire lui-même
}

/**
 * components/AuthLayout.tsx
 *
 * Mise en page partagée par /login et /setup — reprend le style d'un
 * projet précédent (fond bleu marine, deux colonnes, icône circulaire à
 * gauche, étiquettes en petites majuscules à droite) sur demande de
 * l'utilisateur. La logique de vérification (mot de passe + TOTP côté
 * serveur) reste entièrement inchangée ; seule cette couche visuelle est
 * nouvelle.
 */
export function AuthLayout({ stepLabel, title, description, secondary, children }: AuthLayoutProps) {
  return (
    <main
      className="relative grid min-h-screen lg:grid-cols-2"
      style={{ background: "#0b1220", color: "#e7ecf5" }}
    >
      {/* Colonne gauche — identité visuelle */}
      <div className="hidden flex-col items-center justify-center gap-6 border-r p-10 lg:flex" style={{ borderColor: "#1c2740" }}>
        <div
          className="relative flex h-56 w-56 items-center justify-center rounded-full border"
          style={{ borderColor: "#2a3a5c", background: "radial-gradient(circle at 35% 30%, #16213a, #0b1220)" }}
        >
          <svg width="150" height="150" viewBox="0 0 150 150" fill="none">
            <defs>
              <linearGradient id="bodyGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7fb3ff" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#3d6fc9" stopOpacity="0.35" />
              </linearGradient>
              <radialGradient id="lungGlow" cx="50%" cy="35%" r="70%">
                <stop offset="0%" stopColor="#ff9d8a" />
                <stop offset="100%" stopColor="#e2604a" />
              </radialGradient>
            </defs>

            {/* Silhouette translucide (tête, cou, épaules, cage thoracique) */}
            <g stroke="url(#bodyGlow)" strokeWidth="1.3" fill="none" opacity="0.85">
              <path d="M62 8c0 9 4 14 13 14s13-5 13-14" />
              <path d="M67 22v10M83 22v10" />
              <path d="M50 40c-6 4-10 10-10 18v14c0 26 8 46 8 62M100 40c6 4 10 10 10 18v14c0 26-8 46-8 62" />
              <path d="M50 40c8-6 17-8 25-8s17 2 25 8" />
              <ellipse cx="75" cy="18" rx="15" ry="16" />
              {/* Cage thoracique (arcs costaux stylisés) */}
              <path d="M46 62c8 4 16 6 29 6s21-2 29-6" />
              <path d="M44 78c9 5 18 7 31 7s22-2 31-7" />
              <path d="M43 94c9 5 19 7 32 7s23-2 32-7" />
              <path d="M44 110c8 5 18 7 31 7s23-2 31-7" />
            </g>

            {/* Poumons mis en évidence, avec ramifications bronchiques */}
            <g>
              <path
                d="M75 50c-3 6-16 10-21 22-5 12-4 28 3 35 5 5 12 3 15-4 3-8 3-40 3-53z"
                fill="url(#lungGlow)"
                opacity="0.9"
              />
              <path
                d="M75 50c3 6 16 10 21 22 5 12 4 28-3 35-5 5-12 3-15-4-3-8-3-40-3-53z"
                fill="url(#lungGlow)"
                opacity="0.9"
              />
              <g stroke="#ffd9c9" strokeWidth="0.8" opacity="0.7" fill="none">
                <path d="M75 54v10M75 64c-4 3-9 4-12 8M75 64c4 3 6 5 9 10M60 72c-3 5-4 10-3 16M90 72c3 5 4 10 3 16" />
              </g>
            </g>

            {/* Trachée */}
            <path d="M73 22v30M77 22v30" stroke="#7fb3ff" strokeWidth="1" opacity="0.7" />
          </svg>
          <span
            className="absolute -bottom-3 rounded-full px-3 py-1 text-[10px] font-medium tracking-widest"
            style={{ background: "#0b1220", border: "1px solid #2a3a5c", color: "#9fb3dd" }}
          >
            INCIDENCE PA · THORAX
          </span>
        </div>
        {secondary}
      </div>

      {/* Colonne droite — formulaire */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-16">
        <div className="mx-auto w-full max-w-sm">
          <p
            className="mb-2 text-xs font-semibold tracking-widest"
            style={{ color: "#5b7fd4" }}
          >
            — {stepLabel}
          </p>
          <h1 className="mb-3 text-2xl font-semibold" style={{ color: "#f4f7fc" }}>
            {title}
          </h1>
          <p className="mb-8 text-sm" style={{ color: "#9fb3dd" }}>
            {description}
          </p>
          {children}
        </div>
      </div>
      <footer className="absolute bottom-4 w-full text-center text-xs lg:w-1/2" style={{ color: "#4a5a85" }}>
        © 2026 TB-AI
      </footer>
    </main>
  );
}

export function AuthField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold tracking-widest" style={{ color: "#7d93c2" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export const authInputStyle = {
  background: "#101a2e",
  border: "1px solid #253656",
  color: "#e7ecf5",
};

export const authButtonStyle = {
  background: "#2f6fed",
};
