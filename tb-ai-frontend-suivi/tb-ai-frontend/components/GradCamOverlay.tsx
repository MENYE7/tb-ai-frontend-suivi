"use client";

import { useState } from "react";
import type { DetectedZone } from "@/lib/types";

interface GradCamOverlayProps {
  originalImageBase64: string;
  gradcamImageBase64: string;
  detectedZones: DetectedZone[];
}

/**
 * Affiche l'image originale et la superposition Grad-CAM, avec un bouton
 * pour basculer entre les deux, un zoom simple, et désormais les VRAIES
 * bounding boxes des zones suspectes (calculées côté Space par seuillage
 * de la carte Grad-CAM brute — cf. app.py) dessinées en superposition,
 * plutôt qu'une estimation heuristique côté client sur l'image déjà
 * colorée (moins fiable, retirée).
 */
export function GradCamOverlay({ originalImageBase64, gradcamImageBase64, detectedZones }: GradCamOverlayProps) {
  const [showGradcam, setShowGradcam] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);

  const currentImage = showGradcam ? gradcamImageBase64 : originalImageBase64;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
        onClick={() => setIsZoomed(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentImage}
          alt={showGradcam ? "Superposition Grad-CAM" : "Radiographie originale"}
          className="mx-auto max-h-80 w-auto object-contain"
        />
        {showBoxes && (
          <div className="absolute inset-0">
            {detectedZones.map((zone, i) => (
              <div
                key={i}
                className="absolute border-2 border-red-500"
                style={{
                  left: `${zone.x * 100}%`,
                  top: `${zone.y * 100}%`,
                  width: `${zone.width * 100}%`,
                  height: `${zone.height * 100}%`,
                }}
              >
                <span className="absolute -top-5 left-0 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {Math.round(zone.score * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
        <span className="absolute bottom-2 right-2 rounded bg-slate-900/70 px-2 py-0.5 text-xs text-white">
          Cliquer pour agrandir
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowGradcam(false)}
          className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            !showGradcam
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          Radio originale
        </button>
        <button
          type="button"
          onClick={() => setShowGradcam(true)}
          className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            showGradcam
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          Grad-CAM
        </button>
        {detectedZones.length > 0 && (
          <button
            type="button"
            onClick={() => setShowBoxes((v) => !v)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {showBoxes ? "Masquer" : "Afficher"} les zones
          </button>
        )}
      </div>

      {detectedZones.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Zones suspectes ({detectedZones.length})
          </p>
          <ul className="space-y-1">
            {detectedZones.map((zone, i) => (
              <li key={i} className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300">
                <span>
                  • Zone {i + 1} — x={zone.x.toFixed(2)}, y={zone.y.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400">score {Math.round(zone.score * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">
            Bounding boxes obtenues par seuillage de la carte Grad-CAM — approximation
            géométrique de l&apos;activation du réseau, pas une segmentation anatomique
            validée. À interpréter avec votre lecture clinique de l&apos;image.
          </p>
        </div>
      )}

      {isZoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsZoomed(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentImage} alt="Radiographie agrandie" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => setIsZoomed(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
