"use client";

import { createContext, useContext } from "react";
import type { ModulePermissionModule, Profile, Space } from "@/types/database.types";
import type { NotificationItem } from "@/lib/supabase/notifications";

interface AuthProfileContextValue {
  /** Profile REAL (Supabase `public.profiles`), não persona mock. */
  profile: Profile;
  email: string | null;
  /** Espaços reais do usuário (RLS já filtra) — usado pelo seletor de espaço. */
  mySpaces: Space[];
  canAccessVisionario: boolean;
  canAccessTiktok: boolean;
  /** `has_module_permission(space, módulo, 'view')` por módulo — decide o que aparece no menu. */
  visionarioModulePermissions: Partial<Record<ModulePermissionModule, boolean>>;
  tiktokModulePermissions: Partial<Record<ModulePermissionModule, boolean>>;
  /** Calculado ao vivo (ver lib/supabase/notifications.ts) — nunca uma tabela mock. */
  notifications: NotificationItem[];
}

const AuthProfileContext = createContext<AuthProfileContextValue | null>(null);

export function AuthProfileProvider({
  profile,
  email,
  mySpaces,
  canAccessVisionario,
  canAccessTiktok,
  visionarioModulePermissions,
  tiktokModulePermissions,
  notifications,
  children,
}: AuthProfileContextValue & { children: React.ReactNode }) {
  return (
    <AuthProfileContext.Provider
      value={{
        profile,
        email,
        mySpaces,
        canAccessVisionario,
        canAccessTiktok,
        visionarioModulePermissions,
        tiktokModulePermissions,
        notifications,
      }}
    >
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
