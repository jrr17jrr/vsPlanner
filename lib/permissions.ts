import type { Database } from "@/mock/seed";
import type { Profile, Space, SpaceMember, SpaceRole } from "@/types/entities";

/**
 * Regras de acesso do VSLead (hoje aplicadas apenas no client, via mock).
 *
 * IMPORTANTE (futuro Supabase): estas checagens precisam ser espelhadas em
 * Row Level Security no Postgres. Nenhuma tela deve confiar apenas nesta
 * camada — `role: 'super_admin'` e o acesso a espaços via `space_members`
 * devem ser validados no backend antes de qualquer leitura/escrita.
 */

export function isSuperAdmin(profile: Profile | undefined | null): boolean {
  return profile?.role === "super_admin";
}

export function getMembership(
  db: Pick<Database, "spaceMembers">,
  userId: string,
  spaceId: string
): SpaceMember | undefined {
  return db.spaceMembers.find(
    (m) => m.userId === userId && m.spaceId === spaceId
  );
}

export function getSpaceRole(
  db: Pick<Database, "spaceMembers">,
  userId: string,
  spaceId: string
): SpaceRole | null {
  return getMembership(db, userId, spaceId)?.role ?? null;
}

export function canAccessSpace(
  db: Pick<Database, "spaceMembers">,
  userId: string,
  spaceId: string
): boolean {
  return getMembership(db, userId, spaceId) !== undefined;
}

export function getUserSpaces(
  db: Pick<Database, "spaceMembers" | "spaces">,
  userId: string
): Space[] {
  const spaceIds = new Set(
    db.spaceMembers.filter((m) => m.userId === userId).map((m) => m.spaceId)
  );
  return db.spaces.filter((s) => spaceIds.has(s.id));
}

export function getPersonalSpace(
  db: Pick<Database, "spaces">,
  userId: string
): Space | undefined {
  return db.spaces.find((s) => s.type === "personal" && s.ownerId === userId);
}

export function hasRoleAtLeast(role: SpaceRole | null, min: SpaceRole): boolean {
  const order: SpaceRole[] = ["viewer", "member", "admin", "owner"];
  if (!role) return false;
  return order.indexOf(role) >= order.indexOf(min);
}
