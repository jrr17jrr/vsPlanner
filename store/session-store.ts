"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  userId: string | null;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  login: (userId: string) => void;
  logout: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      login: (userId) => set({ userId }),
      logout: () => set({ userId: null }),
    }),
    {
      name: "vslead:session:v1",
      skipHydration: true,
      partialize: (state) => ({ userId: state.userId }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
