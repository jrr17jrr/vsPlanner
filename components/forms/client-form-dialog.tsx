"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbStore } from "@/store/db-store";
import { generateId } from "@/lib/ids";
import { toDateKey } from "@/lib/format";
import type { Client, ClientStatus } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
  spaceId: string;
}

export function ClientFormDialog({ open, onOpenChange, client, spaceId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ClientForm key={client?.id ?? "new"} onOpenChange={onOpenChange} client={client} spaceId={spaceId} />
      )}
    </Dialog>
  );
}

function ClientForm({ onOpenChange, client, spaceId }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [name, setName] = useState(client?.name ?? "");
  const [company, setCompany] = useState(client?.company ?? "");
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? "ativo");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(client?.whatsapp ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [instagram, setInstagram] = useState(client?.instagram ?? "");
  const [website, setWebsite] = useState(client?.website ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [dueDay, setDueDay] = useState(client ? String(client.dueDay) : "5");
  const [pricingMode, setPricingMode] = useState<"individual" | "pacote">(client?.pricingMode ?? "individual");
  const [packagePrice, setPackagePrice] = useState(client?.packagePrice ? String(client.packagePrice) : "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    const payload = {
      name,
      company: company || undefined,
      status,
      phone: phone || undefined,
      whatsapp: whatsapp || undefined,
      email: email || undefined,
      instagram: instagram || undefined,
      website: website || undefined,
      notes: notes || undefined,
      dueDay: Number(dueDay) || 5,
      pricingMode,
      packagePrice: pricingMode === "pacote" ? Number(packagePrice.replace(",", ".")) || 0 : undefined,
    };
    if (client) {
      update("clients", client.id, payload);
      toast.success("Cliente atualizado.");
    } else {
      add("clients", {
        id: generateId("client"),
        spaceId,
        ...payload,
        joinedAt: toDateKey(new Date()),
        createdAt: new Date().toISOString(),
      });
      toast.success("Cliente cadastrado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli-name">Nome</Label>
            <Input id="cli-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli-company">Empresa</Label>
            <Input id="cli-company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli-dueday">Dia de vencimento</Label>
            <Input id="cli-dueday" type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cobrança</Label>
            <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as "individual" | "pacote")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Por serviço</SelectItem>
                <SelectItem value="pacote">Pacote fechado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {pricingMode === "pacote" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli-package">Valor do pacote (R$/mês)</Label>
            <Input id="cli-package" inputMode="decimal" value={packagePrice} onChange={(e) => setPackagePrice(e.target.value)} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli-phone">Telefone</Label>
            <Input id="cli-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli-whatsapp">WhatsApp (só números com DDI)</Label>
            <Input id="cli-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5511999999999" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli-email">E-mail</Label>
            <Input id="cli-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli-instagram">Instagram (URL)</Label>
            <Input id="cli-instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cli-website">Site</Label>
          <Input id="cli-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cli-notes">Observações</Label>
          <Textarea id="cli-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{client ? "Salvar alterações" : "Cadastrar cliente"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
