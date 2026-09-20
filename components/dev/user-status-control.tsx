"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/dev/confirm-button";
import { setUserStatusAction } from "@/lib/supabase/admin-users-actions";
import type { ProfileStatus } from "@/types/database.types";

export function UserStatusControl({
  userId,
  status,
  isSelf,
}: {
  userId: string;
  status: ProfileStatus;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (status === "active") {
    return (
      <ConfirmButton
        label="Bloquear"
        title={isSelf ? "Bloquear a sua própria conta?" : "Bloquear este usuário?"}
        description={
          isSelf
            ? "Você perde o acesso ao sistema imediatamente (a sessão é encerrada no próximo request). Se você for o único super_admin ativo, o banco recusa esta ação."
            : "O usuário é desconectado e não consegue mais acessar o sistema até ser reativado."
        }
        confirmLabel="Bloquear"
        onConfirm={() => setUserStatusAction(userId, "blocked", { confirmSelf: isSelf })}
      />
    );
  }

  function handleActivate() {
    startTransition(async () => {
      const result = await setUserStatusAction(userId, "active");
      if (result.error) toast.error(result.error);
      else toast.success(result.success ?? "Usuário ativado.");
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleActivate} disabled={pending}>
      {pending ? "Aguarde…" : "Ativar"}
    </Button>
  );
}
