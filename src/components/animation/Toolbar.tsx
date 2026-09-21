"use client";

import React from "react";
import { useStore } from "@/lib/animation/store";
import { DEFAULT_BRUSH, PALETTE_COLORS } from "@/lib/animation/defaults";
import type { ToolId } from "@/lib/animation/types";
import {
  Pencil,
  Brush,
  Pen,
  Droplets,
  Eraser,
  Slash,
  Square,
  Circle,
  PaintBucket,
  MousePointer2,
  Move,
  Hand,
  ZoomIn,
  Pipette,
  Undo2,
  Redo2,
} from "lucide-react";

interface ToolDef {
  id: ToolId;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { id: "pencil", label: "Lápiz", icon: <Pencil size={16} />, shortcut: "P" },
  { id: "brush", label: "Pincel", icon: <Brush size={16} />, shortcut: "B" },
  { id: "ink", label: "Pluma tinta", icon: <Pen size={16} />, shortcut: "K" },
  { id: "watercolor", label: "Acuarela", icon: <Droplets size={16} />, shortcut: "W" },
  { id: "eraser", label: "Goma", icon: <Eraser size={16} />, shortcut: "E" },
  { id: "line", label: "Línea", icon: <Slash size={16} />, shortcut: "L" },
  { id: "rectangle", label: "Rectángulo", icon: <Square size={16} />, shortcut: "R" },
  { id: "ellipse", label: "Elipse", icon: <Circle size={16} />, shortcut: "O" },
  { id: "fill", label: "Relleno", icon: <PaintBucket size={16} />, shortcut: "G" },
  { id: "selection", label: "Selección", icon: <MousePointer2 size={16} />, shortcut: "V" },
  { id: "transform", label: "Transformar", icon: <Move size={16} />, shortcut: "T" },
  { id: "eyedropper", label: "Cuentagotas", icon: <Pipette size={16} />, shortcut: "I" },
  { id: "pan", label: "Mover lienzo", icon: <Hand size={16} />, shortcut: "H" },
  { id: "zoom", label: "Zoom", icon: <ZoomIn size={16} />, shortcut: "Z" },
];

export function Toolbar() {
  const currentTool = useStore((s) => s.currentTool);
  const setTool = useStore((s) => s.setTool);
  const brush = useStore((s) => s.brush);
  const setBrush = useStore((s) => s.setBrush);
  const project = useStore((s) => s.project);
  const saveCustomPalette = useStore((s) => s.saveCustomPalette);
  const loadCustomPalette = useStore((s) => s.loadCustomPalette);
  const customPalette = useStore((s) => s.customPalette);

  if (!project) return null;

  return (
    <div className="flex flex-col gap-3 p-2 bg-card border-r border-border h-full overflow-y-auto no-scrollbar">
      {/* Herramientas */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Herramientas
        </div>
        <div className="grid grid-cols-3 gap-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              title={`${tool.label} (${tool.shortcut})`}
              onClick={() => setTool(tool.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-md text-[10px] transition-colors ${
                currentTool === tool.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 hover:bg-muted text-foreground"
              }`}
            >
              {tool.icon}
              <span className="mt-1">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color actual */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Color
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="color"
            value={brush.color}
            onChange={(e) => setBrush({ color: e.target.value })}
            className="w-10 h-10 rounded border border-border cursor-pointer"
          />
          <div className="flex-1">
            <input
              type="text"
              value={brush.color}
              onChange={(e) => setBrush({ color: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-background border border-border rounded font-mono"
            />
          </div>
        </div>
        {/* Paleta */}
        <div className="grid grid-cols-6 gap-1">
          {PALETTE_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setBrush({ color })}
              title={color}
              className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        {/* Paleta personalizada guardada por el usuario */}
        {customPalette.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Paleta guardada</div>
            <div className="grid grid-cols-6 gap-1">
              {customPalette.map((color, i) => (
                <button
                  key={`${color}-${i}`}
                  onClick={() => setBrush({ color })}
                  title={color}
                  className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
        {/* Botones para guardar/cargar la paleta personalizada */}
        <div className="flex gap-1 mt-2">
          <button
            className="flex-1 px-2 py-1 text-[10px] bg-muted hover:bg-muted-foreground/20 rounded"
            onClick={() => {
              // Guardar el color actual como parte de la paleta personalizada (máx 30)
              const next = [...customPalette];
              if (!next.includes(brush.color)) next.push(brush.color);
              saveCustomPalette(next.slice(-30));
            }}
            title="Guardar el color actual en la paleta personalizada (persiste en localStorage)"
          >
            Guardar paleta
          </button>
          <button
            className="flex-1 px-2 py-1 text-[10px] bg-muted hover:bg-muted-foreground/20 rounded"
            onClick={() => loadCustomPalette()}
            title="Recargar la paleta personalizada desde localStorage"
          >
            Cargar paleta
          </button>
        </div>
      </div>

      {/* Tolerancia de relleno (solo relevante para el bote de tinta) */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex justify-between">
          <span>Tolerancia relleno</span>
          <span className="text-foreground">{Math.round(brush.fillTolerance)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={brush.fillTolerance}
          onChange={(e) => setBrush({ fillTolerance: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Tamaño del pincel */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex justify-between">
          <span>Tamaño</span>
          <span className="text-foreground">{brush.size.toFixed(1)}px</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={100}
          step={0.5}
          value={brush.size}
          onChange={(e) => setBrush({ size: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Opacidad */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex justify-between">
          <span>Opacidad</span>
          <span className="text-foreground">{Math.round(brush.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.01}
          value={brush.opacity}
          onChange={(e) => setBrush({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Dureza */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex justify-between">
          <span>Dureza</span>
          <span className="text-foreground">{Math.round(brush.hardness * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={brush.hardness}
          onChange={(e) => setBrush({ hardness: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Suavizado */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex justify-between">
          <span>Estabilización</span>
          <span className="text-foreground">{Math.round(brush.smoothing * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={brush.smoothing}
          onChange={(e) => setBrush({ smoothing: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Sensibilidad a presión */}
      <div className="flex items-center justify-between text-xs">
        <label htmlFor="pressure">Sensibilidad a presión</label>
        <input
          id="pressure"
          type="checkbox"
          checked={brush.pressureSensitivity}
          onChange={(e) => setBrush({ pressureSensitivity: e.target.checked })}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <label htmlFor="eraser-mode">Goma suave</label>
        <input
          id="eraser-mode"
          type="checkbox"
          checked={brush.eraserMode === "soft"}
          onChange={(e) => setBrush({ eraserMode: e.target.checked ? "soft" : "solid" })}
        />
      </div>

      {/* Reset */}
      <button
        className="mt-2 px-2 py-1 text-xs bg-muted hover:bg-muted-foreground/20 rounded"
        onClick={() => setBrush({ ...DEFAULT_BRUSH, color: brush.color, size: brush.size })}
      >
        Restablecer pincel
      </button>
    </div>
  );
}
