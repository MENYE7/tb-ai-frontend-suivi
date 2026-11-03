"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { SampleImages } from "@/components/SampleImages";
import { useDemo } from "@/components/DemoProvider";
import { CircularGauge } from "@/components/CircularGauge";
import { GradCamOverlay } from "@/components/GradCamOverlay";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { ReportPdfButton } from "@/components/ReportPdfButton";
import { analyzeImage, ApiError } from "@/lib/api";
import { preloadModel } from "@/lib/onnxInference";
import { isLikelyAnonymizedId } from "@/lib/utils";
import { useExpertName } from "@/lib/useExpertName";
import type { ExpertStatus, PredictionResult } from "@/lib/types";

const DISCLAIMER =
  "⚠️ Outil d'aide au dépistage à visée de recherche — ne remplace pas votre jugement clinique. " +
  "Les zones d'activation affichées sont des estimations, pas une localisation anatomique validée.";

export default function AnalyzePage() {
  const demo = useDemo();
  const [expertName] = useExpertName();
  const [patientId, setPatientId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ step: number; total: number } | null>(null);
  const [result, setResult] = useState<(PredictionResult & { analysisId: string; createdAt: string; caseOpened?: boolean }) | null>(null);
  const [expertStatus, setExpertStatus] = useState<ExpertStatus>("pending");
  const [error, setError] = useState<string | null>(null);

  // Précharge le modèle ONNX (~27 Mo) dès l'arrivée sur la page, pour que
  // l'analyse démarre sans délai de téléchargement au premier upload.
  useEffect(() => {
    preloadModel();
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      setError(null);
      setResult(null);
      setProgress(null);
      setExpertStatus("pending");

      // Démo publique : l'évaluateur n'a pas à inventer un identifiant.
      let effectiveId = patientId;
      if (demo && !patientId.trim()) {
        effectiveId = `SIM-D${Date.now().toString(36).slice(-5).toUpperCase()}`;
        setPatientId(effectiveId);
      }

      if (!isLikelyAnonymizedId(effectiveId)) {
        setError(
          "Saisissez d'abord un identifiant patient anonymisé (ex. 'P-2026-014'), sans espace ni nom réel."
        );
        return;
      }

      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setIsLoading(true);

      try {
        const prediction = await analyzeImage(file, effectiveId.trim(), (step, total) =>
          setProgress({ step, total })
        );
        setResult({ ...prediction, createdAt: new Date().toISOString() });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Erreur inattendue lors de l'analyse.");
      } finally {
        setIsLoading(false);
        setProgress(null);
      }
    },
    [patientId, demo]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Analyse d&apos;une radiographie</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{DISCLAIMER}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="patient-id" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Identifiant patient (anonymisé)
            </label>
            <input
              id="patient-id"
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="ex. P-2026-014"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              N&apos;utilisez jamais de nom ou prénom réel dans ce champ.
            </p>
          </div>

          <UploadDropzone onFilesSelected={handleFiles} disabled={isLoading} />
          {demo && <SampleImages onPick={(file) => handleFiles([file])} disabled={isLoading} />}
          {demo && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Démo ouverte, sans identifiant : l&apos;analyse s&apos;exécute dans votre navigateur (la radio n&apos;est
              envoyée nulle part). Un score ≥ 50 % ouvre automatiquement un cas dans « Suivi des cas ».
            </p>
          )}

          {previewUrl && !result && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Aperçu" className="mx-auto max-h-64 object-contain" />
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          {isLoading && (
            <div className="flex flex-col items-center gap-4 text-slate-500 dark:text-slate-400">
              <span className="glow-spinner" />
              <p className="text-sm">
                {progress ? `Calcul de la saillance... ${progress.step}/${progress.total}` : "Analyse en cours..."}
              </p>
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">{error}</div>
          )}

          {!isLoading && !error && result && (
            <div className="flex w-full flex-col gap-4">
              <CircularGauge probability={result.probability} riskLevel={result.riskLevel} />
              <p className="text-center text-xs text-slate-400">
                Analysé en {Math.round(result.inferenceTimeMs)} ms
              </p>
              <GradCamOverlay
                originalImageBase64={result.originalImageBase64}
                gradcamImageBase64={result.gradcamImageBase64}
                detectedZones={result.detectedZones}
              />
              {result.caseOpened && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                  Dépistage positif : un cas de suivi a été ouvert.{" "}
                  <Link href={`/cases?open=${encodeURIComponent(result.analysisId)}`} className="font-semibold underline">
                    Ouvrir le suivi
                  </Link>
                </div>
              )}
              <FeedbackButtons analysisId={result.analysisId} onFeedbackSubmitted={setExpertStatus} />
              <ReportPdfButton
                data={{
                  patientId: patientId.trim(),
                  createdAt: result.createdAt,
                  probability: result.probability,
                  riskLevel: result.riskLevel,
                  originalImageBase64: result.originalImageBase64,
                  gradcamImageBase64: result.gradcamImageBase64,
                  expertStatus,
                  expertName: expertStatus !== "pending" ? expertName : undefined,
                  detectedZones: result.detectedZones,
                  inferenceTimeMs: result.inferenceTimeMs,
                }}
              />
            </div>
          )}

          {!isLoading && !error && !result && (
            <p className="text-sm text-slate-400">Le résultat de l&apos;analyse s&apos;affichera ici.</p>
          )}
        </div>
      </div>
    </main>
  );
}

