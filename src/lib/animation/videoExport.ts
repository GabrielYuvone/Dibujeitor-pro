// ============================================================================
// videoExport.ts — Exportación a video MP4 con ffmpeg.wasm
// ============================================================================

"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { AnimationProject, ExportOptions } from "./types";
import { findCellAtFrame, totalFrames } from "./utils";
import { getCachedImage, preloadImage } from "./useDrawingEngine";

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

const FFMPEG_CORE_VERSION = "0.12.6";
const FFMPEG_CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ff;
    return ff;
  })();

  return loadingPromise;
}

// ---------------------------------------------------------------------------
// Renderizar un frame a un canvas offscreen y devolver un Blob PNG
// ---------------------------------------------------------------------------

async function renderFrameToBlob(
  project: AnimationProject,
  frame: number,
  width: number,
  height: number,
  bgColor: string
): Promise<Blob> {
  // Asegurar que todas las imágenes estén cacheadas
  for (const layer of project.layers) {
    if (layer.type === "audio") continue;
    const cell = findCellAtFrame(layer.cells, frame, layer.loopRange);
    if (cell?.drawingId) {
      const d = project.drawings[cell.drawingId];
      if (d) await preloadImage(cell.drawingId, d.dataUrl);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Fondo
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Componer capas
  for (const layer of project.layers) {
    if (!layer.visible || layer.type === "audio") continue;
    const cell = findCellAtFrame(layer.cells, frame, layer.loopRange);
    if (!cell || !cell.drawingId) continue;
    const img = getCachedImage(cell.drawingId);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.globalAlpha = layer.opacity;
      // Reescalar al tamaño de salida
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, width, height);
    }
  }
  ctx.globalAlpha = 1;

  // Botones
  for (const btn of project.buttons) {
    if (!btn.visible) continue;
    ctx.fillStyle = btn.color;
    ctx.fillRect(btn.x, btn.y, btn.width, btn.height);
    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + btn.height / 2);
  }

  return new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png")
  );
}

// ---------------------------------------------------------------------------
// Exportar a MP4 usando ffmpeg.wasm
// ---------------------------------------------------------------------------

export async function exportMp4(
  project: AnimationProject,
  options: ExportOptions,
  onProgress?: (p: number, stage: "rendering" | "encoding") => void
): Promise<Blob> {
  console.log("[MP4] Iniciando exportación, crossOriginIsolated:", self.crossOriginIsolated);
  let ff: FFmpeg;
  try {
    ff = await getFFmpeg();
    console.log("[MP4] ffmpeg cargado OK");
  } catch (e) {
    console.error("[MP4] Error cargando ffmpeg:", e);
    throw new Error(`No se pudo cargar ffmpeg-core. Verificá la conexión a internet. Detalle: ${(e as Error).message}`);
  }

  const start = Math.max(0, options.rangeStart);
  const end = Math.min(options.rangeEnd, totalFrames(project.layers));
  const total = end - start;
  console.log(`[MP4] Exportando ${total} frames (${start}-${end-1}) a ${options.width}x${options.height} @ ${options.fps}fps`);

  // 1. Renderizar frames a PNG y escribirlos en el FS virtual de ffmpeg
  for (let i = 0; i < total; i++) {
    const frame = start + i;
    try {
      const blob = await renderFrameToBlob(
        project,
        frame,
        options.width,
        options.height,
        options.backgroundColor
      );
      const fname = `frame_${i.toString().padStart(5, "0")}.png`;
      const data = await fetchFile(blob);
      await ff.writeFile(fname, data);
      onProgress?.(i / total, "rendering");
      // Ceder al hilo para no congelar la UI
      await new Promise((r) => setTimeout(r, 0));
    } catch (e) {
      console.error(`[MP4] Error en frame ${i}:`, e);
      throw new Error(`Error renderizando frame ${i}: ${(e as Error).message}`);
    }
  }
  console.log("[MP4] Frames renderizados, llamando a ffmpeg.exec()");

  // 2. Si hay audio, escribir el WAV/MP3
  let audioName: string | null = null;
  let audioStartOffset = 0;
  if (options.includeAudio) {
    const clips = Object.values(project.audioClips).filter((c) => !c.muted);
    if (clips.length > 0) {
      const clip = clips[0];
      const ext = clip.dataUrl.startsWith("data:audio/mpeg") || clip.dataUrl.startsWith("data:audio/mp3")
        ? "mp3"
        : "wav";
      audioName = `audio.${ext}`;
      const blob = await fetchFile(clip.dataUrl);
      await ff.writeFile(audioName, blob);
      audioStartOffset = clip.startFrame / options.fps;
    }
  }

  // 3. Progreso de ffmpeg
  ff.on("progress", ({ progress }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)), "encoding");
  });

  // 4. Ejecutar ffmpeg
  const outName = "output.mp4";
  const args: string[] = [
    "-framerate", String(options.fps),
    "-i", "frame_%05d.png",
  ];
  if (audioName) {
    args.push("-i", audioName);
  }
  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "23",
  );
  if (audioName) {
    args.push("-c:a", "aac", "-b:a", "128k");
    // Sincronizar audio: si empieza más tarde, retrasar con -itsoffset
    if (audioStartOffset > 0) {
      args.push("-itsoffset", audioStartOffset.toFixed(3));
    }
  }
  args.push(outName);

  try {
    console.log("[MP4] Ejecutando ffmpeg con args:", args.join(" "));
    await ff.exec(args);
    console.log("[MP4] ffmpeg.exec() completado OK");
  } catch (e) {
    console.error("[MP4] Error en ffmpeg.exec():", e);
    throw new Error(`Error en ffmpeg: ${(e as Error).message}`);
  }

  // 5. Leer resultado
  let data: Uint8Array<ArrayBuffer>;
  try {
    data = await ff.readFile(outName);
    console.log("[MP4] Archivo leído OK, tamaño:", data.length);
  } catch (e) {
    console.error("[MP4] Error leyendo output:", e);
    // Listar archivos del FS para debug
    try {
      const files = await ff.listDir("/");
      console.log("[MP4] Archivos en /:", files.map((f) => f.name).join(", "));
    } catch (_) {}
    throw new Error(`No se pudo leer el MP4 generado: ${(e as Error).message}`);
  }
  const blob = new Blob([data as BlobPart], { type: "video/mp4" });

  // 6. Limpieza del FS virtual
  try {
    for (let i = 0; i < total; i++) {
      const fname = `frame_${i.toString().padStart(5, "0")}.png`;
      await ff.deleteFile(fname);
    }
    if (audioName) await ff.deleteFile(audioName);
    await ff.deleteFile(outName);
  } catch (_) {}

  return blob;
}

// ---------------------------------------------------------------------------
// Exportar a WebM usando MediaRecorder (más rápido, sin ffmpeg)
// ---------------------------------------------------------------------------

export async function exportWebM(
  project: AnimationProject,
  options: ExportOptions,
  onProgress?: (p: number) => void
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d")!;

  const stream = canvas.captureStream(0); // 0 = manual frames
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const start = Math.max(0, options.rangeStart);
  const end = Math.min(options.rangeEnd, totalFrames(project.layers));
  const total = end - start;
  const frameDuration = 1000 / options.fps;

  recorder.start();

  for (let i = 0; i < total; i++) {
    const frame = start + i;
    // Render frame
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const layer of project.layers) {
      if (!layer.visible || layer.type === "audio") continue;
      const cell = findCellAtFrame(layer.cells, frame, layer.loopRange);
      if (!cell || !cell.drawingId) continue;
      const img = getCachedImage(cell.drawingId);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
    }
    ctx.globalAlpha = 1;

    // Forzar frame en el stream
    // @ts-ignore
    if (stream.getVideoTracks()[0].requestFrame) {
      // @ts-ignore
      stream.getVideoTracks()[0].requestFrame();
    }
    onProgress?.(i / total);
    await new Promise((r) => setTimeout(r, frameDuration));
  }

  recorder.stop();
  await new Promise((r) => recorder.onstop = () => r(null));
  return new Blob(chunks, { type: "video/webm" });
}
