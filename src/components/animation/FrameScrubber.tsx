"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { useStore } from "@/lib/animation/store";
import { totalFrames } from "@/lib/animation/utils";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
} from "lucide-react";

/**
 * Barra de navegación rápida de frames. Se ubica entre el lienzo y el
 * timeline. Permite hacer scrub arrastrando el slider, saltar al frame
 * anterior/siguiente, y play/pausa. Es más compacto que el timeline completo.
 */
export function FrameScrubber() {
  const project = useStore((s) => s.project);
  const gotoFrame = useStore((s) => s.gotoFrame);
  const nextFrame = useStore((s) => s.nextFrame);
  const prevFrame = useStore((s) => s.prevFrame);

  const total = useMemo(() => {
    if (!project) return 1;
    return Math.max(1, totalFrames(project.layers), project.currentFrame + 1);
  }, [project]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll para mantener el thumb del slider visible cuando
  // cambia el frame actual.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !project) return;
    const slider = el.querySelector<HTMLInputElement>('input[type="range"]');
    if (!slider) return;
    // No hay necesidad de scroll (slider se ajusta solo), pero aseguramos
    // que el input refleje el frame actual.
    slider.value = String(project.currentFrame);
  }, [project?.currentFrame, project, total]);

  if (!project) return null;

  const current = project.currentFrame;

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = Number(e.target.value);
    if (!Number.isNaN(f)) gotoFrame(f);
  };

  return (
    <div
      ref={containerRef}
      className="shrink-0 flex items-center gap-2 px-3 py-1 border-t border-b border-border bg-muted/20 text-xs"
    >
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => gotoFrame(0)}
          title="Ir al inicio"
        >
          <SkipBack size={12} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={prevFrame}
          title="Anterior (←)"
        >
          <ChevronLeft size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={nextFrame}
          title="Siguiente (→)"
        >
          <ChevronRight size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => gotoFrame(total - 1)}
          title="Ir al final"
        >
          <SkipForward size={12} />
        </Button>
      </div>

      <div className="flex-1 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={total - 1}
          step={1}
          value={current}
          onChange={handleScrub}
          className="flex-1 w-full h-1 cursor-pointer"
          aria-label="Navegación de frames"
        />
      </div>

      <div className="flex items-center gap-2 font-mono">
        <span className="text-foreground font-semibold">{current + 1}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{total}</span>
      </div>
    </div>
  );
}
