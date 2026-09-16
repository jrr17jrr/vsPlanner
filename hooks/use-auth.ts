"use client";

import { useMemo } from "react";
import { useDbStore } from "@/store/db-store";
import { useSessionStore } from "@/store/session-store";
import {
  getPersonalSpace,
  getUserSpaces,
  isSuperAdmin,
  canAccessSpace,
} from "@/lib/permissions";

export function useAuth() {
  const userId = useSessionStore((s) => s.userId);
  const login = useSessionStore((s) => s.login);
  const logout = useSessionStore((s) => s.logout);
  const profiles = useDbStore((s) => s.profiles);
  const spaces = useDbStore((s) => s.spaces);
  const spaceMembers = useDbStore((s) => s.spaceMembers);

  const profile = useMemo(
    () => profiles.find((p) => p.id === userId) ?? null,
    [profiles, userId]
  );

  const db = { spaces, spaceMembers };

  const personalSpace = profile ? getPersonalSpace(db, profile.id) : undefined;
  const mySpaces = profile ? getUserSpaces(db, profile.id) : [];
  const canAccessVisionario = profile
    ? canAccessSpace(db, profile.id, spaces.find((s) => s.slug === "visionario-dev")?.id ?? "")
    : false;
  const canAccessTiktok = profile
    ? canAccessSpace(db, profile.id, spaces.find((s) => s.slug === "tiktok")?.id ?? "")
    : false;

  return {
    userId,
    profile,
    isAuthenticated: !!profile,
    isSuperAdmin: isSuperAdmin(profile),
    personalSpace,
    mySpaces,
    canAccessVisionario,
    canAccessTiktok,
    login,
    logout,
  };
}
