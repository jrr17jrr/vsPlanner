"use client";

import { ConfirmButton } from "@/components/dev/confirm-button";
import { setUserSystemRoleAction } from "@/lib/supabase/admin-users-actions";
import type { SystemRole } from "@/types/database.types";

export function UserSystemRoleControl({
  userId,
  systemRole,
  isSelf,
}: {
  userId: string;
  systemRole: SystemRole;
  isSelf: boolean;
}) {
  if (systemRole === "super_admin") {
    return (
      <ConfirmButton
        label="Remover super_admin"
        title={isSelf ? "Remover seu próprio acesso de super_admin?" : "Remover acesso de super_admin?"}
        description={
          isSelf
            ? "Você perde acesso ao Painel Dev imediatamente. Se você for o único super_admin ativo, o banco recusa esta ação."
            : "Esse usuário deixa de ter acesso ao Painel Dev e a qualquer permissão administrativa."
        }
        confirmLabel="Remover"
        onConfirm={() => setUserSystemRoleAction(userId, "user", { confirmSelf: isSelf })}
      />
    );
  }

  return (
    <ConfirmButton
      label="Promover a super_admin"
      title="Promover a super_admin?"
      description="Esse usuário passa a ter acesso total ao Painel Dev: gerenciar todos os usuários e todos os espaços."
      confirmLabel="Promover"
      confirmVariant="default"
      onConfirm={() => setUserSystemRoleAction(userId, "super_admin")}
    />
  );
}
