// ============================================================================
// store.ts — Estado global con Zustand (motor de animación)
// ============================================================================

"use client";

import { create } from "zustand";
import type {
  AnimationProject,
  BrushSettings,
  CanvasView,
  Cell,
  Drawing,
  ExportOptions,
  ID,
  InteractiveButton,
  Layer,
  OnionSkinSettings,
  PlaybackState,
  ToolId,
  ViewMode,
  Action,
  EventHandler,
  Variable,
  Marker,
  AudioClip,
} from "./types";
import { DEFAULT_BRUSH, DEFAULT_ONION, DEFAULT_SETTINGS, createBlankProject } from "./defaults";
import { genId, totalFrames } from "./utils";
import {
  deleteProjectFromDb,
  listProjectsFromDb,
  loadProjectFromDb,
  saveProjectToDb,
  duplicateProjectInDb,
} from "./db";

// ---------------------------------------------------------------------------
// Estado de la aplicación
// ---------------------------------------------------------------------------

interface AppState {
  // Lista de proyectos en disco
  projects: AnimationProject[];
  projectsLoading: boolean;

  // Proyecto abierto
  project: AnimationProject | null;

  // Estado de UI / herramientas
  currentTool: ToolId;
  brush: BrushSettings;
  onion: OnionSkinSettings;
  playback: PlaybackState;
  canvasView: CanvasView;
  viewMode: ViewMode;
  exportOptions: ExportOptions;

  // Estado de UI
  panelLayout: "default" | "focus";
  showGrid: boolean;
  showSafeArea: boolean;
  showRulers: boolean;
  thumbnailCache: Record<ID, string>;
  isAutosaving: boolean;
  lastAutosaveAt: number | null;

  // Selección temporal (texto activo)
  drawingBuffer: HTMLCanvasElement | null;

  // Acciones
  // Projects
  refreshProjects: () => Promise<void>;
  newProject: (name: string) => Promise<AnimationProject>;
  openProject: (id: string) => Promise<void>;
  saveCurrent: () => Promise<void>;
  duplicateCurrent: (newName: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  closeProject: () => void;
  exportProject: () => AnimationProject | null;

  // Tools
  setTool: (tool: ToolId) => void;
  setBrush: (b: Partial<BrushSettings>) => void;

  // Onion
  setOnion: (o: Partial<OnionSkinSettings>) => void;

  // Playback
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  setLooping: (l: boolean) => void;
  setSpeed: (s: number) => void;
  setRange: (start: number | null, end: number | null) => void;

  // Canvas view
  setCanvasView: (v: Partial<CanvasView>) => void;
  resetCanvasView: () => void;

  // Navigation
  gotoFrame: (frame: number) => void;
  nextFrame: () => void;
  prevFrame: () => void;
  setViewMode: (m: ViewMode) => void;

  // Project settings
  setProjectSettings: (s: Partial<AnimationProject["settings"]>) => void;
  renameProject: (name: string) => void;

  // Layers
  addLayer: (type: Layer["type"], name?: string) => string;
  deleteLayer: (id: ID) => void;
  selectLayer: (id: ID) => void;
  renameLayer: (id: ID, name: string) => void;
  toggleLayerVisible: (id: ID) => void;
  toggleLayerLocked: (id: ID) => void;
  setLayerOpacity: (id: ID, opacity: number) => void;
  moveLayer: (id: ID, dir: "up" | "down") => void;
  duplicateLayer: (id: ID) => void;

  // Cells / drawings
  ensureDrawingForCell: (layerId: ID, frame: number) => Promise<ID>;
  setCellDrawing: (layerId: ID, frame: number, drawingId: ID | null) => void;
  extendCell: (layerId: ID, frame: number, delta: number) => void;
  insertEmptyFrame: (layerId: ID, frame: number) => void;
  removeCell: (layerId: ID, cellId: ID) => void;
  duplicateCell: (layerId: ID, cellId: ID) => void;
  moveCell: (layerId: ID, cellId: ID, newFrame: number) => void;
  setCellLabel: (layerId: ID, cellId: ID, label: string) => void;
  setFrameLabel: (layerId: ID, frame: number, label: string) => void;

  // Drawings
  addDrawing: (drawing: Drawing) => void;
  updateDrawing: (id: ID, dataUrl: string) => Promise<void>;
  deleteDrawing: (id: ID) => void;
  getDrawing: (id: ID) => Drawing | null;

  // Markers
  addMarker: (frame: number, label: string, color: string) => void;
  deleteMarker: (id: ID) => void;
  gotoNextMarker: () => void;
  gotoPrevMarker: () => void;

  // Audio
  addAudioClip: (clip: AudioClip) => void;
  deleteAudioClip: (id: ID) => void;
  setAudioClipStart: (id: ID, frame: number) => void;
  toggleAudioMute: (id: ID) => void;

  // Buttons & actions
  addButton: (button: Partial<InteractiveButton>) => ID;
  updateButton: (id: ID, patch: Partial<InteractiveButton>) => void;
  deleteButton: (id: ID) => void;
  addHandler: (buttonId: ID, handler: EventHandler) => void;
  updateHandler: (buttonId: ID, handlerId: ID, patch: Partial<EventHandler>) => void;
  deleteHandler: (buttonId: ID, handlerId: ID) => void;
  addAction: (buttonId: ID, handlerId: ID, action: Action) => void;
  updateAction: (
    buttonId: ID,
    handlerId: ID,
    actionId: ID,
    patch: Partial<Action>
  ) => void;
  deleteAction: (buttonId: ID, handlerId: ID, actionId: ID) => void;

  // Variables
  setVariable: (name: string, value: Variable["value"]) => void;
  deleteVariable: (name: string) => void;

  // Export options
  setExportOptions: (o: Partial<ExportOptions>) => void;

  // Misc UI
  setPanelLayout: (l: "default" | "focus") => void;
  toggleGrid: () => void;
  toggleSafeArea: () => void;
  toggleRulers: () => void;
  setDrawingBuffer: (c: HTMLCanvasElement | null) => void;

  // Autosave
  triggerAutosave: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function updateProject(
  state: AppState,
  updater: (p: AnimationProject) => AnimationProject
): Partial<AppState> {
  if (!state.project) return {};
  const newProject = updater({ ...state.project, dirty: true, updatedAt: Date.now() });
  return { project: newProject };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<AppState>((set, get) => ({
  projects: [],
  projectsLoading: false,
  project: null,

  currentTool: "pencil",
  brush: { ...DEFAULT_BRUSH },
  onion: { ...DEFAULT_ONION },
  playback: {
    playing: false,
    looping: true,
    speed: 1,
    rangeStart: null,
    rangeEnd: null,
  },
  canvasView: { zoom: 1, panX: 0, panY: 0, rotation: 0 },
  viewMode: "edit",
  exportOptions: {
    format: "gif",
    width: DEFAULT_SETTINGS.width,
    height: DEFAULT_SETTINGS.height,
    fps: DEFAULT_SETTINGS.fps,
    rangeStart: 0,
    rangeEnd: 0,
    includeAudio: false,
    quality: 0.92,
    backgroundColor: "#ffffff",
  },

  panelLayout: "default",
  showGrid: false,
  showSafeArea: false,
  showRulers: false,
  thumbnailCache: {},
  isAutosaving: false,
  lastAutosaveAt: null,
  drawingBuffer: null,

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  refreshProjects: async () => {
    set({ projectsLoading: true });
    const projects = await listProjectsFromDb();
    set({ projects, projectsLoading: false });
  },

  newProject: async (name) => {
    const project = createBlankProject(name);
    await saveProjectToDb(project);
    set({ project, projects: [project, ...get().projects] });
    return project;
  },

  openProject: async (id) => {
    const project = await loadProjectFromDb(id);
    if (project) {
      set({ project, canvasView: { zoom: 1, panX: 0, panY: 0, rotation: 0 } });
    }
  },

  saveCurrent: async () => {
    const p = get().project;
    if (!p) return;
    await saveProjectToDb(p);
    set({
      projects: [p, ...get().projects.filter((x) => x.id !== p.id)],
      isAutosaving: false,
      lastAutosaveAt: Date.now(),
    });
    set((s) => (s.project ? { project: { ...s.project, dirty: false } } : {}));
  },

  duplicateCurrent: async (newName) => {
    const p = get().project;
    if (!p) return;
    const copy = await duplicateProjectInDb(p.id, newName);
    if (copy) {
      set({ project: copy, projects: [copy, ...get().projects] });
    }
  },

  deleteProject: async (id) => {
    await deleteProjectFromDb(id);
    const p = get().project;
    if (p && p.id === id) {
      set({ project: null });
    }
    set({ projects: get().projects.filter((x) => x.id !== id) });
  },

  closeProject: () => set({ project: null }),

  exportProject: () => get().project,

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  setTool: (tool) => set({ currentTool: tool }),
  setBrush: (b) => set((s) => ({ brush: { ...s.brush, ...b } })),

  setOnion: (o) => set((s) => ({ onion: { ...s.onion, ...o } })),

  togglePlay: () => set((s) => ({ playback: { ...s.playback, playing: !s.playback.playing } })),
  setPlaying: (p) => set((s) => ({ playback: { ...s.playback, playing: p } })),
  setLooping: (l) => set((s) => ({ playback: { ...s.playback, looping: l } })),
  setSpeed: (sp) => set((s) => ({ playback: { ...s.playback, speed: sp } })),
  setRange: (start, end) =>
    set((s) => ({ playback: { ...s.playback, rangeStart: start, rangeEnd: end } })),

  setCanvasView: (v) => set((s) => ({ canvasView: { ...s.canvasView, ...v } })),
  resetCanvasView: () => set({ canvasView: { zoom: 1, panX: 0, panY: 0, rotation: 0 } }),

  gotoFrame: (frame) =>
    set((s) =>
      s.project
        ? { project: { ...s.project, currentFrame: Math.max(0, frame) } }
        : {}
    ),
  nextFrame: () =>
    set((s) =>
      s.project
        ? { project: { ...s.project, currentFrame: s.project.currentFrame + 1 } }
        : {}
    ),
  prevFrame: () =>
    set((s) =>
      s.project && s.project.currentFrame > 0
        ? { project: { ...s.project, currentFrame: s.project.currentFrame - 1 } }
        : {}
    ),
  setViewMode: (m) => set({ viewMode: m }),

  setProjectSettings: (settings) =>
    set((s) =>
      s.project
        ? {
            project: {
              ...s.project,
              settings: { ...s.project.settings, ...settings },
              dirty: true,
              updatedAt: Date.now(),
            },
          }
        : {}
    ),

  renameProject: (name) =>
    set((s) =>
      s.project
        ? { project: { ...s.project, name, dirty: true, updatedAt: Date.now() } }
        : {}
    ),

  // -------------------------------------------------------------------------
  // Layers
  // -------------------------------------------------------------------------

  addLayer: (type, name) => {
    const state = get();
    if (!state.project) return "";
    const id = genId("layer");
    const newLayer: Layer = {
      id,
      name: name ?? `${type === "draw" ? "Capa de dibujo" : type === "reference" ? "Referencia" : type === "background" ? "Fondo" : "Audio"} ${state.project.layers.length + 1}`,
      type,
      cells: type === "draw" || type === "reference" || type === "background"
        ? [{ id: genId("cell"), drawingId: null, startFrame: 0, duration: 1 }]
        : [],
      visible: true,
      locked: false,
      opacity: 1,
      createdAt: Date.now(),
    };
    set(updateProject(state, (p) => ({
      ...p,
      layers: [...p.layers, newLayer],
      currentLayerId: id,
    })));
    return id;
  },

  deleteLayer: (id) => {
    const state = get();
    if (!state.project) return;
    if (state.project.layers.length <= 1) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.filter((l) => l.id !== id),
      currentLayerId: p.currentLayerId === id ? p.layers[0].id : p.currentLayerId,
    })));
  },

  selectLayer: (id) =>
    set((s) =>
      s.project ? { project: { ...s.project, currentLayerId: id } } : {}
    ),

  renameLayer: (id, name) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, name } : l)),
    })));
  },

  toggleLayerVisible: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })));
  },

  toggleLayerLocked: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    })));
  },

  setLayerOpacity: (id, opacity) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })));
  },

  moveLayer: (id, dir) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = [...p.layers];
      const idx = layers.findIndex((l) => l.id === id);
      if (idx < 0) return p;
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= layers.length) return p;
      [layers[idx], layers[target]] = [layers[target], layers[idx]];
      return { ...p, layers };
    }));
  },

  duplicateLayer: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layer = p.layers.find((l) => l.id === id);
      if (!layer) return p;
      const newId = genId("layer");
      const newLayer: Layer = {
        ...layer,
        id: newId,
        name: `${layer.name} (copia)`,
        cells: layer.cells.map((c) => ({ ...c, id: genId("cell") })),
        createdAt: Date.now(),
      };
      const idx = p.layers.findIndex((l) => l.id === id);
      const layers = [...p.layers];
      layers.splice(idx + 1, 0, newLayer);
      return { ...p, layers, currentLayerId: newId };
    }));
  },

  // -------------------------------------------------------------------------
  // Cells / drawings
  // -------------------------------------------------------------------------

  ensureDrawingForCell: async (layerId, frame) => {
    const state = get();
    if (!state.project) throw new Error("No project");
    const layer = state.project.layers.find((l) => l.id === layerId);
    if (!layer) throw new Error("Layer not found");

    // Buscar celda existente en este frame
    const existing = layer.cells.find(
      (c) => frame >= c.startFrame && frame < c.startFrame + c.duration
    );

    if (existing && existing.drawingId) {
      return existing.drawingId;
    }

    // Crear nuevo Drawing vacío
    const drawingId = genId("draw");
    const now = Date.now();
    const canvas = document.createElement("canvas");
    canvas.width = state.project.settings.width;
    canvas.height = state.project.settings.height;
    const dataUrl = canvas.toDataURL("image/png");

    const drawing: Drawing = {
      id: drawingId,
      name: `Drawing ${Object.keys(state.project.drawings).length + 1}`,
      dataUrl,
      width: state.project.settings.width,
      height: state.project.settings.height,
      createdAt: now,
      updatedAt: now,
    };

    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const cells = [...l.cells];
        // Si existe celda en este frame, asignarle el drawingId
        const cell = cells.find(
          (c) => frame >= c.startFrame && frame < c.startFrame + c.duration
        );
        if (cell) {
          const idx = cells.indexOf(cell);
          cells[idx] = { ...cell, drawingId };
        } else {
          // Crear nueva celda
          cells.push({ id: genId("cell"), drawingId, startFrame: frame, duration: 1 });
          cells.sort((a, b) => a.startFrame - b.startFrame);
        }
        return { ...l, cells };
      });
      return {
        ...p,
        layers,
        drawings: { ...p.drawings, [drawingId]: drawing },
      };
    }));

    return drawingId;
  },

  setCellDrawing: (layerId, frame, drawingId) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const cells = [...l.cells];
        const cell = cells.find(
          (c) => frame >= c.startFrame && frame < c.startFrame + c.duration
        );
        if (cell) {
          const idx = cells.indexOf(cell);
          cells[idx] = { ...cell, drawingId };
        }
        return { ...l, cells };
      });
      return { ...p, layers };
    }));
  },

  extendCell: (layerId, frame, delta) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const cells = [...l.cells];
        const cell = cells.find(
          (c) => frame >= c.startFrame && frame < c.startFrame + c.duration
        );
        if (cell) {
          const idx = cells.indexOf(cell);
          const newDuration = Math.max(1, cell.duration + delta);
          cells[idx] = { ...cell, duration: newDuration };
        }
        return { ...l, cells };
      });
      return { ...p, layers };
    }));
  },

  insertEmptyFrame: (layerId, frame) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const cells = [...l.cells];
        // Avanzar todas las celdas en o después del frame
        const newCells = cells
          .map((c) =>
            c.startFrame >= frame
              ? { ...c, startFrame: c.startFrame + 1, id: genId("cell") }
              : c
          )
          .filter((c) => c.startFrame < totalFrames([{ cells }]) + 1);
        // Agregar nueva celda vacía
        newCells.push({
          id: genId("cell"),
          drawingId: null,
          startFrame: frame,
          duration: 1,
        });
        newCells.sort((a, b) => a.startFrame - b.startFrame);
        return { ...l, cells: newCells };
      });
      return { ...p, layers };
    }));
  },

  removeCell: (layerId, cellId) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        return { ...l, cells: l.cells.filter((c) => c.id !== cellId) };
      });
      return { ...p, layers };
    }));
  },

  duplicateCell: (layerId, cellId) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const cell = l.cells.find((c) => c.id === cellId);
        if (!cell) return l;
        const newDrawingId = cell.drawingId ? genId("draw") : null;
        let drawings = p.drawings;
        if (newDrawingId && cell.drawingId) {
          const orig = p.drawings[cell.drawingId];
          if (orig) {
            drawings = {
              ...drawings,
              [newDrawingId]: {
                ...orig,
                id: newDrawingId,
                name: `${orig.name} (copia)`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            };
          }
        }
        const newCell: Cell = {
          ...cell,
          id: genId("cell"),
          drawingId: newDrawingId,
          startFrame: cell.startFrame + cell.duration,
        };
        return { ...l, cells: [...l.cells, newCell].sort((a, b) => a.startFrame - b.startFrame) };
      });
      return { ...p, layers };
    }));
  },

  moveCell: (layerId, cellId, newFrame) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const cells = l.cells.map((c) =>
          c.id === cellId ? { ...c, startFrame: Math.max(0, newFrame) } : c
        );
        cells.sort((a, b) => a.startFrame - b.startFrame);
        return { ...l, cells };
      });
      return { ...p, layers };
    }));
  },

  setCellLabel: (layerId, cellId, label) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        return {
          ...l,
          cells: l.cells.map((c) => (c.id === cellId ? { ...c, label } : c)),
        };
      });
      return { ...p, layers };
    }));
  },

  setFrameLabel: (layerId, frame, label) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        return {
          ...l,
          frameLabels: { ...(l.frameLabels ?? {}), [frame]: label as any },
        };
      });
      return { ...p, layers };
    }));
  },

  // -------------------------------------------------------------------------
  // Drawings
  // -------------------------------------------------------------------------

  addDrawing: (drawing) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      drawings: { ...p.drawings, [drawing.id]: drawing },
    })));
  },

  updateDrawing: async (id, dataUrl) => {
    const state = get();
    if (!state.project) return;
    const drawing = state.project.drawings[id];
    if (!drawing) return;
    set(updateProject(state, (p) => ({
      ...p,
      drawings: {
        ...p.drawings,
        [id]: { ...drawing, dataUrl, updatedAt: Date.now() },
      },
    })));
  },

  deleteDrawing: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const drawings = { ...p.drawings };
      delete drawings[id];
      const layers = p.layers.map((l) => ({
        ...l,
        cells: l.cells.map((c) => (c.drawingId === id ? { ...c, drawingId: null } : c)),
      }));
      return { ...p, drawings, layers };
    }));
  },

  getDrawing: (id) => {
    const p = get().project;
    if (!p) return null;
    return p.drawings[id] ?? null;
  },

  // -------------------------------------------------------------------------
  // Markers
  // -------------------------------------------------------------------------

  addMarker: (frame, label, color) => {
    const state = get();
    if (!state.project) return;
    const marker: Marker = { id: genId("mark"), frame, label, color };
    set(updateProject(state, (p) => ({
      ...p,
      markers: [...p.markers, marker].sort((a, b) => a.frame - b.frame),
    })));
  },

  deleteMarker: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      markers: p.markers.filter((m) => m.id !== id),
    })));
  },

  gotoNextMarker: () => {
    const s = get();
    if (!s.project) return;
    const next = s.project.markers
      .filter((m) => m.frame > s.project!.currentFrame)
      .sort((a, b) => a.frame - b.frame)[0];
    if (next) s.gotoFrame(next.frame);
  },

  gotoPrevMarker: () => {
    const s = get();
    if (!s.project) return;
    const prev = s.project.markers
      .filter((m) => m.frame < s.project!.currentFrame)
      .sort((a, b) => b.frame - a.frame)[0];
    if (prev) s.gotoFrame(prev.frame);
  },

  // -------------------------------------------------------------------------
  // Audio
  // -------------------------------------------------------------------------

  addAudioClip: (clip) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      audioClips: { ...p.audioClips, [clip.id]: clip },
    })));
  },

  deleteAudioClip: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const audioClips = { ...p.audioClips };
      delete audioClips[id];
      const layers = p.layers.map((l) =>
        l.audioClipId === id ? { ...l, audioClipId: undefined } : l
      );
      return { ...p, audioClips, layers };
    }));
  },

  setAudioClipStart: (id, frame) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      audioClips: {
        ...p.audioClips,
        [id]: { ...p.audioClips[id], startFrame: frame },
      },
    })));
  },

  toggleAudioMute: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      audioClips: {
        ...p.audioClips,
        [id]: { ...p.audioClips[id], muted: !p.audioClips[id].muted },
      },
    })));
  },

  // -------------------------------------------------------------------------
  // Buttons & actions
  // -------------------------------------------------------------------------

  addButton: (button) => {
    const state = get();
    const id = genId("btn");
    if (!state.project) return id;
    const fullButton: InteractiveButton = {
      id,
      name: button.name ?? `Botón ${state.project.buttons.length + 1}`,
      x: button.x ?? 50,
      y: button.y ?? 50,
      width: button.width ?? 120,
      height: button.height ?? 40,
      label: button.label ?? "Botón",
      color: button.color ?? "#e67e22",
      visible: button.visible ?? true,
      handlers: button.handlers ?? [],
    };
    set(updateProject(state, (p) => ({
      ...p,
      buttons: [...p.buttons, fullButton],
    })));
    return id;
  },

  updateButton: (id, patch) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      buttons: p.buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })));
  },

  deleteButton: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      buttons: p.buttons.filter((b) => b.id !== id),
    })));
  },

  addHandler: (buttonId, handler) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      buttons: p.buttons.map((b) =>
        b.id === buttonId ? { ...b, handlers: [...b.handlers, handler] } : b
      ),
    })));
  },

  updateHandler: (buttonId, handlerId, patch) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      buttons: p.buttons.map((b) =>
        b.id === buttonId
          ? {
              ...b,
              handlers: b.handlers.map((h) =>
                h.id === handlerId ? { ...h, ...patch } : h
              ),
            }
          : b
      ),
    })));
  },

  deleteHandler: (buttonId, handlerId) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      buttons: p.buttons.map((b) =>
        b.id === buttonId
          ? { ...b, handlers: b.handlers.filter((h) => h.id !== handlerId) }
          : b
      ),
    })));
  },

  addAction: (buttonId, handlerId, action) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      buttons: p.buttons.map((b) =>
        b.id === buttonId
          ? {
              ...b,
              handlers: b.handlers.map((h) =>
                h.id === handlerId
                  ? { ...h, actions: [...h.actions, action] }
                  : h
              ),
            }
          : b
      ),
    })));
  },

  updateAction: (buttonId, handlerId, actionId, patch) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      buttons: p.buttons.map((b) =>
        b.id === buttonId
          ? {
              ...b,
              handlers: b.handlers.map((h) =>
                h.id === handlerId
                  ? {
                      ...h,
                      actions: h.actions.map((a) =>
                        a.id === actionId ? { ...a, ...patch } : a
                      ),
                    }
                  : h
              ),
            }
          : b
      ),
    })));
  },

  deleteAction: (buttonId, handlerId, actionId) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      buttons: p.buttons.map((b) =>
        b.id === buttonId
          ? {
              ...b,
              handlers: b.handlers.map((h) =>
                h.id === handlerId
                  ? { ...h, actions: h.actions.filter((a) => a.id !== actionId) }
                  : h
              ),
            }
          : b
      ),
    })));
  },

  // -------------------------------------------------------------------------
  // Variables
  // -------------------------------------------------------------------------

  setVariable: (name, value) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => {
      const others = p.variables.filter((v) => v.name !== name);
      return { ...p, variables: [...others, { name, value }] };
    }));
  },

  deleteVariable: (name) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      variables: p.variables.filter((v) => v.name !== name),
    })));
  },

  // -------------------------------------------------------------------------
  // Export options
  // -------------------------------------------------------------------------

  setExportOptions: (o) =>
    set((s) => ({ exportOptions: { ...s.exportOptions, ...o } })),

  // -------------------------------------------------------------------------
  // Misc UI
  // -------------------------------------------------------------------------

  setPanelLayout: (l) => set({ panelLayout: l }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSafeArea: () => set((s) => ({ showSafeArea: !s.showSafeArea })),
  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
  setDrawingBuffer: (c) => set({ drawingBuffer: c }),

  triggerAutosave: async () => {
    const s = get();
    if (!s.project || !s.project.dirty) return;
    set({ isAutosaving: true });
    await saveProjectToDb(s.project);
    set({
      isAutosaving: false,
      lastAutosaveAt: Date.now(),
      projects: [s.project, ...s.projects.filter((x) => x.id !== s.project!.id)],
    });
    set((st) => (st.project ? { project: { ...st.project, dirty: false } } : {}));
  },
}));

// ---------------------------------------------------------------------------
// Selector de capas ordenadas para visualización (de arriba a abajo)
// ---------------------------------------------------------------------------

export function getOrderedLayers(project: AnimationProject): Layer[] {
  return [...project.layers].reverse();
}

/** Devuelve la capa actualmente seleccionada. */
export function getCurrentLayer(project: AnimationProject): Layer | null {
  if (!project.currentLayerId) return null;
  return project.layers.find((l) => l.id === project.currentLayerId) ?? null;
}
