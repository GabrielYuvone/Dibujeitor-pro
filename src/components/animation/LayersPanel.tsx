"use client";

import React from "react";
import { useStore, getOrderedLayers } from "@/lib/animation/store";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Plus,
  PenLine,
  ImageIcon,
  Music,
  Layers as LayersIcon,
  Square as SquareIcon,
  Repeat,
  ChevronRight,
} from "lucide-react";
import type { LayerType } from "@/lib/animation/types";
import { useState } from "react";

export function LayersPanel() {
  const project = useStore((s) => s.project);
  const addLayer = useStore((s) => s.addLayer);
  const deleteLayer = useStore((s) => s.deleteLayer);
  const selectLayer = useStore((s) => s.selectLayer);
  const renameLayer = useStore((s) => s.renameLayer);
  const toggleLayerVisible = useStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useStore((s) => s.toggleLayerLocked);
  const setLayerOpacity = useStore((s) => s.setLayerOpacity);
  const moveLayer = useStore((s) => s.moveLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const setLayerLoop = useStore((s) => s.setLayerLoop);
  const [expandedLoop, setExpandedLoop] = useState<string | null>(null);

  if (!project) return null;

  const orderedLayers = getOrderedLayers(project);

  const layerIcon = (type: LayerType) => {
    switch (type) {
      case "draw":
        return <PenLine size={14} />;
      case "reference":
        return <ImageIcon size={14} />;
      case "background":
        return <SquareIcon size={14} />;
      case "audio":
        return <Music size={14} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <div className="flex items-center justify-between p-2 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <LayersIcon size={16} /> Capas
        </h3>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="default"
            className="h-7 px-2 text-xs"
            title="Nueva capa de dibujo"
            onClick={() => addLayer("draw")}
          >
            <Plus size={12} /> Capa
          </Button>
        </div>
      </div>

      {/* Fila de botones para tipos específicos de capa */}
      <div className="grid grid-cols-3 gap-1 p-1.5 border-b border-border bg-muted/20">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px]"
          title="Nueva capa de referencia"
          onClick={() => addLayer("reference")}
        >
          <ImageIcon size={11} className="mr-1" /> Ref.
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px]"
          title="Nueva capa de fondo"
          onClick={() => addLayer("background")}
        >
          <SquareIcon size={11} className="mr-1" /> Fondo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px]"
          title="Nueva capa de audio"
          onClick={() => addLayer("audio")}
        >
          <Music size={11} className="mr-1" /> Audio
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {orderedLayers.map((layer) => (
          <div
            key={layer.id}
            className={`border-b border-border text-xs cursor-pointer hover:bg-muted/50 ${
              project.currentLayerId === layer.id ? "bg-primary/20" : ""
            }`}
            onClick={() => selectLayer(layer.id)}
          >
            <div className="flex items-center gap-1 p-2">
            <button
              className={`p-1.5 rounded transition-colors ${
                layer.visible
                  ? "hover:bg-muted text-foreground"
                  : "bg-destructive/20 text-destructive hover:bg-destructive/30"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                toggleLayerVisible(layer.id);
              }}
              title={layer.visible ? "Ocultar capa (click para ocultar)" : "Mostrar capa (click para mostrar)"}
            >
              {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button
              className={`p-1.5 rounded transition-colors ${
                layer.locked
                  ? "bg-amber-500/30 text-amber-500 hover:bg-amber-500/40"
                  : "hover:bg-muted text-muted-foreground"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                toggleLayerLocked(layer.id);
              }}
              title={layer.locked ? "Desbloquear capa (click para desbloquear)" : "Bloquear capa (click para bloquear)"}
            >
              {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <span className="text-muted-foreground">{layerIcon(layer.type)}</span>
            <input
              className="flex-1 bg-transparent outline-none text-xs min-w-0"
              value={layer.name}
              onChange={(e) => renameLayer(layer.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex items-center gap-1">
              <button
                className={`p-1 rounded transition-colors ${
                  layer.loopRange
                    ? "bg-primary/30 text-primary hover:bg-primary/40"
                    : "hover:bg-muted text-muted-foreground"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedLoop(expandedLoop === layer.id ? null : layer.id);
                }}
                title="Configurar bucle de la capa"
              >
                <Repeat size={14} />
              </button>
              <button
                className="p-1 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  // NOTA: el display está invertido (getOrderedLayers hace reverse)
                  // Por eso "Subir" en la UI corresponde a "down" en el store
                  moveLayer(layer.id, "down");
                }}
                title="Subir"
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="p-1 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  moveLayer(layer.id, "up");
                }}
                title="Bajar"
              >
                <ChevronDown size={14} />
              </button>
              <button
                className="p-1 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateLayer(layer.id);
                }}
                title="Duplicar"
              >
                <Copy size={14} />
              </button>
              <button
                className="p-1 rounded hover:bg-muted text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteLayer(layer.id);
                }}
                title="Eliminar"
                disabled={project.layers.length <= 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
            </div>
            {/* Panel expandible para configurar el bucle de la capa */}
            {expandedLoop === layer.id && (
              <div className="flex items-center gap-2 p-2 border-t border-border bg-muted/20 text-xs">
                <ChevronRight size={12} className="text-muted-foreground" />
                <label className="text-muted-foreground">Inicio</label>
                <input
                  type="number"
                  min={0}
                  value={layer.loopRange?.start ?? 0}
                  onChange={(e) => {
                    const start = Number(e.target.value) || 0;
                    const cur = layer.loopRange ?? { start: 0, end: 1, count: 0 };
                    setLayerLoop(layer.id, { ...cur, start });
                  }}
                  className="w-12 px-1 py-0.5 bg-background border border-border rounded"
                />
                <label className="text-muted-foreground">Fin</label>
                <input
                  type="number"
                  min={0}
                  value={layer.loopRange?.end ?? 1}
                  onChange={(e) => {
                    const end = Number(e.target.value) || 1;
                    const cur = layer.loopRange ?? { start: 0, end: 1, count: 0 };
                    setLayerLoop(layer.id, { ...cur, end });
                  }}
                  className="w-12 px-1 py-0.5 bg-background border border-border rounded"
                />
                <label className="text-muted-foreground">#veces</label>
                <input
                  type="number"
                  min={0}
                  value={layer.loopRange?.count ?? 0}
                  onChange={(e) => {
                    const count = Math.max(0, Number(e.target.value) || 0);
                    const cur = layer.loopRange ?? { start: 0, end: 1, count: 0 };
                    setLayerLoop(layer.id, { ...cur, count });
                  }}
                  className="w-12 px-1 py-0.5 bg-background border border-border rounded"
                  title="0 = infinito"
                />
                <button
                  className="ml-auto px-2 py-0.5 bg-destructive/20 text-destructive hover:bg-destructive/30 rounded text-[10px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLayerLoop(layer.id, null);
                    setExpandedLoop(null);
                  }}
                  title="Quitar bucle"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Opacidad de capa actual */}
      {project.currentLayerId && (
        <div className="p-2 border-t border-border">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
            Opacidad de capa
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={project.layers.find((l) => l.id === project.currentLayerId)?.opacity ?? 1}
              onChange={(e) =>
                setLayerOpacity(project.currentLayerId!, Number(e.target.value))
              }
              className="flex-1"
            />
            <span className="text-xs w-10 text-right">
              {Math.round(
                (project.layers.find((l) => l.id === project.currentLayerId)?.opacity ?? 1) * 100
              )}
              %
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
