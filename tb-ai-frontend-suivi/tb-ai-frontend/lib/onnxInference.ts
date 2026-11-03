"use client";

/**
 * lib/onnxInference.ts
 *
 * Inférence TB-AI 100% côté navigateur (onnxruntime-web, WASM) — porté
 * depuis l'outil HTML autonome où cette logique a déjà été testée et
 * validée (classification + saillance par occlusion sur des cas réels
 * Normal/Tuberculose). Remplace l'ancien appel serveur vers le Space
 * Hugging Face, qui nécessite désormais un abonnement payant.
 *
 * Choix conservés de l'outil autonome, pour les mêmes raisons qu'alors :
 * - Grayscale via la formule ITU-R 601-2 (identique à PIL.convert("L") de
 *   l'entraînement), pas une simple moyenne (R+G+B)/3.
 * - Saillance par occlusion sur la variation de LOGIT (pas de probabilité)
 *   — reste un signal exploitable même pour des prédictions très
 *   confiantes (proche de 0% ou 100%), contrairement à la probabilité qui
 *   sature à ces extrêmes.
 * - Noms d'entrée/sortie du modèle lus dynamiquement (jamais supposés en
 *   dur), le modèle ayant été produit par un pipeline externe.
 */

import type { DetectedZone } from "./types";

// ⚠️ onnxruntime-web n'est PAS importé directement (`import "onnxruntime-web"`) :
// son paquet expose plusieurs variantes de build (browser/node), et
// laisser webpack l'empaqueter provoque une erreur de parsing sur sa
// variante Node (confirmé par test — `next build` échouait sur
// ort.node.min.mjs). Solution officiellement recommandée par le paquet
// (cf. son README) : le charger via un <script> CDN classique, qui
// expose `window.ort`, et le déclarer "externe" côté webpack
// (next.config.js) pour qu'il n'essaie jamais de l'analyser. C'est
// exactement l'approche déjà validée dans l'outil HTML autonome de ce
// projet — reprise ici à l'identique.

declare global {
  interface Window {
    ort?: typeof import("onnxruntime-web");
  }
}

const ORT_CDN_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.js";

const MODEL_URL = "https://huggingface.co/menyeg2/tb-model/resolve/main/tb_model_v2.onnx";
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const IMAGE_SIZE = 224;
const OCC_GRID = 6;
const ZONE_THRESHOLD_RATIO = 0.6;

export interface ClientInferenceResult {
  probability: number;
  gradcamImageBase64: string;
  detectedZones: DetectedZone[];
  inferenceTimeMs: number;
}

// --------------------------------------------------------------------------- #
// Chargement du script CDN (une seule fois, réutilisé partout)
// --------------------------------------------------------------------------- #

let ortLoadPromise: Promise<void> | null = null;

function ensureOrtLoaded(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("onnxruntime-web ne peut être chargé que côté navigateur."));
  }
  if (window.ort) return Promise.resolve();

  if (!ortLoadPromise) {
    ortLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${ORT_CDN_URL}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Échec du chargement d'onnxruntime-web.")));
        return;
      }
      const script = document.createElement("script");
      script.src = ORT_CDN_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Échec du chargement d'onnxruntime-web (réseau ou CDN bloqué)."));
      document.head.appendChild(script);
    });
  }
  return ortLoadPromise;
}

// --------------------------------------------------------------------------- #
// Session (chargée une seule fois, réutilisée pour toutes les analyses)
// --------------------------------------------------------------------------- #

let sessionPromise: Promise<{
  session: import("onnxruntime-web").InferenceSession;
  inputName: string;
  outputName: string;
}> | null = null;

function loadSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      await ensureOrtLoaded();
      const ort = window.ort!;
      const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
      return {
        session,
        inputName: session.inputNames[0],
        outputName: session.outputNames[0],
      };
    })();
    // Un échec (réseau coupé, CDN lent) ne doit pas être mémorisé : la prochaine
    // analyse doit pouvoir réessayer sans recharger la page.
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

/** Précharge le script + le modèle avant la première analyse (appelé au montage de la page). */
export function preloadModel(): void {
  loadSession().catch(() => undefined);
}

// --------------------------------------------------------------------------- #
// Prétraitement
// --------------------------------------------------------------------------- #

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function preprocessImage(img: HTMLImageElement): { data: Float32Array; grayCanvas: HTMLCanvasElement } {
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  const imageData = ctx.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE).data;

  const data = new Float32Array(1 * 3 * IMAGE_SIZE * IMAGE_SIZE);
  const plane = IMAGE_SIZE * IMAGE_SIZE;

  for (let i = 0; i < plane; i++) {
    const r = imageData[i * 4];
    const g = imageData[i * 4 + 1];
    const b = imageData[i * 4 + 2];
    // Luma ITU-R 601-2, identique à PIL.convert("L") côté entraînement.
    const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    data[i] = (gray - MEAN[0]) / STD[0];
    data[plane + i] = (gray - MEAN[1]) / STD[1];
    data[2 * plane + i] = (gray - MEAN[2]) / STD[2];
  }

  return { data, grayCanvas: canvas };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire cette image."));
    };
    img.src = url;
  });
}

// --------------------------------------------------------------------------- #
// Inférence
// --------------------------------------------------------------------------- #

async function runInference(tensorData: Float32Array): Promise<{ probability: number; rawLogit: number }> {
  await ensureOrtLoaded();
  const ort = window.ort!;
  const { session, inputName, outputName } = await loadSession();

  const tensor = new ort.Tensor("float32", tensorData, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);
  const output = await session.run({ [inputName]: tensor });
  const outTensor = output[outputName];

  if (!outTensor) {
    throw new Error(`Sortie '${outputName}' introuvable dans la réponse du modèle.`);
  }
  if (outTensor.data.length !== 1) {
    throw new Error(
      `La sortie du modèle contient ${outTensor.data.length} valeurs, une seule était attendue.`
    );
  }

  const rawLogit = Number(outTensor.data[0]);
  return { probability: sigmoid(rawLogit), rawLogit };
}

// --------------------------------------------------------------------------- #
// Saillance par occlusion
// --------------------------------------------------------------------------- #

async function computeOcclusionHeatmap(
  baseData: Float32Array,
  baselineLogit: number,
  onProgress?: (step: number, total: number) => void
): Promise<number[][]> {
  const cellSize = IMAGE_SIZE / OCC_GRID;
  const heat: number[][] = Array.from({ length: OCC_GRID }, () => new Array(OCC_GRID).fill(0));
  const plane = IMAGE_SIZE * IMAGE_SIZE;
  let step = 0;
  const total = OCC_GRID * OCC_GRID;

  for (let gy = 0; gy < OCC_GRID; gy++) {
    for (let gx = 0; gx < OCC_GRID; gx++) {
      const x0 = Math.floor(gx * cellSize);
      const x1 = Math.floor((gx + 1) * cellSize);
      const y0 = Math.floor(gy * cellSize);
      const y1 = Math.floor((gy + 1) * cellSize);

      const masked = baseData.slice();
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = y * IMAGE_SIZE + x;
          masked[idx] = 0;
          masked[plane + idx] = 0;
          masked[2 * plane + idx] = 0;
        }
      }

      const { rawLogit: maskedLogit } = await runInference(masked);
      // Valeur ABSOLUE du changement de logit : une prédiction confiante
      // vers "Normal" peut voir son logit REMONTER en masquant une zone
      // clé, une prédiction confiante vers "Tuberculose" plutôt DESCENDRE
      // — Math.abs capture l'importance de la zone dans les deux cas.
      heat[gy][gx] = Math.abs(baselineLogit - maskedLogit);

      step++;
      onProgress?.(step, total);
    }
  }

  return heat;
}

/** Convertit la carte de chaleur (grille grossière) en bounding boxes normalisées [0,1]. */
function extractZones(heat: number[][]): DetectedZone[] {
  const flat = heat.flat();
  const maxHeat = Math.max(...flat);
  if (maxHeat <= 0) return [];

  const threshold = maxHeat * ZONE_THRESHOLD_RATIO;
  const cellSize = 1 / OCC_GRID;
  const zones: DetectedZone[] = [];

  for (let gy = 0; gy < OCC_GRID; gy++) {
    for (let gx = 0; gx < OCC_GRID; gx++) {
      if (heat[gy][gx] >= threshold) {
        zones.push({
          x: gx * cellSize,
          y: gy * cellSize,
          width: cellSize,
          height: cellSize,
          score: heat[gy][gx] / maxHeat,
        });
      }
    }
  }

  return zones.sort((a, b) => b.score - a.score);
}

/** Dessine l'image en niveaux de gris + la carte de saillance en superposition lissée, retourne un data URL PNG. */
function drawOverlay(grayCanvas: HTMLCanvasElement, heat: number[][]): string {
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(grayCanvas, 0, 0);

  const maxHeat = Math.max(...heat.flat());

  const mini = document.createElement("canvas");
  mini.width = OCC_GRID;
  mini.height = OCC_GRID;
  const miniCtx = mini.getContext("2d")!;
  const imgData = miniCtx.createImageData(OCC_GRID, OCC_GRID);

  for (let gy = 0; gy < OCC_GRID; gy++) {
    for (let gx = 0; gx < OCC_GRID; gx++) {
      const norm = maxHeat > 0 ? heat[gy][gx] / maxHeat : 0;
      const idx = (gy * OCC_GRID + gx) * 4;
      imgData.data[idx] = Math.round(255 * norm);
      imgData.data[idx + 1] = Math.round(120 * (1 - norm));
      imgData.data[idx + 2] = 40;
      imgData.data[idx + 3] = Math.round(200 * norm);
    }
  }
  miniCtx.putImageData(imgData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 0.75;
  ctx.drawImage(mini, 0, 0, OCC_GRID, OCC_GRID, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  ctx.globalAlpha = 1;

  return canvas.toDataURL("image/png");
}

// --------------------------------------------------------------------------- #
// Point d'entrée public
// --------------------------------------------------------------------------- #

export async function analyzeImageClientSide(
  file: File,
  onProgress?: (step: number, total: number) => void
): Promise<ClientInferenceResult> {
  const start = performance.now();

  const img = await loadImage(file);
  const { data, grayCanvas } = preprocessImage(img);

  const { probability, rawLogit } = await runInference(data);
  const heat = await computeOcclusionHeatmap(data, rawLogit, onProgress);

  const gradcamImageBase64 = drawOverlay(grayCanvas, heat);
  const detectedZones = extractZones(heat);
  const inferenceTimeMs = Math.round(performance.now() - start);

  return { probability, gradcamImageBase64, detectedZones, inferenceTimeMs };
}
