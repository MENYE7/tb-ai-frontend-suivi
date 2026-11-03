"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STAGE_LABELS, type TbCase } from "@/lib/cases";
import { openCaseManually } from "@/lib/casesClient";
import { submitFeedback, ApiError } from "@/lib/api";
import { useExpertName } from "@/lib/useExpertName";
import { RISK_LABELS, type AnalysisRecord, type ExpertStatus, type RiskLevel } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface AnalysesTableProps {
  analyses: AnalysisRecord[];
  onStatusChange?: (updated: AnalysisRecord) => void;
  /** Cas de suivi existants, indexés par identifiant d'analyse. */
  cases?: Record<string, TbCase>;
  onCaseOpened?: (opened: TbCase) => void;
}

type SortKey = "createdAt" | "probability" | "patientId";
type SortDirection = "asc" | "desc";

const STATUS_LABELS: Record<ExpertStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  rejected: "Rejeté",
};

const RISK_FILTER_OPTIONS: { value: RiskLevel | "all"; label: string }[] = [
  { value: "all", label: "Tous les risques" },
  { value: "high", label: "Élevé" },
  { value: "moderate", label: "Modéré" },
  { value: "low", label: "Faible" },
];

const STATUS_FILTER_OPTIONS: { value: ExpertStatus | "all"; label: string }[] = [
  { value: "all", label: "Tous les statuts" },
  { value: "pending", label: "En attente" },
  { value: "confirmed", label: "Confirmé" },
  { value: "rejected", label: "Rejeté" },
];

export function AnalysesTable({ analyses, onStatusChange, cases, onCaseOpened }: AnalysesTableProps) {
  const [expertName] = useExpertName();
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ExpertStatus | "all">("all");
  const [patientSearch, setPatientSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const filtered = useMemo(() => {
    return analyses
      .filter((a) => riskFilter === "all" || a.riskLevel === riskFilter)
      .filter((a) => statusFilter === "all" || a.expertStatus === statusFilter)
      .filter((a) => a.patientId.toLowerCase().includes(patientSearch.trim().toLowerCase()))
      .sort((a, b) => {
        const dir = sortDirection === "asc" ? 1 : -1;
        if (sortKey === "probability") return (a.probability - b.probability) * dir;
        if (sortKey === "patientId") return a.patientId.localeCompare(b.patientId) * dir;
        return a.createdAt.localeCompare(b.createdAt) * dir;
      });
  }, [analyses, riskFilter, statusFilter, patientSearch, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDirection === "asc" ? " ▲" : " ▼") : "");

  const handleDownloadSummary = async (record: AnalysisRecord) => {
    const { generateSummaryPdfBytes } = await import("@/lib/generateSummaryPdf");
    const { downloadPdfBytes } = await import("@/lib/generatePdfReport");
    const bytes = await generateSummaryPdfBytes(record);
    downloadPdfBytes(bytes, `tbai_resume_${record.patientId}_${record.createdAt.slice(0, 10)}.pdf`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Rechercher un ID patient..."
          value={patientSearch}
          onChange={(e) => setPatientSearch(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as RiskLevel | "all")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          {RISK_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ExpertStatus | "all")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="ml-auto self-center text-sm text-slate-500 dark:text-slate-400">
          {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="cursor-pointer select-none px-4 py-2" onClick={() => toggleSort("createdAt")}>
                Date{sortIndicator("createdAt")}
              </th>
              <th className="cursor-pointer select-none px-4 py-2" onClick={() => toggleSort("patientId")}>
                Patient{sortIndicator("patientId")}
              </th>
              <th className="cursor-pointer select-none px-4 py-2" onClick={() => toggleSort("probability")}>
                Score{sortIndicator("probability")}
              </th>
              <th className="px-4 py-2">Risque</th>
              <th className="px-4 py-2">Statut expert</th>
              <th className="px-4 py-2">Suivi</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((a) => (
              <tr key={a.id} className="text-slate-700 dark:text-slate-300">
                <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.patientId}</td>
                <td className="px-4 py-2 font-semibold">{(a.probability * 100).toFixed(1)}%</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.riskLevel === "high"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        : a.riskLevel === "moderate"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    }`}
                  >
                    {RISK_LABELS[a.riskLevel]}
                  </span>
                </td>
                <td className="px-4 py-2">{STATUS_LABELS[a.expertStatus]}</td>
                <td className="px-4 py-2">
                  {cases && cases[a.id] ? (
                    <Link
                      href={`/cases?open=${encodeURIComponent(a.id)}`}
                      className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                    >
                      {STAGE_LABELS[cases[a.id].stage]}
                    </Link>
                  ) : cases ? (
                    <OpenCaseButton analysisId={a.id} expertName={expertName} onOpened={(c) => onCaseOpened?.(c)} />
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {a.expertStatus === "pending" ? (
                      <InlineFeedbackActions
                        analysisId={a.id}
                        expertName={expertName}
                        onDone={(updated) => onStatusChange?.(updated)}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadSummary(a)}
                      title="Télécharger le résumé PDF (sans images, non conservées)"
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                    >
                      PDF
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Aucune analyse ne correspond à ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Ouvre manuellement un suivi pour une analyse qui n'en a pas (score sous le seuil, ou analyse plus ancienne). */
function OpenCaseButton({
  analysisId,
  expertName,
  onOpened,
}: {
  analysisId: string;
  expertName: string;
  onOpened: (opened: TbCase) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    setError(null);
    if (!expertName.trim()) {
      setError("Indiquez votre nom en haut de la page.");
      return;
    }
    setBusy(true);
    try {
      onOpened(await openCaseManually(analysisId, expertName.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        Ouvrir un suivi
      </button>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

/**
 * Version compacte de FeedbackButtons.tsx, adaptée à une cellule de
 * tableau — permet à l'expert de statuer sur une analyse en attente
 * directement depuis l'historique, pas seulement juste après l'analyse
 * fraîche sur /analyze. Même endpoint (POST /api/feedback), même règle
 * (nom de l'expert requis, pas une authentification réelle).
 */
function InlineFeedbackActions({
  analysisId,
  expertName,
  onDone,
}: {
  analysisId: string;
  expertName: string;
  onDone: (updated: AnalysisRecord) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (decision: "confirmed" | "rejected") => {
    setError(null);
    if (!expertName.trim()) {
      setError("Indiquez votre nom en haut de la page.");
      return;
    }
    setIsSubmitting(true);
    try {
      const updated = await submitFeedback(analysisId, decision, expertName.trim());
      onDone(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'enregistrement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => handle("confirmed")}
          disabled={isSubmitting}
          title="Confirmer ce résultat"
          className="rounded border border-emerald-600 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => handle("rejected")}
          disabled={isSubmitting}
          title="Rejeter ce résultat"
          className="rounded border border-red-600 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
        >
          ✗
        </button>
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}
