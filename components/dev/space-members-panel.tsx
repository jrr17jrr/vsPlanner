"use client";

import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ConfirmButton } from "@/components/dev/confirm-button";
import { SpaceRoleSelect } from "@/components/dev/space-role-select";
import { GrantAccessForm } from "@/components/dev/grant-access-form";
import {
  changeSpaceMemberRoleAction,
  revokeSpaceAccessAction,
  grantSpaceAccessAction,
} from "@/lib/supabase/admin-spaces-actions";
import { initials } from "@/lib/format";
import type { AdminUserRow, Space, SpaceMember } from "@/types/database.types";

export function SpaceMembersPanel({
  space,
  members,
  allUsers,
  userById,
}: {
  space: Space;
  members: SpaceMember[];
  allUsers: AdminUserRow[];
  userById: Map<string, AdminUserRow>;
}) {
  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Membros</p>
      <div className="flex flex-col gap-2">
        {members.map((m) => {
          const user = userById.get(m.user_id);
          const isCanonicalOwner = m.user_id === space.owner_id;
          return (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary">
                    {initials(user?.name ?? "??")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.name ?? m.user_id}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SpaceRoleSelect
                  value={m.role}
                  onChange={(role) => changeSpaceMemberRoleAction(space.id, m.user_id, role)}
                />
                <ConfirmButton
                  label="Remover"
                  title="Remover este membro do espaço?"
                  description={
                    isCanonicalOwner
                      ? "Este é o proprietário original do espaço — o banco recusa esta remoção."
                      : "O usuário perde o acesso a este espaço imediatamente."
                  }
                  confirmLabel="Remover"
                  onConfirm={() => revokeSpaceAccessAction(space.id, m.user_id)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {availableUsers.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Compartilhar este espaço
          </p>
          <GrantAccessForm
            options={availableUsers.map((u) => ({
              value: u.id,
              label: `${u.name} (${u.email ?? "sem e-mail"})`,
            }))}
            optionLabel="Usuário"
            onSubmit={(userId, role) => grantSpaceAccessAction(space.id, userId, role)}
          />
        </div>
      )}
    </Card>
  );
}
