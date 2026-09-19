"use client";

import React, { useState, useEffect } from "react";
import { useStore } from "@/lib/animation/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { downloadBlob, exportAnimation } from "@/lib/animation/export";
import { totalFrames } from "@/lib/animation/utils";
import type { ExportFormat } from "@/lib/animation/types";
import { Loader2, Download } from "lucide-react";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMAT_LABELS: { id: ExportFormat; label: string; description: string }[] = [
  { id: "gif", label: "GIF animado", description: "Animación completa en un solo archivo .gif" },
  { id: "png_sequence", label: "Secuencia PNG", description: "Una imagen PNG por frame (alta calidad)" },
  { id: "jpeg_sequence", label: "Secuencia JPEG", description: "Una imagen JPG por frame (más liviana)" },
  { id: "png", label: "PNG (frame actual)", description: "Solo el frame actual como PNG" },
  { id: "jpeg", label: "JPEG (frame actual)", description: "Solo el frame actual como JPG" },
];

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const project = useStore((s) => s.project);
  const exportOptions = useStore((s) => s.exportOptions);
  const setExportOptions = useStore((s) => s.setExportOptions);

  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calcular rango por defecto al abrir
  useEffect(() => {
    if (open && project) {
      const total = totalFrames(project.layers);
      if (exportOptions.rangeEnd === 0 || exportOptions.rangeEnd < total) {
        setExportOptions({
          rangeStart: 0,
          rangeEnd: total,
          width: project.settings.width,
          height: project.settings.height,
          fps: project.settings.fps,
          backgroundColor: project.settings.bgColor,
        });
      }
    }
  }, [open, project]);

  if (!project) return null;

  const total = totalFrames(project.layers);

  const handleExport = async () => {
    if (!project) return;
    setExporting(true);
    setError(null);
    setProgress(0);
    try {
      const results = await exportAnimation(project, exportOptions, (p) => setProgress(p));
      for (const { blob, filename } of results) {
        downloadBlob(blob, filename);
      }
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      setError((e as Error).message ?? "Error al exportar");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar animación</DialogTitle>
          <DialogDescription>
            Elegí el formato y las opciones. El proyecto original no se modifica.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Formato */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
              Formato
            </label>
            <select
              value={exportOptions.format}
              onChange={(e) =>
                setExportOptions({ format: e.target.value as ExportFormat })
              }
              className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded"
            >
              {FORMAT_LABELS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {FORMAT_LABELS.find((f) => f.id === exportOptions.format)?.description}
            </p>
          </div>

          {/* Resolución */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
              Resolución de salida
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={exportOptions.width}
                onChange={(e) =>
                  setExportOptions({ width: Number(e.target.value) })
                }
                className="w-20 px-2 py-1 text-sm bg-background border border-border rounded"
              />
              <span>×</span>
              <input
                type="number"
                value={exportOptions.height}
                onChange={(e) =>
                  setExportOptions({ height: Number(e.target.value) })
                }
                className="w-20 px-2 py-1 text-sm bg-background border border-border rounded"
              />
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() =>
                  setExportOptions({
                    width: project.settings.width,
                    height: project.settings.height,
                  })
                }
              >
                Original
              </Button>
            </div>
          </div>

          {/* FPS */}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
              FPS de salida
            </label>
            <input
              type="number"
              value={exportOptions.fps}
              onChange={(e) => setExportOptions({ fps: Number(e.target.value) })}
              className="w-20 px-2 py-1 text-sm bg-background border border-border rounded"
            />
          </div>

          {/* Rango */}
          {exportOptions.format !== "png" && exportOptions.format !== "jpeg" && (
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
                Rango de frames (0 a {total - 1})
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={exportOptions.rangeStart}
                  min={0}
                  onChange={(e) =>
                    setExportOptions({ rangeStart: Number(e.target.value) })
                  }
                  className="w-20 px-2 py-1 text-sm bg-background border border-border rounded"
                />
                <span>a</span>
                <input
                  type="number"
                  value={exportOptions.rangeEnd}
                  min={1}
                  onChange={(e) =>
                    setExportOptions({ rangeEnd: Number(e.target.value) })
                  }
                  className="w-20 px-2 py-1 text-sm bg-background border border-border rounded"
                />
              </div>
            </div>
          )}

          {/* Color de fondo */}
          {(exportOptions.format === "gif" ||
            exportOptions.format === "jpeg" ||
            exportOptions.format === "jpeg_sequence") && (
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
                Color de fondo
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={exportOptions.backgroundColor}
                  onChange={(e) =>
                    setExportOptions({ backgroundColor: e.target.value })
                  }
                  className="w-8 h-8 rounded border border-border cursor-pointer"
                />
                <input
                  type="text"
                  value={exportOptions.backgroundColor}
                  onChange={(e) =>
                    setExportOptions({ backgroundColor: e.target.value })
                  }
                  className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded font-mono"
                />
              </div>
            </div>
          )}

          {/* Quality (JPEG) */}
          {(exportOptions.format === "jpeg" ||
            exportOptions.format === "jpeg_sequence") && (
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
                Calidad: {Math.round(exportOptions.quality * 100)}%
              </label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={exportOptions.quality}
                onChange={(e) =>
                  setExportOptions({ quality: Number(e.target.value) })
                }
                className="w-full"
              />
            </div>
          )}

          {/* Progreso */}
          {exporting && (
            <div>
              <div className="text-xs mb-1 text-muted-foreground">
                Exportando… {Math.round(progress * 100)}%
              </div>
              <div className="w-full h-2 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}

          {/* Nota MP4 */}
          {exportOptions.format === "gif" && (
            <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
              <strong>Nota técnica:</strong> La exportación a MP4 no está incluida en esta versión
              por limitaciones del navegador (requiere codificador de video WASM, ~10MB adicional).
              Como alternativa, podés usar la secuencia PNG e importarla a un editor como DaVinci
              Resolve, Shotcut o Adobe Premiere para generar MP4 con control total del códec.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin mr-2" size={14} /> : <Download className="mr-2" size={14} />}
            Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
