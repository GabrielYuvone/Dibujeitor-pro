// ============================================================================
// drawing.ts — Utilidades de dibujo, color, geometría, estabilización
// ============================================================================

import type { BrushSettings, RGBA } from "./types";

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): RGBA {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b, a: 255 };
}

export function rgbaToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Convierte hex + opacidad (0..1) en rgba() string */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Estabilización de trazo (suavizado exponencial simple)
// ---------------------------------------------------------------------------

export interface StrokeSmoother {
  lastX: number | null;
  lastY: number | null;
  factor: number; // 0 = sin suavizado, 1 = máximo suavizado
}

export function createSmoother(smoothing: number): StrokeSmoother {
  return { lastX: null, lastY: null, factor: Math.max(0, Math.min(0.9, smoothing * 0.85)) };
}

/** Aplica suavizado a una nueva posición. Devuelve posición ajustada. */
export function smoothPoint(
  s: StrokeSmoother,
  x: number,
  y: number
): { x: number; y: number } {
  if (s.lastX === null || s.lastY === null || s.factor === 0) {
    s.lastX = x;
    s.lastY = y;
    return { x, y };
  }
  const nx = s.lastX + (x - s.lastX) * (1 - s.factor);
  const ny = s.lastY + (y - s.lastY) * (1 - s.factor);
  s.lastX = nx;
  s.lastY = ny;
  return { x: nx, y: ny };
}

// ---------------------------------------------------------------------------
// Configuración de contexto Canvas
// ---------------------------------------------------------------------------

export function configureStroke(
  ctx: CanvasRenderingContext2D,
  brush: BrushSettings,
  pressure = 1
) {
  const size = brush.pressureSensitivity
    ? brush.size * Math.max(brush.minSizePressure, pressure)
    : brush.size;
  ctx.lineWidth = Math.max(0.5, size);
  ctx.strokeStyle = brush.color;
  ctx.fillStyle = brush.color;
  ctx.lineCap = brush.cap;
  ctx.lineJoin = brush.join;
  ctx.globalAlpha = brush.opacity;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

/** Configura el contexto para goma (usa destination-out). */
export function configureEraser(
  ctx: CanvasRenderingContext2D,
  brush: BrushSettings,
  pressure = 1
) {
  const size = brush.pressureSensitivity
    ? brush.size * Math.max(brush.minSizePressure, pressure)
    : brush.size;
  ctx.lineWidth = Math.max(0.5, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = brush.eraserMode === "soft" ? brush.opacity * 0.5 : 1;
}

/**
 * Configura el contexto para el LÁPIZ.
 *
 * El lápiz tiene una textura tipo "mina de lápiz":
 * - Menor opacidad (0.65x) — parece grafito
 * - LineCap cuadrado (trazos más definidos)
 * - LineWidth más fino (0.6x del tamaño) — línea precisa
 * - LineJoin mitre
 *
 * Esto produce un trazo más seco y definido, distinto del pincel
 * que es redondo y suave.
 */
export function configurePencil(
  ctx: CanvasRenderingContext2D,
  brush: BrushSettings,
  pressure = 1
) {
  const size = brush.pressureSensitivity
    ? brush.size * Math.max(brush.minSizePressure, pressure)
    : brush.size;
  // Lápiz: 0.6x del tamaño, opacidad reducida
  ctx.lineWidth = Math.max(0.5, size * 0.6);
  ctx.strokeStyle = brush.color;
  ctx.fillStyle = brush.color;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.globalAlpha = brush.opacity * 0.7;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

/**
 * Dibuja una textura de mina de lápiz alrededor de un punto.
 * Compone varios puntos pequeños con jitter para simular
 * la aspereza del grafito sobre papel.
 */
export function drawPencilDab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number
) {
  const count = Math.max(2, Math.floor(size * 0.4));
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * size * 0.5;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    const s = size * (0.15 + Math.random() * 0.2);
    ctx.globalAlpha = alpha * (0.3 + Math.random() * 0.4);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.3, s), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Dibuja un segmento de trazo con pluma de tinta.
 *
 * La pluma de tinta tiene un flujo irregular: a veces suelta más tinta
 * (línea más gruesa y opaca), a veces menos (línea más fina y tenue).
 * Simula una pluma estilográfica real con tinta que fluye variable.
 *
 * - Tamaño base sufre variación aleatoria (±40%)
 * - Opacidad varía (0.5 a 1.0)
 * - A veces agrega pequeñas salpicaduras alrededor del trazo
 * - El trazo principal es continuo pero con ancho variable
 */
export function drawInkSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  baseSize: number,
  baseColor: string,
  baseAlpha: number,
  pressure = 1
) {
  // Variación de flujo de tinta (random entre 0.6 y 1.0)
  const flow = 0.6 + Math.random() * 0.4;
  // Ancho variable: a veces grueso, a veces fino
  const size = baseSize * flow * (0.7 + Math.random() * 0.6) * pressure;
  // Opacidad variable
  const alpha = baseAlpha * (0.5 + Math.random() * 0.5);

  ctx.strokeStyle = baseColor;
  ctx.fillStyle = baseColor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = Math.max(0.5, size);

  // Trazo principal
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // A veces agrega salpicaduras (10% de probabilidad)
  if (Math.random() < 0.1) {
    const splatterCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < splatterCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = size * (1 + Math.random() * 3);
      const px = x2 + Math.cos(angle) * r;
      const py = y2 + Math.sin(angle) * r;
      const s = size * (0.1 + Math.random() * 0.2);
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.3, s), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A veces agrega un "blob" de tinta extra en el extremo
  if (Math.random() < 0.15) {
    ctx.globalAlpha = alpha * 0.8;
    ctx.beginPath();
    ctx.arc(x2, y2, Math.max(0.5, size * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Dibuja un punto inicial de pluma de tinta.
 */
export function drawInkDab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseSize: number,
  baseColor: string,
  baseAlpha: number,
  pressure = 1
) {
  const flow = 0.7 + Math.random() * 0.3;
  const size = baseSize * flow * pressure;
  const alpha = baseAlpha * (0.7 + Math.random() * 0.3);

  ctx.fillStyle = baseColor;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, size / 2), 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Conversión de coordenadas de pantalla a coordenadas del lienzo
// ---------------------------------------------------------------------------

/**
 * Transforma coordenadas de pantalla en coordenadas de bitmap del lienzo
 * teniendo en cuenta zoom, pan y rotación.
 *
 * La transform CSS aplicada al canvas es:
 *   translate(-50%, -50%) translate(panX, panY) scale(zoom) rotate(rotation)
 *
 * Lo que significa: dado un punto P en coords locales del canvas (relativo a su
 * centro), su posición en pantalla es:
 *   screenPos = containerCenter + (panX, panY) + zoom * R(rotation) * P
 *
 * Para invertir (screen → canvas local):
 *   1. offset desde el centro del elemento en pantalla: V - (containerCenter + pan)
 *   2. dividir por zoom (des-zoom)
 *   3. aplicar rotación inversa: R(-rotation) * (V_unzoomed)
 *   4. sumar (W/2, H/2) para pasar de coords-centradas a bitmap
 */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  canvasRect: DOMRect,
  view: { zoom: number; panX: number; panY: number; rotation: number },
  projectWidth: number,
  projectHeight: number
): { x: number; y: number } {
  // 1. offset desde el centro del contenedor en coords de pantalla
  const dx = screenX - canvasRect.left - canvasRect.width / 2;
  const dy = screenY - canvasRect.top - canvasRect.height / 2;

  // 2. restar PRIMERO el pan (en coords de pantalla, antes de rotar)
  const sx = dx - view.panX;
  const sy = dy - view.panY;

  // 3. dividir por zoom (des-zoom)
  const ux = sx / view.zoom;
  const uy = sy / view.zoom;

  // 4. rotación inversa
  const angle = (-view.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = ux * cos - uy * sin;
  const ry = ux * sin + uy * cos;

  // 5. convertir de coords-centradas a bitmap (sumar W/2, H/2)
  const bx = rx + projectWidth / 2;
  const by = ry + projectHeight / 2;
  return { x: bx, y: by };
}

// ---------------------------------------------------------------------------
// Dibujo de primitivas (línea, rect, elipse)
// ---------------------------------------------------------------------------

export function strokeLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function strokeRectangle(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.stroke();
}

export function strokeEllipse(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Bote de tinta (flood fill) sobre ImageData
// ---------------------------------------------------------------------------

/**
 * Flood fill sobre ImageData con tolerancia de color.
 * Implementación con pila (stack) para evitar desbordamiento.
 */
export function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  fillColor: RGBA,
  tolerance = 32
) {
  const { width, height, data } = imageData;
  startX = Math.floor(startX);
  startY = Math.floor(startY);
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  const startIdx = (startY * width + startX) * 4;
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  // Si ya es del color objetivo, no hacer nada
  if (
    sr === fillColor.r &&
    sg === fillColor.g &&
    sb === fillColor.b &&
    sa === fillColor.a
  ) {
    return;
  }

  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const p = y * width + x;
    if (visited[p]) continue;
    const idx = p * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    // Tolerancia
    const dr = r - sr;
    const dg = g - sg;
    const db = b - sb;
    const da = a - sa;
    if (Math.abs(dr) > tolerance || Math.abs(dg) > tolerance || Math.abs(db) > tolerance || Math.abs(da) > tolerance) {
      continue;
    }

    visited[p] = 1;
    data[idx] = fillColor.r;
    data[idx + 1] = fillColor.g;
    data[idx + 2] = fillColor.b;
    data[idx + 3] = fillColor.a;

    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }
}

// ---------------------------------------------------------------------------
// Generación de miniaturas
// ---------------------------------------------------------------------------

export async function generateThumbnail(
  dataUrl: string,
  size = 80
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = img.width / img.height;
      let w: number, h: number;
      if (ratio > 1) {
        w = size;
        h = size / ratio;
      } else {
        h = size;
        w = size * ratio;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo obtener contexto 2D"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Limpieza de imagen (eliminar píxeles transparentes sobrantes)
// ---------------------------------------------------------------------------

/** Crea un ImageData vacío del tamaño del proyecto. */
export function createEmptyImageData(width: number, height: number): ImageData {
  return new ImageData(width, height);
}

/** Carga un dataURL a un ImageData. */
export async function dataUrlToImageData(
  dataUrl: string,
  width: number,
  height: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo obtener contexto 2D"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        const data = ctx.getImageData(0, 0, width, height);
        resolve(data);
      } catch (e) {
        reject(e as Error);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Convierte un ImageData a dataURL PNG. */
export function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener contexto 2D");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Composición de capas (render de un frame)
// ---------------------------------------------------------------------------

/**
 * Compone una lista de capas (cada una con su ImageData) sobre un
 * canvas destino, aplicando opacidad y orden.
 */
export function composeLayers(
  ctx: CanvasRenderingContext2D,
  layerCanvases: { canvas: HTMLCanvasElement; opacity: number; visible: boolean }[]
) {
  for (const layer of layerCanvases) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(layer.canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Utilidad de geometría
// ---------------------------------------------------------------------------

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
