import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "TB-AI — Assistant de dépistage",
  description: "Interface experte de dépistage assisté de la tuberculose sur radiographie thoracique.",
};

/**
 * Layout racine — volontairement SANS Navbar. La Navbar (liens Analyse/
 * Tableau de bord/Lot, déconnexion...) n'a de sens que sur les pages
 * authentifiées ; elle vit maintenant dans app/(main)/layout.tsx, pas ici.
 * /login et /setup restent en dehors de ce groupe (main) et n'héritent
 * donc que de ce layout minimal — corrige le défaut où la Navbar (avec un
 * bouton "Déconnexion" qui n'a pas de sens avant connexion) apparaissait
 * sur l'écran de connexion lui-même.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-50`}>
        {children}
      </body>
    </html>
  );
}
