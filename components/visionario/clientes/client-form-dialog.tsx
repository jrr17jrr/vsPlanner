"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createClientAction,
  updateClientAction,
  type ClientFormInput,
} from "@/lib/supabase/clients-actions";
import { toDateKey } from "@/lib/format";
import type { Client, ClientStatus, SpaceMemberProfile } from "@/types/database.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
  members: SpaceMemberProfile[];
  onSaved?: (clientId: string) => void;
}

export function ClientFormDialog({ open, onOpenChange, client, members, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ClientForm
          key={client?.id ?? "new"}
          onOpenChange={onOpenChange}
          client={client}
          members={members}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function ClientForm({ onOpenChange, client, members, onSaved }: Omit<Props, "open">) {
  const [name, setName] = useState(client?.name ?? "");
  const [company, setCompany] = useState(client?.company ?? "");
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? "ativo");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(client?.whatsapp ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [instagram, setInstagram] = useState(client?.instagram ?? "");
  const [website, setWebsite] = useState(client?.website ?? "");
  const [joinedAt, setJoinedAt] = useState(client?.joined_at ?? toDateKey(new Date()));
  const [responsibleId, setResponsibleId] = useState(client?.responsible_id ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Dê um nome para o cliente.");
      return;
    }

    const input: ClientFormInput = {
      name,
      company: company || undefined,
      status,
      phone: phone || undefined,
      whatsapp: whatsapp || undefined,
      email: email || undefined,
      instagram: instagram || undefined,
      website: website || undefined,
      joinedAt,
      responsibleId: responsibleId || undefined,
      notes: notes || undefined,
    };

    startTransition(async () => {
      const result = client
        ? await updateClientAction(client.id, input)
        : await createClientAction(input);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? (client ? "Cliente atualizado." : "Cliente criado."));
      onOpenChange(false);
      if (result.clientId) onSaved?.(result.clientId);
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-name">Nome *</Label>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-company">Empresa</Label>
            <Input id="client-company" value={company} onChange={(e) => setCompany(e.target.value)} disabled={pending} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-phone">Telefone</Label>
            <Input id="client-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-whatsapp">WhatsApp</Label>
            <Input
              id="client-whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              disabled={pending}
              placeholder="(11) 99999-9999"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-email">E-mail</Label>
          <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-instagram">Instagram</Label>
            <Input id="client-instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-website">Site</Label>
            <Input id="client-website" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={pending} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-joined">Cliente desde</Label>
            <Input
              id="client-joined"
              type="date"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Responsável</Label>
            <Select
              value={responsibleId || "none"}
              onValueChange={(v) => setResponsibleId(v === "none" ? "" : v)}
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-notes">Observações</Label>
          <Textarea id="client-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : client ? "Salvar alterações" : "Criar cliente"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
