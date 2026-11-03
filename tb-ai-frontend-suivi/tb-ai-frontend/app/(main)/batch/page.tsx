"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { analyzeImage, ApiError } from "@/lib/api";
import { preloadModel } from "@/lib/onnxInference";
import { RISK_LABELS, type BatchItem } from "@/lib/types";
import { analysesToCsv, downloadCsv, generateId } from "@/lib/utils";
import type { AnalysisRecord } from "@/lib/types";

const MAX_FILES = 50;
// ⚠️ CORRECTIF : l'ancienne concurrence de 3 avait du sens quand chaque
// analyse était un appel RÉSEAU vers un serveur capable de vraiment
// paralléliser (ancien Space Hugging Face). Depuis le passage à
// l'inférence 100% navigateur (WASM, mono-thread par défaut sans
// isolation cross-origin COOP/COEP configurée), lancer plusieurs
// inférences "en parallèle" ne fait que les faire s'entrelacer sur le
// même cœur CPU — aucun gain de vitesse, juste un risque de pression
// mémoire (plusieurs tenseurs/sessions actifs en même temps). Traitement
// séquentiel, une image à la fois.
const CONCURRENCY = 1;

/**
 * Traitement du lot CÔTÉ CLIENT, une image à la fois (CONCURRENCY=1, cf.
 * note ci-dessus) — chaque image est entièrement analysée dans le
 * navigateur (lib/onnxInference.ts), puis son résultat seul est envoyé au
 * serveur pour l'historique. Permet une progression réelle affichée à
 * l'utilisateur, indépendamment de toute limite de timeout serveur.
 */

function sanitizePatientId(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, "");
  const cleaned = base.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
  return cleaned || generateId("P");
}

export default function BatchPage() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    preloadModel();
  }, []);

  const handleFiles = useCallback((selectedFiles: File[]) => {
    const limited = selectedFiles.slice(0, MAX_FILES);
    const newItems: BatchItem[] = [];
    const newFiles = new Map<string, File>();

    for (const file of limited) {
      const id = generateId("batch");
      newItems.push({
        id,
        fileName: file.name,
        patientId: sanitizePatientId(file.name),
        status: "queued",
      });
      newFiles.set(id, file);
    }

    setItems(newItems);
    setFiles(newFiles);
  }, []);

  const updateItem = (id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const runBatch = useCallback(async () => {
    setIsProcessing(true);
    const queue = [...items];
    let cursor = 0;

    async function worker() {
      while (cursor < queue.length) {
        const index = cursor++;
        const item = queue[index];
        const file = files.get(item.id);
        if (!file) continue;

        updateItem(item.id, { status: "processing" });
        try {
          const result = await analyzeImage(file, item.patientId);
          updateItem(item.id, { status: "done", probability: result.probability, riskLevel: result.riskLevel });
        } catch (err) {
          updateItem(item.id, {
            status: "error",
            errorMessage: err instanceof ApiError ? err.message : "Échec de l'analyse.",
          });
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    setIsProcessing(false);
  }, [items, files]);

  const doneCount = items.filter((it) => it.status === "done" || it.status === "error").length;
  const progressPct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  const handleExport = () => {
    const asRecords: AnalysisRecord[] = items
      .filter((it) => it.status === "done" && it.probability !== undefined && it.riskLevel)
      .map((it) => ({
        id: it.id,
        createdAt: new Date().toISOString(),
        patientId: it.patientId,
        probability: it.probability as number,
        riskLevel: it.riskLevel!,
        expertStatus: "pending",
      }));
    downloadCsv(`tbai_lot_${new Date().toISOString().slice(0, 10)}.csv`, analysesToCsv(asRecords));
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Analyse par lot</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Jusqu&apos;à {MAX_FILES} images. L&apos;identifiant patient est dérivé du nom de fichier — renommez vos
        fichiers en amont avec vos identifiants anonymisés pour un résultat directement exploitable.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <UploadDropzone
          onFilesSelected={handleFiles}
          multiple
          maxFiles={MAX_FILES}
          disabled={isProcessing}
          label="Glissez-déposez vos radiographies ici"
          hint={`ou cliquez pour en sélectionner jusqu'à ${MAX_FILES}`}
        />

        {items.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={runBatch}
                disabled={isProcessing || items.every((it) => it.status !== "queued")}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing ? "Traitement en cours..." : `Lancer l'analyse (${items.length} images)`}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={doneCount === 0}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                📄 Exporter en CSV
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {doneCount}/{items.length} traitées
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Fichier</th>
                    <th className="px-4 py-2">Patient</th>
                    <th className="px-4 py-2">Statut</th>
                    <th className="px-4 py-2">Score</th>
                    <th className="px-4 py-2">Risque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((item) => (
                    <tr key={item.id} className="text-slate-700 dark:text-slate-300">
                      <td className="px-4 py-2">{item.fileName}</td>
                      <td className="px-4 py-2 font-mono text-xs">{item.patientId}</td>
                      <td className="px-4 py-2">
                        {item.status === "queued" && <span className="text-slate-400">En attente</span>}
                        {item.status === "processing" && <span className="text-blue-500">Analyse...</span>}
                        {item.status === "done" && <span className="text-emerald-600 dark:text-emerald-400">✓ Terminé</span>}
                        {item.status === "error" && (
                          <span className="text-red-600 dark:text-red-400" title={item.errorMessage}>
                            ✗ Erreur
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {item.probability !== undefined ? `${(item.probability * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-2">{item.riskLevel ? RISK_LABELS[item.riskLevel] : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
