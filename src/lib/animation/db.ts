// ============================================================================
// db.ts — Persistencia local de proyectos (IndexedDB)
// ============================================================================

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AnimationProject } from "./types";

interface AnimDB extends DBSchema {
  projects: {
    key: string; // project.id
    value: AnimationProject;
    indexes: { "by-updatedAt": number; "by-name": string };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

let _db: IDBPDatabase<AnimDB> | null = null;

async function getDb(): Promise<IDBPDatabase<AnimDB>> {
  if (_db) return _db;
  _db = await openDB<AnimDB>("animacion-2d-escuela", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("projects")) {
        const store = db.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
        store.createIndex("by-name", "name");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    },
  });
  return _db;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function saveProjectToDb(project: AnimationProject): Promise<void> {
  const db = await getDb();
  // Marcamos como guardado
  const toSave: AnimationProject = {
    ...project,
    updatedAt: Date.now(),
    lastSavedAt: Date.now(),
    dirty: false,
  };
  await db.put("projects", toSave);
}

export async function loadProjectFromDb(id: string): Promise<AnimationProject | null> {
  const db = await getDb();
  return (await db.get("projects", id)) ?? null;
}

export async function listProjectsFromDb(): Promise<AnimationProject[]> {
  const db = await getDb();
  const all = await db.getAll("projects");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProjectFromDb(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("projects", id);
}

export async function duplicateProjectInDb(
  id: string,
  newName: string
): Promise<AnimationProject | null> {
  const original = await loadProjectFromDb(id);
  if (!original) return null;
  const copy: AnimationProject = {
    ...original,
    id: crypto.randomUUID(),
    name: newName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSavedAt: Date.now(),
    dirty: false,
  };
  await saveProjectToDb(copy);
  return copy;
}

// ---------------------------------------------------------------------------
// Configuración global (no de proyecto)
// ---------------------------------------------------------------------------

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put("settings", value, key);
}

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const db = await getDb();
  const v = await db.get("settings", key);
  return (v as T) ?? null;
}
