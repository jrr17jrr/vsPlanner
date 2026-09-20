"use client";

import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/dev/confirm-button";
import { SpaceRoleSelect } from "@/components/dev/space-role-select";
import { GrantAccessForm } from "@/components/dev/grant-access-form";
import {
  changeSpaceMemberRoleAction,
  revokeSpaceAccessAction,
  grantSpaceAccessAction,
} from "@/lib/supabase/admin-spaces-actions";
import type { Space, SpaceMember } from "@/types/database.types";

export function UserSpacesPanel({
  userId,
  memberships,
  allSpaces,
  spaceNameById,
}: {
  userId: string;
  memberships: SpaceMember[];
  allSpaces: Space[];
  spaceNameById: Map<string, string>;
}) {
  const memberSpaceIds = new Set(memberships.map((m) => m.space_id));
  const availableSpaces = allSpaces.filter((s) => !memberSpaceIds.has(s.id));

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Espaços</p>
      <div className="flex flex-col gap-2">
        {memberships.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum espaço.</p>
        )}
        {memberships.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <p className="truncate text-sm font-medium text-foreground">
              {spaceNameById.get(m.space_id) ?? m.space_id}
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
        ))}
      </div>

      {availableSpaces.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Conceder acesso a um espaço
          </p>
          <GrantAccessForm
            options={availableSpaces.map((s) => ({ value: s.id, label: s.name }))}
            optionLabel="Espaço"
            onSubmit={(spaceId, role) => grantSpaceAccessAction(spaceId, userId, role)}
          />
        </div>
      )}
    </Card>
  );
}
