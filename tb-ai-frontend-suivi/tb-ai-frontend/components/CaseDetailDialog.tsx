"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  CONTACT_CHANNEL_LABELS,
  MIN_FAILED_CONTACTS_BEFORE_UNREACHABLE,
  buildPatientReminder,
  contactAttempts,
  type ContactChannel,
  type MessageLang,
  LOST_REASON_LABELS,
  OUTCOME_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
  TEST_RESULT_LABELS,
  allowedNextStages,
  allowedOutcomes,
  caseFlags,
  type CaseAction,
  type CaseEvent,
  type CaseOutcome,
  type LostReason,
  type TbCase,
  type TestResult,
} from "@/lib/cases";
import { sendCaseAction } from "@/lib/casesClient";
import { useExpertName } from "@/lib/useExpertName";
import { formatDateTime } from "@/lib/utils";

const EVENT_LABELS: Record<CaseEvent["type"], string> = {
  opened: "Cas ouvert",
  assigned: "Responsable",
  due_changed: "Échéance",
  advanced: "Étape",
  closed: "Clôture",
  note: "Note",
  patient_contact: "Rappel patient",
  alert: "Alerte automatique",
};

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const primaryButton =
  "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";

export function CaseDetailDialog({
  caseData,
  onClose,
  onUpdated,
}: {
  caseData: TbCase;
  onClose: () => void;
  onUpdated: (updated: TbCase) => void;
}) {
  const [expertName, setExpertName] = useExpertName();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState(caseData.owner ?? "");
  const [dueDate, setDueDate] = useState(caseData.dueDate ?? "");
  const [testResult, setTestResult] = useState<TestResult>("positive");
  const [stepNote, setStepNote] = useState("");
  const [outcome, setOutcome] = useState<CaseOutcome | "">("");
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [closeNote, setCloseNote] = useState("");
  const [freeNote, setFreeNote] = useState("");
  const [lang, setLang] = useState<MessageLang>("fr");
  const [facility, setFacility] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("sms");
  const [contactNote, setContactNote] = useState("");
  const [copied, setCopied] = useState(false);

  const c = caseData;
  const closed = c.stage === "closed";
  const flags = caseFlags(c);
  const next = allowedNextStages(c)[0];
  const outcomes = allowedOutcomes(c);
  const attempts = contactAttempts(c);

  // Remet les champs à jour quand le cas change (après une action).
  useEffect(() => {
    setOwner(c.owner ?? "");
    setDueDate(c.dueDate ?? "");
    setStepNote("");
    setCloseNote("");
    setFreeNote("");
    setContactNote("");
    setOutcome("");
    setLostReason("");
  }, [c.id, c.updatedAt, c.owner, c.dueDate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: CaseAction) => {
    setError(null);
    setBusy(true);
    try {
      onUpdated(await sendCaseAction(c.id, action));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  const by = expertName.trim();
  const needName = !by;
  const reminderText = buildPatientReminder(c, lang, facility);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cas ${c.patientId}`}
        onClick={(e) => e.stopPropagation()}
        className="my-6 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Cas <span className="font-mono">{c.patientId}</span>
              {c.simulated && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  simulé
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Score {(c.probability * 100).toFixed(1)} % · ouvert le {formatDateTime(c.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Parcours */}
        <ol className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {STAGE_ORDER.map((stage) => {
            const reached = STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf(c.stage);
            const current = stage === c.stage;
            return (
              <li
                key={stage}
                className={`rounded-full px-2.5 py-1 font-medium ${
                  current
                    ? "bg-blue-600 text-white"
                    : reached
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                }`}
              >
                {STAGE_LABELS[stage]}
              </li>
            );
          })}
        </ol>

        {closed ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <strong>{c.outcome ? OUTCOME_LABELS[c.outcome] : "Clôturé"}</strong>
            {c.lostReason && <> — {LOST_REASON_LABELS[c.lostReason]}</>}
            {c.closedAt && <> · le {formatDateTime(c.closedAt)}</>}
          </div>
        ) : (
          <>
            {(flags.overdue || flags.unassigned) && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                {flags.overdue && (
                  <span className="rounded-full bg-red-100 px-2 py-1 text-red-700 dark:bg-red-950 dark:text-red-300">
                    Échéance dépassée
                  </span>
                )}
                {flags.unassigned && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Sans responsable
                  </span>
                )}
              </div>
            )}

            {needName && (
              <label className="mt-3 block rounded-md bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Indiquez votre nom pour pouvoir agir sur ce cas (il sera inscrit au journal) :
                <input
                  type="text"
                  value={expertName}
                  onChange={(e) => setExpertName(e.target.value)}
                  placeholder="Votre nom"
                  className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-slate-900 dark:border-amber-800 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
            )}

            {/* Responsable et échéance */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Responsable</label>
                <div className="flex gap-2">
                  <input value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={60} placeholder="Nom de l'agent" className={inputClass} />
                  <button type="button" disabled={busy || needName || !owner.trim()} onClick={() => run({ action: "assign", by, owner })} className={primaryButton}>
                    OK
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Échéance de l&apos;étape</label>
                <div className="flex gap-2">
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
                  <button type="button" disabled={busy || needName || !dueDate} onClick={() => run({ action: "set_due", by, dueDate })} className={primaryButton}>
                    OK
                  </button>
                </div>
              </div>
            </div>

            {/* Étape suivante */}
            <div className="mt-5 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Étape suivante</h3>

              {c.stage === "opened" && (
                <button type="button" disabled={busy || needName} onClick={() => run({ action: "advance", by, to: "test_ordered" })} className={primaryButton}>
                  Test de confirmation demandé
                </button>
              )}

              {c.stage === "test_ordered" && (
                <div className="flex flex-col gap-2">
                  <select value={testResult} onChange={(e) => setTestResult(e.target.value as TestResult)} className={inputClass}>
                    {(Object.keys(TEST_RESULT_LABELS) as TestResult[]).map((r) => (
                      <option key={r} value={r}>
                        {TEST_RESULT_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={stepNote}
                    onChange={(e) => setStepNote(e.target.value)}
                    maxLength={500}
                    placeholder={testResult === "not_done" ? "Pourquoi le test n'a pas été réalisé (obligatoire)" : "Note (facultatif)"}
                    className={inputClass}
                  />
                  <div>
                    <button type="button" disabled={busy || needName} onClick={() => run({ action: "advance", by, to: "result_recorded", testResult, note: stepNote })} className={primaryButton}>
                      Enregistrer le résultat
                    </button>
                  </div>
                </div>
              )}

              {c.stage === "result_recorded" && c.testResult === "positive" && next === "treatment" && (
                <div className="flex flex-col gap-2">
                  <input
                    value={stepNote}
                    onChange={(e) => setStepNote(e.target.value)}
                    maxLength={500}
                    placeholder="Début de traitement (date) ou lieu d'orientation (obligatoire)"
                    className={inputClass}
                  />
                  <div>
                    <button type="button" disabled={busy || needName} onClick={() => run({ action: "advance", by, to: "treatment", note: stepNote })} className={primaryButton}>
                      Enregistrer traitement ou orientation
                    </button>
                  </div>
                </div>
              )}

              {c.stage === "result_recorded" && c.testResult === "not_done" && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Le test n&apos;a pas été réalisé : demandez-le à nouveau ou clôturez le cas avec un motif.</p>
                  <div>
                    <button type="button" disabled={busy || needName} onClick={() => run({ action: "advance", by, to: "test_ordered", note: "Nouveau test demandé" })} className={primaryButton}>
                      Redemander un test
                    </button>
                  </div>
                </div>
              )}

              {c.stage === "result_recorded" && c.testResult === "negative" && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Résultat négatif : clôturez le cas (« TB exclue »).</p>
              )}

              {c.stage === "treatment" && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Traitement ou orientation enregistrés : clôturez le cas une fois la prise en charge confirmée.</p>
              )}
            </div>

            {/* Clôture */}
            {/* Rappel au patient */}
            <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Rappel au patient</h3>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Message neutre (il ne mentionne ni la tuberculose ni le dépistage). L&apos;outil ne stocke aucun numéro :
                envoyez-le avec vos propres moyens, puis consignez la tentative ci-dessous.
                {" "}
                {attempts.total > 0
                  ? `${attempts.total} tentative(s) consignée(s), dont ${attempts.failed} sans réponse.`
                  : "Aucune tentative consignée."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select value={lang} onChange={(e) => setLang(e.target.value as MessageLang)} className={`${inputClass} !w-auto`}>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
                <input
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  maxLength={60}
                  placeholder="Nom de votre centre (facultatif)"
                  className={`${inputClass} min-w-[12rem] flex-1`}
                />
              </div>
              <textarea
                readOnly
                value={reminderText}
                rows={3}
                className={`${inputClass} mt-2 resize-none bg-slate-50 dark:bg-slate-800`}
                aria-label="Message de rappel"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(reminderText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setError("Copie impossible : sélectionnez le texte et copiez-le à la main.");
                    }
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {copied ? "Copié ✓" : "Copier le message"}
                </button>
                <select value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)} className={`${inputClass} !w-auto`}>
                  {(Object.keys(CONTACT_CHANNEL_LABELS) as ContactChannel[]).map((ch) => (
                    <option key={ch} value={ch}>
                      {CONTACT_CHANNEL_LABELS[ch]}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={contactNote}
                onChange={(e) => setContactNote(e.target.value)}
                maxLength={500}
                placeholder="Note (facultatif, sans coordonnées)"
                className={`${inputClass} mt-2`}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || needName}
                  onClick={() => run({ action: "contact", by, channel, reached: true, note: contactNote })}
                  className={primaryButton}
                >
                  Patient joint
                </button>
                <button
                  type="button"
                  disabled={busy || needName}
                  onClick={() => run({ action: "contact", by, channel, reached: false, note: contactNote })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Pas de réponse
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Clôturer le cas</h3>
              <div className="flex flex-col gap-2">
                <select value={outcome} onChange={(e) => setOutcome(e.target.value as CaseOutcome | "")} className={inputClass}>
                  <option value="">Choisir l&apos;issue…</option>
                  {outcomes.map((o) => (
                    <option key={o} value={o}>
                      {OUTCOME_LABELS[o]}
                    </option>
                  ))}
                </select>
                {outcome === "lost" && (
                  <select value={lostReason} onChange={(e) => setLostReason(e.target.value as LostReason | "")} className={inputClass}>
                    <option value="">Motif (obligatoire)…</option>
                    {(Object.keys(LOST_REASON_LABELS) as LostReason[]).map((r) => (
                      <option key={r} value={r}>
                        {LOST_REASON_LABELS[r]}
                      </option>
                    ))}
                  </select>
                )}
                {outcome === "lost" && lostReason === "unreachable" && attempts.failed < MIN_FAILED_CONTACTS_BEFORE_UNREACHABLE && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Pour classer « injoignable », consignez d&apos;abord au moins {MIN_FAILED_CONTACTS_BEFORE_UNREACHABLE} tentatives
                    sans réponse (actuellement : {attempts.failed}).
                  </p>
                )}
                {outcome && (
                  <input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={500} placeholder="Note (facultatif)" className={inputClass} />
                )}
                <div>
                  <button
                    type="button"
                    disabled={busy || needName || !outcome || (outcome === "lost" && !lostReason)}
                    onClick={() =>
                      outcome &&
                      run({ action: "close", by, outcome, lostReason: outcome === "lost" && lostReason ? lostReason : undefined, note: closeNote })
                    }
                    className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
                  >
                    Clôturer
                  </button>
                </div>
              </div>
            </div>

            {/* Note libre */}
            <div className="mt-3 flex gap-2">
              <input value={freeNote} onChange={(e) => setFreeNote(e.target.value)} maxLength={500} placeholder="Ajouter une note au journal" className={inputClass} />
              <button type="button" disabled={busy || needName || !freeNote.trim()} onClick={() => run({ action: "note", by, note: freeNote })} className={primaryButton}>
                Ajouter
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <p className="mt-3 text-xs text-slate-400">
          N&apos;enregistrez aucun nom, numéro de téléphone ni adresse de patient : seuls l&apos;identifiant anonymisé et les étapes du parcours sont conservés.
        </p>

        {/* Journal */}
        <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800 dark:text-slate-100">Journal</h3>
        <ul className="flex flex-col gap-1.5 text-sm">
          {[...c.events].reverse().map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-3 text-slate-600 dark:text-slate-300">
              <span className="w-28 shrink-0 text-xs text-slate-400">{formatDateTime(e.at)}</span>
              <span>
                <strong>{e.type === "advanced" && e.stage ? STAGE_LABELS[e.stage] : EVENT_LABELS[e.type]}</strong>
                {" · "}
                {e.by}
                {e.type === "patient_contact" && e.channel && (
                  <>
                    {" "}
                    — {CONTACT_CHANNEL_LABELS[e.channel]} : {e.reached ? "patient joint" : "pas de réponse"}
                  </>
                )}
                {e.note && <> — {e.note}</>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
