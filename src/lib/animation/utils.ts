// ============================================================================
// utils.ts — Utilidades generales del módulo de animación
// ============================================================================

import type { ID, Layer } from "./types";

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
  frame: number,
  loopRange?: { start: number; end: number; count: number } | null
): { startFrame: number; duration: number; drawingId: string | null } | null {
  // Si la capa define un rango de bucle, mapear el frame pedido a un frame
  // dentro del rango (repitiendo el rango `count` veces o indefinidamente
  // cuando count = 0). Esto reproduce el comportamiento de "loop" de capas
  // para ciclos de caminata, etc.
  if (loopRange && loopRange.end > loopRange.start) {
    const rangeLen = loopRange.end - loopRange.start;
    if (frame >= loopRange.start) {
      const offset = frame - loopRange.start;
      const limit = loopRange.count > 0 ? loopRange.count * rangeLen : Infinity;
      if (offset < limit) {
        const loopedOffset = offset % rangeLen;
        frame = loopRange.start + loopedOffset;
      }
    }
  }
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

/**
 * Transformación interpolada de una capa en un frame dado.
 *
 * Si la capa no tiene `transformKeyframes`, devuelve la identidad
 * (offset 0, scale 1, rotation 0). Si tiene keyframes:
 *   - frame <= primer kf → valores del primer kf
 *   - frame >= último kf  → valores del último kf
 *   - primer < frame < último → interpolación LINEAL entre los dos
 *     keyframes circundantes en todos los canales (offsetX, offsetY,
 *     scale, rotation).
 *
 * La interpolación lineal en rotation puede causar "giro largo" si los
 * dos kf están a más de 180° de diferencia — el usuario debería mantener
 * rotaciones pequeñas entre kf adyacentes si quiere el camino más corto.
 */
export function interpolateLayerTransform(
  layer: { transformKeyframes?: Layer["transformKeyframes"] },
  frame: number
): { offsetX: number; offsetY: number; scale: number; rotation: number } {
  const kfs = layer.transformKeyframes;
  if (!kfs || kfs.length === 0) {
    return { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
  }
  // Copia ordenada para no mutar el array original
  const sorted = [...kfs].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) {
    const k = sorted[0];
    return { offsetX: k.offsetX, offsetY: k.offsetY, scale: k.scale, rotation: k.rotation };
  }
  const last = sorted[sorted.length - 1];
  if (frame >= last.frame) {
    return { offsetX: last.offsetX, offsetY: last.offsetY, scale: last.scale, rotation: last.rotation };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const span = Math.max(1, b.frame - a.frame);
      const t = (frame - a.frame) / span;
      return {
        offsetX: a.offsetX + (b.offsetX - a.offsetX) * t,
        offsetY: a.offsetY + (b.offsetY - a.offsetY) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t,
      };
    }
  }
  // No debería llegar aquí, pero por seguridad
  const k = sorted[0];
  return { offsetX: k.offsetX, offsetY: k.offsetY, scale: k.scale, rotation: k.rotation };
}
