"use client";

import React, { useRef } from "react";
import { useStore } from "@/lib/animation/store";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Library as LibIcon, Plus } from "lucide-react";
import type { LibraryItem } from "@/lib/animation/types";
import { genId } from "@/lib/animation/utils";
import { preloadImage } from "@/lib/animation/useDrawingEngine";

export function LibraryPanel() {
  const project = useStore((s) => s.project);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!project) return null;

  const handleFile = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    let width: number | undefined;
    let height: number | undefined;
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((r) => {
        img.onload = () => {
          width = img.naturalWidth;
          height = img.naturalHeight;
          r();
        };
        img.onerror = () => r();
      });
    }

    const item: LibraryItem = {
      id: genId("lib"),
      name: file.name,
      type: file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("audio/")
          ? "audio"
          : "image",
      dataUrl,
      width,
      height,
      tags: [],
      createdAt: Date.now(),
    };

    // Agregar a la biblioteca del proyecto
    useStore.setState((s) => {
      if (!s.project) return {};
      return {
        project: {
          ...s.project,
          library: [...s.project.library, item],
          dirty: true,
          updatedAt: Date.now(),
        },
      };
    });
  };

  // Agregar imagen de la biblioteca al canvas actual
  const addToCanvas = async (item: LibraryItem) => {
    if (!project || !project.currentLayerId) return;
    const layer = project.layers.find((l) => l.id === project.currentLayerId);
    if (!layer || layer.locked || !layer.visible || layer.type === "audio") return;

    // Crear un drawing nuevo con la imagen
    const drawingId = genId("draw");
    const now = Date.now();
    // Pre-cachear la imagen
    await preloadImage(drawingId, item.dataUrl);

    // Calcular dataUrl escalado al tamaño del canvas si la imagen es más grande
    let finalDataUrl = item.dataUrl;
    const imgW = item.width ?? project.settings.width;
    const imgH = item.height ?? project.settings.height;
    if (imgW !== project.settings.width || imgH !== project.settings.height) {
      // Reescalar a las dimensiones del proyecto
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = project.settings.width;
      tmpCanvas.height = project.settings.height;
      const ctx = tmpCanvas.getContext("2d")!;
      const img = new Image();
      img.src = item.dataUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, project.settings.width, project.settings.height);
          resolve();
        };
        img.onerror = () => resolve();
      });
      finalDataUrl = tmpCanvas.toDataURL("image/png");
      await preloadImage(drawingId, finalDataUrl);
    }

    useStore.setState((s) => {
      if (!s.project) return {};
      // Buscar celda actual o crear nueva
      const layers = s.project.layers.map((l) => {
        if (l.id !== layer.id) return l;
        const cells = [...l.cells];
        const existing = cells.find(
          (c) =>
            s.project!.currentFrame >= c.startFrame &&
            s.project!.currentFrame < c.startFrame + c.duration
        );
        if (existing) {
          const idx = cells.indexOf(existing);
          // Si la celda ya tiene un drawing, lo pisamos
          cells[idx] = { ...existing, drawingId };
        } else {
          cells.push({
            id: genId("cell"),
            drawingId,
            startFrame: s.project.currentFrame,
            duration: 1,
          });
          cells.sort((a, b) => a.startFrame - b.startFrame);
        }
        return { ...l, cells };
      });
      return {
        project: {
          ...s.project,
          layers,
          drawings: {
            ...s.project.drawings,
            [drawingId]: {
              id: drawingId,
              name: item.name,
              dataUrl: finalDataUrl,
              width: s.project.settings.width,
              height: s.project.settings.height,
              createdAt: now,
              updatedAt: now,
            },
          },
          dirty: true,
          updatedAt: now,
        },
      };
    });
  };

  const removeFromLibrary = (id: string) => {
    useStore.setState((s) => {
      if (!s.project) return {};
      return {
        project: {
          ...s.project,
          library: s.project.library.filter((i) => i.id !== id),
          dirty: true,
          updatedAt: Date.now(),
        },
      };
    });
  };

  return (
    <div className="flex flex-col h-full bg-card border-b border-border">
      <div className="flex items-center justify-between p-2 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <LibIcon size={16} /> Biblioteca
        </h3>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={12} /> Importar
        </Button>
      </div>

      <div className="text-xs text-muted-foreground p-2 bg-muted/20 border-b border-border">
        Hacé clic en una imagen para agregarla al canvas en el cuadro actual.
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-2">
        {project.library.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground p-4">
            Biblioteca vacía. Importá dibujos, imágenes o sonidos para reutilizarlos.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {project.library.map((item) => (
              <div
                key={item.id}
                className="border border-border rounded p-1.5 bg-background/30 hover:bg-muted/30 cursor-pointer group relative"
                onClick={() => addToCanvas(item)}
                title={`Agregar "${item.name}" al canvas`}
              >
                <button
                  className="absolute top-1 right-1 p-0.5 rounded bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromLibrary(item.id);
                  }}
                  title="Eliminar de la biblioteca"
                >
                  <Trash2 size={10} />
                </button>
                <div className="aspect-square bg-neutral-900 rounded mb-1 overflow-hidden flex items-center justify-center">
                  {item.type === "image" || item.type === "drawing" ? (
                    <img src={item.dataUrl} alt={item.name} className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Audio</span>
                  )}
                </div>
                <div className="text-[10px] truncate flex items-center gap-1">
                  <Plus size={9} className="text-primary shrink-0" />
                  <span className="truncate">{item.name}</span>
                </div>
                {item.width && item.height && (
                  <div className="text-[9px] text-muted-foreground">
                    {item.width}×{item.height}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
