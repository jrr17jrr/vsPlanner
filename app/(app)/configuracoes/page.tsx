"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/format";

export default function ConfiguracoesPage() {
  const { profile, mySpaces } = useAuth();
  const update = useDbStore((s) => s.update);
  const spaceMembers = useDbStore((s) => s.spaceMembers);

  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");

  if (!profile) return null;

  function saveProfile() {
    update("profiles", profile!.id, { name, phone: phone || undefined });
    toast.success("Perfil atualizado.");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" description="Perfil, preferências e espaços." />

      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Perfil</p>
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-primary/15 text-lg text-primary">{initials(name || profile.name)}</AvatarFallback>
          </Avatar>
          <div className="text-xs text-muted-foreground">
            Avatar gerado automaticamente a partir do nome.
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-name">Nome</Label>
            <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-email">E-mail</Label>
            <Input id="cfg-email" value={profile.email} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-phone">Telefone</Label>
            <Input id="cfg-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <Button size="sm" className="mt-4" onClick={saveProfile}>Salvar perfil</Button>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Preferências</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Tema</Label>
            <Select value="dark" disabled>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Moeda</Label>
            <Select value="BRL" disabled>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">Real (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fuso horário</Label>
            <Select value="America/Sao_Paulo" disabled>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">América/São Paulo (GMT-3)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Outras opções de tema, moeda e fuso horário chegam em versões futuras.
        </p>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Meus espaços</p>
        <div className="flex flex-col gap-2">
          {mySpaces.map((space) => {
            const membership = spaceMembers.find((m) => m.spaceId === space.id && m.userId === profile.id);
            return (
              <div key={space.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{space.name}</p>
                  <p className="text-xs text-muted-foreground">{space.type === "personal" ? "Espaço pessoal" : "Espaço compartilhado"}</p>
                </div>
                <Badge variant="secondary">{membership?.role}</Badge>
              </div>
            );
          })}
        </div>
        <Separator className="my-3" />
        <p className="text-xs text-muted-foreground">
          Convite de membros e gestão avançada de permissões chegam junto com o Supabase Auth.
        </p>
      </Card>
    </div>
  );
}
