"use client";

import { useMemo } from "react";
import { useAuthProfile } from "@/components/providers/auth-profile-provider";
import type { NavAccess } from "@/lib/nav";

/** Permissões reais da sessão (ver app/(app)/layout.tsx) no formato das regras de navegação. */
export function useNavAccess(): NavAccess {
  const { profile, canAccessVisionario, canAccessTiktok, canAccessClt, visionarioModulePermissions, tiktokModulePermissions } = useAuthProfile();
  const isSuperAdmin = profile.system_role === "super_admin";
  return useMemo(
    () => ({ canAccessVisionario, canAccessTiktok, canAccessClt, visionarioModulePermissions, tiktokModulePermissions, isSuperAdmin }),
    [canAccessVisionario, canAccessTiktok, canAccessClt, visionarioModulePermissions, tiktokModulePermissions, isSuperAdmin]
  );
}
