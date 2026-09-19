"use client";

import React from "react";
import { useStore } from "@/lib/animation/store";
import { COMMON_FPS, RESOLUTIONS } from "@/lib/animation/defaults";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// Presets de color de fondo, incluyendo chroma key estándar
const BG_PRESETS: { color: string; label: string }[] = [
  { color: "#ffffff", label: "Blanco" },
  { color: "#000000", label: "Negro" },
  // Chroma key estándar de la industria
  { color: "#00b140", label: "Verde chroma key (#00b140)" },
  { color: "#004098", label: "Azul chroma key (#004098)" },
  { color: "#00ff00", label: "Verde puro (#00ff00)" },
  { color: "#0000ff", label: "Azul puro (#0000ff)" },
  { color: "#ff00ff", label: "Magenta (chroma alternativo)" },
];

export function PropertiesPanel() {
  const project = useStore((s) => s.project);
  const setProjectSettings = useStore((s) => s.setProjectSettings);
  const renameProject = useStore((s) => s.renameProject);
  const currentTool = useStore((s) => s.currentTool);
  const brush = useStore((s) => s.brush);

  if (!project) return null;

  const currentLayer = project.layers.find((l) => l.id === project.currentLayerId);
  const cell = currentLayer?.cells.find(
    (c) =>
      project.currentFrame >= c.startFrame &&
      project.currentFrame < c.startFrame + c.duration
  );
  const drawing = cell?.drawingId ? project.drawings[cell.drawingId] : null;

  return (
    <div className="flex flex-col gap-3 p-3 bg-card border-b border-border overflow-y-auto no-scrollbar h-full">
      {/* Propiedades del proyecto */}
      <Section title="Proyecto">
        <Field label="Nombre">
          <input
            type="text"
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-background border border-border rounded"
          />
        </Field>
        <Field label="Resolución">
          <select
            value={`${project.settings.width}x${project.settings.height}`}
            onChange={(e) => {
              const r = RESOLUTIONS.find((x) => `${x.width}x${x.height}` === e.target.value);
              if (r) {
                setProjectSettings({
                  width: r.width,
                  height: r.height,
                  aspectRatio: r.ratio,
                });
              }
            }}
            className="w-full px-1 py-1 text-xs bg-background border border-border rounded"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.label} value={`${r.width}x${r.height}`}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="FPS">
          <div className="flex gap-1">
            <select
              value={project.settings.fps}
              onChange={(e) => setProjectSettings({ fps: Number(e.target.value) })}
              className="flex-1 px-1 py-1 text-xs bg-background border border-border rounded"
            >
              {COMMON_FPS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={project.settings.fps}
              min={1}
              max={120}
              onChange={(e) => setProjectSettings({ fps: Number(e.target.value) })}
              className="w-16 px-1 py-1 text-xs bg-background border border-border rounded"
            />
          </div>
        </Field>
        <Field label="Color de fondo">
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={project.settings.bgColor}
              onChange={(e) => setProjectSettings({ bgColor: e.target.value })}
              className="w-8 h-8 rounded border border-border cursor-pointer"
            />
            <input
              type="text"
              value={project.settings.bgColor}
              onChange={(e) => setProjectSettings({ bgColor: e.target.value })}
              className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded font-mono"
            />
          </div>
          {/* Presets para chroma key y comunes */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {BG_PRESETS.map((p) => (
              <button
                key={p.color}
                title={p.label}
                onClick={() => setProjectSettings({ bgColor: p.color })}
                className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: p.color }}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Verde y azul: para chroma key (composición)
          </p>
        </Field>
      </Section>

      {/* Herramienta actual */}
      <Section title="Herramienta actual">
        <Field label="Activa">
          <span className="text-sm font-mono">{currentTool}</span>
        </Field>
        <Field label="Tamaño">
          <span className="text-sm font-mono">{brush.size}px</span>
        </Field>
        <Field label="Color">
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded border border-border"
              style={{ backgroundColor: brush.color }}
            />
            <span className="text-xs font-mono">{brush.color}</span>
          </div>
        </Field>
      </Section>

      {/* Capa actual */}
      {currentLayer && (
        <Section title="Capa actual">
          <Field label="Nombre">
            <span className="text-xs">{currentLayer.name}</span>
          </Field>
          <Field label="Tipo">
            <span className="text-xs font-mono">{currentLayer.type}</span>
          </Field>
          <Field label="Opacidad">
            <span className="text-xs font-mono">
              {Math.round(currentLayer.opacity * 100)}%
            </span>
          </Field>
        </Section>
      )}

      {/* Cuadro actual */}
      {cell && (
        <Section title="Cuadro actual">
          <Field label="Frame inicio">
            <span className="text-xs font-mono">{cell.startFrame + 1}</span>
          </Field>
          <Field label="Duración (exposición)">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() =>
                  useStore.getState().extendCell(currentLayer!.id, project.currentFrame, -1)
                }
              >
                <ChevronDown size={14} />
              </Button>
              <span className="text-xs font-mono">{cell.duration}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() =>
                  useStore.getState().extendCell(currentLayer!.id, project.currentFrame, 1)
                }
              >
                <ChevronUp size={14} />
              </Button>
            </div>
          </Field>
          <Field label="Drawing">
            <span className="text-xs">{drawing?.name ?? "(vacío)"}</span>
          </Field>
        </Section>
      )}

      {/* Marcadores */}
      {project.markers.length > 0 && (
        <Section title="Marcadores">
          <div className="space-y-1">
            {project.markers.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded"
                onClick={() => useStore.getState().gotoFrame(m.frame)}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <span className="flex-1">{m.label}</span>
                <span className="text-muted-foreground font-mono">F{m.frame + 1}</span>
                <button
                  className="text-destructive hover:bg-muted p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    useStore.getState().deleteMarker(m.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-md p-2 bg-background/30">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-muted-foreground shrink-0">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
