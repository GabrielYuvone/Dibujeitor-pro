// ============================================================================
// videoExport.ts — Exportación a video MP4 con ffmpeg.wasm
// ============================================================================
//
// Estrategia de carga de ffmpeg-core:
// 1. Intentar primero desde el CDN (unpkg). Es lo más rápido si hay internet.
// 2. Si el CDN falla, intentar desde `/ffmpeg/ffmpeg-core.{js,wasm}` servido
//    localmente (misma origen). Esto requiere que los archivos estén en
//    `public/ffmpeg/`. Si no están, se saltea al fallback.
// 3. Si todo falla, propagate el error. El caller (exportMp4) puede decidir
//    caer a WebM (que no necesita ffmpeg).
//
// IMPORTANTE: si la carga falla, `loadingPromise` se resetea a null en un
// `catch()` para que retries posteriores funcionen (antes se quedaba
// cacheado el rejection y todas las exportaciones siguientes fallaban
// hasta recargar la página).

"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { AnimationProject, ExportOptions } from "./types";
import { findCellAtFrame, totalFrames, interpolateLayerTransform } from "./utils";
import { getCachedImage, preloadImage } from "./useDrawingEngine";

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

const FFMPEG_CORE_VERSION = "0.12.6";
const FFMPEG_CORE_BASE_CDN = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;
// Misma origen — funciona en PCs sin internet o con firewall que bloquea
// unpkg. Requiere que existan public/ffmpeg/ffmpeg-core.js y .wasm.
const FFMPEG_CORE_BASE_LOCAL = `/ffmpeg`;

async function tryLoadFFmpegFromBase(base: string): Promise<FFmpeg> {
  const ff = new FFmpeg();
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return ff;
}

/** Verifica si un recurso HTTP existe (HEAD request, no descarga el body). */
async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    let ff: FFmpeg | null = null;
    // 1. CDN (unpkg) — la ruta principal
    try {
      ff = await tryLoadFFmpegFromBase(FFMPEG_CORE_BASE_CDN);
    } catch (cdnErr) {
      // 2. Local (same-origin /ffmpeg/) — solo si existe
      const localJsExists = await urlExists(`${FFMPEG_CORE_BASE_LOCAL}/ffmpeg-core.js`);
      if (localJsExists) {
        try {
          ff = await tryLoadFFmpegFromBase(FFMPEG_CORE_BASE_LOCAL);
        } catch (localErr) {
          // Continuar al throw final
        }
      }
      if (!ff) {
        // Reset loadingPromise para que retry posteriores no usen este
        // rejection cacheado.
        loadingPromise = null;
        throw new Error(
          `No se pudo cargar ffmpeg-core ni desde CDN ni desde /ffmpeg/ local. ` +
          `Detalle CDN: ${cdnErr instanceof Error ? cdnErr.message : String(cdnErr)}. ` +
          `Si estás offline o detrás de un firewall, descargá ffmpeg-core.js y ffmpeg-core.wasm ` +
          `(versión ${FFMPEG_CORE_VERSION}) y copialos a public/ffmpeg/. ` +
          `Alternativamente, exportá a WebM (no requiere ffmpeg).`
        );
      }
    }
    ffmpegInstance = ff;
    return ff;
  })();

  // Si la carga falla, resetear loadingPromise para permitir retries
  loadingPromise.catch(() => {
    if (!ffmpegInstance) loadingPromise = null;
  });

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
      const t = interpolateLayerTransform(layer, frame);
      const hasTransform =
        t.offsetX !== 0 || t.offsetY !== 0 || t.scale !== 1 || t.rotation !== 0;
      if (hasTransform) {
        // Pivot en el centro del frame de salida (width × height)
        ctx.save();
        ctx.translate(width / 2 + t.offsetX, height / 2 + t.offsetY);
        if (t.rotation !== 0) ctx.rotate((t.rotation * Math.PI) / 180);
        if (t.scale !== 1) ctx.scale(t.scale, t.scale);
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, -width / 2, -height / 2, width, height);
        ctx.restore();
      } else {
        // Reescalar al tamaño de salida
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, width, height);
      }
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
  // Cantidad de veces que se repite la animación en el export. 1 = una
  // sola vez (default). Si el usuario pidió 3 loops, renderizamos la
  // animación 3 veces seguidas en el video de salida.
  const loopCount = Math.max(1, options.loopCount ?? 1);
  const totalToRender = total * loopCount;
  console.log(`[MP4] Exportando ${total} frames × ${loopCount} loops = ${totalToRender} frames totales (${start}-${end-1}) a ${options.width}x${options.height} @ ${options.fps}fps`);

  // Safety check: si no hay frames para renderizar, tirar error claro
  // en vez de producir un video vacío.
  if (totalToRender <= 0) {
    throw new Error("No hay frames para exportar. Verificá que el proyecto tenga al menos un frame y que el rango de export sea válido.");
  }

  // PRE-EXPORT CLEANUP: eliminar frames viejos del FS virtual de ffmpeg
  // que pudieron quedar de exports anteriores. Si un export anterior
  // tuvo más frames que el actual, esos frames viejos se quedarían en
  // el FS y ffmpeg los leería junto con los nuevos, produciendo un video
  // con frames mezclados (ej: 10 nuevos + 20 viejos = 30 frames, donde
  // los últimos 20 son basura). Esto causa el bug "el video abre pero
  // vacío".
  try {
    // Brute-force: borrar frame_00000 a frame_00999 (suficiente para
    // la mayoría de los proyectos; si hay más, el loop de render los
    // sobrescribe igual).
    for (let i = 0; i < 1000; i++) {
      const fname = `frame_${i.toString().padStart(5, "0")}.png`;
      try {
        await ff.deleteFile(fname);
      } catch (_) {
        // El archivo no existe — está bien, seguir
      }
    }
    // También borrar output.mp4 viejo si existe
    try {
      await ff.deleteFile("output.mp4");
    } catch (_) {}
    // Y archivos de audio viejos
    try {
      await ff.deleteFile("audio.mp3");
    } catch (_) {}
    try {
      await ff.deleteFile("audio.wav");
    } catch (_) {}
  } catch (_) {}

  // 1. Renderizar frames a PNG y escribirlos en el FS virtual de ffmpeg.
  // El outer loop repite la animación loopCount veces; el frame dentro de
  // cada loop se calcula con % total.
  for (let i = 0; i < totalToRender; i++) {
    const frame = start + (i % total);
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
      onProgress?.(i / totalToRender, "rendering");
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

  // 6. Limpieza del FS virtual — borrar TODOS los frames que escribimos
  // (totalToRender, no total — si no, los del loopCount > 1 se quedan).
  try {
    for (let i = 0; i < totalToRender; i++) {
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
  // Repetir la animación loopCount veces en el WebM exportado.
  const loopCount = Math.max(1, options.loopCount ?? 1);
  const totalToRender = total * loopCount;
  const frameDuration = 1000 / options.fps;

  recorder.start();

  for (let i = 0; i < totalToRender; i++) {
    const frame = start + (i % total);
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
        const t = interpolateLayerTransform(layer, frame);
        const hasTransform =
          t.offsetX !== 0 || t.offsetY !== 0 || t.scale !== 1 || t.rotation !== 0;
        if (hasTransform) {
          const W = canvas.width;
          const H = canvas.height;
          ctx.save();
          ctx.translate(W / 2 + t.offsetX, H / 2 + t.offsetY);
          if (t.rotation !== 0) ctx.rotate((t.rotation * Math.PI) / 180);
          if (t.scale !== 1) ctx.scale(t.scale, t.scale);
          ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, -W / 2, -H / 2, W, H);
          ctx.restore();
        } else {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Forzar frame en el stream
    // @ts-ignore
    if (stream.getVideoTracks()[0].requestFrame) {
      // @ts-ignore
      stream.getVideoTracks()[0].requestFrame();
    }
    onProgress?.(i / totalToRender);
    await new Promise((r) => setTimeout(r, frameDuration));
  }

  recorder.stop();
  await new Promise((r) => recorder.onstop = () => r(null));
  return new Blob(chunks, { type: "video/webm" });
}
