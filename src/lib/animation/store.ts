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
import { genId, totalFrames, interpolateLayerTransform } from "./utils";
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

  // Estado de dibujo y modificadores de teclado
  isDrawing: boolean;
  rightPanelVisible: boolean;
  xModifier: boolean;
  zModifier: boolean;
  spaceModifier: boolean;
  toolSettings: Record<string, Partial<BrushSettings>>;
  customPalette: string[];
  // Drafts de transform por capa (no persistidos). Ver comentario en el
  // estado inicial para más detalle.
  layerDrafts: Record<string, { offsetX: number; offsetY: number; scale: number; rotation: number }>;

  // Selección temporal (texto activo)
  drawingBuffer: HTMLCanvasElement | null;

  // Pilas de undo/redo
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  skipReloadOnHistory: boolean;

  // Placement de imagen importada: cuando el usuario hace click en una
  // imagen de la biblioteca, se activa el modo transformación. La imagen
  // se muestra sobre el canvas con su aspect ratio original, y el usuario
  // puede moverla (drag dentro) o escalarla (drag de las puntas) antes de
  // confirmar (Enter) o cancelar (Escape).
  imagePlacement: ImagePlacement | null;

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
  setPlaybackFps: (fps: number) => void;
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
  setLayerLoop: (id: ID, range: { start: number; end: number; count: number } | null) => void;

  // Transform keyframes (animación de offset/scale/rotation por capa)
  setLayerTransformAtFrame: (
    layerId: ID,
    frame: number,
    transform: { offsetX: number; offsetY: number; scale: number; rotation: number }
  ) => void;
  removeLayerTransformKeyframe: (layerId: ID, frame: number) => void;
  clearLayerTransformKeyframes: (layerId: ID) => void;
  // Draft transform: preview "live" del offset aplicado a una capa
  // cuando el usuario arrastra con space o con el tool "move-layer".
  // NO se persiste al guardar el proyecto. Para commitear el draft como
  // keyframe, el usuario debe presionar el botón "Keyframe" (que llama a
  // commitLayerDraftAsKeyframe). Esto separa "mover libremente" de
  // "animar con keyframes" como pidió el usuario.
  setLayerDraft: (
    layerId: ID,
    transform: { offsetX: number; offsetY: number; scale: number; rotation: number }
  ) => void;
  clearLayerDraft: (layerId: ID) => void;
  commitLayerDraftAsKeyframe: (layerId: ID, frame: number) => void;

  // Cells / drawings
  ensureDrawingForCell: (layerId: ID, frame: number) => Promise<ID>;
  setCellDrawing: (layerId: ID, frame: number, drawingId: ID | null) => void;
  extendCell: (layerId: ID, frame: number, delta: number) => void;
  setCellDuration: (layerId: ID, cellId: ID, newDuration: number) => void;
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
  setRightPanelVisible: (v: boolean) => void;
  saveCustomPalette: (palette: string[]) => void;
  loadCustomPalette: () => string[];

  // Undo / Redo multinivel
  pushHistory: (drawingId: ID, prevDataUrl: string, newDataUrl: string) => void;
  pushProjectSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Placement de imagen (modo transformación de imagen importada)
  startImagePlacement: (dataUrl: string, nativeW: number, nativeH: number) => void;
  updateImagePlacement: (patch: Partial<ImagePlacement>) => void;
  confirmImagePlacement: () => Promise<void>;
  cancelImagePlacement: () => void;

  // Autosave
  triggerAutosave: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Tipo para entradas del stack de undo/redo
// ---------------------------------------------------------------------------
// Dos tipos de entrada:
//  - "drawing": edición in-place de un drawing (pincel, goma, etc.)
//  - "project": cambio estructural (agregar capa, mover cell, extender
//    cell, etc.). Para estos, capturamos una referencia al project
//    PRE-mutación. Como los proyectos son inmutables (cada mutación
//    produce un nuevo objeto), la referencia capturada sigue apuntando
//    al estado anterior. La memoria es eficiente porque los drawings
//    compartidos entre snapshots se referencian, no se duplican.

type HistoryEntry =
  | { type: "drawing"; drawingId: ID; prevDataUrl: string; newDataUrl: string }
  | { type: "project"; prevProject: AnimationProject };

// ---------------------------------------------------------------------------
// Tipo para el placement de imagen (transformación interactiva)
// ---------------------------------------------------------------------------

interface ImagePlacement {
  dataUrl: string;        // imagen original (data URL)
  x: number;               // posición x en coords del canvas (esquina sup-izq)
  y: number;               // posición y
  width: number;           // ancho actual (preserva aspect ratio)
  height: number;          // alto actual
  nativeW: number;         // ancho original de la imagen (px)
  nativeH: number;         // alto original (px)
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
    playbackFps: 6,
    rangeStart: null,
    rangeEnd: null,
  },
  canvasView: { zoom: 1, panX: 0, panY: 0, rotation: 0 },
  viewMode: "edit",
  exportOptions: {
    format: "mp4",
    width: DEFAULT_SETTINGS.width,
    height: DEFAULT_SETTINGS.height,
    fps: DEFAULT_SETTINGS.fps,
    rangeStart: 0,
    rangeEnd: 0,
    includeAudio: true,
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
  // Estado de dibujo y modificadores de teclado (no persistidos)
  isDrawing: false,
  rightPanelVisible: true,
  xModifier: false,
  zModifier: false,
  spaceModifier: false,
  toolSettings: {} as Record<string, Partial<BrushSettings>>,
  customPalette: [] as string[],
  // Drafts de transformación por capa (no persistidos). Cuando el usuario
  // arrastra una capa con space o con el tool "move-layer", se acumula acá
  // el offset "live". El rendering aplica interpolated transform + draft.
  // Si el usuario quiere guardarlo como keyframe, llama al botón "Keyframe"
  // (commitLayerDraftAsKeyframe) que captura interpolated + draft como
  // keyframe en el frame actual y resetea el draft.
  layerDrafts: {} as Record<string, { offsetX: number; offsetY: number; scale: number; rotation: number }>,
  // Pilas de undo/redo (no persistidas)
  undoStack: [] as HistoryEntry[],
  redoStack: [] as HistoryEntry[],
  // Indicador para evitar que el motor de dibujo recargue el canvas
  // cuando se hace undo/redo (la imagen cacheada ya está actualizada)
  skipReloadOnHistory: false,
  // Placement de imagen (transformación interactiva)
  imagePlacement: null as ImagePlacement | null,

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

  setTool: (tool) => {
    set((s) => {
      // Guardar la configuración actual del pincel para la herramienta actual
      // y restaurar la configuración guardada para la nueva herramienta.
      const prevTool = s.currentTool;
      const toolSettings = { ...s.toolSettings };
      // Guardar settings relevantes (size, opacity, color, hardness, etc.)
      toolSettings[prevTool] = {
        size: s.brush.size,
        color: s.brush.color,
        opacity: s.brush.opacity,
        hardness: s.brush.hardness,
        smoothing: s.brush.smoothing,
        fillTolerance: s.brush.fillTolerance,
      };
      // Restaurar settings de la nueva herramienta (si existen)
      const restored = toolSettings[tool];
      const newBrush = restored
        ? { ...s.brush, ...restored }
        : s.brush;
      return { currentTool: tool, toolSettings, brush: newBrush };
    });
  },
  setBrush: (b) => set((s) => ({ brush: { ...s.brush, ...b } })),

  setOnion: (o) => set((s) => ({ onion: { ...s.onion, ...o } })),

  togglePlay: () => set((s) => ({ playback: { ...s.playback, playing: !s.playback.playing } })),
  setPlaying: (p) => set((s) => ({ playback: { ...s.playback, playing: p } })),
  setLooping: (l) => set((s) => ({ playback: { ...s.playback, looping: l } })),
  setPlaybackFps: (fps) => set((s) => ({ playback: { ...s.playback, playbackFps: Math.max(1, fps) } })),
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
    get().pushProjectSnapshot();
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
    get().pushProjectSnapshot();
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
    get().pushProjectSnapshot();
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
    get().pushProjectSnapshot();
    set(updateProject(state, (p) => {
      const layer = p.layers.find((l) => l.id === id);
      if (!layer) return p;
      const newId = genId("layer");
      // IMPORTANTE: duplicar también los Drawing de cada celda. Si no, las
      // celdas de la nueva capa apuntan al mismo drawingId que las originales
      // y cualquier edición en una capa se refleja en la otra (comparten el
      // mismo bitmap subyacente). Duplicando los drawings garantizamos que
      // la copia sea totalmente independiente.
      const newDrawings = { ...p.drawings };
      const newCells = layer.cells.map((c) => {
        const newCellId = genId("cell");
        if (!c.drawingId) {
          return { ...c, id: newCellId };
        }
        const orig = p.drawings[c.drawingId];
        if (!orig) {
          return { ...c, id: newCellId };
        }
        const newDrawingId = genId("draw");
        newDrawings[newDrawingId] = {
          ...orig,
          id: newDrawingId,
          name: `${orig.name} (copia)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return { ...c, id: newCellId, drawingId: newDrawingId };
      });
      const newLayer: Layer = {
        ...layer,
        id: newId,
        name: `${layer.name} (copia)`,
        cells: newCells,
        createdAt: Date.now(),
      };
      const idx = p.layers.findIndex((l) => l.id === id);
      const layers = [...p.layers];
      layers.splice(idx + 1, 0, newLayer);
      return { ...p, layers, currentLayerId: newId, drawings: newDrawings };
    }));
  },

  setLayerLoop: (id, range) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, loopRange: range } : l)),
    })));
  },

  // -------------------------------------------------------------------------
  // Transform keyframes de capa (offset/scale/rotation animados)
  // -------------------------------------------------------------------------

  setLayerTransformAtFrame: (layerId, frame, transform) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const kfs = [...(l.transformKeyframes ?? [])];
        const idx = kfs.findIndex((k) => k.frame === frame);
        const newKf = { frame, ...transform };
        if (idx >= 0) {
          kfs[idx] = newKf;
        } else {
          kfs.push(newKf);
          kfs.sort((a, b) => a.frame - b.frame);
        }
        return { ...l, transformKeyframes: kfs };
      }),
    })));
  },

  removeLayerTransformKeyframe: (layerId, frame) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const kfs = (l.transformKeyframes ?? []).filter((k) => k.frame !== frame);
        return { ...l, transformKeyframes: kfs };
      }),
    })));
  },

  clearLayerTransformKeyframes: (layerId) => {
    const state = get();
    if (!state.project) return;
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) =>
        l.id === layerId ? { ...l, transformKeyframes: [] } : l
      ),
    })));
  },

  // -------------------------------------------------------------------------
  // Draft transform (preview "live" del offset; no crea keyframe hasta
  // que el usuario lo commitea explícitamente con el botón "Keyframe")
  // -------------------------------------------------------------------------

  setLayerDraft: (layerId, transform) => {
    // Solo actualiza el draft en memoria — no toca el project ni el undo.
    // El rendering aplica (interpolated + draft) para mostrar el preview.
    set((s) => ({
      layerDrafts: { ...s.layerDrafts, [layerId]: transform },
    }));
  },

  clearLayerDraft: (layerId) => {
    set((s) => {
      const next = { ...s.layerDrafts };
      delete next[layerId];
      return { layerDrafts: next };
    });
  },

  commitLayerDraftAsKeyframe: (layerId, frame) => {
    // Captura el transform ACTUAL (interpolated + draft) como keyframe
    // en el frame actual y resetea el draft a identidad. Así el usuario
    // puede arrastrar libremente sin crear keyframes automáticamente y
    // commitear solo cuando lo decide.
    const state = get();
    if (!state.project) return;
    const layer = state.project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const draft = state.layerDrafts[layerId];
    // interp = transform interpolado en este frame (de los kfs existentes)
    const interp = interpolateLayerTransform(layer, frame);
    // final = interp + draft (suma en offset y rotation, multiplica scale)
    const finalTransform = {
      offsetX: interp.offsetX + (draft?.offsetX ?? 0),
      offsetY: interp.offsetY + (draft?.offsetY ?? 0),
      scale: interp.scale * (draft?.scale ?? 1),
      rotation: interp.rotation + (draft?.rotation ?? 0),
    };
    // Push snapshot ANTES de mutar el project (para que sea deshacerable)
    get().pushProjectSnapshot();
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const kfs = [...(l.transformKeyframes ?? [])];
        const idx = kfs.findIndex((k) => k.frame === frame);
        const newKf = { frame, ...finalTransform };
        if (idx >= 0) kfs[idx] = newKf;
        else {
          kfs.push(newKf);
          kfs.sort((a, b) => a.frame - b.frame);
        }
        return { ...l, transformKeyframes: kfs };
      }),
    })));
    // Resetear el draft — el offset ahora está "bakeado" en el keyframe.
    set((s) => {
      const next = { ...s.layerDrafts };
      delete next[layerId];
      return { layerDrafts: next };
    });
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

    // Snapshot ANTES de mutar — esto es lo que faltaba para que el primer
    // "+" del usuario sea deshacerable (issue reportado: "apenas empiezo
    // a trabajar no puedo deshacer el frame").
    get().pushProjectSnapshot();

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
    get().pushProjectSnapshot();
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

  // Cambiar la duración de una celda específica por su ID
  setCellDuration: (layerId, cellId, newDuration) => {
    // Cambia la duración (exposición) de un cell. Si la duración AUMENTA,
    // los cells posteriores de la misma capa se desplazan a la derecha
    // para no quedar solapados (que es el bug que reporta el usuario).
    // Si disminuye, los cells siguientes se "pegan" al nuevo fin
    // manteniendo la continuidad temporal (más útil que dejar un hueco).
    const state = get();
    if (!state.project) return;
    get().pushProjectSnapshot();
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const idx = l.cells.findIndex((c) => c.id === cellId);
        if (idx < 0) return l;
        const cell = l.cells[idx];
        const safeDuration = Math.max(1, newDuration);
        const delta = safeDuration - cell.duration;
        // Mover todos los cells posteriores por delta
        const cells = l.cells.map((c, i) => {
          if (i === idx) return { ...c, duration: safeDuration };
          if (i > idx) return { ...c, startFrame: Math.max(0, c.startFrame + delta) };
          return c;
        });
        cells.sort((a, b) => a.startFrame - b.startFrame);
        return { ...l, cells };
      });
      return { ...p, layers };
    }));
  },

  extendCell: (layerId, frame, delta) => {
    const state = get();
    if (!state.project) return;
    get().pushProjectSnapshot();
    const layer = state.project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const cell = layer.cells.find(
      (c) => frame >= c.startFrame && frame < c.startFrame + c.duration
    );
    if (!cell) return;
    const newDuration = Math.max(1, cell.duration + delta);
    get().setCellDuration(layerId, cell.id, newDuration);
  },

  insertEmptyFrame: (layerId, frame) => {
    const state = get();
    if (!state.project) return;
    get().pushProjectSnapshot();
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
    get().pushProjectSnapshot();
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
    get().pushProjectSnapshot();
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
    // Mueve un cell a `newFrame` (en coords absolutas del timeline). Si al
    // moverlo queda solapado con otro cell de la misma capa, empuja los
    // posteriores a la derecha hasta que no haya solapamiento. Esto
    // permite arrastrar cells dentro del timeline y que el layout se
    // reorganice sin superposiciones.
    const state = get();
    if (!state.project) return;
    get().pushProjectSnapshot();
    set(updateProject(state, (p) => {
      const layers = p.layers.map((l) => {
        if (l.id !== layerId) return l;
        const cells = l.cells.map((c) =>
          c.id === cellId ? { ...c, startFrame: Math.max(0, newFrame) } : c
        );
        cells.sort((a, b) => a.startFrame - b.startFrame);
        // Resolver solapamientos: si un cell empieza antes de que termine
        // el anterior, empujarlo a la derecha. Procesar en orden.
        for (let i = 1; i < cells.length; i++) {
          const prev = cells[i - 1];
          const cur = cells[i];
          const prevEnd = prev.startFrame + prev.duration;
          if (cur.startFrame < prevEnd) {
            cells[i] = { ...cur, startFrame: prevEnd };
          }
        }
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
  setRightPanelVisible: (v) => set({ rightPanelVisible: v }),
  saveCustomPalette: (palette) => {
    set({ customPalette: palette });
    try {
      localStorage.setItem("dibujeitor:customPalette", JSON.stringify(palette));
    } catch (e) {
      console.warn("No se pudo guardar la paleta:", e);
    }
  },
  loadCustomPalette: () => {
    try {
      const raw = localStorage.getItem("dibujeitor:customPalette");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        set({ customPalette: parsed });
        return parsed as string[];
      }
    } catch (e) {
      console.warn("No se pudo cargar la paleta:", e);
    }
    return [];
  },

  // -------------------------------------------------------------------------
  // Undo / Redo multinivel
  // -------------------------------------------------------------------------

  pushHistory: (drawingId, prevDataUrl, newDataUrl) => {
    // Si prev y new son idénticos, no agregar entrada (no-op)
    if (prevDataUrl === newDataUrl) return;
    set((s) => ({
      undoStack: [...s.undoStack, { type: "drawing" as const, drawingId, prevDataUrl, newDataUrl }].slice(-50),
      redoStack: [], // Clear redo on new action
    }));
  },

  pushProjectSnapshot: () => {
    // Captura una referencia al project actual ANTES de mutarlo. Las
    // acciones estructurales (addLayer, moveCell, etc.) deben llamar esto
    // ANTES de hacer el `set(updateProject(...))`. Como el proyecto es
    // inmutable (cada mutación produce un nuevo objeto), la referencia
    // capturada sigue siendo el "estado previo" y se puede restaurar en
    // undo sin necesidad de diffing.
    set((s) => {
      if (!s.project) return {};
      return {
        undoStack: [...s.undoStack, { type: "project" as const, prevProject: s.project }].slice(-50),
        redoStack: [],
      };
    });
  },

  undo: () => {
    const s = get();
    if (s.undoStack.length === 0) return;
    const entry = s.undoStack[s.undoStack.length - 1];
    if (entry.type === "drawing") {
      // Restaurar el dataUrl anterior en el proyecto
      set((st) => {
        if (!st.project) return {};
        if (!st.project.drawings[entry.drawingId]) return {};
        const restored = {
          ...st.project,
          drawings: {
            ...st.project.drawings,
            [entry.drawingId]: {
              ...st.project.drawings[entry.drawingId],
              dataUrl: entry.prevDataUrl,
              updatedAt: Date.now(),
            },
          },
          dirty: true,
          updatedAt: Date.now(),
        };
        return {
          project: restored,
          undoStack: st.undoStack.slice(0, -1),
          redoStack: [...st.redoStack, entry],
          skipReloadOnHistory: false,
        };
      });
      // Pre-cachear la imagen restaurada
      import("./useDrawingEngine").then(({ preloadImage }) => {
        preloadImage(entry.drawingId, entry.prevDataUrl);
      });
    } else {
      // entry.type === "project"
      // Restaurar el project capturado en el snapshot. Como el project es
      // inmutable, esta referencia sigue siendo el estado previo.
      // IMPORTANTE: guardar el estado ACTUAL en redoStack ANTES de
      // restaurar, así el redo puede volver adelante.
      set((st) => {
        const curProject = st.project;
        if (!curProject) return {};
        return {
          project: entry.prevProject,
          undoStack: st.undoStack.slice(0, -1),
          // Para redo del snapshot de project, guardamos la versión QUE
          // teníamos ANTES de restaurar (i.e., la post-mutación).
          redoStack: [...st.redoStack, { type: "project" as const, prevProject: curProject }],
          skipReloadOnHistory: false,
        };
      });
    }
  },

  redo: () => {
    const s = get();
    if (s.redoStack.length === 0) return;
    const entry = s.redoStack[s.redoStack.length - 1];
    if (entry.type === "drawing") {
      set((st) => {
        if (!st.project) return {};
        if (!st.project.drawings[entry.drawingId]) return {};
        const restored = {
          ...st.project,
          drawings: {
            ...st.project.drawings,
            [entry.drawingId]: {
              ...st.project.drawings[entry.drawingId],
              dataUrl: entry.newDataUrl,
              updatedAt: Date.now(),
            },
          },
          dirty: true,
          updatedAt: Date.now(),
        };
        return {
          project: restored,
          redoStack: st.redoStack.slice(0, -1),
          undoStack: [...st.undoStack, entry],
          skipReloadOnHistory: false,
        };
      });
      import("./useDrawingEngine").then(({ preloadImage }) => {
        preloadImage(entry.drawingId, entry.newDataUrl);
      });
    } else {
      // entry.type === "project" — prevProject es la versión POST-mutación
      // (la que guardamos cuando hicimos undo). La restauramos y guardamos
      // el estado actual (pre-redo) en undoStack.
      set((st) => {
        const curProject = st.project;
        if (!curProject) return {};
        return {
          project: entry.prevProject,
          redoStack: st.redoStack.slice(0, -1),
          undoStack: [...st.undoStack, { type: "project" as const, prevProject: curProject }],
          skipReloadOnHistory: false,
        };
      });
    }
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  // -------------------------------------------------------------------------
  // Placement de imagen (modo transformación de imagen importada)
  // -------------------------------------------------------------------------

  startImagePlacement: (dataUrl, nativeW, nativeH) => {
    const s = get();
    if (!s.project) return;
    // Calcular tamaño inicial preservando aspect ratio:
    // - Si la imagen es más chica que el canvas, usar tamaño nativo
    // - Si es más grande, escalar para que entre (con margen del 10%)
    const cw = s.project.settings.width;
    const ch = s.project.settings.height;
    const margin = 0.1; // 10% de margen
    const maxW = cw * (1 - 2 * margin);
    const maxH = ch * (1 - 2 * margin);
    let w = nativeW;
    let h = nativeH;
    if (w > maxW || h > maxH) {
      const scale = Math.min(maxW / w, maxH / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    // Centrar en el canvas
    const x = Math.round((cw - w) / 2);
    const y = Math.round((ch - h) / 2);
    set({
      imagePlacement: {
        dataUrl,
        x,
        y,
        width: w,
        height: h,
        nativeW,
        nativeH,
      },
    });
  },

  updateImagePlacement: (patch) => {
    set((s) => ({
      imagePlacement: s.imagePlacement ? { ...s.imagePlacement, ...patch } : null,
    }));
  },

  confirmImagePlacement: async () => {
    const s = get();
    if (!s.project || !s.imagePlacement) return;
    const placement = s.imagePlacement;
    // Renderizar la imagen al tamaño actual en el canvas del drawing activo
    // Crear nuevo drawing o usar el existente
    const layer = s.project.layers.find((l) => l.id === s.project!.currentLayerId);
    if (!layer || layer.locked || !layer.visible || layer.type === "audio") {
      set({ imagePlacement: null });
      return;
    }

    // Cargar la imagen
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = placement.dataUrl;
    });
    if (!img) {
      set({ imagePlacement: null });
      return;
    }

    // Crear un canvas temporal con el contenido actual del drawing + la imagen pegada
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = s.project.settings.width;
    tmpCanvas.height = s.project.settings.height;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    // Si hay un drawing existente, dibujarlo primero
    const cell = layer.cells.find(
      (c) =>
        s.project!.currentFrame >= c.startFrame &&
        s.project!.currentFrame < c.startFrame + c.duration
    );
    if (cell?.drawingId) {
      const existing = s.project.drawings[cell.drawingId];
      if (existing) {
        const existingImg = await new Promise<HTMLImageElement | null>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => resolve(null);
          i.src = existing.dataUrl;
        });
        if (existingImg) {
          tmpCtx.drawImage(existingImg, 0, 0, tmpCanvas.width, tmpCanvas.height);
        }
      }
    }
    // Dibujar la imagen colocada en su transformación final
    tmpCtx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
    const finalDataUrl = tmpCanvas.toDataURL("image/png");

    // Crear/actualizar el drawing con la imagen pegada
    const drawingId = cell?.drawingId ?? crypto.randomUUID();
    const now = Date.now();
    const prevDataUrl = cell?.drawingId ? s.project.drawings[cell.drawingId]?.dataUrl ?? "" : "";

    // Pre-cachear la imagen final
    const { preloadImage } = await import("./useDrawingEngine");
    await preloadImage(drawingId, finalDataUrl);

    set((st) => {
      if (!st.project) return {};
      const layers = st.project.layers.map((l) => {
        if (l.id !== layer.id) return l;
        const cells = [...l.cells];
        const existingCell = cells.find(
          (c) =>
            st.project!.currentFrame >= c.startFrame &&
            st.project!.currentFrame < c.startFrame + c.duration
        );
        if (existingCell) {
          const idx = cells.indexOf(existingCell);
          cells[idx] = { ...existingCell, drawingId };
        } else {
          cells.push({
            id: crypto.randomUUID(),
            drawingId,
            startFrame: st.project.currentFrame,
            duration: 1,
          });
          cells.sort((a, b) => a.startFrame - b.startFrame);
        }
        return { ...l, cells };
      });
      return {
        project: {
          ...st.project,
          layers,
          drawings: {
            ...st.project.drawings,
            [drawingId]: {
              id: drawingId,
              name: "Imagen importada",
              dataUrl: finalDataUrl,
              width: st.project.settings.width,
              height: st.project.settings.height,
              createdAt: now,
              updatedAt: now,
            },
          },
          dirty: true,
          updatedAt: now,
        },
        imagePlacement: null,
      };
    });

    // Registrar en el stack de undo
    if (prevDataUrl && prevDataUrl !== finalDataUrl) {
      get().pushHistory(drawingId, prevDataUrl, finalDataUrl);
    }
  },

  cancelImagePlacement: () => {
    set({ imagePlacement: null });
  },

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
