"use client";

import React, { useEffect, useState } from "react";
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
import { createDemoProject } from "@/lib/animation/demo";
import { EXERCISES } from "@/lib/animation/defaults";
import { saveProjectToDb } from "@/lib/animation/db";
import {
  Film,
  Plus,
  FolderOpen,
  Copy,
  Trash2,
  Clock,
  FileVideo,
  Loader2,
} from "lucide-react";
import type { ExerciseTemplate } from "@/lib/animation/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function ProjectManager() {
  const projects = useStore((s) => s.projects);
  const refreshProjects = useStore((s) => s.refreshProjects);
  const newProject = useStore((s) => s.newProject);
  const openProject = useStore((s) => s.openProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const duplicateCurrent = useStore((s) => s.duplicateCurrent);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("Nuevo proyecto");
  const [selectedTemplate, setSelectedTemplate] = useState<ExerciseTemplate>("blank");

  useEffect(() => {
    refreshProjects().then(() => setLoading(false));
  }, [refreshProjects]);

  const handleCreate = async () => {
    let p;
    if (selectedTemplate === "blank") {
      p = await newProject(newName || "Nuevo proyecto");
    } else {
      // Crear con plantilla educativa
      const spec = EXERCISES.find((e) => e.id === selectedTemplate);
      const project = createBlankProjectFromTemplate(newName, spec?.instructions ?? "");
      await saveProjectToDb(project);
      useStore.setState((s) => ({
        project,
        projects: [project, ...s.projects],
      }));
      p = project;
    }
    if (p) {
      useStore.setState({ project: p });
    }
    setShowNewDialog(false);
    setNewName("Nuevo proyecto");
    setSelectedTemplate("blank");
  };

  const handleOpenDemo = async () => {
    const demo = createDemoProject();
    await saveProjectToDb(demo);
    useStore.setState((s) => ({
      project: demo,
      projects: [demo, ...s.projects],
    }));
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el proyecto "${name}"? Esta acción no se puede deshacer.`)) return;
    await deleteProject(id);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Film size={32} className="text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">
              Animación Tradicional 2D
            </h1>
          </div>
          <p className="text-muted-foreground">
            Software de animación cuadro a cuadro para la escuela de animación.
            Dibujo, capas, línea de tiempo, onion skin, audio y funciones interactivas
            inspiradas en Flash clásico.
          </p>
        </header>

        {/* Acciones */}
        <div className="flex flex-wrap gap-3 mb-8">
          <Button onClick={() => setShowNewDialog(true)} size="lg">
            <Plus className="mr-2" size={18} /> Nuevo proyecto
          </Button>
          <Button onClick={handleOpenDemo} variant="outline" size="lg">
            <Film className="mr-2" size={18} /> Abrir demo
          </Button>
        </div>

        {/* Lista de proyectos */}
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FolderOpen size={18} /> Proyectos guardados
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="animate-spin" size={14} /> Cargando proyectos…
          </div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
            No hay proyectos guardados todavía. Creá uno nuevo o abrí el proyecto de demostración.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="border border-border rounded-lg p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer group"
                onClick={() => openProject(p.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {p.settings.width}×{p.settings.height} · {p.settings.fps} FPS
                    </p>
                  </div>
                  <FileVideo size={16} className="text-muted-foreground shrink-0" />
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                  <Clock size={11} />
                  Hace {formatDistanceToNow(p.updatedAt, { locale: es, includeSeconds: false })}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span>{p.layers.length} capas</span>
                  <span>·</span>
                  <span>{Object.keys(p.drawings).length} dibujos</span>
                  <span>·</span>
                  <span>{p.buttons.length} botones</span>
                </div>
                {p.templateInstructions && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 line-clamp-2 mb-2">
                    📚 {p.templateInstructions.slice(0, 80)}…
                  </div>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      openProject(p.id);
                      setTimeout(() => duplicateCurrent(`${p.name} (copia)`), 100);
                    }}
                  >
                    <Copy size={12} /> Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id, p.name);
                    }}
                  >
                    <Trash2 size={12} /> Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pie con info de la arquitectura */}
        <footer className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground space-y-2">
          <p>
            <strong>Arquitectura:</strong> Aplicación web (Next.js + TypeScript) con HTML5 Canvas,
            IndexedDB para almacenamiento local, Web Audio API y Pointer Events. Funciona sin
            conexión y sin cuentas. Multiplataforma: Windows, macOS y Linux vía navegador.
          </p>
          <p>
            <strong>Limitaciones conocidas:</strong> Exportación MP4 no incluida (usar secuencia
            PNG + editor externo). Captura de cámara: pendiente (getUserMedia disponible).
          </p>
        </footer>
      </div>

      {/* Diálogo nuevo proyecto */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo proyecto</DialogTitle>
            <DialogDescription>
              Elegí un nombre y, opcionalmente, una plantilla educativa con instrucciones iniciales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
                Nombre del proyecto
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
                Plantilla educativa (opcional)
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value as ExerciseTemplate)}
                className="w-full px-2 py-2 text-sm bg-background border border-border rounded"
              >
                {EXERCISES.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} — {ex.description.slice(0, 60)}
                  </option>
                ))}
              </select>
              {selectedTemplate !== "blank" && (
                <div className="mt-2 p-2 bg-muted/30 rounded text-xs space-y-1">
                  <p className="font-semibold">
                    {EXERCISES.find((e) => e.id === selectedTemplate)?.title}
                  </p>
                  <p className="text-muted-foreground">
                    {EXERCISES.find((e) => e.id === selectedTemplate)?.description}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 mt-1">
                    {EXERCISES.find((e) => e.id === selectedTemplate)?.instructions.map((ins, i) => (
                      <li key={i}>{ins}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Crear proyecto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper local para crear proyecto desde plantilla
import { createBlankProject } from "@/lib/animation/defaults";
function createBlankProjectFromTemplate(name: string, instructions: string) {
  const p = createBlankProject(name);
  return { ...p, templateInstructions: instructions };
}
