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
import { exportMp4, exportWebM } from "@/lib/animation/videoExport";
import { totalFrames } from "@/lib/animation/utils";
import type { ExportFormat } from "@/lib/animation/types";
import { Loader2, Download } from "lucide-react";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMAT_LABELS: { id: ExportFormat; label: string; description: string }[] = [
  { id: "mp4", label: "MP4 (video)", description: "Video MP4 con H.264 — se codifica con ffmpeg.wasm (~25MB descarga única del core)" },
  { id: "webm", label: "WebM (video)", description: "Video WebM con VP9 — rápido, sin dependencias externas" },
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
  const [stage, setStage] = useState<"rendering" | "encoding" | "">("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setStage("");

    try {
      const baseName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_");

      if (exportOptions.format === "mp4") {
        setStage("rendering");
        const blob = await exportMp4(project, exportOptions, (p, s) => {
          setStage(s);
          setProgress(p);
        });
        downloadBlob(blob, `${baseName}.mp4`);
      } else if (exportOptions.format === "webm") {
        const blob = await exportWebM(project, exportOptions, (p) => {
          setProgress(p);
        });
        downloadBlob(blob, `${baseName}.webm`);
      } else {
        const results = await exportAnimation(project, exportOptions, (p) => setProgress(p));
        for (const { blob, filename } of results) {
          downloadBlob(blob, filename);
        }
      }
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      setError((e as Error).message ?? "Error al exportar");
    } finally {
      setExporting(false);
      setStage("");
    }
  };

  const isVideoFormat = exportOptions.format === "mp4" || exportOptions.format === "webm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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

          {/* Audio para video */}
          {isVideoFormat && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={exportOptions.includeAudio}
                onChange={(e) =>
                  setExportOptions({ includeAudio: e.target.checked })
                }
              />
              Incluir audio (si hay pistas)
            </label>
          )}

          {/* Color de fondo */}
          {(exportOptions.format === "gif" ||
            exportOptions.format === "jpeg" ||
            exportOptions.format === "jpeg_sequence" ||
            exportOptions.format === "mp4" ||
            exportOptions.format === "webm") && (
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
              <div className="text-xs mb-1 text-muted-foreground flex justify-between">
                <span>
                  {stage === "rendering" && "Renderizando frames…"}
                  {stage === "encoding" && "Codificando video…"}
                  {!stage && "Exportando…"}
                </span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              {exportOptions.format === "mp4" && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  La primera exportación MP4 descarga ffmpeg-core (~25MB). Las siguientes son rápidas.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}

          {/* Nota informativa */}
          {exportOptions.format === "mp4" && !exporting && (
            <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
              <strong>MP4 con ffmpeg.wasm:</strong> La primera vez se descarga el core de ffmpeg
              (~25MB) que se cachea para futuras exportaciones. Esto permite generar video MP4
              con H.264 + audio AAC directamente en el navegador, sin servidor.
            </div>
          )}
          {exportOptions.format === "webm" && !exporting && (
            <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
              <strong>WebM con MediaRecorder:</strong> Codificación nativa del navegador (VP9 + Opus).
              Más rápido que MP4 pero el formato WebM no es tan universal como MP4.
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
