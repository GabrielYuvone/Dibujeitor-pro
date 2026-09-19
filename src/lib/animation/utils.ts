// ============================================================================
// utils.ts — Utilidades generales del módulo de animación
// ============================================================================

import type { ID } from "./types";

/** Genera IDs únicos. */
export function genId(prefix = "id"): ID {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Formatea un número de frame como etiqueta, p.ej. frame 0 → "F-001". */
export function formatFrame(frame: number, pad = 3): string {
  return `F-${String(frame + 1).padStart(pad, "0")}`;
}

/** Formatea tiempo en segundos como mm:ss.ms */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

/** Convierte un número de frame a tiempo en segundos según FPS. */
export function framesToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

/** Convierte tiempo a frame. */
export function secondsToFrames(seconds: number, fps: number): number {
  return Math.floor(seconds * fps);
}

/** Devuelve el total de frames del proyecto (max de todas las capas). */
export function totalFrames(layers: { cells: { startFrame: number; duration: number }[] }[]): number {
  let max = 0;
  for (const layer of layers) {
    for (const cell of layer.cells) {
      const end = cell.startFrame + cell.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

/** Devuelve el drawing activo para una capa en un frame dado. */
export function findCellAtFrame(
  cells: { startFrame: number; duration: number; drawingId: string | null }[],
  frame: number
): { startFrame: number; duration: number; drawingId: string | null } | null {
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (frame >= c.startFrame && frame < c.startFrame + c.duration) {
      return c;
    }
  }
  return null;
}

/** Calcula el bounding box de los píxeles no transparentes de un ImageData. */
export function getContentBounds(imageData: ImageData): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const { width, height, data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
