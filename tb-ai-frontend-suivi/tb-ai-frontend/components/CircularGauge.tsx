"use client";

import { RISK_LABELS, type RiskLevel } from "@/lib/types";

interface CircularGaugeProps {
  probability: number; // 0-1
  riskLevel: RiskLevel;
  size?: number;
}

const RISK_STROKE: Record<RiskLevel, string> = {
  low: "#10b981", // emerald-500
  moderate: "#f59e0b", // amber-500
  high: "#ef4444", // red-500
};

/**
 * Jauge circulaire (anneau) animée : le remplissage transitionne en CSS
 * vers la nouvelle valeur à chaque changement de `probability`, plutôt
 * que d'apparaître instantanément.
 */
export function CircularGauge({ probability, riskLevel, size = 180 }: CircularGaugeProps) {
  const clamped = Math.min(1, Math.max(0, probability));
  const strokeWidth = size * 0.09;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center" role="img" aria-label={`Probabilité de tuberculose : ${Math.round(clamped * 100)}%`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200 dark:text-slate-700"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={RISK_STROKE[riskLevel]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
            style={{ transition: "stroke-dashoffset 800ms ease-out, stroke 800ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-slate-900 dark:text-slate-50">
            {Math.round(clamped * 100)}%
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Probabilité TB</span>
        </div>
      </div>
      <span
        className={`mt-3 rounded-full border px-3 py-1 text-sm font-medium ${
          riskLevel === "high"
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
            : riskLevel === "moderate"
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400"
        }`}
      >
        Risque {RISK_LABELS[riskLevel]}
      </span>
    </div>
  );
}
