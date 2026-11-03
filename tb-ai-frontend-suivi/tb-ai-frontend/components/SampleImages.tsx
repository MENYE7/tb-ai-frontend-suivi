"use client";

import { useEffect, useState } from "react";

interface Sample {
  file: string;
  label: string;
}

/**
 * Boutons « radio d'exemple » pour la démo publique. Ils n'apparaissent que si
 * public/samples/manifest.json liste au moins une image (voir LISEZ-MOI.txt
 * dans ce dossier). Le fichier est chargé dans le navigateur, comme un import.
 */
export function SampleImages({ onPick, disabled }: { onPick: (file: File) => void; disabled?: boolean }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/samples/manifest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => {
        if (cancelled || !Array.isArray(list)) return;
        setSamples(
          list.filter(
            (s): s is Sample =>
              !!s && typeof s.file === "string" && typeof s.label === "string" && /^[\w.-]+$/.test(s.file)
          )
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (samples.length === 0) return null;

  const pick = async (s: Sample) => {
    setError(null);
    try {
      const response = await fetch(`/samples/${encodeURIComponent(s.file)}`);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      onPick(new File([blob], s.file, { type: blob.type || "image/jpeg" }));
    } catch {
      setError("Impossible de charger cette radio d'exemple.");
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
      <p className="mb-2 text-sm font-medium text-blue-900 dark:text-blue-200">
        Pas de radio sous la main ? Essayez un exemple public :
      </p>
      <div className="flex flex-wrap gap-2">
        {samples.map((s) => (
          <button
            key={s.file}
            type="button"
            disabled={disabled}
            onClick={() => pick(s)}
            className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm text-blue-800 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200"
          >
            {s.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
