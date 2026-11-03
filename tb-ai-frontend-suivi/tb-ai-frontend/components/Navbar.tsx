"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useExpertName } from "@/lib/useExpertName";

const NAV_LINKS = [
  { href: "/analyze", label: "Analyse" },
  { href: "/cases", label: "Suivi des cas" },
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/batch", label: "Lot" },
];

export function Navbar({ demo = false }: { demo?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [expertName, setExpertName] = useExpertName();
  const [isDark, setIsDark] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("tbai:theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = stored ? stored === "dark" : prefersDark;
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("tbai:theme", next ? "dark" : "light");
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/analyze" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
            <span>🫁</span>
            <span>TB-AI</span>
          </Link>
          <nav className="flex gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline">Expert :</span>
            <input
              type="text"
              value={expertName}
              onChange={(e) => setExpertName(e.target.value)}
              placeholder="Votre nom"
              className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Basculer le thème sombre"
            className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isDark ? "☀️" : "🌙"}
          </button>

          {!demo && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isLoggingOut ? "..." : "Déconnexion"}
          </button>
          )}
        </div>
      </div>
    </header>
  );
}
