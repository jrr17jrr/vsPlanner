"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createUserAction } from "@/lib/supabase/admin-users-actions";
import type { ProfileStatus, SystemRole } from "@/types/database.types";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ProfileStatus>("active");
  const [systemRole, setSystemRole] = useState<SystemRole>("user");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setStatus("active");
    setSystemRole("user");
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createUserAction({ name, email, password, status, systemRole });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(result.success ?? "Usuário criado.");
      resetForm();
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Cria a conta no Supabase Auth; profile, espaço Pessoal e membership owner
            são criados automaticamente pela trigger do banco.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-name">Nome</Label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="Nome completo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-email">E-mail</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              placeholder="pessoa@exemplo.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-password">Senha inicial</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              placeholder="mínimo 8 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ProfileStatus)}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="blocked">blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>system_role</Label>
              <Select
                value={systemRole}
                onValueChange={(v) => setSystemRole(v as SystemRole)}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="super_admin">super_admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !name.trim() || !email.trim() || password.length < 8}
          >
            {pending ? "Criando…" : "Criar usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
