"use client";

import React from "react";
import { useStore } from "@/lib/animation/store";
import { Button } from "@/components/ui/button";

export function OnionSkinPanel() {
  const onion = useStore((s) => s.onion);
  const setOnion = useStore((s) => s.setOnion);

  return (
    <div className="flex flex-col gap-2 p-2 bg-card border-b border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Papel cebolla
        </h3>
        <input
          type="checkbox"
          checked={onion.enabled}
          onChange={(e) => setOnion({ enabled: e.target.checked })}
        />
      </div>

      {onion.enabled && (
        <>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={onion.onlyPrevious}
              onChange={(e) => setOnion({ onlyPrevious: e.target.checked })}
            />
            Solo cuadro anterior (modo luz de mesa)
          </label>

          {!onion.onlyPrevious && (
            <>
              <div className="flex items-center justify-between text-xs">
                <label>Cuadros anteriores</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={onion.prevFrames}
                  onChange={(e) => setOnion({ prevFrames: Number(e.target.value) })}
                  className="w-12 px-1 py-0.5 text-xs bg-background border border-border rounded"
                />
              </div>
              <div>
                <div className="text-xs flex justify-between mb-1">
                  <span>Opacidad anterior</span>
                  <span>{Math.round(onion.prevOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={onion.prevOpacity}
                  onChange={(e) => setOnion({ prevOpacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label>Color ant.:</label>
                <input
                  type="color"
                  value={onion.prevColor}
                  onChange={(e) => setOnion({ prevColor: e.target.value })}
                  className="w-7 h-6 rounded border border-border cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label>Cuadros posteriores</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={onion.nextFrames}
                  onChange={(e) => setOnion({ nextFrames: Number(e.target.value) })}
                  className="w-12 px-1 py-0.5 text-xs bg-background border border-border rounded"
                />
              </div>
              <div>
                <div className="text-xs flex justify-between mb-1">
                  <span>Opacidad posterior</span>
                  <span>{Math.round(onion.nextOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={onion.nextOpacity}
                  onChange={(e) => setOnion({ nextOpacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label>Color post.:</label>
                <input
                  type="color"
                  value={onion.nextColor}
                  onChange={(e) => setOnion({ nextColor: e.target.value })}
                  className="w-7 h-6 rounded border border-border cursor-pointer"
                />
              </div>
            </>
          )}

          {onion.onlyPrevious && (
            <>
              <div>
                <div className="text-xs flex justify-between mb-1">
                  <span>Opacidad</span>
                  <span>{Math.round(onion.prevOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={onion.prevOpacity}
                  onChange={(e) => setOnion({ prevOpacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label>Color:</label>
                <input
                  type="color"
                  value={onion.prevColor}
                  onChange={(e) => setOnion({ prevColor: e.target.value })}
                  className="w-7 h-6 rounded border border-border cursor-pointer"
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
