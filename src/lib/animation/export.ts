// ============================================================================
// export.ts — Exportación de animación (PNG, JPEG, GIF, secuencias)
// ============================================================================

"use client";

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { AnimationProject, ExportOptions, ExportFormat } from "./types";
import { dataUrlToImageData, hexToRgb } from "./drawing";
import { findCellAtFrame, totalFrames } from "./utils";

// ---------------------------------------------------------------------------
// Renderiza un frame a ImageData compuesto (todas las capas visibles)
// ---------------------------------------------------------------------------

async function composeFrameToImageData(
  project: AnimationProject,
  frame: number,
  includeOnion: boolean
): Promise<ImageData> {
  const { width, height, bgColor } = project.settings;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // Fondo
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Para cada capa (de abajo hacia arriba), buscar la celda activa
  // Las capas en project.layers están ordenadas con la primera en la parte
  // inferior, por lo que iteramos en orden normal.
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    if (layer.type === "audio") continue;
    if (layer.locked && !includeOnion) continue;
    const cell = findCellAtFrame(layer.cells, frame, layer.loopRange);
    if (!cell || !cell.drawingId) continue;
    const drawing = project.drawings[cell.drawingId];
    if (!drawing) continue;

    try {
      const imgData = await dataUrlToImageData(drawing.dataUrl, width, height);
      // Aplicar opacidad
      const tmp = document.createElement("canvas");
      tmp.width = width;
      tmp.height = height;
      const tmpCtx = tmp.getContext("2d")!;
      tmpCtx.putImageData(imgData, 0, 0);
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(tmp, 0, 0);
      ctx.globalAlpha = 1;
    } catch (e) {
      console.error("Error componiendo capa:", e);
    }
  }

  return ctx.getImageData(0, 0, width, height);
}

// ---------------------------------------------------------------------------
// Exportar como secuencia PNG/JPEG (ZIP)
// ---------------------------------------------------------------------------

async function exportSequence(
  project: AnimationProject,
  options: ExportOptions,
  format: "png" | "jpeg",
  onProgress?: (p: number) => void
): Promise<Blob[]> {
  const frames: Blob[] = [];
  const start = Math.max(0, options.rangeStart);
  const end = Math.min(options.rangeEnd, totalFrames(project.layers));
  const total = end - start;
  let count = 0;

  for (let f = start; f < end; f++) {
    const imgData = await composeFrameToImageData(project, f, false);

    // Reescalar si es necesario
    let finalCanvas = document.createElement("canvas");
    finalCanvas.width = options.width;
    finalCanvas.height = options.height;
    const fctx = finalCanvas.getContext("2d")!;
    // Color de fondo
    fctx.fillStyle = options.backgroundColor;
    fctx.fillRect(0, 0, options.width, options.height);

    const tmp = document.createElement("canvas");
    tmp.width = imgData.width;
    tmp.height = imgData.height;
    tmp.getContext("2d")!.putImageData(imgData, 0, 0);
    fctx.drawImage(tmp, 0, 0, options.width, options.height);

    const mime = format === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve) =>
      finalCanvas.toBlob((b) => resolve(b!), mime, options.quality)
    );
    frames.push(blob);
    count++;
    onProgress?.(count / total);
    // Ceder el hilo para no congelar la UI
    await new Promise((r) => setTimeout(r, 0));
  }

  return frames;
}

// ---------------------------------------------------------------------------
// Exportar como GIF
// ---------------------------------------------------------------------------

async function exportGif(
  project: AnimationProject,
  options: ExportOptions,
  onProgress?: (p: number) => void
): Promise<Blob> {
  const gif = GIFEncoder();
  const start = Math.max(0, options.rangeStart);
  const end = Math.min(options.rangeEnd, totalFrames(project.layers));
  const total = end - start;
  let count = 0;
  const delayMs = Math.max(20, Math.round(1000 / options.fps));

  for (let f = start; f < end; f++) {
    const imgData = await composeFrameToImageData(project, f, false);

    // Reescalar
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = options.width;
    finalCanvas.height = options.height;
    const fctx = finalCanvas.getContext("2d", { willReadFrequently: true })!;
    fctx.fillStyle = options.backgroundColor;
    fctx.fillRect(0, 0, options.width, options.height);

    const tmp = document.createElement("canvas");
    tmp.width = imgData.width;
    tmp.height = imgData.height;
    tmp.getContext("2d")!.putImageData(imgData, 0, 0);
    fctx.drawImage(tmp, 0, 0, options.width, options.height);

    const finalData = fctx.getImageData(0, 0, options.width, options.height);
    // Cuantizar paleta
    const palette = quantize(finalData.data, 256);
    const indexed = applyPalette(finalData.data, palette);

    gif.writeFrame(indexed, options.width, options.height, {
      palette,
      delay: delayMs,
    });

    count++;
    onProgress?.(count / total);
    await new Promise((r) => setTimeout(r, 0));
  }

  gif.finish();
  const buffer = gif.bytes();
  return new Blob([buffer], { type: "image/gif" });
}

// ---------------------------------------------------------------------------
// Exportar un único frame (PNG o JPEG)
// ---------------------------------------------------------------------------

async function exportSingleFrame(
  project: AnimationProject,
  options: ExportOptions,
  format: "png" | "jpeg"
): Promise<Blob> {
  const f = options.rangeStart;
  const imgData = await composeFrameToImageData(project, f, false);
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = options.width;
  finalCanvas.height = options.height;
  const fctx = finalCanvas.getContext("2d")!;
  fctx.fillStyle = options.backgroundColor;
  fctx.fillRect(0, 0, options.width, options.height);

  const tmp = document.createElement("canvas");
  tmp.width = imgData.width;
  tmp.height = imgData.height;
  tmp.getContext("2d")!.putImageData(imgData, 0, 0);
  fctx.drawImage(tmp, 0, 0, options.width, options.height);

  const mime = format === "png" ? "image/png" : "image/jpeg";
  return new Promise<Blob>((resolve) =>
    finalCanvas.toBlob((b) => resolve(b!), mime, options.quality)
  );
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

export async function exportAnimation(
  project: AnimationProject,
  options: ExportOptions,
  onProgress?: (p: number) => void
): Promise<{ blob: Blob; filename: string }[]> {
  const results: { blob: Blob; filename: string }[] = [];
  const baseName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_");

  switch (options.format) {
    case "png": {
      const blob = await exportSingleFrame(project, options, "png");
      results.push({ blob, filename: `${baseName}_frame${options.rangeStart}.png` });
      break;
    }
    case "jpeg": {
      const blob = await exportSingleFrame(project, options, "jpeg");
      results.push({ blob, filename: `${baseName}_frame${options.rangeStart}.jpg` });
      break;
    }
    case "gif": {
      const blob = await exportGif(project, options, onProgress);
      results.push({ blob, filename: `${baseName}.gif` });
      break;
    }
    case "png_sequence": {
      const blobs = await exportSequence(project, options, "png", onProgress);
      blobs.forEach((blob, i) => {
        results.push({
          blob,
          filename: `${baseName}_frame${String(i).padStart(4, "0")}.png`,
        });
      });
      break;
    }
    case "jpeg_sequence": {
      const blobs = await exportSequence(project, options, "jpeg", onProgress);
      blobs.forEach((blob, i) => {
        results.push({
          blob,
          filename: `${baseName}_frame${String(i).padStart(4, "0")}.jpg`,
        });
      });
      break;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helper para descargar blobs
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
