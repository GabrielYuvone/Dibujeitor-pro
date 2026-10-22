"use client";

import React, { useMemo, useRef, useEffect, useState } from "react";
import { useStore, getOrderedLayers } from "@/lib/animation/store";
import { findCellAtFrame, totalFrames, formatFrame, interpolateLayerTransform } from "@/lib/animation/utils";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Repeat,
  Plus,
  Copy,
  Trash2,
  Flag,
  Rewind,
  FastForward,
  PenLine,
  ImageIcon,
  Music,
  Square as SquareIcon,
  Layers as LayersIcon,
  Diamond,
  Move,
  RotateCcw,
} from "lucide-react";
import { genId } from "@/lib/animation/utils";

export function Timeline() {
  const project = useStore((s) => s.project);
  const playback = useStore((s) => s.playback);
  const togglePlay = useStore((s) => s.togglePlay);
  const setLooping = useStore((s) => s.setLooping);
  const setPlaybackFps = useStore((s) => s.setPlaybackFps);
  const gotoFrame = useStore((s) => s.gotoFrame);
  const nextFrame = useStore((s) => s.nextFrame);
  const prevFrame = useStore((s) => s.prevFrame);
  const ensureDrawing = useStore((s) => s.ensureDrawingForCell);
  const extendCell = useStore((s) => s.extendCell);
  const insertEmptyFrame = useStore((s) => s.insertEmptyFrame);
  const removeCell = useStore((s) => s.removeCell);
  const duplicateCell = useStore((s) => s.duplicateCell);
  const addLayer = useStore((s) => s.addLayer);
  const deleteLayer = useStore((s) => s.deleteLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const setLayerTransformAtFrame = useStore((s) => s.setLayerTransformAtFrame);
  const removeLayerTransformKeyframe = useStore((s) => s.removeLayerTransformKeyframe);
  const clearLayerTransformKeyframes = useStore((s) => s.clearLayerTransformKeyframes);
  const addMarker = useStore((s) => s.addMarker);
  const deleteMarker = useStore((s) => s.deleteMarker);

  const timelineRef = useRef<HTMLDivElement | null>(null);
  const frameWidth = 24; // ancho de cada celda en px
  const layerHeight = 36;
  // Ref para el menú desplegable "agregar capa" (click fuera cierra)
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  // Total de frames (extensible)
  const total = useMemo(() => {
    if (!project) return 1;
    return Math.max(totalFrames(project.layers), 60, project.currentFrame + 30);
  }, [project]);

  // Auto-scroll al frame actual
  useEffect(() => {
    if (!timelineRef.current || !project) return;
    const container = timelineRef.current;
    const left = project.currentFrame * frameWidth;
    if (left < container.scrollLeft || left > container.scrollLeft + container.clientWidth - 100) {
      container.scrollLeft = left - container.clientWidth / 2;
    }
  }, [project?.currentFrame, frameWidth]);

  if (!project) return null;

  const orderedLayers = getOrderedLayers(project);
  const fps = project.settings.fps;
  const durationSec = total / fps;

  const handleAddFrame = async () => {
    if (!project.currentLayerId) return;
    // Siempre agregar DESPUÉS del último frame existente (no en el frame
    // actual+1). Si el playhead está en el medio, no queremos interrumpir
    // la animación — el nuevo frame va al final de la línea de tiempo.
    const nextFrameIdx = totalFrames(project.layers);
    await ensureDrawing(project.currentLayerId, nextFrameIdx);
    gotoFrame(nextFrameIdx);
  };

  const handleDuplicateFrame = () => {
    if (!project.currentLayerId) return;
    const layer = project.layers.find((l) => l.id === project.currentLayerId);
    if (!layer) return;
    const cell = layer.cells.find(
      (c) =>
        project.currentFrame >= c.startFrame &&
        project.currentFrame < c.startFrame + c.duration
    );
    if (cell) {
      duplicateCell(project.currentLayerId, cell.id);
    }
  };

  const handleDeleteFrame = () => {
    if (!project.currentLayerId) return;
    const layer = project.layers.find((l) => l.id === project.currentLayerId);
    if (!layer) return;
    const cell = layer.cells.find(
      (c) =>
        project.currentFrame >= c.startFrame &&
        project.currentFrame < c.startFrame + c.duration
    );
    if (cell && layer.cells.length > 1) {
      removeCell(project.currentLayerId, cell.id);
    }
  };

  const handleAddMarker = () => {
    addMarker(
      project.currentFrame,
      `Marcador ${project.markers.length + 1}`,
      ["#f1c40f", "#e74c3c", "#2ecc71", "#3498db"][project.markers.length % 4]
    );
  };

  return (
    <div className="flex flex-col h-full bg-card border-t border-border">
      {/* Barra superior: controles de reproducción */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => gotoFrame(0)} title="Ir al inicio">
            <SkipBack size={14} />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={prevFrame} title="Anterior (←)">
            <ChevronLeft size={14} />
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-7 w-7 p-0"
            onClick={togglePlay}
            title="Reproducir/Pausar (Espacio)"
          >
            {playback.playing ? <Pause size={14} /> : <Play size={14} />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={nextFrame} title="Siguiente (→)">
            <ChevronRight size={14} />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => gotoFrame(total - 1)} title="Ir al final">
            <SkipForward size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 w-7 p-0 ${playback.looping ? "bg-primary/20" : ""}`}
            onClick={() => setLooping(!playback.looping)}
            title="Bucle"
          >
            <Repeat size={14} />
          </Button>
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleAddFrame} title="Nuevo cuadro (N)">
            <Plus size={14} /> Nuevo
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleDuplicateFrame} title="Duplicar (D)">
            <Copy size={14} /> Duplicar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleDeleteFrame} title="Eliminar cuadro">
            <Trash2 size={14} /> Borrar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => insertEmptyFrame(project.currentLayerId!, project.currentFrame)} title="Insertar vacío">
            <Plus size={14} /> Vacío
          </Button>
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Sección Capas: agregar / duplicar / borrar */}
        <div className="flex items-center gap-1 relative">
          {/* Botón principal con menú desplegable: click = agregar capa de dibujo,
              click en la flecha = abrir menú con otros tipos */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            title="Nueva capa de dibujo (clic en la flecha para otros tipos)"
            onClick={() => addLayer("draw")}
          >
            <LayersIcon size={14} /> Capa
          </Button>
          <button
            className="px-1 h-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded text-xs"
            title="Otros tipos de capa"
            onClick={(e) => {
              e.stopPropagation();
              setShowLayerMenu((v) => !v);
            }}
          >
            <ChevronDown size={12} />
          </button>
          {showLayerMenu && (
            <>
              {/* Overlay para cerrar al hacer clic fuera */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowLayerMenu(false)}
              />
              <div className="absolute top-8 left-0 z-50 bg-background border border-border rounded shadow-lg py-1 min-w-[160px]">
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted text-left"
                  onClick={() => { addLayer("draw"); setShowLayerMenu(false); }}
                >
                  <PenLine size={12} /> Capa de dibujo
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted text-left"
                  onClick={() => { addLayer("reference"); setShowLayerMenu(false); }}
                >
                  <ImageIcon size={12} /> Capa de referencia
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted text-left"
                  onClick={() => { addLayer("background"); setShowLayerMenu(false); }}
                >
                  <SquareIcon size={12} /> Capa de fondo
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted text-left"
                  onClick={() => { addLayer("audio"); setShowLayerMenu(false); }}
                >
                  <Music size={12} /> Capa de audio
                </button>
              </div>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Duplicar capa actual"
            disabled={!project.currentLayerId}
            onClick={() => project.currentLayerId && duplicateLayer(project.currentLayerId)}
          >
            <Copy size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            title="Borrar capa actual"
            disabled={!project.currentLayerId || project.layers.length <= 1}
            onClick={() => project.currentLayerId && deleteLayer(project.currentLayerId)}
          >
            <Trash2 size={14} />
          </Button>
          {/* Separador */}
          <div className="h-5 w-px bg-border mx-1" />
          {/* Keyframe de transformación: captura la transformación actual
              de la capa (offset/scale/rotation interpolados) en el frame
              actual. Si ya existe un kf en este frame, lo actualiza. */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            title="Agregar keyframe de transform en el frame actual (mover/escalar/rotar capa)"
            disabled={!project.currentLayerId}
            onClick={() => {
              if (!project.currentLayerId) return;
              const layer = project.layers.find((l) => l.id === project.currentLayerId);
              if (!layer) return;
              const t = interpolateLayerTransform(layer, project.currentFrame);
              setLayerTransformAtFrame(project.currentLayerId, project.currentFrame, t);
            }}
          >
            <Diamond size={12} /> Keyframe
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Quitar keyframe en el frame actual"
            disabled={!project.currentLayerId}
            onClick={() => {
              if (!project.currentLayerId) return;
              removeLayerTransformKeyframe(project.currentLayerId, project.currentFrame);
            }}
          >
            <Diamond size={12} className="opacity-30" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Limpiar todos los keyframes de transform de la capa actual"
            disabled={!project.currentLayerId}
            onClick={() => {
              if (!project.currentLayerId) return;
              clearLayerTransformKeyframes(project.currentLayerId);
            }}
          >
            <RotateCcw size={12} />
          </Button>
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-2 text-xs">
          <label className="text-muted-foreground">Velocidad:</label>
          <select
            value={playback.playbackFps}
            onChange={(e) => setPlaybackFps(Number(e.target.value))}
            className="bg-background border border-border rounded px-1 py-0.5 text-xs"
          >
            <option value={1}>1 FPS</option>
            <option value={2}>2 FPS</option>
            <option value={3}>3 FPS</option>
            <option value={6}>6 FPS</option>
            <option value={12}>12 FPS</option>
            <option value={24}>24 FPS</option>
            <option value={30}>30 FPS</option>
            <option value={60}>60 FPS</option>
          </select>
          {/* Input numérico para FPS personalizado */}
          <input
            type="number"
            min={1}
            max={120}
            value={playback.playbackFps}
            onChange={(e) => {
              const f = Number(e.target.value);
              if (!Number.isNaN(f) && f > 0) setPlaybackFps(f);
            }}
            className="w-12 px-1 py-0.5 bg-background border border-border rounded text-xs"
            title="FPS personalizado"
          />
          <span className="text-muted-foreground">FPS</span>
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Frame:</span>
          <span className="font-mono font-semibold">{project.currentFrame + 1}</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono">{total}</span>
          <span className="text-muted-foreground ml-2">FPS:</span>
          <span className="font-mono font-semibold">{fps}</span>
          <span className="text-muted-foreground ml-2">Dur:</span>
          <span className="font-mono">{durationSec.toFixed(2)}s</span>
        </div>
      </div>

      {/* Cabecera de timeline */}
      <div className="flex border-b border-border">
        <div className="w-48 shrink-0 border-r border-border bg-muted/30 flex items-center justify-between px-2 py-1">
          <span className="text-xs font-semibold">Capas</span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleAddMarker} title="Agregar marcador">
            <Flag size={12} /> Marcador
          </Button>
        </div>
        <div className="flex-1 overflow-x-auto no-scrollbar relative">
          <div className="flex h-7" style={{ width: total * frameWidth }}>
            {Array.from({ length: total }).map((_, i) => {
              const isCurrent = i === project.currentFrame;
              const isMarker = project.markers.find((m) => m.frame === i);
              return (
                <button
                  key={i}
                  className={`timeline-cell shrink-0 border-r border-border text-[10px] flex items-center justify-center font-mono relative ${
                    isCurrent ? "bg-primary/30 text-primary-foreground font-bold" : "bg-muted/30"
                  }`}
                  style={{ width: frameWidth }}
                  onClick={() => gotoFrame(i)}
                >
                  {(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}
                  {isMarker && (
                    <span
                      className="absolute top-0 right-0 w-2 h-2 rounded-bl-sm"
                      style={{ backgroundColor: isMarker.color }}
                      title={isMarker.label}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cuerpo del timeline */}
      <div ref={timelineRef} className="flex-1 overflow-auto no-scrollbar">
        <div className="flex">
          {/* Lista de capas */}
          <div className="w-48 shrink-0 border-r border-border">
            {orderedLayers.map((layer) => (
              <div
                key={layer.id}
                className={`flex items-center px-2 border-b border-border text-xs ${
                  project.currentLayerId === layer.id ? "bg-primary/20" : ""
                }`}
                style={{ height: layerHeight }}
                onClick={() => useStore.getState().selectLayer(layer.id)}
              >
                <span className="truncate flex-1">{layer.name}</span>
                {!layer.visible && <span className="text-muted-foreground ml-1">○</span>}
                {layer.locked && <span className="text-muted-foreground ml-1">🔒</span>}
              </div>
            ))}
          </div>

          {/* Celdas */}
          <div className="flex-1 relative" style={{ width: total * frameWidth }}>
            {orderedLayers.map((layer, layerIdx) => (
              <div
                key={layer.id}
                className={`relative border-b border-border ${
                  layer.type === "audio" ? "bg-purple-500/5" : ""
                }`}
                style={{ height: layerHeight, width: total * frameWidth }}
              >
                {/* Celdas de la capa */}
                {layer.cells.map((cell) => {
                  const left = cell.startFrame * frameWidth;
                  const width = cell.duration * frameWidth;
                  const isCurrent =
                    project.currentFrame >= cell.startFrame &&
                    project.currentFrame < cell.startFrame + cell.duration;
                  const drawing = cell.drawingId ? project.drawings[cell.drawingId] : null;
                  return (
                    <div
                      key={cell.id}
                      className={`absolute top-1 bottom-1 rounded-sm border flex items-center px-1 overflow-hidden cursor-grab active:cursor-grabbing ${
                        isCurrent
                          ? "border-primary ring-1 ring-primary"
                          : "border-border"
                      } ${layer.type === "audio" ? "bg-purple-500/20" : "bg-blue-500/20"}`}
                      style={{
                        left,
                        width: Math.max(width - 2, 12),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        useStore.getState().selectLayer(layer.id);
                        gotoFrame(cell.startFrame);
                      }}
                      onPointerDown={(e) => {
                        // Arrastrar el cell desde el cuerpo para moverlo
                        // a otra posición del timeline. El resize handle
                        // del borde derecho tiene su propio onPointerDown
                        // que frena la propagación (e.stopPropagation()).
                        if (e.ctrlKey || e.metaKey) return;
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startCellStart = cell.startFrame;
                        const cellId = cell.id;
                        const layerId = layer.id;
                        let moved = false;
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);
                        const onMove = (ev: PointerEvent) => {
                          const dx = ev.clientX - startX;
                          if (Math.abs(dx) < 4 && !moved) return;
                          moved = true;
                          const framesDelta = Math.round(dx / frameWidth);
                          const newStart = Math.max(0, startCellStart + framesDelta);
                          useStore.getState().moveCell(layerId, cellId, newStart);
                        };
                        const onUp = () => {
                          window.removeEventListener("pointermove", onMove);
                          window.removeEventListener("pointerup", onUp);
                        };
                        window.addEventListener("pointermove", onMove);
                        window.addEventListener("pointerup", onUp);
                      }}
                    >
                      {drawing?.thumbnail ? (
                        <img
                          src={drawing.thumbnail}
                          alt=""
                          className="h-full w-auto object-contain opacity-80"
                        />
                      ) : drawing ? (
                        <img
                          src={drawing.dataUrl}
                          alt=""
                          className="h-full w-auto object-contain opacity-80"
                          style={{ maxWidth: 30 }}
                        />
                      ) : null}
                      <span className="ml-1 text-[10px] truncate flex-1">
                        {cell.label || (drawing?.name ?? (cell.drawingId ? "" : "(vacío)"))}
                      </span>
                      {/* Handle de resize en el borde derecho de la celda */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/40"
                        title="Arrastrá para cambiar la duración (exposición)"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const startX = e.clientX;
                          const startDuration = cell.duration;
                          const cellId = cell.id;
                          const layerId = layer.id;
                          (e.target as HTMLElement).setPointerCapture(e.pointerId);

                          const onMove = (ev: PointerEvent) => {
                            const dx = ev.clientX - startX;
                            const framesDelta = Math.round(dx / frameWidth);
                            const newDuration = Math.max(1, startDuration + framesDelta);
                            useStore.getState().setCellDuration(layerId, cellId, newDuration);
                          };
                          const onUp = () => {
                            window.removeEventListener("pointermove", onMove);
                            window.removeEventListener("pointerup", onUp);
                          };
                          window.addEventListener("pointermove", onMove);
                          window.addEventListener("pointerup", onUp);
                        }}
                      />
                    </div>
                  );
                })}

                {/* Indicador de audio */}
                {layer.type === "audio" && layer.audioClipId && (
                  <div className="absolute top-1 bottom-1 bg-purple-500/40 border border-purple-500 rounded-sm overflow-hidden">
                    <AudioWaveform clipId={layer.audioClipId} />
                  </div>
                )}

                {/* Keyframes de transformación: diamantes amarillos en la
                    parte superior de la fila. Click = ir al frame, click con
                    Shift = borrar el keyframe. */}
                {(layer.transformKeyframes ?? []).map((kf) => {
                  const left = kf.frame * frameWidth;
                  const isCurrent = kf.frame === project.currentFrame;
                  return (
                    <button
                      key={`kf-${kf.frame}`}
                      className="absolute top-0 z-10 flex items-center justify-center"
                      style={{ left: left - 6, width: 14, height: 14 }}
                      title={`KF frame ${kf.frame + 1}: offset(${Math.round(kf.offsetX)}, ${Math.round(kf.offsetY)}) scale(${kf.scale.toFixed(2)}) rot(${kf.rotation.toFixed(0)}°)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.shiftKey) {
                          removeLayerTransformKeyframe(layer.id, kf.frame);
                        } else {
                          gotoFrame(kf.frame);
                        }
                      }}
                    >
                      <Diamond
                        size={10}
                        className={
                          isCurrent
                            ? "fill-amber-500 text-amber-500"
                            : "fill-amber-300/80 text-amber-500"
                        }
                      />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indicador de frame actual (línea roja) — se dibuja como overlay */}
    </div>
  );
}

function AudioWaveform({ clipId }: { clipId: string }) {
  const clip = useStore((s) => (s.project?.audioClips ?? {})[clipId]);
  if (!clip?.waveform) return null;
  return (
    <div className="h-full flex items-center gap-0 px-1">
      {clip.waveform.slice(0, 200).map((v, i) => (
        <div
          key={i}
          className="bg-purple-400 mx-px"
          style={{
            width: 1,
            height: `${Math.max(2, v * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}
