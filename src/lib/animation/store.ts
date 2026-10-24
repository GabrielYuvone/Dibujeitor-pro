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
  // Selección múltiple de cells en el timeline (no persistida).
  // El usuario puede Shift+click para rango, Ctrl/Cmd+click para toggle
  // individual. Las operaciones bulk (borrar, duplicar) aplican a la
  // selección completa si hay más de un cell seleccionado.
  selectedCellIds: Set<string>;

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
  // Guardar/cargar proyecto como archivo en la PC del usuario.
  // Formato: JSON con toda la estructura del AnimationProject (layers,
  // cells, drawings como dataUrl, audioClips, etc.). Es totalmente
  // serializable — no hay campos no-JSON-safe. Permite compartir el
  // proyecto como archivo.
  saveProjectToFile: () => Promise<void>;
  openProjectFromFile: (file: File) => Promise<void>;

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
  toggleLayerMask: (id: ID) => void;
  setLayerOpacity: (id: ID, opacity: number) => void;
  moveLayer: (id: ID, dir: "up" | "down") => void;
  // Mover una capa a una posición específica (para drag-and-drop reorder)
  moveLayerToIndex: (id: ID, targetIndex: number) => void;
  // Merge de capas: compone los drawings de las capas seleccionadas en
  // una sola capa (la de más abajo), y borra las demás.
  mergeLayers: (layerIds: ID[]) => Promise<void>;
  duplicateLayer: (id: ID) => void;
  setLayerLoop: (id: ID, range: { start: number; end: number; count: number } | null) => void;
  // Rotoscopio: extraer frames de un video y crear una capa de referencia
  importVideoForRotoscope: (
    videoFile: File,
    options: {
      videoFps: number;
      animFps: number;
      startFrame: number;
      endFrame: number;
      quality: number;
      maxWidth: number;
    },
    onProgress?: (current: number, total: number) => void
  ) => Promise<string>;

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
  // Selección múltiple de cells
  selectCell: (
    layerId: ID,
    cellId: ID,
    modifiers: { shift: boolean; ctrl: boolean }
  ) => void;
  clearCellSelection: () => void;
  deleteSelectedCells: () => void;

  // Expandir el bitmap de un drawing para incluir una posición (x, y)
  // que está fuera de los bounds actuales. Retorna cuánto se movió el
  // origen del bitmap (offsetX, offsetY) — quien llama debe ajustar el
  // draft offset y la posición del click en consecuencia.
  // Si no hace falta expandir, retorna {offsetX: 0, offsetY: 0}.
  ensureDrawingBounds: (
    drawingId: ID,
    x: number,
    y: number,
    margin?: number
  ) => Promise<{ offsetX: number; offsetY: number }>;

  // Cells / drawings
  ensureDrawingForCell: (layerId: ID, frame: number) => Promise<ID>;
  // Borrar todo el bitmap del drawing de la capa+frame actual. Útil para
  // "limpiar el canvas" sin tener que borrar a mano. Se accede con
  // doble-click en la goma del Toolbar. Es deshacerable (pushProjectSnapshot).
  clearActiveDrawing: () => Promise<void>;
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
  rotation?: number;       // grados de rotación (0 = sin rotar)
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
    loopCount: 1,
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
  // Set vacío de cell IDs seleccionados en el timeline. Es un Set<string>
  // (no array) para membership check O(1) al renderizar highlight.
  selectedCellIds: new Set<string>(),
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

  saveProjectToFile: async () => {
    const project = get().project;
    if (!project) return;
    // Serializar el proyecto completo a JSON. Todos los campos son
    // JSON-safe (drawings/audioClips son dataUrl strings base64).
    // No incluimos `dirty` ni `lastSavedAt` porque son estado interno
    // de sincronización con IndexedDB, no del proyecto en sí.
    const exportable = {
      ...project,
      dirty: false,
      lastSavedAt: undefined,
      // Marcar el formato para que el loader pueda validar y migrar
      __format: "dibujeitor-project",
      __version: 1,
    };
    const json = JSON.stringify(exportable, null, 2);
    // Sanitizar el nombre sugerido: solo alfanum, guiones, guion bajo.
    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "proyecto";

    // Preferir el File System Access API (Chrome/Edge moderno) — le
    // permite al usuario elegir la ubicación y el nombre del archivo en
    // un diálogo nativo del SO. Si el browser no lo soporta o el usuario
    // cancela, caemos al fallback de descarga automática.
    const w = window as any;
    if (typeof w.showSaveFilePicker === "function") {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName: `${safeName}.dibu`,
          types: [
            {
              description: "Proyecto Dibujeitor (.dibu)",
              accept: { "application/json": [".dibu"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        return; // Guardado exitoso en la ubicación elegida
      } catch (e: any) {
        // AbortError = el usuario canceló el diálogo (Escape o click en Cancel)
        if (e?.name === "AbortError") return;
        // Otro error (ej. browser no soporta createWritable) → fallback
        console.warn("showSaveFilePicker falló, usando descarga automática:", e);
      }
    }

    // Fallback: descarga automática al directorio de Downloads del browser.
    // No deja elegir ubicación/nombre, pero al menos descarga el archivo.
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.dibu`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  openProjectFromFile: async (file) => {
    // Leer el archivo como texto y parsear como JSON.
    const text = await file.text();
    let parsed: AnimationProject;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      alert(`No se pudo leer el archivo: no es JSON válido. Detalle: ${(e as Error).message}`);
      return;
    }
    // Validar que tenga los campos mínimos de un AnimationProject.
    if (!parsed || typeof parsed !== "object") {
      alert("Archivo inválido: no es un objeto JSON.");
      return;
    }
    if (!parsed.__format || parsed.__format !== "dibujeitor-project") {
      // No es nuestro formato, pero podríamos aceptar si tiene los campos
      // mínimos. Por ahora, exigimos el formato.
      if (!parsed.layers || !parsed.drawings || !parsed.settings) {
        alert("Archivo inválido: no parece ser un proyecto de Dibujeitor. Debe tener layers, drawings y settings.");
        return;
      }
      // OK, asumimos que es un proyecto válido sin el __format.
    }
    // Regenerar el ID para evitar colisiones con proyectos existentes en
    // IndexedDB (por si el usuario ya tiene un proyecto con el mismo ID).
    parsed.id = crypto.randomUUID();
    parsed.name = `${parsed.name} (importado)`;
    parsed.createdAt = Date.now();
    parsed.updatedAt = Date.now();
    parsed.dirty = false;
    parsed.lastSavedAt = Date.now();
    // Guardar en IndexedDB para que aparezca en la galería de proyectos.
    await saveProjectToDb(parsed);
    // Abrir el proyecto en el editor.
    set({
      project: parsed,
      canvasView: { zoom: 1, panX: 0, panY: 0, rotation: 0 },
    });
  },

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
    set(updateProject(state, (p) => {
      // Filtrar PRIMERO y luego usar el primer elemento REMAINING para
      // currentLayerId. Antes usaba p.layers[0] que podía ser la capa
      // que se estaba borrando → currentLayerId apuntaba a una capa
      // inexistente → el engine se quedaba sin capa activa →
      // "frame congelado" durante el playback.
      const remaining = p.layers.filter((l) => l.id !== id);
      return {
        ...p,
        layers: remaining,
        currentLayerId: p.currentLayerId === id ? remaining[0].id : p.currentLayerId,
      };
    }));
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

  toggleLayerMask: (id) => {
    const state = get();
    if (!state.project) return;
    get().pushProjectSnapshot();
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, isMask: !l.isMask } : l)),
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

  moveLayerToIndex: (id, targetIndex) => {
    const state = get();
    if (!state.project) return;
    get().pushProjectSnapshot();
    set(updateProject(state, (p) => {
      const layers = [...p.layers];
      const idx = layers.findIndex((l) => l.id === id);
      if (idx < 0 || targetIndex < 0 || targetIndex >= layers.length) return p;
      if (idx === targetIndex) return p;
      // Sacar la capa de su posición y insertarla en targetIndex
      const [layer] = layers.splice(idx, 1);
      layers.splice(targetIndex, 0, layer);
      return { ...p, layers };
    }));
  },

  mergeLayers: async (layerIds) => {
    const state = get();
    if (!state.project) return;
    const proj = state.project;
    // Encontrar las capas seleccionadas en el orden del array project.layers
    // (de abajo hacia arriba). La de más abajo es la "base" — se queda con
    // el contenido mergeado. Las demás se borran.
    const selectedLayers = proj.layers.filter((l) => layerIds.includes(l.id));
    if (selectedLayers.length < 2) return;

    get().pushProjectSnapshot();

    // La capa base es la PRIMERA en project.layers (más abajo en el z-order)
    const baseLayer = selectedLayers[0];
    const otherLayers = selectedLayers.slice(1);

    // Para cada celda de la capa base, componer los drawings de todas
    // las capas seleccionadas en ese frame range.
    const newDrawings = { ...proj.drawings };
    const mergedCells: typeof baseLayer.cells = [];

    for (const baseCell of baseLayer.cells) {
      // Crear canvas para componer
      const canvas = document.createElement("canvas");
      canvas.width = proj.settings.width;
      canvas.height = proj.settings.height;
      const ctx = canvas.getContext("2d")!;

      // Dibujar cada capa seleccionada (de abajo hacia arriba) en el
      // startFrame de esta celda
      for (const layer of selectedLayers) {
        if (!layer.visible) continue;
        const cell = layer.cells.find(
          (c) => baseCell.startFrame >= c.startFrame && baseCell.startFrame < c.startFrame + c.duration
        );
        if (!cell || !cell.drawingId) continue;
        const drawing = proj.drawings[cell.drawingId];
        if (!drawing) continue;
        // Cargar el drawing como imagen
        const img = await new Promise<HTMLImageElement | null>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => resolve(null);
          i.src = drawing.dataUrl;
        });
        if (img) {
          ctx.globalAlpha = layer.opacity;
          ctx.drawImage(img, 0, 0, drawing.width, drawing.height);
        }
      }
      ctx.globalAlpha = 1;

      const dataUrl = canvas.toDataURL("image/png");
      const drawingId = genId("draw");
      newDrawings[drawingId] = {
        id: drawingId,
        name: `Merged ${baseCell.startFrame}`,
        dataUrl,
        width: proj.settings.width,
        height: proj.settings.height,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mergedCells.push({
        ...baseCell,
        id: genId("cell"),
        drawingId,
      });
    }

    // Pre-cachear los nuevos drawings
    try {
      const { preloadImage } = await import("./useDrawingEngine");
      for (const cell of mergedCells) {
        if (cell.drawingId) {
          const d = newDrawings[cell.drawingId];
          if (d) await preloadImage(cell.drawingId, d.dataUrl);
        }
      }
    } catch (_) {}

    // Actualizar el proyecto: reemplazar las cells de la capa base,
    // borrar las otras capas, limpiar drawings huérfanos.
    set(updateProject(get(), (p) => {
      const remainingLayers = p.layers.filter((l) => !otherLayers.some((ol) => ol.id === l.id));
      const updatedLayers = remainingLayers.map((l) => {
        if (l.id === baseLayer.id) {
          return { ...l, cells: mergedCells };
        }
        return l;
      });
      return { ...p, layers: updatedLayers, drawings: newDrawings, currentLayerId: baseLayer.id };
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

  importVideoForRotoscope: async (videoFile, options, onProgress) => {
    const state = get();
    if (!state.project) return "";
    const proj = state.project;

    // 1. Cargar el video en un elemento <video> temporal
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    video.src = url;

    // Esperar a que el metadata cargue (duración, dimensiones)
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo cargar el video"));
    });

    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    // Redimensionar si es muy grande
    const scale = Math.min(1, options.maxWidth / videoW);
    const outW = Math.round(videoW * scale);
    const outH = Math.round(videoH * scale);

    // 2. Canvas para capturar frames
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;

    // 3. Calcular cuántos frames de animación vamos a extraer
    const totalAnimFrames = options.endFrame - options.startFrame + 1;

    // 4. Extraer cada frame
    const newDrawings: Record<string, Drawing> = {};
    const cells: Cell[] = [];
    const startFrame = 0; // Los cells empiezan en el frame 0 del proyecto

    for (let i = 0; i < totalAnimFrames; i++) {
      const animFrame = options.startFrame + i;
      // Timestamp en el video: frame / fps del video
      const timestamp = animFrame / options.videoFps;

      // Seek al timestamp
      video.currentTime = Math.min(timestamp, video.duration - 0.01);
      await new Promise<void>((resolve) => {
        const handler = () => { video.onseeked = null; resolve(); };
        video.onseeked = handler;
        // Timeout de seguridad por si onseeked no dispara
        setTimeout(resolve, 500);
      });

      // Capturar el frame
      ctx.drawImage(video, 0, 0, videoW, videoH, 0, 0, outW, outH);
      const dataUrl = canvas.toDataURL("image/jpeg", options.quality);

      // Crear el drawing
      const drawingId = genId("draw");
      const now = Date.now();
      newDrawings[drawingId] = {
        id: drawingId,
        name: `Roto ${i}`,
        dataUrl,
        width: outW,
        height: outH,
        createdAt: now,
        updatedAt: now,
      };

      // Pre-cachear
      try {
        const { preloadImage } = await import("./useDrawingEngine");
        await preloadImage(drawingId, dataUrl);
      } catch (_) {}

      // Crear cell
      cells.push({
        id: genId("cell"),
        drawingId,
        startFrame: startFrame + i,
        duration: 1,
      });

      onProgress?.(i + 1, totalAnimFrames);
      // Ceder al hilo
      await new Promise(r => setTimeout(r, 0));
    }

    // 5. Descartar el video
    URL.revokeObjectURL(url);
    video.src = "";

    // 6. Crear la capa de referencia
    const layerId = genId("layer");
    const newLayer: Layer = {
      id: layerId,
      name: `Rotoscopio: ${videoFile.name}`,
      type: "reference",
      cells,
      visible: true,
      locked: false,
      opacity: 0.5, // Semi-transparente para calcar
      createdAt: Date.now(),
    };

    // 7. Push snapshot + actualizar proyecto
    get().pushProjectSnapshot();
    set(updateProject(get(), (p) => ({
      ...p,
      layers: [newLayer, ...p.layers], // La referencia va al fondo
      drawings: { ...p.drawings, ...newDrawings },
      currentLayerId: p.currentLayerId, // No cambiar la capa activa
      dirty: true,
      updatedAt: Date.now(),
    })));

    return layerId;
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
  // Selección múltiple de cells (Shift=rango, Ctrl=toggle)
  // -------------------------------------------------------------------------

  selectCell: (layerId, cellId, modifiers) => {
    const state = get();
    if (!state.project) return;
    const layer = state.project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const clickedCell = layer.cells.find((c) => c.id === cellId);
    if (!clickedCell) return;

    if (modifiers.shift) {
      // Shift+click: seleccionar rango desde el último cell seleccionado
      // (en la misma capa) hasta el cell clickeado. Si no hay selección
      // previa en esta capa, el rango arranca desde el cell clickeado.
      const lastSelectedInLayer = layer.cells.find((c) =>
        state.selectedCellIds.has(c.id)
      );
      const anchor = lastSelectedInLayer ?? clickedCell;
      const startFrame = Math.min(anchor.startFrame, clickedCell.startFrame);
      const endFrame = Math.max(anchor.startFrame, clickedCell.startFrame);
      const range = layer.cells.filter(
        (c) => c.startFrame >= startFrame && c.startFrame <= endFrame
      );
      const newSet = new Set(state.selectedCellIds);
      range.forEach((c) => newSet.add(c.id));
      set({ selectedCellIds: newSet });
    } else if (modifiers.ctrl) {
      // Ctrl/Cmd+click: toggle individual
      const newSet = new Set(state.selectedCellIds);
      if (newSet.has(cellId)) newSet.delete(cellId);
      else newSet.add(cellId);
      set({ selectedCellIds: newSet });
    } else {
      // Click normal: selección única
      set({ selectedCellIds: new Set([cellId]) });
    }
  },

  clearCellSelection: () => {
    set({ selectedCellIds: new Set<string>() });
  },

  deleteSelectedCells: () => {
    const state = get();
    if (!state.project) return;
    const selected = state.selectedCellIds;
    if (selected.size === 0) return;
    get().pushProjectSnapshot();
    // Para cada cell seleccionado, borrarlo. No dejamos una capa sin cells.
    set(updateProject(state, (p) => ({
      ...p,
      layers: p.layers.map((l) => {
        const cellsToDelete = l.cells.filter((c) => selected.has(c.id));
        if (cellsToDelete.length === 0) return l;
        const remaining = l.cells.filter((c) => !selected.has(c.id));
        // Si la capa quedaría sin cells, agregar uno vacío en frame 0
        if (remaining.length === 0) {
          return {
            ...l,
            cells: [{ id: genId("cell"), drawingId: null, startFrame: 0, duration: 1 }],
          };
        }
        // Re-numerar startFrames para cerrar huecos (de izquierda a derecha)
        remaining.sort((a, b) => a.startFrame - b.startFrame);
        let cursor = remaining[0].startFrame;
        const rebased = remaining.map((c) => {
          const newCell = { ...c, startFrame: cursor };
          cursor += c.duration;
          return newCell;
        });
        return { ...l, cells: rebased };
      }),
    })));
    set({ selectedCellIds: new Set<string>() });
  },

  // -------------------------------------------------------------------------
  // Cells / drawings
  // -------------------------------------------------------------------------

  ensureDrawingBounds: async (drawingId, x, y, margin = 100) => {
    const state = get();
    if (!state.project) return { offsetX: 0, offsetY: 0 };
    const drawing = state.project.drawings[drawingId];
    if (!drawing) return { offsetX: 0, offsetY: 0 };

    // Calcular cuánto hay que expandir en cada dirección para que (x, y)
    // quede dentro del bitmap, con un margen para no expandir en cada click.
    const expandLeft = x < 0 ? Math.ceil(-x + margin) : 0;
    const expandTop = y < 0 ? Math.ceil(-y + margin) : 0;
    const expandRight = x >= drawing.width ? Math.ceil(x - drawing.width + margin) : 0;
    const expandBottom = y >= drawing.height ? Math.ceil(y - drawing.height + margin) : 0;

    if (expandLeft === 0 && expandTop === 0 && expandRight === 0 && expandBottom === 0) {
      return { offsetX: 0, offsetY: 0 };
    }

    // El origen del bitmap se mueve: lo que era (0, 0) ahora está en
    // (expandLeft, expandTop) del nuevo bitmap. Esto es lo que el caller
    // necesita para ajustar el draft (restar expandLeft/Top) y el click
    // (sumar expandLeft/Top).
    const offsetX = expandLeft;
    const offsetY = expandTop;
    const newW = drawing.width + expandLeft + expandRight;
    const newH = drawing.height + expandTop + expandBottom;

    // Crear nuevo canvas con las nuevas dimensiones
    const newCanvas = document.createElement("canvas");
    newCanvas.width = newW;
    newCanvas.height = newH;
    const newCtx = newCanvas.getContext("2d");
    if (!newCtx) return { offsetX: 0, offsetY: 0 };

    // Cargar la imagen actual y dibujarla en (offsetX, offsetY) del nuevo canvas
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = drawing.dataUrl;
    });
    if (img) {
      newCtx.drawImage(img, offsetX, offsetY);
    }

    const newDataUrl = newCanvas.toDataURL("image/png");
    const now = Date.now();

    // Pre-cachear la nueva imagen para que el rendering sea síncrono
    try {
      const { preloadImage } = await import("./useDrawingEngine");
      await preloadImage(drawingId, newDataUrl);
    } catch (_) {
      // ignore
    }

    // Actualizar el drawing con las nuevas dimensiones y dataUrl
    set((s) => {
      if (!s.project) return {};
      return {
        project: {
          ...s.project,
          drawings: {
            ...s.project.drawings,
            [drawingId]: {
              ...drawing,
              dataUrl: newDataUrl,
              width: newW,
              height: newH,
              updatedAt: now,
            },
          },
          dirty: true,
          updatedAt: now,
        },
      };
    });

    return { offsetX, offsetY };
  },

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

  clearActiveDrawing: async () => {
    const state = get();
    if (!state.project) return;
    const proj = state.project;
    const layer = proj.layers.find((l) => l.id === proj.currentLayerId);
    if (!layer) return;
    const cell = layer.cells.find(
      (c) => proj.currentFrame >= c.startFrame && proj.currentFrame < c.startFrame + c.duration
    );
    if (!cell || !cell.drawingId) return;
    const drawing = proj.drawings[cell.drawingId];
    if (!drawing) return;
    // Extraer IDs a variables locales para que TypeScript sepa que son
    // no-null dentro del callback del set (que es un closure distinto).
    const drawingId = cell.drawingId;

    // Snapshot ANTES de mutar (deshacerable con Ctrl+Z)
    get().pushProjectSnapshot();

    // Crear canvas vacío con las dimensiones actuales del drawing
    // (que pueden ser más grandes que project.settings si fue expandido)
    const emptyCanvas = document.createElement("canvas");
    emptyCanvas.width = drawing.width;
    emptyCanvas.height = drawing.height;
    const emptyDataUrl = emptyCanvas.toDataURL("image/png");

    // Pre-cachear la imagen vacía para que el rendering sea síncrono
    try {
      const { preloadImage } = await import("./useDrawingEngine");
      await preloadImage(drawingId, emptyDataUrl);
    } catch (_) {
      // ignore
    }

    const now = Date.now();
    set((s) => {
      if (!s.project) return {};
      return {
        project: {
          ...s.project,
          drawings: {
            ...s.project.drawings,
            [drawingId]: {
              ...drawing,
              dataUrl: emptyDataUrl,
              updatedAt: now,
            },
          },
          dirty: true,
          updatedAt: now,
        },
      };
    });
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
    if (!layer) {
      // No hay capa activa — no pegar, mostrar error claro
      set({ imagePlacement: null });
      console.warn("confirmImagePlacement: no hay capa activa");
      return;
    }
    if (layer.locked) {
      // Capa bloqueada — no se puede pegar, mostrar error claro
      set({ imagePlacement: null });
      alert(`La capa "${layer.name}" está bloqueada. Desbloqueala para pegar la imagen.`);
      return;
    }
    if (layer.type === "audio") {
      // Capa de audio — no acepta imágenes
      set({ imagePlacement: null });
      alert(`La capa "${layer.name}" es de audio. Seleccioná una capa de dibujo/referencia/fondo para pegar.`);
      return;
    }
    // Si la capa está OCULTA, la mostramos automáticamente — el usuario
    // está pegando explícitamente, así que quiere verla. Antes esto
    // abortaba silenciosamente y la imagen "desaparecía" sin explicación
    // (issue reportado: "no sé donde pega la imagen").
    if (!layer.visible) {
      set(updateProject(s, (p) => ({
        ...p,
        layers: p.layers.map((l) =>
          l.id === layer.id ? { ...l, visible: true } : l
        ),
      })));
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
    // Dibujar la imagen colocada en su transformación final (con rotación)
    const rot = placement.rotation ?? 0;
    if (rot !== 0) {
      tmpCtx.save();
      tmpCtx.translate(placement.x + placement.width / 2, placement.y + placement.height / 2);
      tmpCtx.rotate((rot * Math.PI) / 180);
      tmpCtx.drawImage(img, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
      tmpCtx.restore();
    } else {
      tmpCtx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
    }
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
