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
  | "ink"
  | "watercolor"
  | "eraser"
  | "line"
  | "rectangle"
  | "ellipse"
  | "fill"
  | "selection"
  | "transform"
  | "eyedropper"
  | "pan"
  | "zoom"
  | "move-layer";

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
  // Tipo de punta del pincel: "round" (redonda, suave) o "flat" (chata,
  // cuadrada, termina recto). Cambia el lineCap y lineJoin.
  brushTip: "round" | "flat";
  join: StrokeJoin;
  eraserMode: "solid" | "soft";
  fillTolerance: number;
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

/**
 * Keyframe de transformación de capa. Permite animar la posición,
 * escala y rotación de una capa a lo largo del tiempo. Por ejemplo,
 * un fondo que se desplaza horizontalmente mientras un personaje
 * camina, o un elemento que crece desde el centro.
 *
 * La interpolación entre dos keyframes consecutivos es LINEAL en
 * todos los canales (offsetX, offsetY, scale, rotation).
 */
export interface LayerTransformKeyframe {
  frame: number;
  offsetX: number;  // desplazamiento en píxeles (canvas coords)
  offsetY: number;
  scale: number;     // 1 = sin escala
  rotation: number;  // grados, 0 = sin rotación
}

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
  // Rango de bucle de la capa. Si está definido, la capa se repite dentro
  // de este rango al reproducir/exportar (útil para ciclos de caminata, etc.).
  loopRange?: { start: number; end: number; count: number } | null;
  // Keyframes de transformación (offset/scale/rotation) animados a lo
  // largo del tiempo. Ordenados por frame. Vacío = sin animación, capa
  // se renderiza sin transform (offset 0, scale 1, rotation 0).
  transformKeyframes?: LayerTransformKeyframe[];
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
  // Marcadores de formato para importar/exportar como archivo. __format
  // identifica que el JSON es un proyecto de Dibujeitor; __version permite
  // migrar el schema en el futuro sin romper archivos viejos.
  __format?: "dibujeitor-project";
  __version?: number;
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
  playbackFps: number;
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

export type ExportFormat = "png" | "jpeg" | "gif" | "png_sequence" | "jpeg_sequence" | "mp4" | "webm";

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
  // Cantidad de veces que se repite la animación en el export. 1 = una
  // sola vez (default). 3 = el video exportado contiene la animación 3
  // veces seguidas. Útil para loops cortos que querés ver repetidos en
  // redes sociales sin que el viewer tenga que re-play.
  loopCount: number;
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
