"use client";

import { useState } from "react";
import { submitFeedback, ApiError } from "@/lib/api";
import { useExpertName } from "@/lib/useExpertName";
import type { ExpertStatus } from "@/lib/types";

interface FeedbackButtonsProps {
  analysisId: string;
  initialStatus?: ExpertStatus;
  onFeedbackSubmitted?: (status: ExpertStatus) => void;
}

/**
 * FeedbackButtons — l'expert confirme ou infirme le résultat de l'IA.
 * Enregistré via POST /api/feedback (voir la note sur `expertName` dans
 * ce fichier route : identification par nom saisi, PAS une authentification).
 */
export function FeedbackButtons({ analysisId, initialStatus = "pending", onFeedbackSubmitted }: FeedbackButtonsProps) {
  const [expertName] = useExpertName();
  const [status, setStatus] = useState<ExpertStatus>(initialStatus);
  const [comment, setComment] = useState("");
  const [showCommentFor, setShowCommentFor] = useState<ExpertStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecision = async (decision: "confirmed" | "rejected") => {
    setError(null);

    if (!expertName.trim()) {
      setError("Indiquez votre nom (en haut de la page) avant de valider un résultat.");
      return;
    }

    // Demande un commentaire pour un rejet (utile pour comprendre le désaccord),
    // optionnel pour une confirmation.
    if (decision === "rejected" && showCommentFor !== "rejected") {
      setShowCommentFor("rejected");
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await submitFeedback(analysisId, decision, expertName.trim(), comment.trim() || undefined);
      setStatus(updated.expertStatus);
      setShowCommentFor(null);
      onFeedbackSubmitted?.(updated.expertStatus);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'enregistrement du feedback.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status !== "pending") {
    return (
      <div
        className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          status === "confirmed"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
        }`}
      >
        {status === "confirmed" ? "✓ Résultat confirmé par l'expert" : "✗ Résultat infirmé par l'expert"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!expertName && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Indiquez votre nom en haut de la page pour pouvoir valider un résultat.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleDecision("confirmed")}
          disabled={isSubmitting}
          className="flex-1 rounded-md border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✓ Confirmer
        </button>
        <button
          type="button"
          onClick={() => handleDecision("rejected")}
          disabled={isSubmitting}
          className="flex-1 rounded-md border border-red-600 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:hover:bg-red-950"
        >
          ✗ Rejeter
        </button>
      </div>

      {showCommentFor === "rejected" && (
        <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <label htmlFor="feedback-comment" className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Pourquoi infirmez-vous ce résultat ? (optionnel, utile pour l&apos;amélioration du modèle)
          </label>
          <textarea
            id="feedback-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => handleDecision("rejected")}
            disabled={isSubmitting}
            className="self-end rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isSubmitting ? "Envoi..." : "Confirmer le rejet"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
