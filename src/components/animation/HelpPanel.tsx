"use client";

import React from "react";
import { useStore } from "@/lib/animation/store";
import {
  Pencil,
  Brush,
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
  Pen,
  Droplets,
  Keyboard,
  Info,
  Lightbulb,
} from "lucide-react";

interface ShortcutDef {
  keys: string;
  description: string;
  category: "Herramientas" | "Navegación" | "Edición" | "Vista" | "Reproducción";
}

const SHORTCUTS: ShortcutDef[] = [
  // Herramientas
  { keys: "P", description: "Lápiz (textura de grafito)", category: "Herramientas" },
  { keys: "B", description: "Pincel (trazo suave)", category: "Herramientas" },
  { keys: "K", description: "Pluma de tinta (flujo irregular)", category: "Herramientas" },
  { keys: "W", description: "Acuarela (trazo translúcido acumulativo)", category: "Herramientas" },
  { keys: "E", description: "Goma de borrar", category: "Herramientas" },
  { keys: "L", description: "Línea recta", category: "Herramientas" },
  { keys: "R", description: "Rectángulo", category: "Herramientas" },
  { keys: "O", description: "Elipse", category: "Herramientas" },
  { keys: "G", description: "Relleno (bote de tinta)", category: "Herramientas" },
  { keys: "V", description: "Selección rectangular", category: "Herramientas" },
  { keys: "T", description: "Transformar", category: "Herramientas" },
  { keys: "I", description: "Cuentagotas (sampler color)", category: "Herramientas" },
  { keys: "H", description: "Mover lienzo (pan)", category: "Herramientas" },

  // Navegación
  { keys: "→", description: "Avanzar un cuadro", category: "Navegación" },
  { keys: "←", description: "Retroceder un cuadro", category: "Navegación" },
  { keys: "N", description: "Crear nuevo cuadro vacío", category: "Navegación" },
  { keys: "D", description: "Duplicar cuadro actual", category: "Navegación" },

  // Edición
  { keys: "Ctrl+Z", description: "Deshacer (multinivel)", category: "Edición" },
  { keys: "Ctrl+Y", description: "Rehacer (multinivel)", category: "Edición" },
  { keys: "Ctrl+Shift+Z", description: "Rehacer (alternativa)", category: "Edición" },
  { keys: "Ctrl+S", description: "Guardar proyecto", category: "Edición" },
  { keys: "Ctrl+V", description: "Pegar selección (después de cortar)", category: "Edición" },
  { keys: "Delete", description: "Limpiar selección", category: "Edición" },
  { keys: "Escape", description: "Cancelar selección", category: "Edición" },

  // Vista
  { keys: "F1", description: "Lienzo a pantalla completa (toggle) — se puede seguir dibujando", category: "Vista" },
  { keys: "Z (mantener)", description: "Modo zoom temporal: arrastrá arriba/abajo o usá la rueda", category: "Vista" },
  { keys: "X (mantener)", description: "Modo goma temporal: convertí cualquier trazo en borrado", category: "Vista" },
  { keys: "C (mantener)", description: "Modo pan temporal: arrastrá el lienzo", category: "Vista" },
  { keys: "Ctrl (mantener)", description: "Modo resize brush: arrastrá arriba/abajo para cambiar tamaño", category: "Vista" },
  { keys: "Rueda mouse", description: "Zoom in/out (también con Z apretado)", category: "Vista" },

  // Reproducción
  { keys: "Espacio", description: "Reproducir / Pausar animación", category: "Reproducción" },
];

const CATEGORIES: ShortcutDef["category"][] = [
  "Herramientas",
  "Navegación",
  "Edición",
  "Vista",
  "Reproducción",
];

export function HelpPanel() {
  return (
    <div className="flex flex-col gap-4 p-3 bg-card overflow-y-auto no-scrollbar text-sm">
      {/* Header con icono */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Info size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">Guía rápida</h3>
      </div>

      {/* Recuadros destacados */}
      <div className="grid grid-cols-1 gap-2">
        <div className="p-3 rounded-md bg-primary/10 border border-primary/30">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb size={14} className="text-primary" />
            <span className="font-semibold text-xs">Flujo de trabajo recomendado</span>
          </div>
          <p className="text-xs text-muted-foreground">
            1) Elegí herramienta con atajo (P, B, K). 2) Activá onion skin para ver poses anteriores/posteriores.
            3) Dibujá con presión sensible (tableta). 4) Avanzá con → y creá nuevo cuadro con N.
            5) Reproducí con Espacio para revisar el movimiento.
          </p>
        </div>

        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 mb-1">
            <ZoomIn size={14} className="text-amber-500" />
            <span className="font-semibold text-xs">Zoom rápido con Z</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Mantené <kbd className="bg-muted px-1.5 rounded font-mono">Z</kbd> apretado y arrastrá el mouse
            hacia <strong>arriba</strong> para acercar o hacia <strong>abajo</strong> para alejar. También
            podés usar la rueda del mouse mientras mantenés Z. Al soltar Z, volvés automáticamente a la
            herramienta que tenías (lápiz, pincel, etc.).
          </p>
        </div>

        <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-1">
            <Keyboard size={14} className="text-blue-500" />
            <span className="font-semibold text-xs">Pantalla completa con F1</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Presioná <kbd className="bg-muted px-1.5 rounded font-mono">F1</kbd> para ocultar todos los
            paneles y ver el lienzo a pantalla completa. Podés <strong>seguir dibujando</strong> y usar las
            <strong> flechas ← →</strong> para navegar entre cuadros. Presioná F1 de nuevo para volver.
          </p>
        </div>
      </div>

      {/* Lista de atajos por categoría */}
      {CATEGORIES.map((cat) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
            {cat}
          </h4>
          <div className="space-y-1">
            {SHORTCUTS.filter((s) => s.category === cat).map((s) => (
              <div
                key={s.keys}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-muted-foreground">{s.description}</span>
                <kbd className="bg-muted px-2 py-0.5 rounded font-mono text-[10px] shrink-0">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Herramientas resumen */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
          Resumen de herramientas
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <ToolSummary icon={<Pencil size={14} />} name="Lápiz" desc="Grafito seco, presión variable" />
          <ToolSummary icon={<Brush size={14} />} name="Pincel" desc="Trazo suave y redondo" />
          <ToolSummary icon={<Pen size={14} />} name="Tinta" desc="Flujo irregular con salpicaduras" />
          <ToolSummary icon={<Droplets size={14} />} name="Acuarela" desc="Trazo translúcido acumulativo" />
          <ToolSummary icon={<Eraser size={14} />} name="Goma" desc="Borra con presión" />
          <ToolSummary icon={<Slash size={14} />} name="Línea" desc="Línea recta perfecta" />
          <ToolSummary icon={<Square size={14} />} name="Rectángulo" desc="Contorno rectangular" />
          <ToolSummary icon={<Circle size={14} />} name="Elipse" desc="Contorno ovalado" />
          <ToolSummary icon={<PaintBucket size={14} />} name="Relleno" desc="Bote de tinta (flood fill)" />
          <ToolSummary icon={<MousePointer2 size={14} />} name="Selección" desc="Rectángulo para cortar/mover" />
          <ToolSummary icon={<Move size={14} />} name="Transformar" desc="Mover selección" />
          <ToolSummary icon={<Pipette size={14} />} name="Cuentagotas" desc="Muestrea color del lienzo" />
          <ToolSummary icon={<Hand size={14} />} name="Pan" desc="Mover el lienzo por la pantalla" />
        </div>
      </div>
    </div>
  );
}

function ToolSummary({ icon, name, desc }: { icon: React.ReactNode; name: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 p-1.5 rounded bg-background/40 border border-border">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[11px]">{name}</div>
        <div className="text-[9px] text-muted-foreground truncate">{desc}</div>
      </div>
    </div>
  );
}
