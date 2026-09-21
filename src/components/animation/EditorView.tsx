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
  ChevronRight,
  Layers as LayersIcon,
  Music as MusicIcon,
  Library as LibraryIcon,
} from "lucide-react";
import { CanvasStage } from "./CanvasStage";
import { Toolbar } from "./Toolbar";
import { LayersPanel } from "./LayersPanel";
import { Timeline } from "./Timeline";
import { FrameScrubber } from "./FrameScrubber";
import { PropertiesPanel } from "./PropertiesPanel";
import { OnionSkinPanel } from "./OnionSkinPanel";
import { HelpPanel } from "./HelpPanel";
import { AudioPanel } from "./AudioPanel";
import { LibraryPanel } from "./LibraryPanel";
import { ExportDialog } from "./ExportDialog";
import { HelpDialog } from "./HelpDialog";

type RightPanelTab = "properties" | "layers" | "onion" | "help" | "audio" | "library";

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
  // Modo "lienzo a pantalla completa": oculta paneles laterales y timeline,
  // dejando solo el canvas en grande. Se puede seguir dibujando y usando
  // flechas para navegar frames. Toggle con F1.
  const [fullscreenCanvas, setFullscreenCanvas] = useState(false);
  const rightPanelVisible = useStore((s) => s.rightPanelVisible);
  const setRightPanelVisible = useStore((s) => s.setRightPanelVisible);

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

      // Ctrl/Cmd + Z = undo, Ctrl/Cmd + Y o Ctrl/Cmd + Shift+Z = redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          saveCurrent();
        } else if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          useStore.getState().undo();
        } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
          e.preventDefault();
          useStore.getState().redo();
        }
        return;
      }

      // F1 = toggle canvas a pantalla completa
      if (e.key === "F1") {
        e.preventDefault();
        setFullscreenCanvas((v) => !v);
        return;
      }

      switch (e.key.toLowerCase()) {
        case "p":
          useStore.getState().setTool("pencil");
          break;
        case "b":
          useStore.getState().setTool("brush");
          break;
        case "k":
          useStore.getState().setTool("ink");
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
        // NOTA: Z es ahora un MODIFICADOR temporal (mantener apretado para zoom)
        // y NO cambia el tool activo. Para hacer zoom: presionar Z, arrastrar hacia
        // arriba/abajo o usar la rueda del mouse, soltar Z para volver a dibujar.
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
        {/* Logo chiquito en el área de trabajo */}
        <img
          src="/logointro.png"
          alt=""
          className="h-7 w-auto ml-2 mr-1 object-contain opacity-80"
        />
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
            <MenubarItem onClick={() => useStore.getState().undo()}>
              <Undo2 className="mr-2" size={14} /> Deshacer <span className="ml-auto text-[10px] opacity-60">Ctrl+Z</span>
            </MenubarItem>
            <MenubarItem onClick={() => useStore.getState().redo()}>
              <Redo2 className="mr-2" size={14} /> Rehacer <span className="ml-auto text-[10px] opacity-60">Ctrl+Y</span>
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
            <MenubarItem onClick={() => setFullscreenCanvas((v) => !v)}>
              <Maximize2 className="mr-2" size={14} /> {fullscreenCanvas ? "Salir pantalla completa" : "Lienzo a pantalla completa"} <span className="ml-auto text-[10px] opacity-60">F1</span>
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
      ) : fullscreenCanvas ? (
        // Modo "lienzo a pantalla completa" (F1): solo canvas, sin paneles.
        // Se puede seguir dibujando y usando flechas para navegar frames.
        <div className="flex-1 relative bg-neutral-950">
          <CanvasStage width={project.settings.width} height={project.settings.height} />
          {/* Indicador flotante: cómo salir */}
          <div className="absolute top-3 right-3 bg-background/80 backdrop-blur rounded px-3 py-1.5 text-xs border border-border">
            <span className="text-muted-foreground">Pantalla completa · </span>
            <kbd className="bg-muted px-1.5 rounded">F1</kbd>
            <span className="text-muted-foreground"> para salir · </span>
            <kbd className="bg-muted px-1.5 rounded">Espacio</kbd>
            <span className="text-muted-foreground"> play · </span>
            <kbd className="bg-muted px-1.5 rounded">→</kbd>
            <kbd className="bg-muted px-1.5 rounded ml-1">←</kbd>
            <span className="text-muted-foreground"> navegar</span>
          </div>
          {/* Botón play flotante */}
          <Button
            size="icon"
            variant="default"
            className="absolute bottom-4 right-4 rounded-full h-12 w-12 shadow-lg"
            onClick={togglePlay}
            title="Reproducir/Pausar (Espacio)"
          >
            {playback.playing ? <Pause size={18} /> : <Play size={18} />}
          </Button>
        </div>
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
              {/* Frame scrubber (barra de navegación rápida entre lienzo y timeline) */}
              <FrameScrubber />

              {/* Timeline abajo */}
              <div className="h-72 shrink-0">
                <Timeline />
              </div>
            </div>

            {/* Panel derecho: tabs (con iconos) */}
            {rightPanelVisible ? (
              <div className="w-72 shrink-0 flex flex-col border-l border-border">
                <div className="flex border-b border-border bg-muted/30">
                  {/* Botón para ocultar el panel */}
                  <button
                    className="px-2 py-1.5 border-r border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={() => setRightPanelVisible(false)}
                    title="Ocultar panel"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <TabButton active={rightTab === "properties"} onClick={() => setRightTab("properties")} title="Propiedades">
                    <Settings2 size={16} />
                  </TabButton>
                  <TabButton active={rightTab === "layers"} onClick={() => setRightTab("layers")} title="Capas">
                    <LayersIcon size={16} />
                  </TabButton>
                  <TabButton active={rightTab === "onion"} onClick={() => setRightTab("onion")} title="Onion skin">
                    <Eye size={16} />
                  </TabButton>
                  <TabButton active={rightTab === "audio"} onClick={() => setRightTab("audio")} title="Audio">
                    <MusicIcon size={16} />
                  </TabButton>
                  <TabButton active={rightTab === "library"} onClick={() => setRightTab("library")} title="Biblioteca">
                    <LibraryIcon size={16} />
                  </TabButton>
                  <TabButton active={rightTab === "help"} onClick={() => setRightTab("help")} title="Ayuda">
                    <HelpCircle size={16} />
                  </TabButton>
                </div>
                <div className="flex-1 overflow-hidden">
                  {rightTab === "properties" && <PropertiesPanel />}
                  {rightTab === "layers" && <LayersPanel />}
                  {rightTab === "onion" && (
                    <div className="h-full overflow-y-auto no-scrollbar">
                      <OnionSkinPanel />
                    </div>
                  )}
                  {rightTab === "help" && (
                    <div className="h-full overflow-y-auto no-scrollbar">
                      <HelpPanel />
                    </div>
                  )}
                  {rightTab === "audio" && <AudioPanel />}
                  {rightTab === "library" && <LibraryPanel />}
                </div>
              </div>
            ) : (
              // Botón flotante para volver a mostrar el panel derecho
              <button
                className="w-8 shrink-0 border-l border-border bg-muted/30 hover:bg-muted flex items-center justify-center"
                onClick={() => setRightPanelVisible(true)}
                title="Mostrar panel"
              >
                <ChevronLeft size={14} />
              </button>
            )}
          </div>

          {/* Botones flotantes - REMOVIDO el play duplicado, ya está en Timeline */}

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
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      className={`flex-1 px-2 py-1.5 text-xs font-medium border-b-2 transition-colors flex items-center justify-center ${
        active
          ? "border-transparent text-primary bg-muted/40"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
      }`}
      onClick={onClick}
      title={title}
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
  const setPlaybackFps = useStore((s) => s.setPlaybackFps);

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
          value={playback.playbackFps}
          onChange={(e) => setPlaybackFps(Number(e.target.value))}
          className="bg-transparent text-xs px-1 border border-border rounded"
        >
          <option value={1}>1 FPS</option>
          <option value={2}>2 FPS</option>
          <option value={3}>3 FPS</option>
          <option value={6}>6 FPS</option>
          <option value={12}>12 FPS</option>
          <option value={24}>24 FPS</option>
          <option value={30}>30 FPS</option>
          <option value={60}>60 FPS</option>
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
