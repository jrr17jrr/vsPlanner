"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/dev/confirm-button";
import { UserNameForm } from "@/components/dev/user-name-form";
import { UserStatusControl } from "@/components/dev/user-status-control";
import { UserSystemRoleControl } from "@/components/dev/user-system-role-control";
import { updateUserEmailAction, setUserPasswordAction } from "@/lib/supabase/admin-users-actions";
import { initials, formatDate } from "@/lib/format";
import type { AdminUserRow } from "@/types/database.types";

/**
 * Seção "CONTA" da tela de detalhes do usuário: Nome, E-mail, Nova senha,
 * Status e system_role, tudo junto — trocar e-mail/senha usa a Supabase
 * Admin API (Service Role), só no servidor. A senha atual nunca aparece
 * em lugar nenhum porque o Supabase não a guarda em texto puro.
 */
export function UserAccountPanel({
  user,
  isSelf,
}: {
  user: AdminUserRow;
  isSelf: boolean;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  return (
    <Card className="p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Conta
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary/15 text-lg text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={user.system_role === "super_admin" ? "default" : "secondary"}>
              {user.system_role}
            </Badge>
            <Badge variant={user.status === "active" ? "success" : "destructive"}>
              {user.status}
            </Badge>
          </div>
        </div>

        <UserNameForm userId={user.id} initialName={user.name} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-current-email">E-mail atual</Label>
          <Input id="account-current-email" value={user.email ?? "—"} disabled />
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
            disabled={!newEmail.trim() || newEmail.trim() === user.email}
            onConfirm={async () => {
              const result = await updateUserEmailAction(user.id, newEmail.trim());
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
              const result = await setUserPasswordAction(user.id, newPassword);
              if (!result.error) setNewPassword("");
              return result;
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Criado em</p>
            <p>{formatDate(user.created_at)}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Último acesso</p>
            <p>{user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "nunca"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <UserStatusControl userId={user.id} status={user.status} isSelf={isSelf} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>system_role</Label>
            <UserSystemRoleControl userId={user.id} systemRole={user.system_role} isSelf={isSelf} />
          </div>
        </div>
      </div>
    </Card>
  );
}
