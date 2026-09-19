// ============================================================================
// useDrawingEngine.ts — Hook que orquesta el motor de dibujo del lienzo
// ============================================================================

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useStore } from "./store";
import {
  configureEraser,
  configureStroke,
  createSmoother,
  floodFill,
  hexToRgb,
  screenToCanvas,
  strokeEllipse,
  strokeRectangle,
  strokeLine,
  type StrokeSmoother,
  dataUrlToImageData,
  imageDataToDataUrl,
  generateThumbnail,
} from "./drawing";
import type { ToolId } from "./types";
import { genId } from "./utils";

// ---------------------------------------------------------------------------
// Hook de motor de dibujo
// ---------------------------------------------------------------------------

interface DrawingEngineState {
  drawingCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useDrawingEngine({
  drawingCanvasRef,
  overlayCanvasRef,
  containerRef,
}: DrawingEngineState) {
  const project = useStore((s) => s.project);
  const brush = useStore((s) => s.brush);
  const currentTool = useStore((s) => s.currentTool);
  const canvasView = useStore((s) => s.canvasView);
  const ensureDrawing = useStore((s) => s.ensureDrawingForCell);
  const updateDrawing = useStore((s) => s.updateDrawing);
  const setTool = useStore((s) => s.setTool);

  // Estado de dibujo actual (no React, refs para no rerenderizar)
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const smootherRef = useRef<StrokeSmoother>(createSmoother(brush.smoothing));
  const savedImageRef = useRef<ImageData | null>(null);
  const pressureRef = useRef<number>(1);
  const drawingIdRef = useRef<string | null>(null);
  const lastDrawCommitRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Cargar el dibujo actual al lienzo
  // ---------------------------------------------------------------------------

  const loadDrawingIntoCanvas = useCallback(
    async (drawingId: string | null) => {
      const canvas = drawingCanvasRef.current;
      if (!canvas || !project) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!drawingId) {
        drawingIdRef.current = null;
        return;
      }

      const drawing = project.drawings[drawingId];
      if (!drawing) {
        drawingIdRef.current = null;
        return;
      }

      drawingIdRef.current = drawingId;
      try {
        const imgData = await dataUrlToImageData(
          drawing.dataUrl,
          canvas.width,
          canvas.height
        );
        ctx.putImageData(imgData, 0, 0);
      } catch (e) {
        console.error("Error cargando dibujo:", e);
      }
    },
    [project, drawingCanvasRef]
  );

  // ---------------------------------------------------------------------------
  // Guardar el dibujo actual al store
  // ---------------------------------------------------------------------------

  const commitDrawing = useCallback(async () => {
    const canvas = drawingCanvasRef.current;
    const drawingId = drawingIdRef.current;
    if (!canvas || !drawingId || !project) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dataUrl = canvas.toDataURL("image/png");
    await updateDrawing(drawingId, dataUrl);
    lastDrawCommitRef.current = Date.now();
  }, [drawingCanvasRef, project, updateDrawing]);

  // ---------------------------------------------------------------------------
  // Reset del smoother cuando cambia el smoothing
  // ---------------------------------------------------------------------------

  useEffect(() => {
    smootherRef.current = createSmoother(brush.smoothing);
  }, [brush.smoothing]);

  // ---------------------------------------------------------------------------
  // Pointer events: dibujar
  // ---------------------------------------------------------------------------

  const getCanvasPoint = useCallback(
    (e: PointerEvent | React.PointerEvent | WheelEvent) => {
      const canvas = drawingCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || !project) return null;
      const rect = container.getBoundingClientRect();
      return screenToCanvas(
        e.clientX,
        e.clientY,
        rect,
        canvasView,
        project.settings.width,
        project.settings.height
      );
    },
    [drawingCanvasRef, containerRef, canvasView, project]
  );

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (!project) return;
      const layer = project.layers.find((l) => l.id === project.currentLayerId);
      if (!layer || layer.locked || !layer.visible || layer.type === "audio") return;

      const tool = currentTool;

      // Pan y zoom son modos de navegación, no dibujan
      if (tool === "pan") {
        isDrawingRef.current = true;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (tool === "eyedropper") {
        const pt = getCanvasPoint(e);
        if (!pt) return;
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const x = Math.floor(pt.x);
        const y = Math.floor(pt.y);
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
        const data = ctx.getImageData(x, y, 1, 1).data;
        const hex = `#${[data[0], data[1], data[2]]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")}`;
        useStore.getState().setBrush({ color: hex });
        setTool("pencil");
        return;
      }

      // Para herramientas de dibujo necesitamos un drawing activo
      const cell = layer.cells.find(
        (c) =>
          project.currentFrame >= c.startFrame &&
          project.currentFrame < c.startFrame + c.duration
      );

      let drawingId = cell?.drawingId ?? null;
      if (!drawingId && (tool === "pencil" || tool === "brush" || tool === "eraser" || tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "fill")) {
        try {
          drawingId = await ensureDrawing(layer.id, project.currentFrame);
        } catch (err) {
          console.error("No se pudo crear drawing:", err);
          return;
        }
      }
      if (!drawingId) return;
      await loadDrawingIntoCanvas(drawingId);

      const pt = getCanvasPoint(e);
      if (!pt) return;

      isDrawingRef.current = true;
      startPosRef.current = pt;
      lastPosRef.current = pt;
      smootherRef.current = createSmoother(brush.smoothing);
      pressureRef.current = e.pressure && e.pressure > 0 ? e.pressure : 1;

      const canvas = drawingCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Para primitivas (línea, rect, elipse) guardamos el estado actual
      if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
        savedImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      // Para el bote de tinta, ejecutar inmediatamente
      if (tool === "fill") {
        const color = hexToRgb(brush.color);
        color.a = Math.round(brush.opacity * 255);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        floodFill(imgData, pt.x, pt.y, color);
        ctx.putImageData(imgData, 0, 0);
        isDrawingRef.current = false;
        await commitDrawing();
        return;
      }

      // Para trazo: configurar contexto
      const overlayCtx = overlay?.getContext("2d") ?? null;
      if (tool === "pencil" || tool === "brush") {
        configureStroke(ctx, brush, pressureRef.current);
        // Punto inicial
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.5, ctx.lineWidth / 2), 0, Math.PI * 2);
        ctx.fillStyle = brush.color;
        ctx.fill();
      } else if (tool === "eraser") {
        configureEraser(ctx, brush, pressureRef.current);
      }

      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [
      project,
      currentTool,
      brush,
      canvasView,
      ensureDrawing,
      loadDrawingIntoCanvas,
      commitDrawing,
      getCanvasPoint,
      drawingCanvasRef,
      overlayCanvasRef,
      containerRef,
      setTool,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!project) return;
      const layer = project.layers.find((l) => l.id === project.currentLayerId);
      if (!layer || layer.locked || !layer.visible) return;

      const tool = currentTool;

      // Pan
      if (tool === "pan" && isDrawingRef.current && startPosRef.current) {
        const dx = e.clientX - startPosRef.current.x;
        const dy = e.clientY - startPosRef.current.y;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        useStore.getState().setCanvasView({
          panX: canvasView.panX + dx,
          panY: canvasView.panY + dy,
        });
        return;
      }

      if (!isDrawingRef.current) return;

      const pt = getCanvasPoint(e);
      if (!pt || !lastPosRef.current || !startPosRef.current) return;

      const canvas = drawingCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      pressureRef.current = e.pressure && e.pressure > 0 ? e.pressure : 1;

      if (tool === "pencil" || tool === "brush" || tool === "eraser") {
        if (tool === "pencil" || tool === "brush") {
          configureStroke(ctx, brush, pressureRef.current);
        } else {
          configureEraser(ctx, brush, pressureRef.current);
        }
        const smoothed = smoothPoint(smootherRef.current, pt.x, pt.y);
        // Continuamos el trazo desde lastPosRef
        ctx.beginPath();
        if (lastPosRef.current) {
          ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        }
        ctx.lineTo(smoothed.x, smoothed.y);
        ctx.stroke();
        lastPosRef.current = smoothed;
      } else if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
        // Restaurar estado guardado y dibujar primitiva en overlay
        if (savedImageRef.current) {
          ctx.putImageData(savedImageRef.current, 0, 0);
        }
        configureStroke(ctx, brush, pressureRef.current);
        if (tool === "line") {
          strokeLine(ctx, startPosRef.current.x, startPosRef.current.y, pt.x, pt.y);
        } else if (tool === "rectangle") {
          strokeRectangle(ctx, startPosRef.current.x, startPosRef.current.y, pt.x, pt.y);
        } else if (tool === "ellipse") {
          strokeEllipse(ctx, startPosRef.current.x, startPosRef.current.y, pt.x, pt.y);
        }
      }
    },
    [
      project,
      currentTool,
      brush,
      canvasView,
      getCanvasPoint,
      drawingCanvasRef,
      overlayCanvasRef,
    ]
  );

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent) => {
      if (!project) return;

      if (currentTool === "pan") {
        isDrawingRef.current = false;
        startPosRef.current = null;
        return;
      }

      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      startPosRef.current = null;
      lastPosRef.current = null;
      savedImageRef.current = null;

      await commitDrawing();
    },
    [project, currentTool, commitDrawing]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!project) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(0.05, Math.min(20, canvasView.zoom * (1 + delta * 2)));
      useStore.getState().setCanvasView({ zoom: newZoom });
    },
    [project, canvasView]
  );

  // Throttle de guardado durante dibujo (cada 1s mientras se dibuja)
  // (commitDrawing se llama al soltar el puntero, pero para trazos largos
  // conviene hacer commit periódico)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDrawingRef.current && Date.now() - lastDrawCommitRef.current > 1000) {
        commitDrawing();
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [commitDrawing]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    loadDrawingIntoCanvas,
    commitDrawing,
  };
}

// ---------------------------------------------------------------------------
// Hook de reproducción (motor de animación)
// ---------------------------------------------------------------------------

export function usePlaybackEngine() {
  const project = useStore((s) => s.project);
  const playback = useStore((s) => s.playback);
  const setPlaying = useStore((s) => s.setPlaying);
  const gotoFrame = useStore((s) => s.gotoFrame);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const frameAccumRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioStartedAtRef = useRef<number>(0);

  // Loop de reproducción
  useEffect(() => {
    if (!project || !playback.playing) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // detener audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    const fps = project.settings.fps;
    const speed = playback.speed;
    const total = Math.max(
      1,
      totalFramesOfProject(project),
      ...(playback.rangeEnd ? [playback.rangeEnd] : [])
    );
    const rangeStart = playback.rangeStart ?? 0;
    const rangeEnd = playback.rangeEnd ?? Math.max(1, totalFramesOfProject(project));

    lastTimeRef.current = performance.now();
    frameAccumRef.current = 0;

    const loop = (time: number) => {
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;
      const framesPerMs = (fps * speed) / 1000;
      frameAccumRef.current += dt * framesPerMs;

      while (frameAccumRef.current >= 1) {
        frameAccumRef.current -= 1;
        const next = project.currentFrame + 1;

        if (next >= rangeEnd) {
          if (playback.looping) {
            gotoFrame(rangeStart);
            // Reiniciar audio si existe
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
            }
          } else {
            setPlaying(false);
            gotoFrame(rangeEnd - 1);
            return;
          }
        } else {
          gotoFrame(next);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [project, playback, setPlaying, gotoFrame]);

  // Reproducir audio en el frame actual cuando playing
  useEffect(() => {
    if (!project || !playback.playing) return;
    const fps = project.settings.fps;
    const currentFrame = project.currentFrame;
    // Buscar audio clip que contenga el frame actual
    for (const clip of Object.values(project.audioClips)) {
      const start = clip.startFrame;
      const end = start + Math.floor(clip.duration * fps);
      if (currentFrame >= start && currentFrame <= end && !clip.muted) {
        // Si ya está reproduciendo, no reiniciar
        if (audioRef.current && audioRef.current.dataset.id === clip.id) {
          // sincronizar
          const expectedTime = (currentFrame - start) / fps;
          if (Math.abs(audioRef.current.currentTime - expectedTime) > 0.2) {
            audioRef.current.currentTime = expectedTime;
          }
          if (audioRef.current.paused) audioRef.current.play().catch(() => {});
          return;
        }
        // Crear nuevo elemento
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(clip.dataUrl);
        audio.volume = clip.volume;
        audio.dataset.id = clip.id;
        audio.currentTime = (currentFrame - start) / fps;
        audio.play().catch(() => {});
        audioRef.current = audio;
        return;
      }
    }
    // No hay clip para este frame, pausar
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [project, playback.playing]);
}

function totalFramesOfProject(project: { layers: { cells: { startFrame: number; duration: number }[] }[] }): number {
  let max = 1;
  for (const layer of project.layers) {
    for (const cell of layer.cells) {
      const end = cell.startFrame + cell.duration;
      if (end > max) max = end;
    }
  }
  return max;
}
