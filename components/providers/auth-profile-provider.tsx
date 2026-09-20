"use client";

import { createContext, useContext } from "react";
import type { Profile } from "@/types/database.types";

interface AuthProfileContextValue {
  /** Profile REAL (Supabase `public.profiles`), não o mock de `store/db-store.ts`. */
  profile: Profile;
  email: string | null;
}

const AuthProfileContext = createContext<AuthProfileContextValue | null>(null);

export function AuthProfileProvider({
  profile,
  email,
  children,
}: AuthProfileContextValue & { children: React.ReactNode }) {
  return (
    <AuthProfileContext.Provider value={{ profile, email }}>
      {children}
    </AuthProfileContext.Provider>
  );
}

export function useAuthProfile(): AuthProfileContextValue {
  const ctx = useContext(AuthProfileContext);
  if (!ctx) {
    throw new Error(
      "useAuthProfile() precisa estar dentro de <AuthProfileProvider> (ver app/(app)/layout.tsx)."
    );
  }
  return ctx;
}
