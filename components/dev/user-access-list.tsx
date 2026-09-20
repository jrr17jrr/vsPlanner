"use client";

import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/dev/confirm-button";
import { SpaceRoleSelect } from "@/components/dev/space-role-select";
import { changeSpaceMemberRoleAction, revokeSpaceAccessAction } from "@/lib/supabase/admin-spaces-actions";
import type { SpaceMember } from "@/types/database.types";

/**
 * Seção "ACESSOS" da tela de detalhes do usuário: só a lista de espaços
 * aos quais ele já tem acesso (com o role em cada um, editável) + remover.
 * Conceder um NOVO acesso é uma seção separada (ver `GrantAccessForm`).
 */
export function UserAccessList({
  userId,
  memberships,
  spaceNameById,
}: {
  userId: string;
  memberships: SpaceMember[];
  spaceNameById: Map<string, string>;
}) {
  return (
    <Card className="p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Acessos
      </p>
      <div className="flex flex-col gap-2">
        {memberships.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Este usuário ainda não tem acesso a nenhum espaço.
          </p>
        )}
        {memberships.map((m) => {
          const spaceName = spaceNameById.get(m.space_id) ?? m.space_id;
          return (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <p className="truncate text-sm font-medium text-foreground">
                {spaceName} <span className="font-normal text-muted-foreground">— {m.role}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <SpaceRoleSelect
                  value={m.role}
                  onChange={(role) => changeSpaceMemberRoleAction(m.space_id, userId, role)}
                />
                <ConfirmButton
                  label="Remover"
                  title="Remover acesso a este espaço?"
                  description="O usuário perde o acesso a este espaço imediatamente. Se ele for o único owner, o banco recusa a ação."
                  confirmLabel="Remover"
                  onConfirm={() => revokeSpaceAccessAction(m.space_id, userId)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
