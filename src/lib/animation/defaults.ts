// ============================================================================
// defaults.ts — Proyecto vacío, plantillas educativas, proyecto de demostración
// ============================================================================

import type {
  AnimationProject,
  BrushSettings,
  ExerciseSpec,
  OnionSkinSettings,
  ProjectSettings,
} from "./types";
import { genId } from "./utils";

// ---------------------------------------------------------------------------
// Valores por defecto
// ---------------------------------------------------------------------------

export const DEFAULT_BRUSH: BrushSettings = {
  size: 6,
  color: "#1a1a1a",
  opacity: 1,
  hardness: 0.8,
  smoothing: 0.35,
  pressureSensitivity: true,
  minSizePressure: 0.15,
  cap: "round",
  join: "round",
  eraserMode: "solid",
  fillTolerance: 32,
};

export const DEFAULT_ONION: OnionSkinSettings = {
  enabled: true,
  prevFrames: 3,
  nextFrames: 3,
  prevOpacity: 0.5,
  nextOpacity: 0.5,
  prevColor: "#ff6b35",
  nextColor: "#4dabf7",
  onlyPrevious: false,
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  width: 1280,
  height: 720,
  aspectRatio: "16:9",
  fps: 24,
  bgColor: "#ffffff",
  showSafeArea: false,
  defaultStrokeColor: "#1a1a1a",
  defaultBrushSize: 6,
};

// ---------------------------------------------------------------------------
// Plantillas educativas (especificaciones)
// ---------------------------------------------------------------------------

export const EXERCISES: ExerciseSpec[] = [
  {
    id: "bouncing_ball",
    title: "Pelota que rebota",
    description:
      "Ejercicio clásico para practicar timing, spacing, squash & stretch y arcos de movimiento.",
    instructions: [
      "Dibujá una pelota en 8 posiciones clave siguiendo un arco parabólico.",
      "Aplicá squash en el momento del impacto (frame de contacto).",
      "Aplicá stretch en los frames de aceleración/desaceleración.",
      "Usá onion skin para comparar las posiciones consecutivas.",
      "Reproducí a 24 FPS y verificá el ritmo del rebote.",
    ],
  },
  {
    id: "walk_cycle",
    title: "Ciclo de caminata",
    description:
      "Construccion de un ciclo de caminata completo (contacto, paso bajo, paso cruzado, paso alto).",
    instructions: [
      "Dibujá 4 poses clave: contacto, paso bajo, paso cruzado, paso alto.",
      "Agregá 4 intercalaciones entre cada par de poses clave.",
      "Verificá el arco de la cabeza y de las rodillas.",
      "Repetí el rango en bucle para validar el ciclo.",
    ],
  },
  {
    id: "lip_sync",
    title: "Sincronización labial",
    description:
      "Práctica de sincronización de boca con fonemas (A, E, I, O, U, M, F, S).",
    instructions: [
      "Importá una pista de audio con la frase a sincronizar.",
      "Marcá los frames donde cambia cada fonema.",
      "Dibujá las bocas correspondientes en cada marca.",
      "Reproducí con audio para verificar la sincronía.",
    ],
  },
  {
    id: "anticipation",
    title: "Anticipación",
    description:
      "Ejercicio sobre el principio de anticipación antes de una acción principal.",
    instructions: [
      "Dibujá 2 frames de anticipación (personaje se contrae).",
      "Dibujá 1 frame de acción principal.",
      "Dibujá 2 frames de recuperación.",
      "Compará con y sin anticipación para notar la diferencia.",
    ],
  },
  {
    id: "squash_stretch",
    title: "Squash & Stretch",
    description:
      "Ejercicio para dominar la deformación volumétrica en el impacto.",
    instructions: [
      "Dibujá una pelota redonda en reposo.",
      "En el impacto, aplastala horizontalmente (squash).",
      "En la subida, estírala verticalmente (stretch).",
      "Verificá que el volumen se conserve.",
    ],
  },
  {
    id: "blank",
    title: "Proyecto vacío",
    description: "Proyecto en blanco para prácticas libres.",
    instructions: ["Elegí tus propias poses y dibujá libremente."],
  },
];

// ---------------------------------------------------------------------------
// Proyecto vacío
// ---------------------------------------------------------------------------

export function createBlankProject(name = "Nuevo proyecto"): AnimationProject {
  const drawLayerId = genId("layer");
  const now = Date.now();
  return {
    id: genId("proj"),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS },
    layers: [
      {
        id: drawLayerId,
        name: "Capa de dibujo",
        type: "draw",
        cells: [
          {
            id: genId("cell"),
            drawingId: null,
            startFrame: 0,
            duration: 1,
          },
        ],
        visible: true,
        locked: false,
        opacity: 1,
        createdAt: now,
      },
    ],
    drawings: {},
    audioClips: {},
    markers: [],
    buttons: [],
    variables: [],
    scenes: [],
    library: [],
    currentFrame: 0,
    currentLayerId: drawLayerId,
    dirty: false,
  };
}

// ---------------------------------------------------------------------------
// Resoluciones comunes
// ---------------------------------------------------------------------------

export const RESOLUTIONS: { label: string; width: number; height: number; ratio: ProjectSettings["aspectRatio"] }[] = [
  { label: "HD 720p (1280×720)", width: 1280, height: 720, ratio: "16:9" },
  { label: "Full HD 1080p (1920×1080)", width: 1920, height: 1080, ratio: "16:9" },
  { label: "Cuadrado 1080×1080", width: 1080, height: 1080, ratio: "1:1" },
  { label: "4:3 SD (1024×768)", width: 1024, height: 768, ratio: "4:3" },
  { label: "Vertical 1080×1920", width: 1080, height: 1920, ratio: "9:16" },
  { label: "Cine 2560×1080", width: 2560, height: 1080, ratio: "21:9" },
];

export const COMMON_FPS = [12, 24, 30, 25, 60];

// ---------------------------------------------------------------------------
// Paleta de colores básica para el color picker
// ---------------------------------------------------------------------------

export const PALETTE_COLORS: string[] = [
  "#000000", "#1a1a1a", "#3a3a3a", "#7a7a7a", "#bcbcbc", "#ffffff",
  "#e74c3c", "#c0392b", "#e67e22", "#f39c12", "#f1c40f", "#2ecc71",
  "#27ae60", "#1abc9c", "#16a085", "#3498db", "#2980b9", "#9b59b6",
  "#8e44ad", "#34495e", "#2c3e50", "#d35400", "#7f8c8d", "#95a5a6",
  "#ff6b35", "#4dabf7", "#ff79c6", "#50fa7b", "#bd93f9", "#ffb86c",
];
