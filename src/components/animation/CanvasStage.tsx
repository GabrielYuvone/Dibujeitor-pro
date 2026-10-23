"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { useStore, getCurrentLayer } from "@/lib/animation/store";
import { useDrawingEngine, getCachedImage, preloadImage } from "@/lib/animation/useDrawingEngine";
import { findCellAtFrame, getEffectiveLayerTransform } from "@/lib/animation/utils";
import { executeActions, evalCondition } from "@/lib/animation/actions";
import { screenToCanvas } from "@/lib/animation/drawing";

interface CanvasStageProps {
  width: number;
  height: number;
}

/**
 * Lienzo principal. Renderiza capas con imágenes cacheadas (síncrono)
 * para evitar parpadeo durante el playback.
 *
 * - backgroundRef: fondo del proyecto + grid + safe area
 * - compositedRef: composición final de TODAS las capas visibles (síncrono)
 * - drawingCanvasRef: canvas editable donde el usuario dibuja
 * - overlayCanvasRef: preview de primitivas y selección
 *
 * Durante la edición, el drawingCanvas muestra el drawing activo y está
 * sobre el compositedRef. Durante el playback, ocultamos el drawingCanvas
 * (que es editable y se resetea) y dejamos solo el compositedRef, que se
 * actualiza en una sola operación atómica (sin flicker).
 */
export function CanvasStage({ width, height }: CanvasStageProps) {
  const project = useStore((s) => s.project);
  const canvasView = useStore((s) => s.canvasView);
  const onion = useStore((s) => s.onion);
  const showGrid = useStore((s) => s.showGrid);
  const showSafeArea = useStore((s) => s.showSafeArea);
  const viewMode = useStore((s) => s.viewMode);
  const playback = useStore((s) => s.playback);
  const resetCanvasView = useStore((s) => s.resetCanvasView);
  const imagePlacement = useStore((s) => s.imagePlacement);
  const updateImagePlacement = useStore((s) => s.updateImagePlacement);
  const confirmImagePlacement = useStore((s) => s.confirmImagePlacement);
  const cancelImagePlacement = useStore((s) => s.cancelImagePlacement);
  // Estado del pincel y herramienta para el cursor de pincel
  const brush = useStore((s) => s.brush);
  const currentTool = useStore((s) => s.currentTool);
  const xModifier = useStore((s) => s.xModifier);
  // layerDrafts: subscripción reactiva para que el componente re-renderice
  // cuando el usuario arrastra con space o con el tool "move-layer".
  // Sin esto, el draft se actualiza en el store pero CanvasStage no lo
  // ve y el desplazamiento no se refleja visualmente durante el drag.
  const layerDrafts = useStore((s) => s.layerDrafts);
  // spaceModifier: cuando está apretado el espacio, el engine entra en
  // modo "move-layer temporal". Necesitamos compositar la capa activa con
  // su transform aplicado para que el usuario vea el desplazamiento en
  // tiempo real durante el drag (igual que cuando el tool activo es
  // "move-layer" propiamente dicho).
  const spaceModifier = useStore((s) => s.spaceModifier);
  const isDrawing = useStore((s) => s.isDrawing);

  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const backgroundRef = useRef<HTMLCanvasElement | null>(null);
  const compositedRef = useRef<HTMLCanvasElement | null>(null);
  const lastLoadedDrawingRef = useRef<string | null>(null);
  // Cursor del pincel (overlay visual que sigue al mouse)
  const brushCursorRef = useRef<HTMLDivElement | null>(null);
  const isPointerDownRef = useRef(false);
  // Refs para el manejo de drag/scale de la imagen colocada
  const placementImageRef = useRef<HTMLImageElement | null>(null);
  const placementModeRef = useRef<"none" | "move" | "scale-tl" | "scale-tr" | "scale-bl" | "scale-br" | "rotate">("none");
  const placementStartRef = useRef<{ x: number; y: number; px: number; py: number; pw: number; ph: number; prot: number } | null>(null);

  const engine = useDrawingEngine({
    drawingCanvasRef,
    overlayCanvasRef,
    containerRef,
  });

  // El modo "composición" se usa cuando NO estamos editando o cuando
  // se está reproduciendo. En este modo, el drawingCanvas se oculta
  // (porque se está reseteando entre frames) y solo se ve el composited.
  // En edit mode, AMBOS canvases están visibles: el composited (con onion
  // skin + capas no-activas) DEBAJO del drawing canvas (la capa activa).
  //
  // IMPORTANTE: el transform de la capa activa (keyframes + draft) se
  // aplica al drawingCanvas vía CSS (ver `activeLayerCssTransform` abajo).
  // Esto permite ver y editar la capa en su posición movida, sin que
  // "salte" al soltar espacio. El composited NO incluye la capa activa
  // en edit mode (para no duplicar).
  const isCompositing = viewMode === "preview" || playback.playing;

  // Transform EFECTIVO de la capa activa = interpolated (de keyframes) + draft.
  // Lo aplicamos al drawingCanvas vía CSS para que el usuario vea la capa
  // en su posición movida, incluso después de soltar espacio (el draft
  // persiste hasta que el usuario lo commitea como keyframe o lo limpia).
  // Esto soluciona el bug de "la capa vuelve a donde estaba al soltar space".
  // El transform-origin: 50% 50% (default) hace que rotate/scale sean
  // alrededor del centro del canvas, igual que el ctx.translate + rotate
  // + scale que aplica el composited.
  const activeLayerForTransform = project?.currentLayerId
    ? project.layers.find((l) => l.id === project.currentLayerId)
    : null;
  const activeLayerTransform = activeLayerForTransform
    ? getEffectiveLayerTransform(
        activeLayerForTransform,
        project?.currentFrame ?? 0,
        layerDrafts[activeLayerForTransform.id]
      )
    : { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
  const activeLayerHasTransform =
    activeLayerTransform.offsetX !== 0 ||
    activeLayerTransform.offsetY !== 0 ||
    activeLayerTransform.scale !== 1 ||
    activeLayerTransform.rotation !== 0;
  const activeLayerCssTransform = activeLayerHasTransform
    ? `translate(${activeLayerTransform.offsetX}px, ${activeLayerTransform.offsetY}px) rotate(${activeLayerTransform.rotation}deg) scale(${activeLayerTransform.scale})`
    : undefined;
  // ¿Está oculta la capa activa? Si lo está, escondemos el drawingCanvas
  // (que muestra la capa activa en edit mode). Antes el drawingCanvas
  // ignoraba `layer.visible` → el ojo (eye toggle) no funcionaba para la
  // capa actualmente seleccionada, solo para las demás.
  const activeLayerVisible = activeLayerForTransform ? activeLayerForTransform.visible : true;
  // Dimensiones del drawing activo: si el bitmap fue expandido (porque el
  // usuario dibujó más allá de los límites al mover la capa), usamos las
  // dimensiones reales del drawing. Si no hay drawing, fallback a project
  // settings. Esto hace que el drawingCanvas sea más grande que el canvas
  // visible — el usuario puede panear (via draft transform) para ver las
  // distintas partes del bitmap expandido.
  const activeCellForDims = activeLayerForTransform && project
    ? findCellAtFrame(
        activeLayerForTransform.cells,
        project.currentFrame,
        activeLayerForTransform.loopRange
      )
    : null;
  const activeDrawingForDims = activeCellForDims?.drawingId && project
    ? project.drawings[activeCellForDims.drawingId]
    : null;
  const drawingCanvasW = activeDrawingForDims?.width ?? width;
  const drawingCanvasH = activeDrawingForDims?.height ?? height;

  // ---------------------------------------------------------------------------
  // Pintar fondo
  // ---------------------------------------------------------------------------

  const drawBackground = useCallback(() => {
    const c = backgroundRef.current;
    if (!c || !project) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = project.settings.bgColor;
    ctx.fillRect(0, 0, c.width, c.height);
    if (project.settings.bgColor === "transparent" || project.settings.bgColor === "rgba(0,0,0,0)") {
      const size = 12;
      for (let y = 0; y < c.height; y += size) {
        for (let x = 0; x < c.width; x += size) {
          const checker = ((x / size + y / size) % 2 === 0);
          ctx.fillStyle = checker ? "#3a3a3a" : "#2a2a2a";
          ctx.fillRect(x, y, size, size);
        }
      }
    }
    if (showSafeArea) {
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const sx = c.width * 0.05;
      const sy = c.height * 0.05;
      ctx.strokeRect(sx, sy, c.width - sx * 2, c.height - sy * 2);
      const tx = c.width * 0.1;
      const ty = c.height * 0.1;
      ctx.strokeStyle = "#00ff00";
      ctx.strokeRect(tx, ty, c.width - tx * 2, c.height - ty * 2);
      ctx.setLineDash([]);
    }
    if (showGrid) {
      ctx.strokeStyle = "rgba(128,128,128,0.3)";
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
      ctx.strokeStyle = "rgba(128,128,128,0.6)";
      ctx.beginPath();
      ctx.moveTo(c.width / 2, 0);
      ctx.lineTo(c.width / 2, c.height);
      ctx.moveTo(0, c.height / 2);
      ctx.lineTo(c.width, c.height / 2);
      ctx.stroke();
    }
  }, [project, showSafeArea, showGrid]);

  // ---------------------------------------------------------------------------
  // Componer todas las capas en un solo canvas (síncrono con imágenes cacheadas)
  // ---------------------------------------------------------------------------

  const compositeAll = useCallback(() => {
    const c = compositedRef.current;
    if (!c || !project) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // En edit mode (sin playback), la capa activa se muestra en el drawing
    // canvas (arriba) CON su transform aplicado vía CSS. La excluimos del
    // composited para no duplicar.
    const excludeActiveLayer = viewMode === "edit" && !playback.playing;
    const activeLayerId = project.currentLayerId;

    // Onion skin primero (debajo de las capas reales) — solo en edit mode.
    // Respetamos layer.visible — si la capa activa está oculta, no dibujar
    // su onion skin (el ojo debería funcionar también para el onion).
    if (onion.enabled && excludeActiveLayer) {
      const currentLayer = getCurrentLayer(project);
      if (currentLayer && currentLayer.type !== "audio" && currentLayer.visible) {
        drawOnionIntoCanvas(ctx, project, currentLayer, onion);
      }
    }

    // Capas (de abajo hacia arriba — la primera capa está en el fondo)
    for (const layer of project.layers) {
      if (!layer.visible || layer.type === "audio") continue;
      // En edit mode, excluir la capa activa del composited
      if (excludeActiveLayer && layer.id === activeLayerId) continue;
      const cell = findCellAtFrame(layer.cells, project.currentFrame, layer.loopRange);
      if (!cell || !cell.drawingId) continue;
      const drawing = project.drawings[cell.drawingId];
      if (!drawing) continue;

      const img = getCachedImage(cell.drawingId);
      if (img && img.complete && img.naturalWidth > 0) {
        // Transform EFECTIVO = interpolated (de keyframes) + draft (live).
        // El draft es el offset que el usuario acumula arrastrando con
        // espacio o con el tool "move-layer" sin commitear como keyframe.
        const t = getEffectiveLayerTransform(
          layer,
          project.currentFrame,
          useStore.getState().layerDrafts[layer.id]
        );
        const hasTransform =
          t.offsetX !== 0 || t.offsetY !== 0 || t.scale !== 1 || t.rotation !== 0;
        ctx.globalAlpha = layer.opacity;
        if (hasTransform) {
          // Rotar/escalar alrededor del CENTRO del bitmap (no del canvas
          // visible). Esto coincide con el transform-origin "50% 50%" del
          // drawingCanvas, así el rendering del composited y del drawingCanvas
          // coinciden incluso cuando el bitmap está expandido (más grande
          // que project.settings).
          ctx.save();
          // Mover al top-left del bitmap (con offset)
          ctx.translate(t.offsetX, t.offsetY);
          // Mover al centro del bitmap (pivote de rotación/escala)
          ctx.translate(drawing.width / 2, drawing.height / 2);
          if (t.rotation !== 0) ctx.rotate((t.rotation * Math.PI) / 180);
          if (t.scale !== 1) ctx.scale(t.scale, t.scale);
          // Dibujar imagen centrada en el pivote actual
          ctx.drawImage(img, -drawing.width / 2, -drawing.height / 2, drawing.width, drawing.height);
          ctx.restore();
        } else {
          // Sin transform — drawImage a tamaño natural. Si el bitmap es
          // más grande que project.settings, se clipa al composited canvas
          // automáticamente (que es de tamaño project.settings).
          ctx.drawImage(img, 0, 0, drawing.width, drawing.height);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Botones interactivos en modo preview
    if (viewMode === "preview") {
      for (const btn of project.buttons) {
        if (!btn.visible) continue;
        ctx.fillStyle = btn.color;
        ctx.fillRect(btn.x, btn.y, btn.width, btn.height);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);
        ctx.fillStyle = "#fff";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + btn.height / 2);
      }
    }
  }, [project, onion, viewMode, playback.playing, currentTool, spaceModifier, layerDrafts]);

  // ---------------------------------------------------------------------------
  // Dibujar overlay del placement de imagen (modo transformación)
  // ---------------------------------------------------------------------------

  const drawPlacementOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || !imagePlacement) return;
    const octx = overlay.getContext("2d");
    if (!octx) return;

    // Limpiar el overlay primero
    octx.clearRect(0, 0, overlay.width, overlay.height);

    const img = placementImageRef.current;
    if (!img || !img.complete) return;

    const { x, y, width: w, height: h } = imagePlacement;
    // Dibujar la imagen colocada (semi-transparente para que se vea
    // que está en modo edición)
    octx.globalAlpha = 0.95;
    // Aplicar rotación si hay (pivot en el centro de la imagen)
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rot = imagePlacement.rotation ?? 0;
    if (rot !== 0) {
      octx.save();
      octx.translate(cx, cy);
      octx.rotate((rot * Math.PI) / 180);
      octx.drawImage(img, -w / 2, -h / 2, w, h);
      octx.restore();
    } else {
      octx.drawImage(img, x, y, w, h);
    }
    octx.globalAlpha = 1;

    // Bounding box (rotado si hay rotación)
    if (rot !== 0) {
      octx.save();
      octx.translate(cx, cy);
      octx.rotate((rot * Math.PI) / 180);
      octx.strokeStyle = "#4dabf7";
      octx.lineWidth = 1.5;
      octx.setLineDash([6, 4]);
      octx.strokeRect(-w / 2, -h / 2, w, h);
      octx.setLineDash([]);
      // Corner handles
      const handleSize = 10;
      const handles = [
        { x: -w / 2 - handleSize / 2, y: -h / 2 - handleSize / 2 },
        { x: w / 2 - handleSize / 2, y: -h / 2 - handleSize / 2 },
        { x: -w / 2 - handleSize / 2, y: h / 2 - handleSize / 2 },
        { x: w / 2 - handleSize / 2, y: h / 2 - handleSize / 2 },
      ];
      for (const hd of handles) {
        octx.fillStyle = "#4dabf7";
        octx.fillRect(hd.x, hd.y, handleSize, handleSize);
        octx.strokeStyle = "#fff";
        octx.lineWidth = 1;
        octx.strokeRect(hd.x, hd.y, handleSize, handleSize);
      }
      // Handle de rotación (arriba del top-center, conectado por una línea)
      const rotHandleY = -h / 2 - 24;
      octx.strokeStyle = "#4dabf7";
      octx.lineWidth = 1.5;
      octx.beginPath();
      octx.moveTo(0, -h / 2);
      octx.lineTo(0, rotHandleY);
      octx.stroke();
      octx.fillStyle = "#4dabf7";
      octx.beginPath();
      octx.arc(0, rotHandleY, 6, 0, Math.PI * 2);
      octx.fill();
      octx.strokeStyle = "#fff";
      octx.lineWidth = 1;
      octx.stroke();
      octx.restore();
    } else {
      // Sin rotación — bounding box + handles sin transform
      octx.strokeStyle = "#4dabf7";
      octx.lineWidth = 1.5;
      octx.setLineDash([6, 4]);
      octx.strokeRect(x, y, w, h);
      octx.setLineDash([]);
      const handleSize = 10;
      const handles = [
        { x: x - handleSize / 2, y: y - handleSize / 2 },
        { x: x + w - handleSize / 2, y: y - handleSize / 2 },
        { x: x - handleSize / 2, y: y + h - handleSize / 2 },
        { x: x + w - handleSize / 2, y: y + h - handleSize / 2 },
      ];
      for (const hd of handles) {
        octx.fillStyle = "#4dabf7";
        octx.fillRect(hd.x, hd.y, handleSize, handleSize);
        octx.strokeStyle = "#fff";
        octx.lineWidth = 1;
        octx.strokeRect(hd.x, hd.y, handleSize, handleSize);
      }
      // Handle de rotación (arriba del top-center)
      const rotHandleY = y - 24;
      octx.strokeStyle = "#4dabf7";
      octx.lineWidth = 1.5;
      octx.beginPath();
      octx.moveTo(x + w / 2, y);
      octx.lineTo(x + w / 2, rotHandleY);
      octx.stroke();
      octx.fillStyle = "#4dabf7";
      octx.beginPath();
      octx.arc(x + w / 2, rotHandleY, 6, 0, Math.PI * 2);
      octx.fill();
      octx.strokeStyle = "#fff";
      octx.lineWidth = 1;
      octx.stroke();
    }

    // Texto de ayuda
    octx.fillStyle = "rgba(77, 171, 247, 0.95)";
    octx.font = "11px sans-serif";
    octx.textAlign = "left";
    octx.textBaseline = "top";
    octx.fillText("Enter para confirmar · Esc para cancelar · arrastrá para mover, puntas para escalar, círculo para rotar", x, y - 16);
  }, [imagePlacement]);

  // Cargar la imagen del placement cuando cambia
  useEffect(() => {
    if (!imagePlacement) {
      placementImageRef.current = null;
      // Limpiar overlay
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const octx = overlay.getContext("2d");
        octx?.clearRect(0, 0, overlay.width, overlay.height);
      }
      return;
    }
    // Pre-cargar la imagen
    const img = new Image();
    img.onload = () => {
      placementImageRef.current = img;
      drawPlacementOverlay();
    };
    img.src = imagePlacement.dataUrl;
  }, [imagePlacement, drawPlacementOverlay]);

  // Redibujar el overlay cuando cambia el placement (drag/scale)
  useEffect(() => {
    drawPlacementOverlay();
  }, [drawPlacementOverlay]);

  // ---------------------------------------------------------------------------
  // Handlers para drag/scale de la imagen colocada
  // ---------------------------------------------------------------------------

  const getCanvasPointSimple = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = containerRef.current;
      const proj = project;
      if (!container || !proj) return null;
      const rect = container.getBoundingClientRect();
      return screenToCanvas(clientX, clientY, rect, canvasView, proj.settings.width, proj.settings.height);
    },
    [containerRef, project, canvasView]
  );

  const handlePlacementPointerDown = useCallback(
    (e: React.PointerEvent): boolean => {
      if (!imagePlacement) return false;
      const pt = getCanvasPointSimple(e.clientX, e.clientY);
      if (!pt) return false;
      const { x, y, width: w, height: h } = imagePlacement;
      const handleSize = 14; // área de click para los handles (más grande que el visual)
      // Verificar si el click está en algún corner handle
      const inTL = pt.x >= x - handleSize / 2 && pt.x <= x + handleSize / 2 &&
                   pt.y >= y - handleSize / 2 && pt.y <= y + handleSize / 2;
      const inTR = pt.x >= x + w - handleSize / 2 && pt.x <= x + w + handleSize / 2 &&
                   pt.y >= y - handleSize / 2 && pt.y <= y + handleSize / 2;
      const inBL = pt.x >= x - handleSize / 2 && pt.x <= x + handleSize / 2 &&
                   pt.y >= y + h - handleSize / 2 && pt.y <= y + h + handleSize / 2;
      const inBR = pt.x >= x + w - handleSize / 2 && pt.x <= x + w + handleSize / 2 &&
                   pt.y >= y + h - handleSize / 2 && pt.y <= y + h + handleSize / 2;
      const inImage = pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h;

      // Handle de rotación: está arriba del top-center, a 24px del borde.
      // Si hay rotación, rotar la posición del handle alrededor del centro.
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rot = (imagePlacement.rotation ?? 0) * Math.PI / 180;
      const rotHx_local = 0;           // relativo al centro, sin rotar
      const rotHy_local = -h / 2 - 24; // arriba del top-center
      const rotHx = cx + rotHx_local * Math.cos(rot) - rotHy_local * Math.sin(rot);
      const rotHy = cy + rotHx_local * Math.sin(rot) + rotHy_local * Math.cos(rot);
      const inRotate = Math.sqrt((pt.x - rotHx) ** 2 + (pt.y - rotHy) ** 2) <= 12;

      let mode: typeof placementModeRef.current = "none";
      if (inRotate) mode = "rotate";
      else if (inTL) mode = "scale-tl";
      else if (inTR) mode = "scale-tr";
      else if (inBL) mode = "scale-bl";
      else if (inBR) mode = "scale-br";
      else if (inImage) mode = "move";

      if (mode === "none") return false;

      placementModeRef.current = mode;
      placementStartRef.current = {
        x: pt.x,
        y: pt.y,
        px: imagePlacement.x,
        py: imagePlacement.y,
        pw: imagePlacement.width,
        ph: imagePlacement.height,
        prot: imagePlacement.rotation ?? 0,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return true;
    },
    [imagePlacement, getCanvasPointSimple]
  );

  const handlePlacementPointerMove = useCallback(
    (e: React.PointerEvent): boolean => {
      if (placementModeRef.current === "none" || !imagePlacement || !placementStartRef.current) {
        return false;
      }
      const pt = getCanvasPointSimple(e.clientX, e.clientY);
      if (!pt) return true;
      const start = placementStartRef.current;
      const dx = pt.x - start.x;
      const dy = pt.y - start.y;
      const aspect = imagePlacement.nativeW / imagePlacement.nativeH;

      if (placementModeRef.current === "move") {
        updateImagePlacement({
          x: start.px + dx,
          y: start.py + dy,
        });
      } else if (placementModeRef.current === "rotate") {
        // Rotar: el ángulo desde el centro del image hasta el mouse,
        // relativo a la posición "arriba" (que es -90° en coords estándar).
        // rotation = atan2(dy, dx) * 180/PI + 90
        const cx = start.px + start.pw / 2;
        const cy = start.py + start.ph / 2;
        const angle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
        const newRot = angle + 90;
        // Snap a 15° si Shift está apretado (para alinear fácil)
        const snapped = e.shiftKey
          ? Math.round(newRot / 15) * 15
          : Math.round(newRot);
        updateImagePlacement({ rotation: snapped });
      } else {
        // Escalar desde el centro (más simple y predecible).
        // El usuario arrastra un corner; la imagen crece o se achica
        // manteniendo el centro fijo y preservando aspect ratio.
        const cx = start.px + start.pw / 2;
        const cy = start.py + start.ph / 2;
        const newDx = pt.x - cx;
        const newDy = pt.y - cy;
        const newDist = Math.sqrt(newDx * newDx + newDy * newDy);
        // Distancia original desde el centro a un corner
        const cornerDistX = start.pw / 2;
        const cornerDistY = start.ph / 2;
        const cornerDist = Math.sqrt(cornerDistX * cornerDistX + cornerDistY * cornerDistY);
        const scale = newDist / Math.max(1, cornerDist);
        // Calcular nuevo tamaño preservando aspect ratio
        let newW = Math.max(20, Math.round(start.pw * scale));
        let newH = Math.max(20, Math.round(newW / aspect));
        // Recalcular newW para mantener aspect exacto
        newW = Math.round(newH * aspect);
        // Centro fijo
        const newX = Math.round(cx - newW / 2);
        const newY = Math.round(cy - newH / 2);
        updateImagePlacement({
          x: newX,
          y: newY,
          width: newW,
          height: newH,
        });
      }
      return true;
    },
    [imagePlacement, getCanvasPointSimple, updateImagePlacement]
  );

  const handlePlacementPointerUp = useCallback(
    (e: React.PointerEvent): boolean => {
      if (placementModeRef.current === "none") return false;
      placementModeRef.current = "none";
      placementStartRef.current = null;
      return true;
    },
    []
  );

  // Enter = confirmar, Escape = cancelar
  useEffect(() => {
    if (!imagePlacement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmImagePlacement();
        // Forzar reset de modifiers del engine. Después de Ctrl+V el
        // usuario puede tener ctrlModifier=true sin haber soltado Ctrl
        // explícitamente (ej. si el keyup se perdió al cambiar focus).
        // Sin esto, el siguiente click entraba en modo "resize brush"
        // en vez de dibujar.
        engine.resetModifiers();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelImagePlacement();
        engine.resetModifiers();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imagePlacement, confirmImagePlacement, cancelImagePlacement, engine]);

  // ---------------------------------------------------------------------------
  // Efecto: ajustar tamaños de canvas
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // NOTA: drawingCanvasRef NO se incluye acá — sus dimensiones las
    // maneja el JSX con `drawingCanvasW/H` (que pueden ser más grandes
    // que project.settings si el bitmap fue expandido). Si lo forzamos
    // a project.settings, el bitmap se achica y el drawImage estira la
    // imagen (bug: "me estira el dibujo y se deforma").
    for (const ref of [overlayCanvasRef, backgroundRef, compositedRef]) {
      const c = ref.current;
      if (c && (c.width !== width || c.height !== height)) {
        c.width = width;
        c.height = height;
      }
    }
    // El drawingCanvas lo redimensionamos acá también, pero usando
    // drawingCanvasW/H (dimensiones reales del drawing activo).
    const dc = drawingCanvasRef.current;
    if (dc && (dc.width !== drawingCanvasW || dc.height !== drawingCanvasH)) {
      dc.width = drawingCanvasW;
      dc.height = drawingCanvasH;
    }
    drawBackground();
  }, [width, height, drawingCanvasW, drawingCanvasH, drawBackground]);

  useEffect(() => {
    drawBackground();
  }, [drawBackground]);

  // ---------------------------------------------------------------------------
  // Efecto: pre-cachear todas las imágenes del proyecto
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!project) return;
    const all = Object.values(project.drawings);
    for (const d of all) {
      preloadImage(d.id, d.dataUrl);
    }
  }, [project?.drawings]);

  // ---------------------------------------------------------------------------
  // Efecto: cargar drawing activo + componer (en edit mode)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!project) return;
    // Componer siempre
    compositeAll();
    // Si estamos dibujando activamente, no recargar el drawing del store
    // (eso sobreescribiría lo que el usuario está pintando en el canvas).
    if (isDrawing) return;
    // En edición, también cargar el drawing activo
    if (viewMode !== "edit" || playback.playing) return;
    const layer = getCurrentLayer(project);
    if (!layer || layer.type === "audio") return;
    const cell = findCellAtFrame(layer.cells, project.currentFrame, layer.loopRange);
    const drawingId = cell?.drawingId ?? null;
    // IMPORTANTE: recargar también si cambió el dataUrl del drawing (por undo/redo),
    // no solo si cambió el drawingId. Usamos updatedAt como cache key confiable:
    // cambia con cada commit, undo y redo.
    const drawing = drawingId ? project.drawings[drawingId] : null;
    const updatedAt = drawing?.updatedAt ?? 0;
    const cacheKey = `${drawingId}:${updatedAt}`;
    if (cacheKey !== lastLoadedDrawingRef.current) {
      lastLoadedDrawingRef.current = cacheKey;
      engine.loadDrawingIntoCanvas(drawingId);
    }
  }, [
    project?.currentFrame,
    project?.currentLayerId,
    project?.drawings,
    project?.layers,
    viewMode,
    playback.playing,
    isDrawing,
    onion,
    compositeAll,
    engine,
    layerDrafts,
  ]);

  // Recomponer al cambiar el proyecto (cualquier cambio)
  useEffect(() => {
    compositeAll();
  }, [compositeAll]);

  // ---------------------------------------------------------------------------
  // Transform del contenedor
  // ---------------------------------------------------------------------------

  const transform = `translate(-50%, -50%) translate(${canvasView.panX}px, ${canvasView.panY}px) scale(${canvasView.zoom}) rotate(${canvasView.rotation}deg)`;

  // Determinar si hay que mostrar el cursor de pincel (círculo que sigue al mouse)
  // para herramientas de trazo. Si X está apretado, sigue mostrándose como goma.
  const showsBrushCursor =
    currentTool === "pencil" ||
    currentTool === "brush" ||
    currentTool === "ink" ||
    currentTool === "watercolor" ||
    currentTool === "eraser" ||
    xModifier;

  // Actualizar el tamaño/color del cursor de pincel cuando cambian las settings
  useEffect(() => {
    const el = brushCursorRef.current;
    if (!el) return;
    const size = Math.max(4, brush.size * canvasView.zoom);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderColor = xModifier ? "#ef4444" : brush.color === "#ffffff" ? "#000000" : brush.color;
  }, [brush.size, brush.color, canvasView.zoom, currentTool, xModifier]);

  // Listener global pointerup para resetear el estado interno "pointer down"
  // del canvas y volver a mostrar el cursor del pincel.
  useEffect(() => {
    const onUp = () => {
      isPointerDownRef.current = false;
      // Restaurar cursor del pincel al soltar
      const el = brushCursorRef.current;
      if (el && showsBrushCursor) {
        el.style.opacity = "0.8";
      }
    };
    // Listener global pointermove para actualizar posición del cursor
    // incluso durante el dibujo (los eventos los captura el div interno)
    const onMove = (e: PointerEvent) => {
      const el = brushCursorRef.current;
      if (!el || !showsBrushCursor) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      el.style.left = `${e.clientX - rect.left}px`;
      el.style.top = `${e.clientY - rect.top}px`;
      // Si está dibujando, normalmente ocultamos el cursor. PERO si Ctrl
      // está apretado (modo resize brush), lo mantenemos visible para
      // que el usuario vea cómo cambia el tamaño del trazo en tiempo real.
      if (isPointerDownRef.current && !e.ctrlKey && !e.metaKey) {
        el.style.opacity = "0";   // dibujando normal → ocultar
      } else if (isPointerDownRef.current && (e.ctrlKey || e.metaKey)) {
        el.style.opacity = "1";   // resize brush → bien visible
      } else {
        el.style.opacity = "0.8"; // hover normal
      }
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointermove", onMove);
    };
  }, [showsBrushCursor]);

  if (!project) return null;

  // Determinar el cursor a usar
  const baseCursor =
    currentTool === "pan"
      ? "grab"
      : currentTool === "eyedropper"
        ? "copy"
        : currentTool === "selection" || currentTool === "transform"
          ? "default"
          : "crosshair";

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-neutral-950"
      style={{
        cursor: showsBrushCursor ? "none" : baseCursor,
        touchAction: "none",
      }}
      onWheel={(e) => engine.handleWheel(e as unknown as WheelEvent)}
    >
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          transform,
          transformOrigin: "center center",
          width,
          height,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.2), 0 10px 30px rgba(0,0,0,0.5)",
          cursor: imagePlacement ? "move" : undefined,
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          isPointerDownRef.current = true;
          // Ocultar cursor del pincel inmediatamente al empezar a dibujar
          const el = brushCursorRef.current;
          if (el) el.style.opacity = "0";
          // Si hay un placement activo, interceptar el evento
          if (imagePlacement && handlePlacementPointerDown(e)) {
            e.stopPropagation();
            return;
          }
          engine.handlePointerDown(e);
        }}
        onPointerMove={(e) => {
          if (imagePlacement && handlePlacementPointerMove(e)) {
            e.stopPropagation();
            return;
          }
        }}
        onPointerUp={(e) => {
          if (imagePlacement && handlePlacementPointerUp(e)) {
            e.stopPropagation();
            return;
          }
        }}
      >
        <canvas
          ref={backgroundRef}
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
          style={{ width, height }}
        />
        {/* Composited (onion skin + capas no-activas en edit; todo en preview) */}
        {/* SIEMPRE visible: en edit mode queda DEBAJO del drawing canvas */}
        <canvas
          ref={compositedRef}
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
          style={{ width, height }}
        />
        {/* Drawing canvas (editable, solo en edit mode sin playback).
            Dimensiones = las del drawing activo (puede ser más grande que
            project.settings si el bitmap fue expandido al dibujar más allá
            de los límites moviendo la capa). */}
        <canvas
          ref={drawingCanvasRef}
          width={drawingCanvasW}
          height={drawingCanvasH}
          className="absolute inset-0 canvas-surface"
          style={{
            width: drawingCanvasW,
            height: drawingCanvasH,
            // Escondemos el drawingCanvas si estamos compositando (playback/
            // preview) O si la capa activa está oculta (eye toggle).
            visibility: isCompositing || !activeLayerVisible ? "hidden" : "visible",
            // Aplicamos el transform de la capa activa (keyframes + draft)
            // al drawingCanvas vía CSS. Esto mueve visualmente la capa a su
            // posición movida (igual que el composited aplica el transform
            // para las capas no-activas), y permite al usuario seguir
            // dibujando en la capa movida (los clicks se reverse-transforman
            // en el engine).
            transform: activeLayerCssTransform,
            transformOrigin: "50% 50%",
          }}
        />
        {/* Overlay (selección, primitivas preview) */}
        <canvas
          ref={overlayCanvasRef}
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
          style={{ width, height }}
        />
      </div>

      {/* Indicadores */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-background/80 px-2 py-1 rounded text-xs backdrop-blur">
        <span>{Math.round(canvasView.zoom * 100)}%</span>
        <span className="text-muted-foreground">|</span>
        <span>{width}×{height}</span>
        <button
          className="ml-2 px-2 py-0.5 rounded bg-muted hover:bg-muted-foreground/20"
          onClick={resetCanvasView}
        >
          Reiniciar
        </button>
      </div>

      {/* Cursor de pincel: círculo que sigue al mouse. Solo visible para
          herramientas de trazo (pencil, brush, ink, watercolor, eraser) o
          cuando X está apretado (modo goma temporal). */}
      {showsBrushCursor && (
        <div
          ref={brushCursorRef}
          className="pointer-events-none absolute rounded-full border-2 z-50"
          style={{
            transform: "translate(-50%, -50%)",
            left: "-100px",
            top: "-100px",
            opacity: 0,
            borderColor: xModifier ? "#ef4444" : brush.color === "#ffffff" ? "#000000" : brush.color,
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Botón interactivo (modo preview — sobre el composited)
// ---------------------------------------------------------------------------

function InteractiveButtonView({ buttonId }: { buttonId: string }) {
  const button = useStore((s) =>
    s.project?.buttons.find((b) => b.id === buttonId)
  );
  const project = useStore((s) => s.project);

  if (!button || !project) return null;

  const handleClick = () => {
    const handlers = button.handlers.filter((h) => h.event === "click");
    handlers.forEach((h) => {
      const ctx = {
        project,
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
      if (!evalCondition(h.condition, project.variables)) return;
      executeActions(h.actions, ctx);
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
    >
      {button.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dibujar onion skin en un contexto (síncrono con imágenes cacheadas)
// ---------------------------------------------------------------------------

function drawOnionIntoCanvas(
  ctx: CanvasRenderingContext2D,
  project: NonNullable<ReturnType<typeof useStore.getState>["project"]>,
  currentLayer: ReturnType<typeof getCurrentLayer>,
  onion: ReturnType<typeof useStore.getState>["onion"]
) {
  if (!currentLayer || !onion) return;
  const drawOne = (frame: number, opacity: number, color: string) => {
    const cell = findCellAtFrame(currentLayer.cells, frame);
    if (!cell || !cell.drawingId) return;
    const img = getCachedImage(cell.drawingId);
    if (!img || !img.complete) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
    // Tinte
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  };

  if (!onion.onlyPrevious) {
    for (let i = 1; i <= onion.prevFrames; i++) {
      const frame = project.currentFrame - i;
      if (frame < 0) break;
      const op = onion.prevOpacity * (1 - (i - 1) / onion.prevFrames);
      drawOne(frame, op, onion.prevColor);
    }
  } else {
    const frame = project.currentFrame - 1;
    if (frame >= 0) drawOne(frame, onion.prevOpacity, onion.prevColor);
  }

  if (!onion.onlyPrevious) {
    for (let i = 1; i <= onion.nextFrames; i++) {
      const frame = project.currentFrame + i;
      const op = onion.nextOpacity * (1 - (i - 1) / onion.nextFrames);
      drawOne(frame, op, onion.nextColor);
    }
  }
}
