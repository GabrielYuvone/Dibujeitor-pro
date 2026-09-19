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
} from "lucide-react";
import type { LayerType } from "@/lib/animation/types";

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
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Nueva capa de dibujo"
            onClick={() => addLayer("draw")}
          >
            <Plus size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Nueva capa de referencia"
            onClick={() => addLayer("reference")}
          >
            <ImageIcon size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Nueva capa de fondo"
            onClick={() => addLayer("background")}
          >
            <SquareIcon size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Nueva capa de audio"
            onClick={() => addLayer("audio")}
          >
            <Music size={14} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {orderedLayers.map((layer) => (
          <div
            key={layer.id}
            className={`flex items-center gap-1 p-2 border-b border-border text-xs cursor-pointer hover:bg-muted/50 ${
              project.currentLayerId === layer.id ? "bg-primary/20" : ""
            }`}
            onClick={() => selectLayer(layer.id)}
          >
            <button
              className="p-1 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                toggleLayerVisible(layer.id);
              }}
              title={layer.visible ? "Ocultar" : "Mostrar"}
            >
              {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button
              className="p-1 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                toggleLayerLocked(layer.id);
              }}
              title={layer.locked ? "Desbloquear" : "Bloquear"}
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
                className="p-1 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  moveLayer(layer.id, "up");
                }}
                title="Subir"
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="p-1 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  moveLayer(layer.id, "down");
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
