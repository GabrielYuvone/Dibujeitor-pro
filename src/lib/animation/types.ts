// ============================================================================
// TYPES — Modelo de datos del proyecto de animación tradicional 2D
// ============================================================================

/**
 * El modelo está pensado para una escuela de animación. Reproduce los
 * conceptos tradicionales: dibujo cuadro a cuadro, exposición de dibujos,
 * capas, onion skin y marcadores. El sistema interactivo (botones y
 * acciones estilo Flash clásico) está separado del núcleo de animación.
 */

// ---------------------------------------------------------------------------
// Tipos primitivos
// ---------------------------------------------------------------------------

export type ID = string;

export type RGB = { r: number; g: number; b: number };
export type RGBA = { r: number; g: number; b: number; a: number };

// ---------------------------------------------------------------------------
// Configuración del proyecto
// ---------------------------------------------------------------------------

export type AspectRatio =
  | "16:9"
  | "4:3"
  | "1:1"
  | "3:2"
  | "21:9"
  | "9:16"
  | "custom";

export interface ProjectSettings {
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  fps: number;
  bgColor: string;
  showSafeArea: boolean;
  defaultStrokeColor: string;
  defaultBrushSize: number;
}

// ---------------------------------------------------------------------------
// Sistema de dibujo
// ---------------------------------------------------------------------------

export type ToolId =
  | "pencil"
  | "brush"
  | "eraser"
  | "line"
  | "rectangle"
  | "ellipse"
  | "fill"
  | "selection"
  | "transform"
  | "eyedropper"
  | "pan"
  | "zoom";

export type StrokeCap = "round" | "square" | "butt";
export type StrokeJoin = "round" | "bevel" | "miter";

export interface BrushSettings {
  size: number;
  color: string;
  opacity: number;
  hardness: number;
  smoothing: number;
  pressureSensitivity: boolean;
  minSizePressure: number;
  cap: StrokeCap;
  join: StrokeJoin;
  eraserMode: "solid" | "soft";
}

// ---------------------------------------------------------------------------
// Dibujos y cuadros
// ---------------------------------------------------------------------------

export interface Drawing {
  id: ID;
  name: string;
  dataUrl: string;
  thumbnail?: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
}

export interface Cell {
  id: ID;
  drawingId: ID | null;
  startFrame: number;
  duration: number;
  label?: string;
}

// ---------------------------------------------------------------------------
// Capas
// ---------------------------------------------------------------------------

export type LayerType = "draw" | "reference" | "background" | "audio";

export type KeyframeType =
  | "key"
  | "extreme"
  | "breakdown"
  | "inbetween"
  | "none";

export interface Layer {
  id: ID;
  name: string;
  type: LayerType;
  cells: Cell[];
  visible: boolean;
  locked: boolean;
  opacity: number;
  audioClipId?: ID;
  parentId?: ID | null;
  frameLabels?: Record<number, KeyframeType>;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export interface AudioClip {
  id: ID;
  name: string;
  dataUrl: string;
  duration: number;
  waveform?: number[];
  startFrame: number;
  volume: number;
  muted: boolean;
}

// ---------------------------------------------------------------------------
// Marcadores del timeline
// ---------------------------------------------------------------------------

export interface Marker {
  id: ID;
  frame: number;
  label: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Sistema de botones y acciones (estilo Flash clásico)
// ---------------------------------------------------------------------------

export type EventType =
  | "click"
  | "press"
  | "release"
  | "mouseenter"
  | "mouseleave"
  | "animstart"
  | "animend"
  | "frame";

export type ActionType =
  | "play"
  | "pause"
  | "stop"
  | "restart"
  | "nextFrame"
  | "prevFrame"
  | "gotoFrame"
  | "gotoScene"
  | "show"
  | "hide"
  | "playSound"
  | "setVar"
  | "wait";

export interface Action {
  id: ID;
  type: ActionType;
  target?: string;
  value?: string | number;
  delayMs: number;
}

export interface EventHandler {
  id: ID;
  event: EventType;
  frame?: number;
  actions: Action[];
  condition?: string;
}

export interface InteractiveButton {
  id: ID;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  visible: boolean;
  handlers: EventHandler[];
}

export interface Variable {
  name: string;
  value: string | number | boolean;
}

// ---------------------------------------------------------------------------
// Escenas
// ---------------------------------------------------------------------------

export interface Scene {
  id: ID;
  name: string;
  startFrame: number;
  duration: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Biblioteca
// ---------------------------------------------------------------------------

export type LibraryItemType = "drawing" | "image" | "audio" | "background";

export interface LibraryItem {
  id: ID;
  name: string;
  type: LibraryItemType;
  dataUrl: string;
  width?: number;
  height?: number;
  tags: string[];
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Proyecto completo
// ---------------------------------------------------------------------------

export interface AnimationProject {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  layers: Layer[];
  drawings: Record<ID, Drawing>;
  audioClips: Record<ID, AudioClip>;
  markers: Marker[];
  buttons: InteractiveButton[];
  variables: Variable[];
  scenes: Scene[];
  library: LibraryItem[];
  currentFrame: number;
  currentLayerId: ID | null;
  lastSavedAt?: number;
  dirty: boolean;
  templateInstructions?: string;
}

// ---------------------------------------------------------------------------
// Estado de UI (no persistido)
// ---------------------------------------------------------------------------

export interface OnionSkinSettings {
  enabled: boolean;
  prevFrames: number;
  nextFrames: number;
  prevOpacity: number;
  nextOpacity: number;
  prevColor: string;
  nextColor: string;
  onlyPrevious: boolean;
}

export interface PlaybackState {
  playing: boolean;
  looping: boolean;
  speed: number;
  rangeStart: number | null;
  rangeEnd: number | null;
}

export type ViewMode = "edit" | "preview";

export interface CanvasView {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

export type ExportFormat = "png" | "jpeg" | "gif" | "png_sequence" | "jpeg_sequence";

export interface ExportOptions {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  rangeStart: number;
  rangeEnd: number;
  includeAudio: boolean;
  quality: number;
  backgroundColor: string;
}

// ---------------------------------------------------------------------------
// Plantillas educativas
// ---------------------------------------------------------------------------

export type ExerciseTemplate =
  | "bouncing_ball"
  | "walk_cycle"
  | "lip_sync"
  | "anticipation"
  | "squash_stretch"
  | "blank";

export interface ExerciseSpec {
  id: ExerciseTemplate;
  title: string;
  description: string;
  instructions: string[];
}
