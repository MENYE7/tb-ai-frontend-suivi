"use client";

import { useCallback, useRef, useState } from "react";

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

/**
 * Zone de glisser-déposer générique, utilisée par /analyze (1 image) et
 * /batch (jusqu'à `maxFiles` images). Ne fait AUCUNE validation de
 * contenu ici (magic bytes, taille) — c'est le rôle du serveur
 * (app/api/predict/route.ts), cette zone ne fait que filtrer par
 * extension pour l'ergonomie (retour visuel immédiat).
 */
export function UploadDropzone({
  onFilesSelected,
  multiple = false,
  maxFiles = 1,
  disabled = false,
  label = "Glissez-déposez une radiographie ici",
  hint = "ou cliquez pour parcourir vos fichiers (PNG, JPEG)",
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || disabled) return;
      const files = Array.from(fileList)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, maxFiles);
      if (files.length > 0) onFilesSelected(files);
    },
    [disabled, maxFiles, onFilesSelected]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={`flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors duration-200 ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900"
          : isDragging
            ? "cursor-pointer border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950"
            : "cursor-pointer border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <svg className="mb-3 h-10 w-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 8.25L12 3.75m0 0L7.5 8.25M12 3.75v13.5"
        />
      </svg>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      {multiple && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Maximum {maxFiles} images</p>}
    </div>
  );
}
