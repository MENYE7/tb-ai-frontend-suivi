/**
 * lib/cases.ts
 *
 * Logique PURE du suivi des cas (aucun accès réseau, disque ni DOM) : elle
 * est partagée entre le serveur (routes /api/cases) et le navigateur (mode
 * démo, qui garde ses données simulées dans le navigateur du visiteur).
 *
 * Principe : un dépistage positif (score >= POSITIVE_THRESHOLD) ouvre un
 * CAS qui reste ouvert jusqu'à une clôture DOCUMENTÉE par un humain :
 *   traité (traitement ou orientation enregistrés), exclu (test de
 *   confirmation négatif) ou perdu de vue (avec un motif obligatoire).
 * L'outil ne ferme jamais un cas de lui-même.
 *
 * Aucun champ de ce module ne contient de nom ni de coordonnées de
 * patient : seulement l'identifiant anonymisé déjà utilisé par l'analyse.
 */

import type { AnalysisRecord, RiskLevel } from "./types";

// --------------------------------------------------------------------------- #
// Paramètres (à fixer avec le partenaire de pilote — valeurs par défaut)
// --------------------------------------------------------------------------- #

/** Score à partir duquel un dépistage est considéré positif (seuil 0,50 du jeu de test). */
export const POSITIVE_THRESHOLD = 0.5;
/** Délai proposé par défaut pour chaque étape, en jours. */
export const DEFAULT_STEP_DAYS = 7;
/** Fenêtre de référence du taux de clôture, en jours. */
export const CLOSURE_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

// --------------------------------------------------------------------------- #
// Types
// --------------------------------------------------------------------------- #

export type CaseStage = "opened" | "test_ordered" | "result_recorded" | "treatment" | "closed";
export type TestResult = "positive" | "negative" | "not_done";
export type CaseOutcome = "treated" | "excluded" | "lost";
export type LostReason = "unreachable" | "declined" | "died" | "moved" | "other";

export type CaseEventType =
  | "opened"
  | "assigned"
  | "due_changed"
  | "advanced"
  | "closed"
  | "note"
  | "patient_contact" // tentative de rappel au patient, réussie ou non
  | "alert"; // alerte de retard déclenchée automatiquement

/** Moyen utilisé par l'équipe pour joindre le patient (aucune coordonnée n'est enregistrée). */
export type ContactChannel = "sms" | "whatsapp" | "call" | "home_visit" | "other";

export interface CaseEvent {
  at: string; // ISO 8601
  type: CaseEventType;
  by: string; // nom de l'agent (texte libre) ou "automatique"
  stage?: CaseStage;
  note?: string;
  /** patient_contact : moyen utilisé. */
  channel?: ContactChannel;
  /** patient_contact : le patient a-t-il été joint ? */
  reached?: boolean;
  /** alert : clé de déduplication (type d'alerte + échéance concernée). */
  key?: string;
}

export interface TbCase {
  id: string; // = identifiant de l'analyse
  analysisId: string;
  patientId: string; // identifiant anonymisé
  probability: number;
  riskLevel: RiskLevel;
  createdAt: string;
  updatedAt: string;
  stage: CaseStage;
  owner?: string;
  dueDate?: string; // AAAA-MM-JJ, jusqu'à la fin de cette journée (UTC)
  testResult?: TestResult;
  resultAt?: string; // résultat du test de confirmation obtenu (positif ou négatif)
  outcome?: CaseOutcome;
  lostReason?: LostReason;
  closedAt?: string;
  events: CaseEvent[];
  simulated?: boolean;
}

export const STAGE_LABELS: Record<CaseStage, string> = {
  opened: "Cas ouvert",
  test_ordered: "Test de confirmation demandé",
  result_recorded: "Résultat enregistré",
  treatment: "Traitement ou orientation",
  closed: "Clôturé",
};

export const STAGE_ORDER: CaseStage[] = ["opened", "test_ordered", "result_recorded", "treatment", "closed"];

export const TEST_RESULT_LABELS: Record<TestResult, string> = {
  positive: "Positif (TB confirmée)",
  negative: "Négatif",
  not_done: "Non réalisé",
};

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  call: "Appel téléphonique",
  home_visit: "Visite à domicile",
  other: "Autre",
};

export const OUTCOME_LABELS: Record<CaseOutcome, string> = {
  treated: "Traité (traitement ou orientation enregistrés)",
  excluded: "TB exclue (test négatif)",
  lost: "Perdu de vue",
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  unreachable: "Injoignable",
  declined: "A refusé la suite",
  died: "Décédé",
  moved: "Déménagé / transféré",
  other: "Autre (préciser dans la note)",
};

// --------------------------------------------------------------------------- #
// Garde-fou données personnelles
// --------------------------------------------------------------------------- #

/**
 * Détecte les adresses e-mail et les numéros de téléphone dans un texte
 * libre. Vérification de surface (elle ne peut pas reconnaître un nom) :
 * c'est un garde-fou, pas une garantie d'anonymat.
 */
export function looksLikePersonalData(text: string): boolean {
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return true;
  const withoutDates = text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, " ");
  const collapsed = withoutDates.replace(/(?<=\d)[\s.-](?=\d)/g, "");
  return /\d{7,}/.test(collapsed);
}

const PERSONAL_DATA_ERROR =
  "Le texte semble contenir un numéro de téléphone ou une adresse e-mail. N'enregistrez aucune coordonnée de patient.";

// --------------------------------------------------------------------------- #
// Ouverture d'un cas
// --------------------------------------------------------------------------- #

export function shouldOpenCase(probability: number): boolean {
  return probability >= POSITIVE_THRESHOLD;
}

function addDaysIso(from: Date, days: number): string {
  return new Date(from.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function openCase(analysis: AnalysisRecord, by: string, now: Date = new Date()): TbCase {
  const at = now.toISOString();
  return {
    id: analysis.id,
    analysisId: analysis.id,
    patientId: analysis.patientId,
    probability: analysis.probability,
    riskLevel: analysis.riskLevel,
    createdAt: at,
    updatedAt: at,
    stage: "opened",
    dueDate: addDaysIso(now, DEFAULT_STEP_DAYS),
    events: [{ at, type: "opened", by, stage: "opened" }],
    simulated: analysis.simulated,
  };
}

// --------------------------------------------------------------------------- #
// Actions
// --------------------------------------------------------------------------- #

export type CaseAction =
  | { action: "assign"; by: string; owner: string }
  | { action: "set_due"; by: string; dueDate: string }
  | { action: "advance"; by: string; to: CaseStage; testResult?: TestResult; note?: string }
  | { action: "close"; by: string; outcome: CaseOutcome; lostReason?: LostReason; note?: string }
  | { action: "note"; by: string; note: string }
  | { action: "contact"; by: string; channel: ContactChannel; reached: boolean; note?: string };

export type ActionResult = { ok: true; case: TbCase } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

/** Étapes accessibles depuis l'étape actuelle (l'ordre est imposé). */
export function allowedNextStages(c: TbCase): CaseStage[] {
  switch (c.stage) {
    case "opened":
      return ["test_ordered"];
    case "test_ordered":
      return ["result_recorded"];
    case "result_recorded":
      if (c.testResult === "positive") return ["treatment"];
      if (c.testResult === "not_done") return ["test_ordered"];
      return []; // négatif : clôture « TB exclue »
    default:
      return [];
  }
}

/** Issues de clôture possibles à l'étape actuelle. */
export function allowedOutcomes(c: TbCase): CaseOutcome[] {
  if (c.stage === "closed") return [];
  const out: CaseOutcome[] = [];
  if (c.stage === "treatment") out.push("treated");
  if (c.stage === "result_recorded" && c.testResult === "negative") out.push("excluded");
  out.push("lost");
  return out;
}

/** Tentatives de contact SANS réponse exigées avant de clôturer un cas « injoignable ». */
export const MIN_FAILED_CONTACTS_BEFORE_UNREACHABLE = 2;

const CONTACT_CHANNELS: ContactChannel[] = ["sms", "whatsapp", "call", "home_visit", "other"];

export function contactAttempts(c: TbCase): { total: number; failed: number; lastAt?: string } {
  const contacts = c.events.filter((e) => e.type === "patient_contact");
  return {
    total: contacts.length,
    failed: contacts.filter((e) => e.reached === false).length,
    lastAt: contacts.length ? contacts[contacts.length - 1].at : undefined,
  };
}

const TEST_RESULTS: TestResult[] = ["positive", "negative", "not_done"];
const LOST_REASONS: LostReason[] = ["unreachable", "declined", "died", "moved", "other"];

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function applyAction(c: TbCase, input: CaseAction, now: Date = new Date()): ActionResult {
  if (c.stage === "closed") return fail("Ce cas est déjà clôturé.");
  const by = cleanText(input.by, 60);
  if (!by) return fail("Indiquez votre nom (en haut de la page) avant d'agir sur un cas.");
  const at = now.toISOString();

  const next: TbCase = { ...c, updatedAt: at, events: [...c.events] };

  switch (input.action) {
    case "assign": {
      const owner = cleanText(input.owner, 60);
      if (!owner) return fail("Indiquez le nom du responsable.");
      if (looksLikePersonalData(owner)) return fail(PERSONAL_DATA_ERROR);
      next.owner = owner;
      next.events.push({ at, type: "assigned", by, note: `Responsable : ${owner}` });
      return { ok: true, case: next };
    }

    case "set_due": {
      const dueDate = cleanText(input.dueDate, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate))) {
        return fail("Date d'échéance invalide (format attendu : AAAA-MM-JJ).");
      }
      next.dueDate = dueDate;
      next.events.push({ at, type: "due_changed", by, note: `Échéance : ${dueDate}` });
      return { ok: true, case: next };
    }

    case "advance": {
      if (!allowedNextStages(c).includes(input.to)) {
        return fail("Cette étape n'est pas possible depuis l'étape actuelle.");
      }
      const note = cleanText(input.note, 500);
      if (note && looksLikePersonalData(note)) return fail(PERSONAL_DATA_ERROR);

      if (input.to === "result_recorded") {
        if (!input.testResult || !TEST_RESULTS.includes(input.testResult)) {
          return fail("Indiquez le résultat du test de confirmation.");
        }
        if (input.testResult === "not_done" && note.length < 3) {
          return fail("Si le test n'a pas été réalisé, indiquez pourquoi dans la note.");
        }
        next.testResult = input.testResult;
        if (input.testResult !== "not_done") next.resultAt = at;
      }
      if (input.to === "treatment" && note.length < 3) {
        return fail("Indiquez la date de début de traitement ou le lieu d'orientation dans la note.");
      }
      if (input.to === "test_ordered") {
        // Nouveau test après un « non réalisé » : on repart d'un résultat vide.
        next.testResult = undefined;
        next.resultAt = undefined;
      }

      next.stage = input.to;
      next.dueDate = addDaysIso(now, DEFAULT_STEP_DAYS);
      next.events.push({ at, type: "advanced", by, stage: input.to, note: note || undefined });
      return { ok: true, case: next };
    }

    case "close": {
      if (!allowedOutcomes(c).includes(input.outcome)) {
        return fail("Cette clôture n'est pas possible à l'étape actuelle.");
      }
      const note = cleanText(input.note, 500);
      if (note && looksLikePersonalData(note)) return fail(PERSONAL_DATA_ERROR);
      if (input.outcome === "lost") {
        if (!input.lostReason || !LOST_REASONS.includes(input.lostReason)) {
          return fail("Un motif est obligatoire pour clôturer un cas perdu de vue.");
        }
        if (input.lostReason === "other" && note.length < 3) {
          return fail("Pour le motif « Autre », précisez dans la note.");
        }
        if (input.lostReason === "unreachable") {
          const { failed } = contactAttempts(c);
          if (failed < MIN_FAILED_CONTACTS_BEFORE_UNREACHABLE) {
            return fail(
              `Avant de classer « injoignable », documentez au moins ${MIN_FAILED_CONTACTS_BEFORE_UNREACHABLE} tentatives de contact sans réponse (il y en a ${failed}).`
            );
          }
        }
        next.lostReason = input.lostReason;
      }
      next.stage = "closed";
      next.outcome = input.outcome;
      next.closedAt = at;
      next.dueDate = undefined;
      next.events.push({ at, type: "closed", by, stage: "closed", note: note || undefined });
      return { ok: true, case: next };
    }

    case "note": {
      const note = cleanText(input.note, 500);
      if (note.length < 1) return fail("Note vide.");
      if (looksLikePersonalData(note)) return fail(PERSONAL_DATA_ERROR);
      next.events.push({ at, type: "note", by, note });
      return { ok: true, case: next };
    }

    case "contact": {
      if (!CONTACT_CHANNELS.includes(input.channel)) return fail("Moyen de contact inconnu.");
      if (typeof input.reached !== "boolean") return fail("Indiquez si le patient a été joint.");
      const note = cleanText(input.note, 500);
      if (note && looksLikePersonalData(note)) return fail(PERSONAL_DATA_ERROR);
      next.events.push({
        at,
        type: "patient_contact",
        by,
        stage: c.stage,
        channel: input.channel,
        reached: input.reached,
        note: note || undefined,
      });
      return { ok: true, case: next };
    }

    default:
      return fail("Action inconnue.");
  }
}

// --------------------------------------------------------------------------- #
// Message de rappel au patient (texte à envoyer par l'équipe, sans coordonnées)
// --------------------------------------------------------------------------- #

export type MessageLang = "fr" | "en";

/**
 * Texte volontairement NEUTRE : il ne cite ni la tuberculose ni le dépistage,
 * pour qu'un SMS lu par un proche ne révèle rien (risque de stigmatisation).
 * L'outil ne stocke aucun numéro : c'est l'équipe qui envoie le message avec
 * ses propres moyens, puis consigne la tentative dans le cas.
 */
export function buildPatientReminder(c: TbCase, lang: MessageLang, facility = ""): string {
  const place = facility.trim() || (lang === "fr" ? "votre centre de santé" : "your health centre");
  const by = c.dueDate ?? "";
  if (lang === "en") {
    const when = by ? ` before ${by}` : " as soon as possible";
    return `Reminder from ${place}: a follow-up visit is pending. Please come${when}, or contact us if you cannot. Reference: ${c.patientId}.`;
  }
  const when = by ? ` avant le ${by}` : " dès que possible";
  return `Rappel de ${place} : un rendez-vous de suivi est en attente. Merci de vous présenter${when}, ou de nous contacter si vous ne pouvez pas. Référence : ${c.patientId}.`;
}

// --------------------------------------------------------------------------- #
// Alertes de retard automatiques
// --------------------------------------------------------------------------- #

export type AlertKind = "overdue" | "escalation" | "unassigned";

export interface CaseAlert {
  caseId: string;
  patientId: string;
  owner?: string;
  stage: CaseStage;
  kind: AlertKind;
  daysOverdue: number;
  /** Clé de déduplication : même alerte pour la même échéance = une seule fois. */
  key: string;
  text: string;
}

/** Jours de retard à partir desquels l'alerte monte au superviseur. */
export const ESCALATION_AFTER_DAYS = 7;
/** Jours sans responsable avant alerte. */
export const UNASSIGNED_AFTER_DAYS = 1;

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  overdue: "Retard",
  escalation: "Retard important — à remonter au superviseur",
  unassigned: "Aucun responsable",
};

export function computeAlerts(cases: TbCase[], now: Date = new Date()): CaseAlert[] {
  const alerts: CaseAlert[] = [];
  for (const c of cases) {
    if (c.stage === "closed") continue;
    if (c.dueDate) {
      const due = Date.parse(`${c.dueDate}T23:59:59.999Z`);
      if (Number.isFinite(due) && due < now.getTime()) {
        const daysOverdue = Math.max(1, Math.floor((now.getTime() - due) / DAY_MS) + 1);
        const kind: AlertKind = daysOverdue >= ESCALATION_AFTER_DAYS ? "escalation" : "overdue";
        alerts.push({
          caseId: c.id,
          patientId: c.patientId,
          owner: c.owner,
          stage: c.stage,
          kind,
          daysOverdue,
          key: `${kind}|${c.dueDate}`,
          text: `${c.patientId} — ${STAGE_LABELS[c.stage]} — ${daysOverdue} j de retard (échéance ${c.dueDate})${
            c.owner ? ` — responsable : ${c.owner}` : " — sans responsable"
          }`,
        });
      }
    }
    if (!c.owner) {
      const ageDays = (now.getTime() - Date.parse(c.createdAt)) / DAY_MS;
      if (ageDays >= UNASSIGNED_AFTER_DAYS) {
        alerts.push({
          caseId: c.id,
          patientId: c.patientId,
          stage: c.stage,
          kind: "unassigned",
          daysOverdue: 0,
          key: "unassigned|" + c.createdAt.slice(0, 10),
          text: `${c.patientId} — ${STAGE_LABELS[c.stage]} — aucun responsable depuis ${Math.floor(ageDays)} j`,
        });
      }
    }
  }
  return alerts.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** Alertes qui n'ont pas encore été journalisées pour ce cas (évite les doublons quotidiens). */
export function pendingAlertsFor(c: TbCase, alerts: CaseAlert[]): CaseAlert[] {
  const done = new Set(c.events.filter((e) => e.type === "alert" && e.key).map((e) => e.key));
  return alerts.filter((a) => a.caseId === c.id && !done.has(a.key));
}

/** Inscrit les alertes au journal du cas (événement système « automatique »). */
export function recordAlerts(c: TbCase, alerts: CaseAlert[], now: Date = new Date()): TbCase {
  if (alerts.length === 0 || c.stage === "closed") return c;
  const at = now.toISOString();
  return {
    ...c,
    events: [
      ...c.events,
      ...alerts.map((a): CaseEvent => ({ at, type: "alert", by: "automatique", key: a.key, note: ALERT_KIND_LABELS[a.kind] })),
    ],
  };
}

// --------------------------------------------------------------------------- #
// Alertes et indicateurs
// --------------------------------------------------------------------------- #

export interface CaseFlags {
  overdue: boolean;
  unassigned: boolean;
}

export function caseFlags(c: TbCase, now: Date = new Date()): CaseFlags {
  if (c.stage === "closed") return { overdue: false, unassigned: false };
  const due = c.dueDate ? Date.parse(`${c.dueDate}T23:59:59.999Z`) : Number.NaN;
  return {
    overdue: Number.isFinite(due) && due < now.getTime(),
    unassigned: !c.owner,
  };
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS;
}

export interface CaseMetrics {
  total: number;
  open: number;
  closed: number;
  overdue: number;
  unassigned: number;
  /** Médiane (jours) entre dépistage positif et résultat du test de confirmation. */
  medianDaysToConfirmation: number | null;
  confirmationSample: number;
  /** Part des cas clôturés dans la fenêtre, parmi ceux dont le délai est écoulé. */
  closureRate: number | null;
  closureEligible: number;
  closureWindowDays: number;
  lostReasons: Record<LostReason, number>;
  outcomes: Record<CaseOutcome, number>;
  /** Tentatives de rappel au patient consignées (tous cas). */
  contactAttempts: number;
  /** Cas en retard pour lesquels aucun rappel n'a encore été consigné. */
  overdueWithoutContact: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeMetrics(cases: TbCase[], now: Date = new Date()): CaseMetrics {
  const lostReasons: Record<LostReason, number> = { unreachable: 0, declined: 0, died: 0, moved: 0, other: 0 };
  const outcomes: Record<CaseOutcome, number> = { treated: 0, excluded: 0, lost: 0 };
  let open = 0;
  let overdue = 0;
  let unassigned = 0;
  const confirmationDays: number[] = [];
  let eligible = 0;
  let closedInWindow = 0;
  let contactTotal = 0;
  let overdueWithoutContact = 0;

  for (const c of cases) {
    const flags = caseFlags(c, now);
    if (c.stage === "closed") {
      if (c.outcome) outcomes[c.outcome] += 1;
      if (c.outcome === "lost" && c.lostReason) lostReasons[c.lostReason] += 1;
    } else {
      open += 1;
      if (flags.overdue) {
        overdue += 1;
        if (contactAttempts(c).total === 0) overdueWithoutContact += 1;
      }
      if (flags.unassigned) unassigned += 1;
    }
    contactTotal += contactAttempts(c).total;
    if (c.resultAt) confirmationDays.push(daysBetween(c.createdAt, c.resultAt));

    // Taux de clôture : un cas compte s'il est clôturé, ou si son délai est écoulé.
    const closedWithin = c.closedAt ? daysBetween(c.createdAt, c.closedAt) <= CLOSURE_WINDOW_DAYS : false;
    const windowElapsed = (now.getTime() - Date.parse(c.createdAt)) / DAY_MS >= CLOSURE_WINDOW_DAYS;
    if (closedWithin || windowElapsed) {
      eligible += 1;
      if (closedWithin) closedInWindow += 1;
    }
  }

  return {
    total: cases.length,
    open,
    closed: cases.length - open,
    overdue,
    unassigned,
    medianDaysToConfirmation: median(confirmationDays),
    confirmationSample: confirmationDays.length,
    closureRate: eligible > 0 ? closedInWindow / eligible : null,
    closureEligible: eligible,
    closureWindowDays: CLOSURE_WINDOW_DAYS,
    lostReasons,
    outcomes,
    contactAttempts: contactTotal,
    overdueWithoutContact,
  };
}

// --------------------------------------------------------------------------- #
// Export CSV
// --------------------------------------------------------------------------- #

function csvEscape(value: string | number | undefined): string {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function casesToCsv(cases: TbCase[], now: Date = new Date()): string {
  const header = [
    "id_cas",
    "id_patient_anonymise",
    "ouvert_le",
    "score",
    "etape",
    "responsable",
    "echeance",
    "en_retard",
    "sans_responsable",
    "resultat_test",
    "jours_jusqu_au_resultat",
    "issue",
    "motif_perte_de_vue",
    "cloture_le",
    "rappels_patient",
    "rappels_sans_reponse",
    "alertes_automatiques",
    "simule",
  ];
  const rows = cases.map((c) => {
    const f = caseFlags(c, now);
    return [
      c.id,
      c.patientId,
      c.createdAt,
      (c.probability * 100).toFixed(1) + "%",
      STAGE_LABELS[c.stage],
      c.owner ?? "",
      c.dueDate ?? "",
      f.overdue ? "oui" : "non",
      f.unassigned ? "oui" : "non",
      c.testResult ? TEST_RESULT_LABELS[c.testResult] : "",
      c.resultAt ? daysBetween(c.createdAt, c.resultAt).toFixed(1) : "",
      c.outcome ? OUTCOME_LABELS[c.outcome] : "",
      c.lostReason ? LOST_REASON_LABELS[c.lostReason] : "",
      c.closedAt ?? "",
      contactAttempts(c).total,
      contactAttempts(c).failed,
      c.events.filter((e) => e.type === "alert").length,
      c.simulated ? "oui" : "non",
    ]
      .map(csvEscape)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}
