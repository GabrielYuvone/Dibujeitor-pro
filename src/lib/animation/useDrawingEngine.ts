// ============================================================================
// useDrawingEngine.ts — Motor de dibujo y reproducción
// ============================================================================
// REFACTORIZADO: usa window listeners (no React pointer events) para
// evitar el bug de "solo el primer punto" causado por awaits async en
// handlePointerDown. También pre-cacha imágenes para render síncrono y
// eliminar el parpadeo durante el playback.

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useStore } from "./store";
import {
  configureEraser,
  configurePencil,
  configureStroke,
  createSmoother,
  drawInkDab,
  drawInkSegment,
  drawPencilDab,
  drawWatercolorDab,
  drawWatercolorSegment,
  floodFill,
  hexToRgb,
  screenToCanvas,
  smoothPoint,
  strokeEllipse,
  strokeRectangle,
  strokeLine,
  type StrokeSmoother,
  dataUrlToImageData,
} from "./drawing";
import type { ToolId } from "./types";
import { genId, totalFrames } from "./utils";

interface DrawingEngineState {
  drawingCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// Cache global de imágenes: drawingId → Image (cargada)
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>();

/** Obtiene una Image ya cargada (o null si no está cargada). */
export function getCachedImage(drawingId: string): HTMLImageElement | null {
  return imageCache.get(drawingId) ?? null;
}

/** Carga (o recarga) una Image en la cache. */
export function preloadImage(drawingId: string, dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const existing = imageCache.get(drawingId);
    if (existing && existing.dataset.dataUrl === dataUrl) {
      resolve(existing);
      return;
    }
    const img = new Image();
    img.dataset.dataUrl = dataUrl;
    img.onload = () => {
      imageCache.set(drawingId, img);
      resolve(img);
    };
    img.onerror = () => {
      // Aún así guardamos para no reintentar infinitamente
      imageCache.set(drawingId, img);
      resolve(img);
    };
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

export function useDrawingEngine({
  drawingCanvasRef,
  overlayCanvasRef,
  containerRef,
}: DrawingEngineState) {
  // Suscripciones selectivas para que los callbacks no se recreen demasiado
  const project = useStore((s) => s.project);
  const brush = useStore((s) => s.brush);
  const currentTool = useStore((s) => s.currentTool);
  const canvasView = useStore((s) => s.canvasView);
  const ensureDrawing = useStore((s) => s.ensureDrawingForCell);
  const updateDrawing = useStore((s) => s.updateDrawing);
  const setTool = useStore((s) => s.setTool);
  const gotoFrame = useStore((s) => s.gotoFrame);
  const nextFrame = useStore((s) => s.nextFrame);
  const prevFrame = useStore((s) => s.prevFrame);
  const setPlaying = useStore((s) => s.setPlaying);
  const setCanvasView = useStore((s) => s.setCanvasView);
  const updateButton = useStore((s) => s.updateButton);
  const setVariable = useStore((s) => s.setVariable);

  // Refs de estado de dibujo (no provocan re-render)
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const smootherRef = useRef<StrokeSmoother>(createSmoother(0.35));
  const savedImageRef = useRef<ImageData | null>(null);
  const pressureRef = useRef<number>(1);
  const drawingIdRef = useRef<string | null>(null);
  const lastDrawCommitRef = useRef<number>(0);
  const activeToolRef = useRef<ToolId>(currentTool);
  const activeBrushRef = useRef(brush);
  const activeCanvasViewRef = useRef(canvasView);
  const activeProjectRef = useRef(project);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  // Zoom por arrastre (modificador Z)
  const isZoomingRef = useRef(false);
  const zoomStartRef = useRef<{ y: number; zoom: number } | null>(null);
  // Modificador Z: mientras se mantiene Z apretado, el wheel y el drag
  // hacen zoom (arrastra hacia arriba = acerca, hacia abajo = aleja).
  const zModifierRef = useRef(false);
  // Modificador X: mientras se mantiene X apretado, el trazo se convierte en
  // goma (eraser) temporalmente. Es un acceso rápido para corregir.
  const xModifierRef = useRef(false);
  // Modificador C: mientras se mantiene C apretado, entra en modo pan.
  const cModifierRef = useRef(false);
  // Modificador Ctrl: mientras se mantiene Ctrl apretado + drag, entra en
  // modo "resize brush" (cambiar tamaño del pincel arrastrando arriba/abajo).
  const ctrlModifierRef = useRef(false);
  const isResizingBrushRef = useRef(false);
  const brushResizeStartRef = useRef<{ y: number; size: number } | null>(null);
  // Refs para selección (definidos al inicio del hook)
  const selectionBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const selectionImageRef = useRef<ImageData | null>(null);

  // Listener para los modificadores X (eraser), C (pan), Ctrl (brush resize) y Z (zoom)
  useEffect(() => {
    const isInput = (el: EventTarget | null) => {
      if (!el) return false;
      const t = el as HTMLElement;
      return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
    };
    const onDown = (e: KeyboardEvent) => {
      if (isInput(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        zModifierRef.current = true;
        useStore.setState({ zModifier: true });
      } else if (k === "x") {
        xModifierRef.current = true;
        useStore.setState({ xModifier: true });
      } else if (k === "c") {
        cModifierRef.current = true;
      } else if (k === "control") {
        ctrlModifierRef.current = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "z") {
        zModifierRef.current = false;
        useStore.setState({ zModifier: false });
        // Si estábamos paneando o zoomeando con Z, soltar
        if (isPanningRef.current) {
          isPanningRef.current = false;
          panStartRef.current = null;
        }
        if (isZoomingRef.current) {
          isZoomingRef.current = false;
          zoomStartRef.current = null;
        }
      } else if (k === "x") {
        xModifierRef.current = false;
        useStore.setState({ xModifier: false });
      } else if (k === "c") {
        cModifierRef.current = false;
        if (isPanningRef.current) {
          isPanningRef.current = false;
          panStartRef.current = null;
        }
      } else if (k === "control") {
        ctrlModifierRef.current = false;
        if (isResizingBrushRef.current) {
          isResizingBrushRef.current = false;
          brushResizeStartRef.current = null;
        }
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", () => {
      // Si la ventana pierde foco, resetear todos los modificadores
      zModifierRef.current = false;
      xModifierRef.current = false;
      cModifierRef.current = false;
      ctrlModifierRef.current = false;
      useStore.setState({ zModifier: false, xModifier: false });
    });
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Mantener refs sincronizadas con el estado más reciente
  useEffect(() => {
    activeToolRef.current = currentTool;
  }, [currentTool]);
  useEffect(() => {
    activeBrushRef.current = brush;
    smootherRef.current = createSmoother(brush.smoothing);
  }, [brush]);
  useEffect(() => {
    activeCanvasViewRef.current = canvasView;
  }, [canvasView]);
  useEffect(() => {
    activeProjectRef.current = project;
    // Pre-cachear imágenes de todos los drawings
    if (project) {
      for (const [id, d] of Object.entries(project.drawings)) {
        preloadImage(id, d.dataUrl);
      }
    }
  }, [project]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = containerRef.current;
      const proj = activeProjectRef.current;
      if (!container || !proj) return null;
      const rect = container.getBoundingClientRect();
      return screenToCanvas(
        clientX,
        clientY,
        rect,
        activeCanvasViewRef.current,
        proj.settings.width,
        proj.settings.height
      );
    },
    [containerRef]
  );

  const loadDrawingIntoCanvas = useCallback(
    async (drawingId: string | null) => {
      const canvas = drawingCanvasRef.current;
      const proj = activeProjectRef.current;
      if (!canvas || !proj) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Limpiar SIEMPRE antes de cargar
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (!drawingId) {
        drawingIdRef.current = null;
        return;
      }

      const drawing = proj.drawings[drawingId];
      if (!drawing) {
        drawingIdRef.current = null;
        return;
      }

      drawingIdRef.current = drawingId;

      // Intentar usar la imagen cacheada (síncrono) — pero SOLO si
      // coincide con el dataUrl actual (caso undo/redo: el cache puede
      // tener la versión previa que NO es la que queremos dibujar)
      const cached = getCachedImage(drawingId);
      if (
        cached &&
        cached.complete &&
        cached.naturalWidth > 0 &&
        cached.dataset.dataUrl === drawing.dataUrl
      ) {
        ctx.drawImage(cached, 0, 0, canvas.width, canvas.height);
        return;
      }

      // Fallback async (y cachear para la próxima)
      try {
        await preloadImage(drawingId, drawing.dataUrl);
        const img = getCachedImage(drawingId);
        if (img && img.complete) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      } catch (e) {
        console.error("Error cargando dibujo:", e);
      }
    },
    [drawingCanvasRef]
  );

  const commitDrawing = useCallback(async () => {
    const canvas = drawingCanvasRef.current;
    const drawingId = drawingIdRef.current;
    if (!canvas || !drawingId) return;

    // Capturar el dataUrl ANTERIOR para el stack de undo
    const proj = activeProjectRef.current;
    const prevDrawing = proj?.drawings[drawingId];
    const prevDataUrl = prevDrawing?.dataUrl ?? "";

    const dataUrl = canvas.toDataURL("image/png");
    // Pre-cachear la nueva versión
    await preloadImage(drawingId, dataUrl);
    await updateDrawing(drawingId, dataUrl);

    // Registrar en el stack de undo (solo si cambió)
    if (prevDataUrl !== dataUrl) {
      useStore.getState().pushHistory(drawingId, prevDataUrl, dataUrl);
    }

    lastDrawCommitRef.current = Date.now();
  }, [drawingCanvasRef, updateDrawing]);

  // ---------------------------------------------------------------------------
  // Punto de entrada del pointer down (síncrono lo máximo posible)
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      const proj = activeProjectRef.current;
      if (!proj) return;
      const layer = proj.layers.find((l) => l.id === proj.currentLayerId);
      if (!layer || layer.locked || !layer.visible || layer.type === "audio") return;

      // El tool efectivo depende del modificador X (goma temporal).
      // Si X está apretado, cualquier herramienta de trazo se convierte en goma.
      const baseTool = activeToolRef.current;
      const tool: ToolId = xModifierRef.current ? "eraser" : baseTool;

      // --- MODIFICADOR Z: si Z está apretado, entrar en modo zoom por arrastre ---
      // Arrastra hacia ARRIBA (dy<0) para acercar; hacia ABAJO (dy>0) para alejar.
      // Mientras tanto, la rueda del mouse sigue funcionando para zoom.
      if (zModifierRef.current) {
        isPanningRef.current = false;
        isZoomingRef.current = true;
        isDrawingRef.current = false;
        useStore.setState({ isDrawing: false });
        zoomStartRef.current = {
          y: e.clientY,
          zoom: activeCanvasViewRef.current.zoom,
        };
        return;
      }

      // --- MODIFICADOR C: si C está apretado, entrar en modo pan ---
      if (cModifierRef.current) {
        isPanningRef.current = true;
        isDrawingRef.current = false;
        useStore.setState({ isDrawing: false });
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: activeCanvasViewRef.current.panX,
          panY: activeCanvasViewRef.current.panY,
        };
        return;
      }

      // --- MODIFICADOR Ctrl: si Ctrl está apretado, entrar en modo resize brush ---
      // Arrastra hacia ARRIBA para agrandar, hacia ABAJO para achicar.
      if (ctrlModifierRef.current) {
        isResizingBrushRef.current = true;
        isDrawingRef.current = false;
        useStore.setState({ isDrawing: false });
        brushResizeStartRef.current = {
          y: e.clientY,
          size: activeBrushRef.current.size,
        };
        return;
      }

      // --- Pan: síncrono ---
      if (tool === "pan") {
        isPanningRef.current = true;
        isDrawingRef.current = false;
        useStore.setState({ isDrawing: false });
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: activeCanvasViewRef.current.panX,
          panY: activeCanvasViewRef.current.panY,
        };
        return;
      }

      // --- Zoom: síncrono (toggle zoom x2 / x1) ---
      if (tool === "zoom") {
        const cur = activeCanvasViewRef.current.zoom;
        setCanvasView({ zoom: cur > 1 ? 1 : 2 });
        return;
      }

      // --- Cuentagotas: síncrono ---
      if (tool === "eyedropper") {
        const pt = getCanvasPoint(e.clientX, e.clientY);
        if (!pt) return;
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const x = Math.floor(pt.x);
        const y = Math.floor(pt.y);
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
        let r = 255, g = 255, b = 255;
        try {
          const data = ctx.getImageData(x, y, 1, 1).data;
          r = data[0]; g = data[1]; b = data[2];
        } catch (_) { /* ignore */ }
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        useStore.getState().setBrush({ color: hex });
        setTool("pencil");
        return;
      }

      // --- Herramientas que requieren un drawing activo ---
      // Para herramientas que sólo necesitan "leer" (selection, transform),
      // no creamos un drawing nuevo automáticamente
      if (tool === "selection" || tool === "transform") {
        const pt = getCanvasPoint(e.clientX, e.clientY);
        if (!pt) return;
        // RESETEAR smoother y lastPos para evitar "raya" del trazo anterior
        smootherRef.current = createSmoother(activeBrushRef.current.smoothing);
        startPosRef.current = pt;
        lastPosRef.current = pt; // IMPORTANTE: necesario para que handleUp calcule bounds
        isDrawingRef.current = true;
        useStore.setState({ isDrawing: true });
        return;
      }

      // Crear/obtener drawing para herramientas de dibujo
      const cell = layer.cells.find(
        (c) =>
          proj.currentFrame >= c.startFrame &&
          proj.currentFrame < c.startFrame + c.duration
      );

      let drawingId = cell?.drawingId ?? null;
      if (!drawingId && (tool === "pencil" || tool === "brush" || tool === "ink" || tool === "watercolor" || tool === "eraser" || tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "fill")) {
        // Crear drawing vacío inmediatamente (síncrono)
        const newId = genId("draw");
        const now = Date.now();
        const emptyCanvas = document.createElement("canvas");
        emptyCanvas.width = proj.settings.width;
        emptyCanvas.height = proj.settings.height;
        const emptyDataUrl = emptyCanvas.toDataURL("image/png");

        // Actualizar store
        useStore.setState((s) => {
          if (!s.project) return {};
          // Buscar celda actual o crear nueva
          const layers = s.project.layers.map((l) => {
            if (l.id !== layer.id) return l;
            const cells = [...l.cells];
            const existing = cells.find(
              (c) =>
                s.project!.currentFrame >= c.startFrame &&
                s.project!.currentFrame < c.startFrame + c.duration
            );
            if (existing) {
              const idx = cells.indexOf(existing);
              cells[idx] = { ...existing, drawingId: newId };
            } else {
              cells.push({
                id: genId("cell"),
                drawingId: newId,
                startFrame: s.project.currentFrame,
                duration: 1,
              });
              cells.sort((a, b) => a.startFrame - b.startFrame);
            }
            return { ...l, cells };
          });
          return {
            project: {
              ...s.project,
              layers,
              drawings: {
                ...s.project.drawings,
                [newId]: {
                  id: newId,
                  name: `Drawing ${Object.keys(s.project.drawings).length + 1}`,
                  dataUrl: emptyDataUrl,
                  width: s.project.settings.width,
                  height: s.project.settings.height,
                  createdAt: now,
                  updatedAt: now,
                },
              },
              dirty: true,
              updatedAt: now,
            },
          };
        });

        // Pre-cachear el drawing vacío
        await preloadImage(newId, emptyDataUrl);
        drawingId = newId;
      }

      if (!drawingId) return;

      // Cargar el drawing en el canvas activo (síncrono si está cacheado)
      await loadDrawingIntoCanvas(drawingId);

      const pt = getCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;

      // IMPORTANTE: setear el estado de dibujo INMEDIATAMENTE
      // y RESETEAR el smoother para que no quede con la posición del
      // trazo anterior (causaba el bug "raya al comenzar en cualquier dirección")
      isDrawingRef.current = true;
      useStore.setState({ isDrawing: true });
      startPosRef.current = pt;
      lastPosRef.current = pt;
      smootherRef.current = createSmoother(activeBrushRef.current.smoothing);
      // FIX: cuando e.pressure es 0 o undefined (mouse, o pen apenas tocando la
      // tableta), NO usar 1.0 (presión máxima) — usar minSizePressure para que
      // el punto inicial sea pequeño y no aparezca un "punto grueso" al inicio.
      // El trazo crecerá al recibir eventos de move con presión real.
      const b0 = activeBrushRef.current;
      pressureRef.current = b0.pressureSensitivity
        ? (e.pressure && e.pressure > 0 ? e.pressure : b0.minSizePressure)
        : 1;

      const canvas = drawingCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Para primitivas, guardar estado actual
      if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
        savedImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      // Bote de tinta: ejecutar y commitear inmediatamente
      if (tool === "fill") {
        const color = hexToRgb(activeBrushRef.current.color);
        color.a = Math.round(activeBrushRef.current.opacity * 255);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Usar fillTolerance del pincel para la tolerancia del flood fill
        floodFill(imgData, pt.x, pt.y, color, activeBrushRef.current.fillTolerance);
        ctx.putImageData(imgData, 0, 0);
        isDrawingRef.current = false;
        useStore.setState({ isDrawing: false });
        await commitDrawing();
        return;
      }

      // Lápiz, pincel, pluma de tinta, acuarela, goma: trazar punto inicial
      const b = activeBrushRef.current;
      if (tool === "pencil") {
        // Lápiz: textura de mina de grafito
        configurePencil(ctx, b, pressureRef.current);
        const size = b.pressureSensitivity
          ? b.size * Math.max(b.minSizePressure, pressureRef.current)
          : b.size;
        drawPencilDab(ctx, pt.x, pt.y, size, b.opacity * 0.7);
      } else if (tool === "ink") {
        // Pluma de tinta: punto inicial con flujo irregular
        const size = b.pressureSensitivity
          ? b.size * Math.max(b.minSizePressure, pressureRef.current)
          : b.size;
        drawInkDab(ctx, pt.x, pt.y, size, b.color, b.opacity, pressureRef.current);
      } else if (tool === "watercolor") {
        // Acuarela: parche inicial translúcido
        const size = b.pressureSensitivity
          ? b.size * Math.max(b.minSizePressure, pressureRef.current)
          : b.size;
        drawWatercolorDab(ctx, pt.x, pt.y, size, b.color, b.opacity, pressureRef.current);
      } else if (tool === "brush") {
        // Pincel: trazo suave y redondo
        configureStroke(ctx, b, pressureRef.current);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.5, ctx.lineWidth / 2), 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
      } else if (tool === "eraser") {
        configureEraser(ctx, b, pressureRef.current);
      }
    },
    [getCanvasPoint, loadDrawingIntoCanvas, commitDrawing, setTool, setCanvasView, drawingCanvasRef]
  );

  // ---------------------------------------------------------------------------
  // Move y Up: window listeners (bulletproof)
  // ---------------------------------------------------------------------------

  const handleMove = useCallback(
    (e: PointerEvent) => {
      // Zoom por arrastre (modificador Z apretado + drag)
      // dy < 0 (arrastra hacia arriba) → zoom in
      // dy > 0 (arrastra hacia abajo) → zoom out
      if (isZoomingRef.current && zoomStartRef.current) {
        const dy = e.clientY - zoomStartRef.current.y;
        // Cada 100px de drag cambia el zoom por un factor de 2
        const factor = Math.exp(-dy / 200);
        const newZoom = Math.max(0.05, Math.min(20, zoomStartRef.current.zoom * factor));
        setCanvasView({ zoom: newZoom });
        return;
      }

      // Resize brush (modificador Ctrl apretado + drag)
      // dy < 0 → agrandar; dy > 0 → achicar
      if (isResizingBrushRef.current && brushResizeStartRef.current) {
        const dy = e.clientY - brushResizeStartRef.current.y;
        const startSize = brushResizeStartRef.current.size;
        // Cada 100px de drag cambia el tamaño por un factor de 2
        const factor = Math.exp(-dy / 200);
        const newSize = Math.max(0.5, Math.min(200, startSize * factor));
        useStore.getState().setBrush({ size: newSize });
        return;
      }

      // Pan (tool "pan" o modificador C)
      if (isPanningRef.current && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setCanvasView({
          panX: panStartRef.current.panX + dx,
          panY: panStartRef.current.panY + dy,
        });
        return;
      }

      if (!isDrawingRef.current) return;

      const proj = activeProjectRef.current;
      if (!proj) return;
      const layer = proj.layers.find((l) => l.id === proj.currentLayerId);
      if (!layer || layer.locked || !layer.visible) return;

      // El tool efectivo depende del modificador X (goma temporal).
      const tool: ToolId = xModifierRef.current ? "eraser" : activeToolRef.current;
      const pt = getCanvasPoint(e.clientX, e.clientY);
      if (!pt || !startPosRef.current) return;

      const canvas = drawingCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const b = activeBrushRef.current;
      // FIX: si e.pressure es 0/undefined durante un trazo (tableta que envía
      // eventos intermitentes con pressure=0), mantener la última presión conocida
      // en lugar de saltar a 1.0 (que causaba puntos gruesos en medio del trazo).
      if (b.pressureSensitivity) {
        if (e.pressure && e.pressure > 0) {
          pressureRef.current = e.pressure;
        }
        // si e.pressure es 0, dejamos pressureRef con su valor anterior (carry-over)
      } else {
        pressureRef.current = 1;
      }

      if (tool === "pencil") {
        // Lápiz: dibujar dabs de mina a lo largo del trazo
        configurePencil(ctx, b, pressureRef.current);
        const size = b.pressureSensitivity
          ? b.size * Math.max(b.minSizePressure, pressureRef.current)
          : b.size;
        const smoothed = smoothPoint(smootherRef.current, pt.x, pt.y);
        // Dibujar dabs entre lastPos y smoothed para crear un trazo continuo
        if (lastPosRef.current) {
          const dx = smoothed.x - lastPosRef.current.x;
          const dy = smoothed.y - lastPosRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const step = Math.max(1, size * 0.15);
          const steps = Math.max(1, Math.floor(dist / step));
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = lastPosRef.current.x + dx * t;
            const y = lastPosRef.current.y + dy * t;
            drawPencilDab(ctx, x, y, size, b.opacity * 0.5);
          }
        }
        lastPosRef.current = smoothed;
      } else if (tool === "ink") {
        // Pluma de tinta: trazo con flujo irregular
        const size = b.pressureSensitivity
          ? b.size * Math.max(b.minSizePressure, pressureRef.current)
          : b.size;
        const smoothed = smoothPoint(smootherRef.current, pt.x, pt.y);
        if (lastPosRef.current) {
          drawInkSegment(
            ctx,
            lastPosRef.current.x,
            lastPosRef.current.y,
            smoothed.x,
            smoothed.y,
            size,
            b.color,
            b.opacity,
            pressureRef.current
          );
        }
        lastPosRef.current = smoothed;
      } else if (tool === "watercolor") {
        // Acuarela: trazo translúcido acumulativo
        const size = b.pressureSensitivity
          ? b.size * Math.max(b.minSizePressure, pressureRef.current)
          : b.size;
        const smoothed = smoothPoint(smootherRef.current, pt.x, pt.y);
        if (lastPosRef.current) {
          drawWatercolorSegment(
            ctx,
            lastPosRef.current.x,
            lastPosRef.current.y,
            smoothed.x,
            smoothed.y,
            size,
            b.color,
            b.opacity,
            pressureRef.current
          );
        }
        lastPosRef.current = smoothed;
      } else if (tool === "brush" || tool === "eraser") {
        if (tool === "brush") {
          configureStroke(ctx, b, pressureRef.current);
        } else {
          configureEraser(ctx, b, pressureRef.current);
        }
        const smoothed = smoothPoint(smootherRef.current, pt.x, pt.y);
        // Continuamos el trazo desde lastPos
        if (lastPosRef.current) {
          ctx.beginPath();
          ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
          ctx.lineTo(smoothed.x, smoothed.y);
          ctx.stroke();
        }
        lastPosRef.current = smoothed;
      } else if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
        // Restaurar estado guardado y dibujar primitiva
        if (savedImageRef.current) {
          ctx.putImageData(savedImageRef.current, 0, 0);
        }
        configureStroke(ctx, b, pressureRef.current);
        if (tool === "line") {
          strokeLine(ctx, startPosRef.current.x, startPosRef.current.y, pt.x, pt.y);
        } else if (tool === "rectangle") {
          strokeRectangle(ctx, startPosRef.current.x, startPosRef.current.y, pt.x, pt.y);
        } else if (tool === "ellipse") {
          strokeEllipse(ctx, startPosRef.current.x, startPosRef.current.y, pt.x, pt.y);
        }
      } else if (tool === "selection") {
        // IMPORTANTE: actualizar lastPosRef.current con la posición actual
        // para que handleUp pueda calcular los bounds correctamente
        lastPosRef.current = pt;
        // Dibujar rectángulo de selección en overlay
        const overlay = overlayCanvasRef.current;
        if (!overlay) return;
        const octx = overlay.getContext("2d");
        if (!octx) return;
        octx.clearRect(0, 0, overlay.width, overlay.height);
        octx.strokeStyle = "#4dabf7";
        octx.lineWidth = 1;
        octx.setLineDash([4, 4]);
        const x = Math.min(startPosRef.current.x, pt.x);
        const y = Math.min(startPosRef.current.y, pt.y);
        const w = Math.abs(pt.x - startPosRef.current.x);
        const h = Math.abs(pt.y - startPosRef.current.y);
        octx.strokeRect(x, y, w, h);
        octx.fillStyle = "rgba(77, 171, 247, 0.15)";
        octx.fillRect(x, y, w, h);
        octx.setLineDash([]);
      }
    },
    [getCanvasPoint, setCanvasView, drawingCanvasRef, overlayCanvasRef]
  );

  const handleUp = useCallback(
    async (e: PointerEvent) => {
      // Zoom por arrastre fin
      if (isZoomingRef.current) {
        isZoomingRef.current = false;
        zoomStartRef.current = null;
        return;
      }
      // Brush resize fin
      if (isResizingBrushRef.current) {
        isResizingBrushRef.current = false;
        brushResizeStartRef.current = null;
        return;
      }
      // Pan fin
      if (isPanningRef.current) {
        isPanningRef.current = false;
        panStartRef.current = null;
        return;
      }

      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      useStore.setState({ isDrawing: false });

      const tool: ToolId = xModifierRef.current ? "eraser" : activeToolRef.current;

      // Para selection: guardar bounds, mantener visibles las "marching ants"
      // y EXTRAER el contenido (cortar). Luego el usuario puede pegar con Ctrl+V
      // o mover con la herramienta Transformar.
      if (tool === "selection") {
        const overlay = overlayCanvasRef.current;
        // Calcular bounds
        if (startPosRef.current && lastPosRef.current) {
          const x = Math.min(startPosRef.current.x, lastPosRef.current.x);
          const y = Math.min(startPosRef.current.y, lastPosRef.current.y);
          const w = Math.abs(lastPosRef.current.x - startPosRef.current.x);
          const h = Math.abs(lastPosRef.current.y - startPosRef.current.y);
          if (w > 2 && h > 2) {
            selectionBoundsRef.current = { x, y, width: w, height: h };
            // NO cortar automáticamente. Solo seleccionar.
            // El usuario puede hacer Ctrl+C (copiar) o Ctrl+X (cortar) después.
            // Dibujar "marching ants" en overlay
            if (overlay) {
              const octx = overlay.getContext("2d");
              if (octx) {
                octx.clearRect(0, 0, overlay.width, overlay.height);
                octx.strokeStyle = "#4dabf7";
                octx.lineWidth = 1.5;
                octx.setLineDash([6, 4]);
                octx.strokeRect(x, y, w, h);
                octx.setLineDash([]);
                octx.fillStyle = "rgba(77, 171, 247, 0.9)";
                octx.font = "11px sans-serif";
                octx.textAlign = "left";
                octx.textBaseline = "top";
                octx.fillText("Ctrl+C copiar · Ctrl+X cortar · Ctrl+V pegar", x + 4, y - 14);
              }
            }
          } else {
            // Selección muy pequeña: borrar selección existente
            selectionBoundsRef.current = null;
            selectionImageRef.current = null;
            if (overlay) {
              const octx = overlay.getContext("2d");
              octx?.clearRect(0, 0, overlay.width, overlay.height);
            }
          }
        }
        startPosRef.current = null;
        lastPosRef.current = null;
        return;
      }

      startPosRef.current = null;
      lastPosRef.current = null;
      savedImageRef.current = null;

      await commitDrawing();
    },
    [overlayCanvasRef, drawingCanvasRef, commitDrawing]
  );

  // ---------------------------------------------------------------------------
  // Wheel para zoom
  // ---------------------------------------------------------------------------

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const proj = activeProjectRef.current;
      if (!proj) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const cur = activeCanvasViewRef.current.zoom;
      const newZoom = Math.max(0.05, Math.min(20, cur * (1 + delta * 2)));
      setCanvasView({ zoom: newZoom });
    },
    [setCanvasView]
  );

  // ---------------------------------------------------------------------------
  // Helpers para selección (definidos antes del return)
  // ---------------------------------------------------------------------------

  const clearSelection = useCallback(() => {
    selectionBoundsRef.current = null;
    selectionImageRef.current = null;
    // Limpiar overlay (borrar marching ants)
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const octx = overlay.getContext("2d");
      octx?.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [overlayCanvasRef]);

  const pasteSelection = useCallback(async () => {
    const canvas = drawingCanvasRef.current;
    const sel = selectionImageRef.current;
    const bounds = selectionBoundsRef.current;
    if (!canvas || !sel || !bounds) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(sel, bounds.x, bounds.y);
    await commitDrawing();
    // Limpiar overlay y selección
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const octx = overlay.getContext("2d");
      octx?.clearRect(0, 0, overlay.width, overlay.height);
    }
    selectionBoundsRef.current = null;
    selectionImageRef.current = null;
  }, [drawingCanvasRef, overlayCanvasRef, commitDrawing]);

  // ---------------------------------------------------------------------------
  // Atajos de teclado para selección (Ctrl+V, Delete, Escape)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }
      // Ctrl/Cmd + C = copiar selección (sin borrar)
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
        if (selectionBoundsRef.current && selectionImageRef.current) return;
        e.preventDefault();
        const canvas = drawingCanvasRef.current;
        const bounds = selectionBoundsRef.current;
        if (canvas && bounds) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            try {
              selectionImageRef.current = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
            } catch (_) {}
          }
        }
        return;
      }
      // Ctrl/Cmd + X = cortar selección (copiar + borrar)
      if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X")) {
        // No confundir con el modificador X para goma
        if (selectionBoundsRef.current) {
          e.preventDefault();
          const canvas = drawingCanvasRef.current;
          const bounds = selectionBoundsRef.current;
          if (canvas && bounds) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              try {
                selectionImageRef.current = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
                ctx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
                await commitDrawing();
              } catch (_) {}
            }
          }
          return;
        }
      }
      // Ctrl/Cmd + V = pegar selección (en el lugar original)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "v" || e.key === "V")) {
        if (selectionImageRef.current && selectionBoundsRef.current) {
          e.preventDefault();
          const canvas = drawingCanvasRef.current;
          const sel = selectionImageRef.current;
          const bounds = selectionBoundsRef.current;
          if (canvas && sel && bounds) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.putImageData(sel, bounds.x, bounds.y);
              await commitDrawing();
              const overlay = overlayCanvasRef.current;
              if (overlay) {
                const octx = overlay.getContext("2d");
                octx?.clearRect(0, 0, overlay.width, overlay.height);
              }
              selectionBoundsRef.current = null;
              selectionImageRef.current = null;
            }
          }
          return;
        }
      }
      // Shift + Ctrl/Cmd + V = pegar en la posición del cursor (no implementado aún,
      // pero prevenimos el default)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        // Por ahora hace lo mismo que Ctrl+V normal
        if (selectionImageRef.current && selectionBoundsRef.current) {
          const canvas = drawingCanvasRef.current;
          const sel = selectionImageRef.current;
          const bounds = selectionBoundsRef.current;
          if (canvas && sel && bounds) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.putImageData(sel, bounds.x, bounds.y);
              await commitDrawing();
              const overlay = overlayCanvasRef.current;
              if (overlay) {
                const octx = overlay.getContext("2d");
                octx?.clearRect(0, 0, overlay.width, overlay.height);
              }
              selectionBoundsRef.current = null;
              selectionImageRef.current = null;
            }
          }
        }
        return;
      }
      // Delete o Backspace = limpiar selección
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectionBoundsRef.current) {
          e.preventDefault();
          clearSelection();
        }
        return;
      }
      // Escape = limpiar selección
      if (e.key === "Escape") {
        clearSelection();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pasteSelection, clearSelection, commitDrawing]);

  // ---------------------------------------------------------------------------
  // Window listeners para move/up (bulletproof — no dependen de React)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const move = (e: PointerEvent) => handleMove(e);
    const up = (e: PointerEvent) => handleUp(e);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [handleMove, handleUp]);

  // Commit periódico mientras se dibuja
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
    handleWheel,
    loadDrawingIntoCanvas,
    commitDrawing,
    selectionBoundsRef,
    selectionImageRef,
    clearSelection,
    pasteSelection,
  };
}

// ---------------------------------------------------------------------------
// Hook de reproducción (motor de animación) — sin flicker
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
  // Refs para evitar re-runs del useEffect cuando project cambia
  const playingRef = useRef(false);
  const loopingRef = useRef(true);
  const fpsRef = useRef(6);
  const rangeStartRef = useRef(0);
  const rangeEndRef = useRef(1);

  useEffect(() => {
    playingRef.current = playback.playing;
    loopingRef.current = playback.looping;
    fpsRef.current = playback.playbackFps || 6;
  }, [playback]);

  useEffect(() => {
    if (!project) return;
    const total = totalFrames(project.layers);
    rangeStartRef.current = playback.rangeStart ?? 0;
    rangeEndRef.current = playback.rangeEnd ?? Math.max(1, total);
  }, [project?.layers, playback.rangeStart, playback.rangeEnd]);

  useEffect(() => {
    if (!playingRef.current) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    lastTimeRef.current = performance.now();
    frameAccumRef.current = 0;

    const loop = (time: number) => {
      if (!playingRef.current) return;

      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;
      const framesPerMs = fpsRef.current / 1000;
      frameAccumRef.current += dt * framesPerMs;

      while (frameAccumRef.current >= 1) {
        frameAccumRef.current -= 1;
        // Leer el frame actual directamente del store (no del closure)
        const currentFrame = useStore.getState().project?.currentFrame ?? 0;
        const next = currentFrame + 1;
        const rangeEnd = rangeEndRef.current;
        const rangeStart = rangeStartRef.current;
        if (next >= rangeEnd) {
          if (loopingRef.current) {
            gotoFrame(rangeStart);
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
  }, [playback.playing, setPlaying, gotoFrame]);

  // Audio sincronizado
  useEffect(() => {
    if (!project || !playback.playing) return;
    const fps = project.settings.fps;
    const currentFrame = project.currentFrame;
    for (const clip of Object.values(project.audioClips)) {
      const start = clip.startFrame;
      const end = start + Math.floor(clip.duration * fps);
      if (currentFrame >= start && currentFrame <= end && !clip.muted) {
        if (audioRef.current && audioRef.current.dataset.id === clip.id) {
          const expectedTime = (currentFrame - start) / fps;
          if (Math.abs(audioRef.current.currentTime - expectedTime) > 0.2) {
            audioRef.current.currentTime = expectedTime;
          }
          if (audioRef.current.paused) audioRef.current.play().catch(() => {});
          return;
        }
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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [project, playback.playing]);
}
