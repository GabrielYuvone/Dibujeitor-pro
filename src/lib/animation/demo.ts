// ============================================================================
// demo.ts — Proyecto de demostración con animación simple y botones
// ============================================================================

import type { AnimationProject, Drawing, InteractiveButton } from "./types";
import { DEFAULT_SETTINGS } from "./defaults";
import { genId } from "./utils";

// ---------------------------------------------------------------------------
// Genera un frame del personaje (cuerpo + cabeza + brazos + piernas)
// offset es el desplazamiento vertical para simular rebote
// armPhase es la fase de los brazos
// ---------------------------------------------------------------------------

function drawCharacterFrame(
  width: number,
  height: number,
  offset: number,
  armPhase: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const baseY = height * 0.7 + offset;

  // Cabeza
  ctx.fillStyle = "#f5d4a8";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, baseY - 130, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ojos
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx - 12, baseY - 138, 4, 0, Math.PI * 2);
  ctx.arc(cx + 12, baseY - 138, 4, 0, Math.PI * 2);
  ctx.fill();

  // Boca
  ctx.beginPath();
  ctx.arc(cx, baseY - 122, 6, 0, Math.PI);
  ctx.stroke();

  // Cuerpo
  ctx.fillStyle = "#4dabf7";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 28, baseY - 95);
  ctx.lineTo(cx + 28, baseY - 95);
  ctx.lineTo(cx + 22, baseY - 30);
  ctx.lineTo(cx - 22, baseY - 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Brazos (oscilan con armPhase)
  const armY = baseY - 85;
  const armDX = Math.sin(armPhase) * 18;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 28, armY);
  ctx.lineTo(cx - 50, armY + 30 + armDX);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 28, armY);
  ctx.lineTo(cx + 50, armY + 30 - armDX);
  ctx.stroke();

  // Piernas
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - 12, baseY - 30);
  ctx.lineTo(cx - 12, baseY + 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 12, baseY - 30);
  ctx.lineTo(cx + 12, baseY + 30);
  ctx.stroke();

  // Pies
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx - 16, baseY + 30, 10, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 16, baseY + 30, 10, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  ctx.stroke();

  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Genera 8 frames del rebote del personaje
// ---------------------------------------------------------------------------

function generateDemoDrawings(projectW: number, projectH: number): Drawing[] {
  const drawings: Drawing[] = [];
  const frames = 12;
  const now = Date.now();
  for (let i = 0; i < frames; i++) {
    const phase = (i / frames) * Math.PI * 2;
    const offset = Math.abs(Math.sin(phase)) * -25;
    const armPhase = phase * 2;
    const dataUrl = drawCharacterFrame(projectW, projectH, offset, armPhase);
    drawings.push({
      id: genId("draw"),
      name: `Pose ${i + 1}`,
      dataUrl,
      width: projectW,
      height: projectH,
      createdAt: now + i,
      updatedAt: now + i,
    });
  }
  return drawings;
}

// ---------------------------------------------------------------------------
// Genera 1 kHz beep de 0.5s como dataURL WAV
// ---------------------------------------------------------------------------

function generateBeepWav(): string {
  const sampleRate = 8000;
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 8 * 2, true);
  writeString(36, "data");
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 4) * (1 - Math.exp(-t * 100));
    const sample = Math.sin(2 * Math.PI * 880 * t) * env * 0.4 * 0x7fff;
    view.setInt16(44 + i * 2, sample, true);
  }

  // Convertir a base64
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:audio/wav;base64," + btoa(binary);
}

// ---------------------------------------------------------------------------
// Genera la forma de onda simplificada (256 puntos)
// ---------------------------------------------------------------------------

function generateWaveform(): number[] {
  const points: number[] = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 256;
    const env = Math.exp(-t * 4) * (1 - Math.exp(-t * 50));
    points.push(Math.abs(Math.sin(2 * Math.PI * 880 * t) * env));
  }
  return points;
}

// ---------------------------------------------------------------------------
// Crea el proyecto de demostración completo
// ---------------------------------------------------------------------------

export function createDemoProject(): AnimationProject {
  const width = DEFAULT_SETTINGS.width;
  const height = DEFAULT_SETTINGS.height;
  const now = Date.now();

  const drawings = generateDemoDrawings(width, height);
  const drawingsMap: Record<string, Drawing> = {};
  for (const d of drawings) {
    drawingsMap[d.id] = d;
  }

  const drawLayerId = genId("layer");
  const audioLayerId = genId("layer");

  // Crear celdas — cada frame expone un drawing por 2 frames (animación a 12fps efectivos sobre 24fps)
  const cells = drawings.map((d, i) => ({
    id: genId("cell"),
    drawingId: d.id,
    startFrame: i * 2,
    duration: 2,
  }));

  // Audio clip (beep de prueba)
  const audioId = genId("audio");
  const audioClip = {
    id: audioId,
    name: "Sonido demo",
    dataUrl: generateBeepWav(),
    duration: 0.5,
    waveform: generateWaveform(),
    startFrame: 0,
    volume: 0.6,
    muted: false,
  };

  // Botones interactivos
  const playButton: InteractiveButton = {
    id: genId("btn"),
    name: "btnReproducir",
    x: width / 2 - 200,
    y: height - 160,
    width: 130,
    height: 44,
    label: "▶ Reproducir",
    color: "#2ecc71",
    visible: true,
    handlers: [
      {
        id: genId("ev"),
        event: "click",
        actions: [
          { id: genId("act"), type: "play", delayMs: 0 },
          { id: genId("act"), type: "playSound", target: audioId, delayMs: 0 },
        ],
      },
    ],
  };

  const pauseButton: InteractiveButton = {
    id: genId("btn"),
    name: "btnPausar",
    x: width / 2 - 60,
    y: height - 160,
    width: 130,
    height: 44,
    label: "⏸ Pausar",
    color: "#e67e22",
    visible: true,
    handlers: [
      {
        id: genId("ev"),
        event: "click",
        actions: [{ id: genId("act"), type: "pause", delayMs: 0 }],
      },
    ],
  };

  const nextButton: InteractiveButton = {
    id: genId("btn"),
    name: "btnSiguiente",
    x: width / 2 + 80,
    y: height - 160,
    width: 130,
    height: 44,
    label: "▶| Sig.",
    color: "#4dabf7",
    visible: true,
    handlers: [
      {
        id: genId("ev"),
        event: "click",
        actions: [{ id: genId("act"), type: "nextFrame", delayMs: 0 }],
      },
    ],
  };

  const project: AnimationProject = {
    id: genId("proj"),
    name: "Demo — Personaje",
    createdAt: now,
    updatedAt: now,
    settings: {
      ...DEFAULT_SETTINGS,
      fps: 24,
    },
    layers: [
      {
        id: drawLayerId,
        name: "Personaje",
        type: "draw",
        cells,
        visible: true,
        locked: false,
        opacity: 1,
        createdAt: now,
      },
      {
        id: audioLayerId,
        name: "Audio",
        type: "audio",
        cells: [],
        visible: true,
        locked: false,
        opacity: 1,
        audioClipId: audioId,
        createdAt: now,
      },
    ],
    drawings: drawingsMap,
    audioClips: { [audioId]: audioClip },
    markers: [
      {
        id: genId("mark"),
        frame: 0,
        label: "Inicio",
        color: "#2ecc71",
      },
      {
        id: genId("mark"),
        frame: 12,
        label: "Mitad",
        color: "#f1c40f",
      },
    ],
    buttons: [playButton, pauseButton, nextButton],
    variables: [
      { name: "reproducciones", value: 0 },
    ],
    scenes: [],
    library: [],
    currentFrame: 0,
    currentLayerId: drawLayerId,
    dirty: false,
    templateInstructions:
      "Proyecto de demostración. Contiene 12 poses de un personaje animado a 24 FPS, " +
      "una pista de audio y tres botones interactivos (Reproducir, Pausar y Siguiente). " +
      "Pulsa Reproducir para ver la animación en bucle. El botón Reproducir también " +
      "ejecuta el sonido de demostración.",
  };

  return project;
}
