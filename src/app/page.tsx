"use client";

import { useStore } from "@/lib/animation/store";
import { useEffect } from "react";
import { ProjectManager } from "@/components/animation/ProjectManager";
import { EditorView } from "@/components/animation/EditorView";

export default function HomePage() {
  const project = useStore((s) => s.project);

  // Si hay un proyecto guardado en localStorage, restaurarlo (opcional)
  // Para esta versión no restauramos automáticamente: el usuario elige
  // desde la pantalla de proyectos.

  return project ? <EditorView /> : <ProjectManager />;
}
