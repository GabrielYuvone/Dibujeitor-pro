"use client";

import React, { useRef } from "react";
import { useStore } from "@/lib/animation/store";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Library as LibIcon } from "lucide-react";
import type { LibraryItem } from "@/lib/animation/types";
import { genId } from "@/lib/animation/utils";

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

    // Detectar dimensiones
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
                className="border border-border rounded p-1.5 bg-background/30 hover:bg-muted/30 cursor-pointer group"
                onClick={() => useStore.getState().addDrawing({
                  id: item.id + "_" + Date.now(),
                  name: item.name,
                  dataUrl: item.dataUrl,
                  width: item.width ?? project.settings.width,
                  height: item.height ?? project.settings.height,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                })}
              >
                <div className="aspect-square bg-neutral-900 rounded mb-1 overflow-hidden flex items-center justify-center">
                  {item.type === "image" || item.type === "drawing" ? (
                    <img src={item.dataUrl} alt={item.name} className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Audio</span>
                  )}
                </div>
                <div className="text-[10px] truncate">{item.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
