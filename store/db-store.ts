"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createSeedDatabase, type Database } from "@/mock/seed";

type CollectionKey = keyof Database;
type EntityOf<K extends CollectionKey> = Database[K][number];

interface DbActions {
  add: <K extends CollectionKey>(key: K, item: EntityOf<K>) => void;
  update: <K extends CollectionKey>(
    key: K,
    id: string,
    patch: Partial<EntityOf<K>>
  ) => void;
  remove: <K extends CollectionKey>(key: K, id: string) => void;
  resetToSeed: () => void;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
}

export type DbStore = Database & DbActions;

const ACTION_KEYS = new Set([
  "add",
  "update",
  "remove",
  "resetToSeed",
  "hasHydrated",
  "setHasHydrated",
]);

export const useDbStore = create<DbStore>()(
  persist(
    (set) => ({
      ...createSeedDatabase(),
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      add: (key, item) =>
        set((state) => ({
          [key]: [...(state[key] as unknown[]), item],
        }) as Partial<DbStore>),
      update: (key, id, patch) =>
        set((state) => ({
          [key]: (state[key] as Array<{ id: string }>).map((entity) =>
            entity.id === id ? { ...entity, ...patch } : entity
          ),
        }) as Partial<DbStore>),
      remove: (key, id) =>
        set((state) => ({
          [key]: (state[key] as Array<{ id: string }>).filter(
            (entity) => entity.id !== id
          ),
        }) as Partial<DbStore>),
      resetToSeed: () => set({ ...createSeedDatabase() }),
    }),
    {
      name: "vslead:db:v1",
      skipHydration: true,
      partialize: (state) => {
        const data: Record<string, unknown> = {};
        for (const key of Object.keys(state)) {
          if (!ACTION_KEYS.has(key)) data[key] = state[key as CollectionKey];
        }
        return data;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
