"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { useStore, getCurrentLayer } from "@/lib/animation/store";
import { useDrawingEngine } from "@/lib/animation/useDrawingEngine";
import {
  dataUrlToImageData,
  withAlpha,
} from "@/lib/animation/drawing";
import { findCellAtFrame } from "@/lib/animation/utils";
import type { Drawing, Layer } from "@/lib/animation/types";

interface CanvasStageProps {
  width: number;
  height: number;
}

/**
 * Lienzo principal de dibujo.
 *
 * Compone varios elementos:
 *  - fondo (checkerboard o color del proyecto)
 *  - capas visibles con su drawing activo
 *  - capa de dibujo activa (editable, sobre la que se trabaja)
 *  - overlay (preview de primitivas)
 *
 * El dibujo se realiza sobre un canvas "drawingCanvas" que contiene
 * el bitmap del drawing actual. Al soltar el puntero se persiste al store.
 *
 * La vista (zoom, pan, rotación) se aplica con CSS transform al contenedor
 * de los canvases, manteniendo precisión sub-pixel.
 */
export function CanvasStage({ width, height }: CanvasStageProps) {
  const project = useStore((s) => s.project);
  const canvasView = useStore((s) => s.canvasView);
  const onion = useStore((s) => s.onion);
  const showGrid = useStore((s) => s.showGrid);
  const showSafeArea = useStore((s) => s.showSafeArea);
  const viewMode = useStore((s) => s.viewMode);
  const resetCanvasView = useStore((s) => s.resetCanvasView);

  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const backgroundRef = useRef<HTMLCanvasElement | null>(null);
  const displayRef = useRef<HTMLDivElement | null>(null);
  const lastLoadedDrawingRef = useRef<string | null>(null);

  const engine = useDrawingEngine({
    drawingCanvasRef,
    overlayCanvasRef,
    containerRef,
  });

  // Crear canvas de capas
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Ajustar el tamaño del canvas de dibujo según el proyecto
  useEffect(() => {
    const c = drawingCanvasRef.current;
    if (c && (c.width !== width || c.height !== height)) {
      c.width = width;
      c.height = height;
    }
    const o = overlayCanvasRef.current;
    if (o && (o.width !== width || o.height !== height)) {
      o.width = width;
      o.height = height;
    }
    const b = backgroundRef.current;
    if (b && (b.width !== width || b.height !== height)) {
      b.width = width;
      b.height = height;
      drawBackground();
    }
  }, [width, height]);

  // Pintar fondo del canvas de fondo (color del proyecto + guía)
  const drawBackground = useCallback(() => {
    const c = backgroundRef.current;
    if (!c || !project) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    // Fondo del proyecto
    ctx.fillStyle = project.settings.bgColor;
    ctx.fillRect(0, 0, c.width, c.height);
    // Checkerboard si el color de fondo es transparente
    if (project.settings.bgColor === "transparent" || project.settings.bgColor === "rgba(0,0,0,0)") {
      // pattern
      const size = 12;
      for (let y = 0; y < c.height; y += size) {
        for (let x = 0; x < c.width; x += size) {
          const checker = ((x / size + y / size) % 2 === 0);
          ctx.fillStyle = checker ? "#3a3a3a" : "#2a2a2a";
          ctx.fillRect(x, y, size, size);
        }
      }
    }
    // Safe area
    if (showSafeArea) {
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      // Acción segura (90% del área)
      const sx = c.width * 0.05;
      const sy = c.height * 0.05;
      ctx.strokeRect(sx, sy, c.width - sx * 2, c.height - sy * 2);
      // Título seguro (80%)
      const tx = c.width * 0.1;
      const ty = c.height * 0.1;
      ctx.strokeStyle = "#00ff00";
      ctx.strokeRect(tx, ty, c.width - tx * 2, c.height - ty * 2);
      ctx.setLineDash([]);
    }
    // Grid
    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      const step = 50;
      for (let x = step; x < c.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, c.height);
        ctx.stroke();
      }
      for (let y = step; y < c.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(c.width, y);
        ctx.stroke();
      }
      // Línea central
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(c.width / 2, 0);
      ctx.lineTo(c.width / 2, c.height);
      ctx.moveTo(0, c.height / 2);
      ctx.lineTo(c.width, c.height / 2);
      ctx.stroke();
    }
  }, [project, showSafeArea, showGrid]);

  useEffect(() => {
    drawBackground();
  }, [drawBackground]);

  // Redibujar capas visibles (no activa) cuando cambia el frame o el proyecto
  const renderVisibleLayers = useCallback(async () => {
    if (!project) return;
    const display = displayRef.current;
    if (!display) return;
    // Limpiar canvas anteriores (lazy)
    for (const [, canvas] of layerCanvasesRef.current) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Orden de capas (de abajo a arriba). En project.layers, la primera
    // capa está en el fondo.
    const currentLayer = getCurrentLayer(project);
    for (const layer of project.layers) {
      if (!layer.visible || layer.type === "audio") continue;
      if (layer.id === project.currentLayerId) continue; // se dibuja en el canvas activo
      if (layer.locked) continue; // las capas bloqueadas no se ven en edición
      const cell = findCellAtFrame(layer.cells, project.currentFrame);
      if (!cell || !cell.drawingId) continue;
      const drawing = project.drawings[cell.drawingId];
      if (!drawing) continue;

      // Obtener canvas existente o crear
      let canvas = layerCanvasesRef.current.get(layer.id);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = project.settings.width;
        canvas.height = project.settings.height;
        canvas.style.position = "absolute";
        canvas.style.left = "0";
        canvas.style.top = "0";
        canvas.style.pointerEvents = "none";
        layerCanvasesRef.current.set(layer.id, canvas);
        display.appendChild(canvas);
      }
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = layer.opacity;
      const img = new Image();
      img.src = drawing.dataUrl;
      await new Promise((r) => {
        img.onload = () => r(null);
        img.onerror = () => r(null);
      });
      ctx.drawImage(img, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Limpiar canvas no usados
    const usedIds = new Set(project.layers.map((l) => l.id));
    for (const [id, canvas] of layerCanvasesRef.current) {
      if (!usedIds.has(id)) {
        canvas.remove();
        layerCanvasesRef.current.delete(id);
      }
    }
  }, [project]);

  // Render onion skin: dibujar capas anteriores y posteriores
  const renderOnionSkin = useCallback(async () => {
    // Onion skin se implementa como un canvas overlay que se dibuja
    // antes del overlay normal. Para mantenerlo simple, lo haremos
    // parte del display normal.
    // Implementación simplificada: dibujar en el overlay de onion skin
    // (reutilizamos overlayCanvasRef con doble uso)
    if (!project) return;
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!onion.enabled || viewMode !== "edit") return;

    const currentLayer = getCurrentLayer(project);
    if (!currentLayer || currentLayer.type === "audio") return;

    // Función para dibujar onion de un frame
    const drawOnionFrame = async (frame: number, opacity: number, color: string, isNext: boolean) => {
      const cell = findCellAtFrame(currentLayer.cells, frame);
      if (!cell || !cell.drawingId) return;
      const drawing = project.drawings[cell.drawingId];
      if (!drawing) return;
      const img = new Image();
      img.src = drawing.dataUrl;
      await new Promise((r) => {
        img.onload = () => r(null);
        img.onerror = () => r(null);
      });
      // Tint: dibujamos la imagen con un tinte del color
      // Método: dibujar imagen normal, luego multiplicar con color
      ctx.save();
      ctx.globalAlpha = opacity;
      // Dibujar imagen normal
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(img, 0, 0);
      // Aplicar tinte con multiply
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, overlay.width, overlay.height);
      ctx.restore();
    };

    // Dibujar frames anteriores
    if (!onion.onlyPrevious) {
      for (let i = 1; i <= onion.prevFrames; i++) {
        const frame = project.currentFrame - i;
        if (frame < 0) break;
        const op = onion.prevOpacity * (1 - (i - 1) / onion.prevFrames);
        await drawOnionFrame(frame, op, onion.prevColor, false);
      }
    } else {
      // Solo el anterior
      const frame = project.currentFrame - 1;
      if (frame >= 0) {
        await drawOnionFrame(frame, onion.prevOpacity, onion.prevColor, false);
      }
    }

    // Dibujar frames siguientes (sólo si no es onlyPrevious)
    if (!onion.onlyPrevious) {
      for (let i = 1; i <= onion.nextFrames; i++) {
        const frame = project.currentFrame + i;
        const op = onion.nextOpacity * (1 - (i - 1) / onion.nextFrames);
        await drawOnionFrame(frame, op, onion.nextColor, true);
      }
    }
  }, [project, onion, viewMode]);

  // Al cambiar de frame, cargar el dibujo de la capa actual
  useEffect(() => {
    if (!project) return;
    if (viewMode === "preview") return; // en preview no se edita
    const layer = getCurrentLayer(project);
    if (!layer || layer.type === "audio") return;
    const cell = findCellAtFrame(layer.cells, project.currentFrame);
    const drawingId = cell?.drawingId ?? null;
    if (drawingId !== lastLoadedDrawingRef.current) {
      lastLoadedDrawingRef.current = drawingId;
      engine.loadDrawingIntoCanvas(drawingId);
    }
    // Render visible layers y onion skin
    renderVisibleLayers();
    renderOnionSkin();
  }, [
    project?.currentFrame,
    project?.currentLayerId,
    project?.drawings,
    project?.layers,
    viewMode,
    engine,
    renderVisibleLayers,
    renderOnionSkin,
  ]);

  useEffect(() => {
    renderOnionSkin();
  }, [onion, renderOnionSkin]);

  useEffect(() => {
    renderVisibleLayers();
  }, [renderVisibleLayers]);

  // Estilo del contenedor: aplicar transform
  const transform = `translate(-50%, -50%) translate(${canvasView.panX}px, ${canvasView.panY}px) scale(${canvasView.zoom}) rotate(${canvasView.rotation}deg)`;

  if (!project) return null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-neutral-950"
      style={{
        cursor:
          useStore.getState().currentTool === "pan"
            ? "grab"
            : useStore.getState().currentTool === "eyedropper"
              ? "copy"
              : "crosshair",
      }}
      onWheel={(e) => engine.handleWheel(e as unknown as WheelEvent)}
    >
      {/* Contenedor con transformación */}
      <div
        ref={displayRef}
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          transform,
          transformOrigin: "center center",
          width,
          height,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.2), 0 10px 30px rgba(0,0,0,0.5)",
        }}
        onPointerDown={engine.handlePointerDown}
        onPointerMove={engine.handlePointerMove}
        onPointerUp={engine.handlePointerUp}
        onPointerLeave={engine.handlePointerUp}
      >
        {/* Fondo */}
        <canvas
          ref={backgroundRef}
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
          style={{ width, height }}
        />

        {/* Canvas de capas (no activas) - inyectado dinámicamente */}

        {/* Canvas de dibujo activo */}
        <canvas
          ref={drawingCanvasRef}
          width={width}
          height={height}
          className="absolute inset-0 canvas-surface"
          style={{ width, height }}
        />

        {/* Overlay (onion skin + primitivas en preview) */}
        <canvas
          ref={overlayCanvasRef}
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
          style={{ width, height }}
        />

        {/* Botones interactivos (en preview) */}
        {viewMode === "preview" &&
          project.buttons.map((btn) =>
            btn.visible ? (
              <InteractiveButtonView key={btn.id} buttonId={btn.id} />
            ) : null
          )}
      </div>

      {/* Indicadores de zoom y botones flotantes */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-background/80 px-2 py-1 rounded text-xs backdrop-blur">
        <span>
          {Math.round(canvasView.zoom * 100)}%
        </span>
        <span className="text-muted-foreground">|</span>
        <span>{width}×{height}</span>
        <button
          className="ml-2 px-2 py-0.5 rounded bg-muted hover:bg-muted-foreground/20"
          onClick={resetCanvasView}
        >
          Reiniciar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Botón interactivo (vista de preview)
// ---------------------------------------------------------------------------

function InteractiveButtonView({ buttonId }: { buttonId: string }) {
  const button = useStore((s) =>
    s.project?.buttons.find((b) => b.id === buttonId)
  );
  const project = useStore((s) => s.project);

  if (!button || !project) return null;

  const handleClick = () => {
    // Ejecutar handlers con evento "click"
    const handlers = button.handlers.filter((h) => h.event === "click");
    handlers.forEach((h) => {
      // Verificar condición
      // Evaluar acciones
      const ctx = {
        project: project,
        setProjectState: () => {},
        gotoFrame: (frame: number) => useStore.getState().gotoFrame(frame),
        togglePlay: () => useStore.getState().togglePlay(),
        setPlaying: (p: boolean) => useStore.getState().setPlaying(p),
        gotoScene: () => {},
        setButtonVisible: (id: string, vis: boolean) =>
          useStore.getState().updateButton(id, { visible: vis }),
        playSound: (id: string) => {
          const clip = project.audioClips[id];
          if (clip) {
            const a = new Audio(clip.dataUrl);
            a.volume = clip.volume;
            a.play().catch(() => {});
          }
        },
        setVariable: (name: string, value: any) =>
          useStore.getState().setVariable(name, value),
        stop: () => {},
      };
      import("@/lib/animation/actions").then(({ executeActions, evalCondition }) => {
        if (!evalCondition(h.condition, project.variables)) return;
        executeActions(h.actions, ctx);
      });
    });
  };

  return (
    <button
      className="absolute rounded-md text-white font-medium shadow-lg border border-black/20 hover:brightness-110 active:scale-95 transition-transform z-40"
      style={{
        left: button.x,
        top: button.y,
        width: button.width,
        height: button.height,
        backgroundColor: button.color,
        pointerEvents: "auto",
      }}
      onClick={handleClick}
      onMouseDown={() => {
        // press event
      }}
      onMouseUp={() => {
        // release event
      }}
      onMouseEnter={() => {
        // mouseenter event
      }}
      onMouseLeave={() => {
        // mouseleave event
      }}
    >
      {button.label}
    </button>
  );
}
