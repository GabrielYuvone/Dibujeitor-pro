// ============================================================================
// actions.ts — Sistema de botones y acciones (estilo Flash clásico)
// ============================================================================

import type { Action, AnimationProject, EventHandler, InteractiveButton, Variable } from "./types";
import { genId, totalFrames } from "./utils";

// ---------------------------------------------------------------------------
// Tipos de eventos
// ---------------------------------------------------------------------------

export const EVENT_TYPES: { id: EventHandler["event"]; label: string; description: string }[] = [
  { id: "click", label: "Al hacer clic", description: "Se dispara cuando el usuario hace clic en el botón" },
  { id: "press", label: "Al presionar", description: "Se dispara al presionar el botón del mouse" },
  { id: "release", label: "Al soltar", description: "Se dispara al soltar el botón del mouse" },
  { id: "mouseenter", label: "Al entrar el cursor", description: "Se dispara cuando el cursor entra en el botón" },
  { id: "mouseleave", label: "Al salir el cursor", description: "Se dispara cuando el cursor sale del botón" },
  { id: "animstart", label: "Al comenzar animación", description: "Se dispara cuando comienza la reproducción" },
  { id: "animend", label: "Al terminar animación", description: "Se dispara cuando termina la reproducción" },
  { id: "frame", label: "Al llegar a un fotograma", description: "Se dispara cuando el cabezal llega a un fotograma" },
];

export const ACTION_TYPES: { id: Action["type"]; label: string; needsTarget: boolean; needsValue: boolean }[] = [
  { id: "play", label: "Reproducir animación", needsTarget: false, needsValue: false },
  { id: "pause", label: "Pausar animación", needsTarget: false, needsValue: false },
  { id: "stop", label: "Detener animación", needsTarget: false, needsValue: false },
  { id: "restart", label: "Reiniciar animación", needsTarget: false, needsValue: false },
  { id: "nextFrame", label: "Avanzar un cuadro", needsTarget: false, needsValue: false },
  { id: "prevFrame", label: "Retroceder un cuadro", needsTarget: false, needsValue: false },
  { id: "gotoFrame", label: "Ir a un fotograma", needsTarget: false, needsValue: true },
  { id: "gotoScene", label: "Ir a una escena", needsTarget: true, needsValue: false },
  { id: "show", label: "Mostrar elemento", needsTarget: true, needsValue: false },
  { id: "hide", label: "Ocultar elemento", needsTarget: true, needsValue: false },
  { id: "playSound", label: "Reproducir sonido", needsTarget: true, needsValue: false },
  { id: "setVar", label: "Cambiar variable", needsTarget: true, needsValue: true },
  { id: "wait", label: "Esperar (demora)", needsTarget: false, needsValue: true },
];

// ---------------------------------------------------------------------------
// Helpers de fábrica
// ---------------------------------------------------------------------------

export function createButton(partial: Partial<InteractiveButton>): InteractiveButton {
  return {
    id: genId("btn"),
    name: partial.name ?? "Nuevo botón",
    x: partial.x ?? 50,
    y: partial.y ?? 50,
    width: partial.width ?? 120,
    height: partial.height ?? 40,
    label: partial.label ?? "Botón",
    color: partial.color ?? "#e67e22",
    visible: partial.visible ?? true,
    handlers: partial.handlers ?? [],
  };
}

export function createHandler(event: EventHandler["event"], frame?: number): EventHandler {
  return {
    id: genId("ev"),
    event,
    frame,
    actions: [],
  };
}

export function createAction(type: Action["type"]): Action {
  return {
    id: genId("act"),
    type,
    delayMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Ejecutor de acciones (runtime)
// ---------------------------------------------------------------------------

export interface ActionContext {
  project: AnimationProject;
  setProjectState: (patch: Partial<AnimationProject>) => void;
  gotoFrame: (frame: number) => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  gotoScene: (sceneId: string) => void;
  setButtonVisible: (buttonId: string, visible: boolean) => void;
  playSound: (audioId: string) => void;
  setVariable: (name: string, value: Variable["value"]) => void;
  /** Detener la ejecución de la cadena actual (loop control). */
  stop: () => void;
}

export interface EvalResult {
  stopRequested: boolean;
  gotoFrameRequested?: number;
  setPlayingRequested?: boolean;
}

/** Evalúa una condición simple estilo "varName==value" o "varName!=value". */
export function evalCondition(cond: string | undefined, vars: Variable[]): boolean {
  if (!cond || cond.trim() === "") return true;
  const m = cond.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!m) return true;
  const [, name, op, rawValue] = m;
  const v = vars.find((x) => x.name === name);
  if (!v) return false;
  const cur = v.value;
  const expected = rawValue.trim().replace(/^["']|["']$/g, "");
  switch (op) {
    case "==":
      return String(cur) === expected;
    case "!=":
      return String(cur) !== expected;
    case ">=":
      return Number(cur) >= Number(expected);
    case "<=":
      return Number(cur) <= Number(expected);
    case ">":
      return Number(cur) > Number(expected);
    case "<":
      return Number(cur) < Number(expected);
    default:
      return true;
  }
}

/**
 * Ejecuta una lista de acciones encadenadas con demoras.
 * Las demoras y esperas se respetan mediante setTimeout.
 * @returns AbortSignal-style: llamada al callback stop detiene el loop.
 */
export async function executeActions(
  actions: Action[],
  ctx: ActionContext
): Promise<EvalResult> {
  let stopRequested = false;
  let gotoFrameRequested: number | undefined;
  let setPlayingRequested: boolean | undefined;
  let i = 0;
  const maxIter = 1000; // límite de bucle

  for (const action of actions) {
    if (stopRequested) break;
    if (i++ > maxIter) break;

    // Demora inicial
    if (action.delayMs > 0) {
      await new Promise((r) => setTimeout(r, action.delayMs));
    }

    switch (action.type) {
      case "play":
        setPlayingRequested = true;
        ctx.setPlaying(true);
        break;
      case "pause":
        setPlayingRequested = false;
        ctx.setPlaying(false);
        break;
      case "stop":
        setPlayingRequested = false;
        ctx.setPlaying(false);
        stopRequested = true;
        break;
      case "restart":
        gotoFrameRequested = 0;
        ctx.setPlaying(true);
        ctx.gotoFrame(0);
        break;
      case "nextFrame":
        ctx.gotoFrame(ctx.project.currentFrame + 1);
        break;
      case "prevFrame":
        if (ctx.project.currentFrame > 0) {
          ctx.gotoFrame(ctx.project.currentFrame - 1);
        }
        break;
      case "gotoFrame": {
        const frame = Number(action.value);
        if (!isNaN(frame)) {
          gotoFrameRequested = frame;
          ctx.gotoFrame(frame);
        }
        break;
      }
      case "gotoScene": {
        if (action.target) {
          ctx.gotoScene(action.target);
        }
        break;
      }
      case "show":
        if (action.target) ctx.setButtonVisible(action.target, true);
        break;
      case "hide":
        if (action.target) ctx.setButtonVisible(action.target, false);
        break;
      case "playSound":
        if (action.target) ctx.playSound(action.target);
        break;
      case "setVar":
        if (action.target) ctx.setVariable(action.target, action.value ?? "");
        break;
      case "wait":
        // wait es una demora pura sin acción adicional
        break;
    }
  }

  return { stopRequested, gotoFrameRequested, setPlayingRequested };
}
