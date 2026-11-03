"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CaseDetailDialog } from "@/components/CaseDetailDialog";
import { useDemo } from "@/components/DemoProvider";
import { ApiError } from "@/lib/api";
import {
  ALERT_KIND_LABELS,
  ESCALATION_AFTER_DAYS,
  computeAlerts,
  LOST_REASON_LABELS,
  OUTCOME_LABELS,
  POSITIVE_THRESHOLD,
  STAGE_LABELS,
  caseFlags,
  casesToCsv,
  computeMetrics,
  daysBetween,
  type CaseStage,
  type LostReason,
  type TbCase,
} from "@/lib/cases";
import { fetchCases } from "@/lib/casesClient";
import { downloadCsv, formatDateTime } from "@/lib/utils";

type Filter = "open" | "overdue" | "unassigned" | "closed" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Ouverts" },
  { value: "overdue", label: "En retard" },
  { value: "unassigned", label: "Sans responsable" },
  { value: "closed", label: "Clôturés" },
  { value: "all", label: "Tous" },
];

const STAGE_BADGE: Record<CaseStage, string> = {
  opened: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  test_ordered: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  result_recorded: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  treatment: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  closed: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export default function CasesPage() {
  const demo = useDemo();
  const [cases, setCases] = useState<TbCase[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    fetchCases()
      .then((data) => {
        if (cancelled) return;
        setCases(data.cases);
        setPersistent(data.persistent);
        // Lien direct depuis /analyze ou /dashboard : /cases?open=<id>
        const wanted = new URLSearchParams(window.location.search).get("open");
        if (wanted && data.cases.some((c) => c.id === wanted)) {
          setSelectedId(wanted);
          setFilter("all");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Impossible de charger les cas.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => computeMetrics(cases, now), [cases, now]);
  const alerts = useMemo(() => computeAlerts(cases, now), [cases, now]);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases
      .filter((c) => {
        const f = caseFlags(c, now);
        if (filter === "open") return c.stage !== "closed";
        if (filter === "overdue") return f.overdue;
        if (filter === "unassigned") return f.unassigned;
        if (filter === "closed") return c.stage === "closed";
        return true;
      })
      .filter((c) => c.patientId.toLowerCase().includes(q))
      .sort((a, b) => {
        // Les cas en retard d'abord, puis les plus anciens : ce sont ceux qui risquent d'être perdus.
        const fa = caseFlags(a, now);
        const fb = caseFlags(b, now);
        if (fa.overdue !== fb.overdue) return fa.overdue ? -1 : 1;
        return a.createdAt.localeCompare(b.createdAt);
      });
  }, [cases, filter, search, now]);

  const selected = cases.find((c) => c.id === selectedId) ?? null;

  const handleUpdated = useCallback((updated: TbCase) => {
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const handleExport = () => {
    downloadCsv(`tbai_cas_${new Date().toISOString().slice(0, 10)}.csv`, casesToCsv(cases, now));
  };

  const lostEntries = (Object.keys(metrics.lostReasons) as LostReason[])
    .map((r) => ({ reason: r, count: metrics.lostReasons[r] }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);
  const lostTotal = lostEntries.reduce((s, e) => s + e.count, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Suivi des cas</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Chaque dépistage positif (score ≥ {Math.round(POSITIVE_THRESHOLD * 100)} %) ouvre un cas qui reste suivi jusqu&apos;à
            une clôture documentée : traité, TB exclue, ou perdu de vue avec un motif. L&apos;outil ne ferme jamais un cas de
            lui-même.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={cases.length === 0}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          📄 Exporter en CSV
        </button>
      </div>

      {!persistent && !demo && (
        <div className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <strong>Stockage persistant non configuré.</strong> Sans base de données, les cas peuvent disparaître à chaque
          redéploiement ou être invisibles d&apos;une page à l&apos;autre. Connectez Upstash Redis à ce projet Vercel
          (onglet Storage) avant tout usage réel.
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-400">Chargement...</p>}
      {!isLoading && error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">{error}</div>
      )}

      {!isLoading && !error && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <MetricCard label="Cas ouverts" value={String(metrics.open)} />
            <MetricCard label="En retard" value={String(metrics.overdue)} tone={metrics.overdue > 0 ? "red" : undefined} />
            <MetricCard label="Sans responsable" value={String(metrics.unassigned)} tone={metrics.unassigned > 0 ? "amber" : undefined} />
            <MetricCard
              label="Délai médian jusqu'au résultat"
              value={metrics.medianDaysToConfirmation === null ? "—" : `${metrics.medianDaysToConfirmation.toFixed(1)} j`}
              hint={`${metrics.confirmationSample} cas`}
            />
            <MetricCard
              label={`Clôturés sous ${metrics.closureWindowDays} j`}
              value={metrics.closureRate === null ? "—" : `${Math.round(metrics.closureRate * 100)} %`}
              hint={`sur ${metrics.closureEligible} cas dont le délai est écoulé`}
            />
            <MetricCard
              label="Rappels patient consignés"
              value={String(metrics.contactAttempts)}
              hint={`${metrics.overdueWithoutContact} cas en retard sans rappel`}
              tone={metrics.overdueWithoutContact > 0 ? "amber" : undefined}
            />
            <MetricCard label="Clôturés" value={String(metrics.closed)} hint={`${metrics.outcomes.treated} traités · ${metrics.outcomes.excluded} exclus · ${metrics.outcomes.lost} perdus`} />
          </div>

          {alerts.length > 0 && (
            <section
              aria-label="Alertes de retard"
              className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
                  {alerts.length} alerte{alerts.length > 1 ? "s" : ""} de suivi
                </h2>
                <p className="text-xs text-red-700/80 dark:text-red-300/80">
                  Un e-mail récapitulatif part chaque matin à l&apos;équipe (si l&apos;envoi est configuré). Au-delà de{" "}
                  {ESCALATION_AFTER_DAYS} jours de retard, l&apos;alerte est signalée comme à remonter au superviseur.
                </p>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {(showAllAlerts ? alerts : alerts.slice(0, 5)).map((a) => (
                  <li key={`${a.caseId}-${a.key}`} className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.kind === "escalation"
                          ? "bg-red-600 text-white"
                          : a.kind === "overdue"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      }`}
                    >
                      {ALERT_KIND_LABELS[a.kind].split(" — ")[0]}
                    </span>
                    <span className="flex-1">{a.text}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedId(a.caseId)}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Gérer
                    </button>
                  </li>
                ))}
              </ul>
              {alerts.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllAlerts((v) => !v)}
                  className="mt-2 text-xs font-medium text-red-800 underline dark:text-red-300"
                >
                  {showAllAlerts ? "Réduire" : `Voir les ${alerts.length - 5} autres`}
                </button>
              )}
            </section>
          )}

          {lostTotal > 0 && (
            <div className="mb-6 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Motifs de perte de vue</h2>
              <ul className="flex flex-col gap-1.5">
                {lostEntries.map((e) => (
                  <li key={e.reason} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <span className="w-52 shrink-0">{LOST_REASON_LABELS[e.reason]}</span>
                    <span className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                      <span className="block h-2 rounded-full bg-blue-500" style={{ width: `${(e.count / lostTotal) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums">{e.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  filter === f.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
            <input
              type="text"
              placeholder="Rechercher un ID patient..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Patient</th>
                  <th className="px-4 py-2">Score</th>
                  <th className="px-4 py-2">Étape</th>
                  <th className="px-4 py-2">Responsable</th>
                  <th className="px-4 py-2">Échéance</th>
                  <th className="px-4 py-2">Ouvert depuis</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((c) => {
                  const f = caseFlags(c, now);
                  const ageDays = Math.floor(daysBetween(c.createdAt, (c.closedAt ?? now.toISOString())));
                  return (
                    <tr key={c.id} className="text-slate-700 dark:text-slate-300">
                      <td className="px-4 py-2 font-mono text-xs">{c.patientId}</td>
                      <td className="px-4 py-2 font-semibold">{(c.probability * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE[c.stage]}`}>
                          {c.stage === "closed" && c.outcome ? OUTCOME_LABELS[c.outcome].split(" (")[0] : STAGE_LABELS[c.stage]}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {c.owner ?? (c.stage === "closed" ? "—" : <span className="text-amber-600 dark:text-amber-400">Non attribué</span>)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {c.dueDate ? (
                          <span className={f.overdue ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                            {c.dueDate}
                            {f.overdue && " (en retard)"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap" title={formatDateTime(c.createdAt)}>
                        {ageDays} j
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {c.stage === "closed" ? "Voir" : "Gérer"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      {cases.length === 0
                        ? "Aucun cas pour l'instant : ils s'ouvrent automatiquement à chaque dépistage positif."
                        : "Aucun cas ne correspond à ce filtre."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && <CaseDetailDialog caseData={selected} onClose={() => setSelectedId(null)} onUpdated={handleUpdated} />}
    </main>
  );
}

function MetricCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "red" | "amber" }) {
  const toneClass =
    tone === "red"
      ? "text-red-600 dark:text-red-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-900 dark:text-slate-50";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
