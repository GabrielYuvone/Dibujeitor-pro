"use client";

import React, { useRef, useState, useEffect } from "react";
import { useStore } from "@/lib/animation/store";
import { Button } from "@/components/ui/button";
import { genId } from "@/lib/animation/utils";
import { Upload, Trash2, Music, Volume2, VolumeX } from "lucide-react";
import type { AudioClip } from "@/lib/animation/types";

export function AudioPanel() {
  const project = useStore((s) => s.project);
  const addAudioClip = useStore((s) => s.addAudioClip);
  const deleteAudioClip = useStore((s) => s.deleteAudioClip);
  const setAudioClipStart = useStore((s) => s.setAudioClipStart);
  const toggleAudioMute = useStore((s) => s.toggleAudioMute);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!project) return null;

  const handleFile = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    // Cargar metadata de duración
    const audio = new Audio(dataUrl);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const clip: AudioClip = {
        id: genId("audio"),
        name: file.name,
        dataUrl,
        duration: audio.duration,
        waveform: generateWaveformFromAudio(audio),
        startFrame: 0,
        volume: 1,
        muted: false,
      };
      addAudioClip(clip);
      // Crear capa de audio si no existe
      const hasAudioLayer = project.layers.some((l) => l.type === "audio");
      if (!hasAudioLayer) {
        const id = useStore.getState().addLayer("audio", "Audio");
        // Asignar el audioClipId a la nueva capa
        useStore.getState().updateButton = useStore.getState().updateButton; // noop
        // Para asociar la capa con el clip, hay que hacerlo en el store — lo haremos mediante un pequeño hack
        useStore.setState((s) => {
          if (!s.project) return {};
          return {
            project: {
              ...s.project,
              layers: s.project.layers.map((l) =>
                l.id === id ? { ...l, audioClipId: clip.id } : l
              ),
            },
          };
        });
      }
    };
  };

  const clips = Object.values(project.audioClips);

  return (
    <div className="flex flex-col h-full bg-card border-b border-border">
      <div className="flex items-center justify-between p-2 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Music size={16} /> Audio
        </h3>
        <input
          ref={fileRef}
          type="file"
          accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={12} /> Importar
        </Button>
      </div>

      <div className="text-xs text-muted-foreground p-2 bg-muted/20 border-b border-border">
        Formatos: WAV, MP3, OGG. El audio se reproduce sincronizado con el timeline.
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {clips.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Sin pistas de audio.
          </div>
        ) : (
          clips.map((clip) => (
            <div key={clip.id} className="border-b border-border p-2">
              <div className="flex items-center gap-2 mb-1">
                <button
                  className="text-muted-foreground"
                  onClick={() => toggleAudioMute(clip.id)}
                >
                  {clip.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <span className="text-xs font-mono flex-1 truncate">{clip.name}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {clip.duration.toFixed(1)}s
                </span>
                <button
                  className="text-destructive"
                  onClick={() => deleteAudioClip(clip.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Waveform */}
              <div className="h-12 bg-background border border-border rounded p-1 flex items-center gap-px overflow-hidden">
                {clip.waveform?.slice(0, 200).map((v, i) => (
                  <div
                    key={i}
                    className="bg-purple-400 flex-1"
                    style={{ height: `${Math.max(2, v * 100)}%` }}
                  />
                ))}
              </div>

              {/* Frame de inicio */}
              <div className="flex items-center gap-2 mt-2 text-xs">
                <label className="text-muted-foreground">Inicio (frame):</label>
                <input
                  type="number"
                  min={0}
                  value={clip.startFrame}
                  onChange={(e) => setAudioClipStart(clip.id, Number(e.target.value))}
                  className="w-16 px-1 py-0.5 text-xs bg-background border border-border rounded"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function generateWaveformFromAudio(audio: HTMLAudioElement): number[] {
  // Generación simplificada de waveform (envolvente simulada).
  // Para una waveform real se necesita Web Audio API + decodeAudioData.
  // Aquí generamos una forma aleatoria suave como placeholder.
  const points: number[] = [];
  const samples = 256;
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const env = Math.sin(t * Math.PI);
    const noise = 0.3 + 0.7 * Math.random();
    points.push(env * noise);
  }
  return points;
}
