"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/dev/confirm-button";
import { updateUserEmailAction, setUserPasswordAction } from "@/lib/supabase/admin-users-actions";

/**
 * Trocar e-mail e definir senha usam a Supabase Admin API (Service Role),
 * só no servidor (`lib/supabase/admin-users-actions.ts`). A senha atual
 * nunca aparece em lugar nenhum porque o Supabase não a guarda em texto
 * puro — só é possível DEFINIR uma nova, não ver a antiga.
 */
export function AccountSecurityPanel({ userId, email }: { userId: string; email: string | null }) {
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Conta (Supabase Auth)</p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-current-email">E-mail atual</Label>
          <Input id="account-current-email" value={email ?? "—"} disabled />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="account-new-email">Novo e-mail</Label>
            <Input
              id="account-new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="novo@exemplo.com"
              autoComplete="off"
            />
          </div>
          <ConfirmButton
            label="Alterar e-mail"
            title="Alterar o e-mail deste usuário?"
            description={`O login passa a ser feito com "${newEmail.trim()}", já confirmado — o usuário não recebe e-mail de confirmação.`}
            confirmLabel="Alterar"
            confirmVariant="default"
            disabled={!newEmail.trim() || newEmail.trim() === email}
            onConfirm={async () => {
              const result = await updateUserEmailAction(userId, newEmail.trim());
              if (!result.error) setNewEmail("");
              return result;
            }}
          />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="account-new-password">Nova senha</Label>
            <Input
              id="account-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="mínimo 8 caracteres"
              autoComplete="new-password"
            />
          </div>
          <ConfirmButton
            label="Definir senha"
            title="Definir uma nova senha para este usuário?"
            description="A senha atual não precisa ser conhecida. O usuário passa a usar a nova senha no próximo login; sessões já abertas não são encerradas automaticamente."
            confirmLabel="Definir"
            confirmVariant="default"
            disabled={newPassword.trim().length < 8}
            onConfirm={async () => {
              const result = await setUserPasswordAction(userId, newPassword);
              if (!result.error) setNewPassword("");
              return result;
            }}
          />
        </div>
      </div>
    </Card>
  );
}
