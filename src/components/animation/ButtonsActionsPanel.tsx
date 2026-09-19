"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/animation/store";
import { Button } from "@/components/ui/button";
import {
  ACTION_TYPES,
  EVENT_TYPES,
  createAction,
  createHandler,
  type ActionContext,
} from "@/lib/animation/actions";
import { executeActions, evalCondition } from "@/lib/animation/actions";
import {
  Plus,
  Trash2,
  MousePointerClick,
  Zap,
  Play,
} from "lucide-react";
import type { Action, EventHandler, EventType } from "@/lib/animation/types";
import { genId } from "@/lib/animation/utils";

export function ButtonsActionsPanel() {
  const project = useStore((s) => s.project);
  const addButton = useStore((s) => s.addButton);
  const updateButton = useStore((s) => s.updateButton);
  const deleteButton = useStore((s) => s.deleteButton);
  const addHandler = useStore((s) => s.addHandler);
  const updateHandler = useStore((s) => s.updateHandler);
  const deleteHandler = useStore((s) => s.deleteHandler);
  const addAction = useStore((s) => s.addAction);
  const updateAction = useStore((s) => s.updateAction);
  const deleteAction = useStore((s) => s.deleteAction);
  const setViewMode = useStore((s) => s.setViewMode);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!project) return null;

  const handleAddButton = () => {
    addButton({
      name: `Botón ${project.buttons.length + 1}`,
      label: "Botón",
      x: 50,
      y: 50,
    });
  };

  return (
    <div className="flex flex-col h-full bg-card border-b border-border">
      <div className="flex items-center justify-between p-2 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MousePointerClick size={16} /> Botones y acciones
        </h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleAddButton}>
            <Plus size={12} /> Nuevo
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground p-2 bg-muted/20 border-b border-border">
        Sistema interactivo opcional (estilo Flash clásico). Complementa la animación tradicional.
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {project.buttons.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No hay botones. Agregá uno con "Nuevo".
          </div>
        )}
        {project.buttons.map((btn) => (
          <div key={btn.id} className="border-b border-border">
            <div
              className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30"
              onClick={() => setExpanded(expanded === btn.id ? null : btn.id)}
            >
              <span
                className="w-4 h-4 rounded border border-border"
                style={{ backgroundColor: btn.color }}
              />
              <span className="text-xs font-mono flex-1 truncate">{btn.name}</span>
              <span className="text-xs text-muted-foreground">
                {btn.handlers.length} eventos
              </span>
              <button
                className="text-destructive p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteButton(btn.id);
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>

            {expanded === btn.id && (
              <div className="p-2 bg-background/30 space-y-2">
                {/* Editar info del botón */}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Nombre interno"
                    value={btn.name}
                    onChange={(e) => updateButton(btn.id, { name: e.target.value })}
                    className="px-2 py-1 text-xs bg-background border border-border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Etiqueta visible"
                    value={btn.label}
                    onChange={(e) => updateButton(btn.id, { label: e.target.value })}
                    className="px-2 py-1 text-xs bg-background border border-border rounded"
                  />
                  <input
                    type="number"
                    placeholder="X"
                    value={btn.x}
                    onChange={(e) => updateButton(btn.id, { x: Number(e.target.value) })}
                    className="px-2 py-1 text-xs bg-background border border-border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Y"
                    value={btn.y}
                    onChange={(e) => updateButton(btn.id, { y: Number(e.target.value) })}
                    className="px-2 py-1 text-xs bg-background border border-border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Ancho"
                    value={btn.width}
                    onChange={(e) => updateButton(btn.id, { width: Number(e.target.value) })}
                    className="px-2 py-1 text-xs bg-background border border-border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Alto"
                    value={btn.height}
                    onChange={(e) => updateButton(btn.id, { height: Number(e.target.value) })}
                    className="px-2 py-1 text-xs bg-background border border-border rounded"
                  />
                  <input
                    type="color"
                    value={btn.color}
                    onChange={(e) => updateButton(btn.id, { color: e.target.value })}
                    className="h-7 rounded border border-border"
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={btn.visible}
                      onChange={(e) => updateButton(btn.id, { visible: e.target.checked })}
                    />
                    Visible
                  </label>
                </div>

                {/* Handlers */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Eventos</span>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          addHandler(btn.id, createHandler(e.target.value as EventType));
                        }
                      }}
                      className="text-xs px-1 py-0.5 bg-background border border-border rounded"
                    >
                      <option value="">+ Agregar evento…</option>
                      {EVENT_TYPES.map((et) => (
                        <option key={et.id} value={et.id}>
                          {et.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {btn.handlers.map((h) => (
                    <HandlerEditor
                      key={h.id}
                      buttonId={btn.id}
                      handler={h}
                      onUpdate={(patch) => updateHandler(btn.id, h.id, patch)}
                      onDelete={() => deleteHandler(btn.id, h.id)}
                      onAddAction={(action) => addAction(btn.id, h.id, action)}
                      onUpdateAction={(actionId, patch) =>
                        updateAction(btn.id, h.id, actionId, patch)
                      }
                      onDeleteAction={(actionId) =>
                        deleteAction(btn.id, h.id, actionId)
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Test rápido */}
      <div className="p-2 border-t border-border">
        <Button
          size="sm"
          variant="default"
          className="w-full h-7 text-xs"
          onClick={() => setViewMode("preview")}
        >
          <Play size={12} /> Probar interacciones
        </Button>
      </div>
    </div>
  );
}

function HandlerEditor({
  handler,
  onUpdate,
  onDelete,
  onAddAction,
  onUpdateAction,
  onDeleteAction,
}: {
  buttonId: string;
  handler: EventHandler;
  onUpdate: (patch: Partial<EventHandler>) => void;
  onDelete: () => void;
  onAddAction: (action: Action) => void;
  onUpdateAction: (actionId: string, patch: Partial<Action>) => void;
  onDeleteAction: (actionId: string) => void;
}) {
  const project = useStore((s) => s.project!);
  const eventDef = EVENT_TYPES.find((e) => e.id === handler.event);

  return (
    <div className="border border-border rounded p-1.5 bg-background">
      <div className="flex items-center gap-2 mb-1.5">
        <select
          value={handler.event}
          onChange={(e) => onUpdate({ event: e.target.value as EventType })}
          className="text-xs px-1 py-0.5 bg-background border border-border rounded flex-1"
        >
          {EVENT_TYPES.map((et) => (
            <option key={et.id} value={et.id}>
              {et.label}
            </option>
          ))}
        </select>
        {handler.event === "frame" && (
          <input
            type="number"
            placeholder="Fotograma"
            value={handler.frame ?? 0}
            onChange={(e) => onUpdate({ frame: Number(e.target.value) })}
            className="w-20 text-xs px-1 py-0.5 bg-background border border-border rounded"
          />
        )}
        <button
          className="text-destructive p-1"
          onClick={onDelete}
          title="Eliminar evento"
        >
          <Trash2 size={11} />
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground mb-1.5">
        {eventDef?.description}
      </div>

      {/* Condición opcional */}
      <input
        type="text"
        placeholder="Condición opcional: variable==valor"
        value={handler.condition ?? ""}
        onChange={(e) => onUpdate({ condition: e.target.value })}
        className="w-full text-xs px-1 py-0.5 bg-background border border-border rounded mb-1.5 font-mono"
      />

      {/* Lista de acciones */}
      <div className="space-y-1">
        {handler.actions.map((a) => (
          <ActionEditor
            key={a.id}
            action={a}
            onUpdate={(patch) => onUpdateAction(a.id, patch)}
            onDelete={() => onDeleteAction(a.id)}
          />
        ))}
      </div>

      {/* Agregar acción */}
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) {
            onAddAction(createAction(e.target.value as Action["type"]));
          }
        }}
        className="w-full text-xs px-1 py-0.5 bg-background border border-border rounded mt-1"
      >
        <option value="">+ Agregar acción…</option>
        {ACTION_TYPES.map((at) => (
          <option key={at.id} value={at.id}>
            {at.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ActionEditor({
  action,
  onUpdate,
  onDelete,
}: {
  action: Action;
  onUpdate: (patch: Partial<Action>) => void;
  onDelete: () => void;
}) {
  const project = useStore((s) => s.project);
  if (!project) return null;
  const def = ACTION_TYPES.find((d) => d.id === action.type);
  if (!def) return null;

  return (
    <div className="flex items-center gap-1 text-xs bg-muted/30 p-1 rounded">
      <span className="text-muted-foreground">
        <Zap size={10} />
      </span>
      <span className="flex-1 truncate">{def.label}</span>

      {def.needsValue && action.type !== "setVar" && action.type !== "wait" && (
        <input
          type="text"
          placeholder="valor"
          value={String(action.value ?? "")}
          onChange={(e) => onUpdate({ value: e.target.value })}
          className="w-16 px-1 py-0.5 bg-background border border-border rounded"
        />
      )}

      {def.needsTarget && (
        <select
          value={action.target ?? ""}
          onChange={(e) => onUpdate({ target: e.target.value })}
          className="w-24 px-1 py-0.5 bg-background border border-border rounded"
        >
          <option value="">—</option>
          {action.type === "playSound" &&
            Object.values(project.audioClips).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          {action.type === "gotoScene" &&
            project.scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          {(action.type === "show" || action.type === "hide") &&
            project.buttons.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          {action.type === "setVar" &&
            project.variables.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
        </select>
      )}

      {action.type === "setVar" && (
        <input
          type="text"
          placeholder="valor"
          value={String(action.value ?? "")}
          onChange={(e) => onUpdate({ value: e.target.value })}
          className="w-16 px-1 py-0.5 bg-background border border-border rounded"
        />
      )}

      {action.type === "wait" && (
        <input
          type="number"
          placeholder="ms"
          value={action.delayMs}
          onChange={(e) => onUpdate({ delayMs: Number(e.target.value) })}
          className="w-16 px-1 py-0.5 bg-background border border-border rounded"
        />
      )}

      <input
        type="number"
        placeholder="ms"
        value={action.delayMs}
        onChange={(e) => onUpdate({ delayMs: Number(e.target.value) })}
        title="Demora antes (ms)"
        className="w-12 px-1 py-0.5 bg-background border border-border rounded"
      />

      <button className="text-destructive p-0.5" onClick={onDelete} title="Eliminar">
        <Trash2 size={11} />
      </button>
    </div>
  );
}
