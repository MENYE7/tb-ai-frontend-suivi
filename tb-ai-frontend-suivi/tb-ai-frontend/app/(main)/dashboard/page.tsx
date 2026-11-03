"use client";

import { useEffect, useState } from "react";
import { AnalysesTable } from "@/components/AnalysesTable";
import { fetchAnalyses, ApiError } from "@/lib/api";
import { fetchCases } from "@/lib/casesClient";
import type { TbCase } from "@/lib/cases";
import { analysesToCsv, downloadCsv } from "@/lib/utils";
import type { AnalysisRecord } from "@/lib/types";

export default function DashboardPage() {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [cases, setCases] = useState<Record<string, TbCase>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAnalyses()
      .then((data) => {
        if (!cancelled) setAnalyses(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Impossible de charger les analyses.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    // Les cas sont facultatifs ici : si leur chargement échoue, le tableau reste utilisable.
    fetchCases()
      .then((data) => {
        if (!cancelled) setCases(Object.fromEntries(data.cases.map((c) => [c.id, c])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = () => {
    const csv = analysesToCsv(analyses);
    downloadCsv(`tbai_analyses_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Tableau de bord</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Historique des analyses effectuées sur cet appareil/déploiement.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={analyses.length === 0}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          📄 Exporter en CSV
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Chargement...</p>}
      {!isLoading && error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">{error}</div>
      )}
      {!isLoading && !error && (
        <AnalysesTable
          analyses={analyses}
          cases={cases}
          onCaseOpened={(opened) => setCases((prev) => ({ ...prev, [opened.id]: opened }))}
          onStatusChange={(updated) =>
            setAnalyses((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
          }
        />
      )}
    </main>
  );
}
