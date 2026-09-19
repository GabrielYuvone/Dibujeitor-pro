"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "@/lib/animation/store";
import { usePlaybackEngine } from "@/lib/animation/useDrawingEngine";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Button } from "@/components/ui/button";
import {
  Save,
  Download,
  Play,
  Pause,
  Undo2,
  Redo2,
  Grid3x3,
  SquareDashedMousePointer,
  Edit,
  Eye,
  Settings2,
  Folder,
  HelpCircle,
  Maximize2,
  ChevronLeft,
} from "lucide-react";
import { CanvasStage } from "./CanvasStage";
import { Toolbar } from "./Toolbar";
import { LayersPanel } from "./LayersPanel";
import { Timeline } from "./Timeline";
import { PropertiesPanel } from "./PropertiesPanel";
import { OnionSkinPanel } from "./OnionSkinPanel";
import { ButtonsActionsPanel } from "./ButtonsActionsPanel";
import { AudioPanel } from "./AudioPanel";
import { LibraryPanel } from "./LibraryPanel";
import { ExportDialog } from "./ExportDialog";
import { HelpDialog } from "./HelpDialog";

type RightPanelTab = "properties" | "onion" | "buttons" | "audio" | "library";

export function EditorView() {
  const project = useStore((s) => s.project);
  const viewMode = useStore((s) => s.viewMode);
  const saveCurrent = useStore((s) => s.saveCurrent);
  const triggerAutosave = useStore((s) => s.triggerAutosave);
  const setViewMode = useStore((s) => s.setViewMode);
  const togglePlay = useStore((s) => s.togglePlay);
  const playback = useStore((s) => s.playback);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const toggleSafeArea = useStore((s) => s.toggleSafeArea);
  const showGrid = useStore((s) => s.showGrid);
  const showSafeArea = useStore((s) => s.showSafeArea);
  const resetCanvasView = useStore((s) => s.resetCanvasView);
  const closeProject = useStore((s) => s.closeProject);
  const isAutosaving = useStore((s) => s.isAutosaving);

  const [rightTab, setRightTab] = useState<RightPanelTab>("properties");
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Motor de reproducción
  usePlaybackEngine();

  // Autosave cada 30s
  useEffect(() => {
    const interval = setInterval(() => {
      triggerAutosave();
    }, 30000);
    return () => clearInterval(interval);
  }, [triggerAutosave]);

  // Atajos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (!project) return;

      // No interferir con Cmd/Ctrl
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          saveCurrent();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case "p":
          useStore.getState().setTool("pencil");
          break;
        case "b":
          useStore.getState().setTool("brush");
          break;
        case "e":
          useStore.getState().setTool("eraser");
          break;
        case "l":
          useStore.getState().setTool("line");
          break;
        case "r":
          useStore.getState().setTool("rectangle");
          break;
        case "o":
          useStore.getState().setTool("ellipse");
          break;
        case "g":
          useStore.getState().setTool("fill");
          break;
        case "v":
          useStore.getState().setTool("selection");
          break;
        case "t":
          useStore.getState().setTool("transform");
          break;
        case "i":
          useStore.getState().setTool("eyedropper");
          break;
        case "h":
          useStore.getState().setTool("pan");
          break;
        case "z":
          useStore.getState().setTool("zoom");
          break;
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowright":
          e.preventDefault();
          useStore.getState().nextFrame();
          break;
        case "arrowleft":
          e.preventDefault();
          useStore.getState().prevFrame();
          break;
        case "n":
          e.preventDefault();
          if (project.currentLayerId) {
            const nextFrameIdx = project.currentFrame + 1;
            useStore.getState().ensureDrawingForCell(project.currentLayerId, nextFrameIdx).then(() => {
              useStore.getState().gotoFrame(nextFrameIdx);
            });
          }
          break;
        case "d":
          e.preventDefault();
          if (project.currentLayerId) {
            const layer = project.layers.find((l) => l.id === project.currentLayerId);
            if (layer) {
              const cell = layer.cells.find(
                (c) =>
                  project.currentFrame >= c.startFrame &&
                  project.currentFrame < c.startFrame + c.duration
              );
              if (cell) {
                useStore.getState().duplicateCell(project.currentLayerId, cell.id);
              }
            }
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project, saveCurrent, togglePlay]);

  if (!project) return null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Menubar */}
      <Menubar className="rounded-none border-b border-border h-10 shrink-0">
        <MenubarMenu>
          <MenubarTrigger>Archivo</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => closeProject()}>
              <ChevronLeft className="mr-2" size={14} /> Volver a proyectos
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => saveCurrent()}>
              <Save className="mr-2" size={14} /> Guardar
            </MenubarItem>
            <MenubarItem onClick={() => setExportOpen(true)}>
              <Download className="mr-2" size={14} /> Exportar…
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edición</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>
              <Undo2 className="mr-2" size={14} /> Deshacer (próx.)
            </MenubarItem>
            <MenubarItem disabled>
              <Redo2 className="mr-2" size={14} /> Rehacer (próx.)
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Ver</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => setViewMode("edit")}>
              <Edit className="mr-2" size={14} /> Modo edición
            </MenubarItem>
            <MenubarItem onClick={() => setViewMode("preview")}>
              <Eye className="mr-2" size={14} /> Modo previsualización
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={toggleGrid}>
              <Grid3x3 className="mr-2" size={14} /> {showGrid ? "Ocultar" : "Mostrar"} cuadrícula
            </MenubarItem>
            <MenubarItem onClick={toggleSafeArea}>
              <SquareDashedMousePointer className="mr-2" size={14} /> {showSafeArea ? "Ocultar" : "Mostrar"} área segura
            </MenubarItem>
            <MenubarItem onClick={resetCanvasView}>
              <Settings2 className="mr-2" size={14} /> Reiniciar vista
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Ayuda</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => setHelpOpen(true)}>
              <HelpCircle className="mr-2" size={14} /> Cómo usar el programa
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <div className="ml-auto flex items-center gap-2 px-3">
          {/* Indicador de guardado */}
          {project.dirty && (
            <span className="text-xs text-amber-500">● Sin guardar</span>
          )}
          {isAutosaving && (
            <span className="text-xs text-muted-foreground animate-pulse">Guardando…</span>
          )}
          <span className="text-xs text-muted-foreground">
            {project.name}
          </span>
        </div>
      </Menubar>

      {/* Modo previsualización (pantalla completa) */}
      {viewMode === "preview" ? (
        <PreviewMode />
      ) : (
        <>
          {/* Contenido principal */}
          <div className="flex flex-1 overflow-hidden">
            {/* Panel izquierdo: herramientas */}
            <div className="w-56 shrink-0">
              <Toolbar />
            </div>

            {/* Centro: lienzo */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 relative">
                <CanvasStage width={project.settings.width} height={project.settings.height} />
              </div>

              {/* Timeline abajo */}
              <div className="h-72 shrink-0">
                <Timeline />
              </div>
            </div>

            {/* Panel derecho: tabs */}
            <div className="w-80 shrink-0 flex flex-col border-l border-border">
              <div className="flex border-b border-border bg-muted/30">
                <TabButton active={rightTab === "properties"} onClick={() => setRightTab("properties")}>
                  Propiedades
                </TabButton>
                <TabButton active={rightTab === "onion"} onClick={() => setRightTab("onion")}>
                  Onion
                </TabButton>
                <TabButton active={rightTab === "buttons"} onClick={() => setRightTab("buttons")}>
                  Botones
                </TabButton>
                <TabButton active={rightTab === "audio"} onClick={() => setRightTab("audio")}>
                  Audio
                </TabButton>
                <TabButton active={rightTab === "library"} onClick={() => setRightTab("library")}>
                  Biblioteca
                </TabButton>
              </div>
              <div className="flex-1 overflow-hidden">
                {rightTab === "properties" && <PropertiesPanel />}
                {rightTab === "onion" && (
                  <div className="h-full overflow-y-auto no-scrollbar">
                    <OnionSkinPanel />
                  </div>
                )}
                {rightTab === "buttons" && <ButtonsActionsPanel />}
                {rightTab === "audio" && <AudioPanel />}
                {rightTab === "library" && <LibraryPanel />}
              </div>
            </div>
          </div>

          {/* Botones flotantes */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <Button
              size="icon"
              variant="default"
              className="rounded-full h-12 w-12 shadow-lg"
              onClick={togglePlay}
              title="Reproducir/Pausar (Espacio)"
            >
              {playback.playing ? <Pause size={18} /> : <Play size={18} />}
            </Button>
          </div>
        </>
      )}

      {/* Modals */}
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`flex-1 px-2 py-1.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-primary text-primary bg-background"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modo previsualización (pantalla completa)
// ---------------------------------------------------------------------------

function PreviewMode() {
  const project = useStore((s) => s.project)!;
  const setViewMode = useStore((s) => s.setViewMode);
  const playback = useStore((s) => s.playback);
  const togglePlay = useStore((s) => s.togglePlay);
  const nextFrame = useStore((s) => s.nextFrame);
  const prevFrame = useStore((s) => s.prevFrame);
  const gotoFrame = useStore((s) => s.gotoFrame);
  const setLooping = useStore((s) => s.setLooping);
  const setSpeed = useStore((s) => s.setSpeed);

  return (
    <div className="flex-1 flex flex-col bg-black relative">
      {/* Lienzo a pantalla completa */}
      <div className="flex-1 relative">
        <CanvasStage width={project.settings.width} height={project.settings.height} />
      </div>

      {/* Botón volver */}
      <Button
        size="sm"
        variant="secondary"
        className="absolute top-3 left-3"
        onClick={() => setViewMode("edit")}
      >
        <ChevronLeft size={14} /> Volver a editar
      </Button>

      {/* Controles de reproducción */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/90 backdrop-blur rounded-full px-4 py-2 shadow-xl border border-border z-50">
        <Button size="sm" variant="ghost" className="rounded-full" onClick={() => gotoFrame(0)}>
          <Maximize2 size={14} />
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full" onClick={prevFrame}>
          <ChevronLeft size={16} />
        </Button>
        <Button size="sm" variant="default" className="rounded-full" onClick={togglePlay}>
          {playback.playing ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full" onClick={nextFrame}>
          <ChevronLeft size={16} className="rotate-180" />
        </Button>
        <select
          value={playback.speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="bg-transparent text-xs px-1 border border-border rounded"
        >
          <option value={0.25}>0.25×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={1.5}>1.5×</option>
          <option value={2}>2×</option>
        </select>
        <Button
          size="sm"
          variant="ghost"
          className={`rounded-full ${playback.looping ? "bg-primary/20" : ""}`}
          onClick={() => setLooping(!playback.looping)}
          title="Bucle"
        >
          <Folder size={14} />
        </Button>
        <span className="text-xs text-muted-foreground font-mono">
          {project.currentFrame + 1}/{Math.max(1, project.layers.reduce((acc, l) => Math.max(acc, ...l.cells.map((c) => c.startFrame + c.duration)), 1))}
        </span>
      </div>
    </div>
  );
}
