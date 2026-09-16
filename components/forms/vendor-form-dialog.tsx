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
import type { Vendor } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor;
  spaceId: string;
}

export function VendorFormDialog({ open, onOpenChange, vendor, spaceId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <VendorForm key={vendor?.id ?? "new"} onOpenChange={onOpenChange} vendor={vendor} spaceId={spaceId} />
      )}
    </Dialog>
  );
}

function VendorForm({ onOpenChange, vendor, spaceId }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [name, setName] = useState(vendor?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(vendor?.whatsapp ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [status, setStatus] = useState<"ativo" | "inativo">(vendor?.status ?? "ativo");
  const [defaultCommissionPct, setDefaultCommissionPct] = useState(
    vendor ? String(vendor.defaultCommissionPct) : "15"
  );
  const [notes, setNotes] = useState(vendor?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Informe o nome do vendedor.");
      return;
    }
    const payload = {
      name,
      whatsapp: whatsapp || undefined,
      email: email || undefined,
      status,
      defaultCommissionPct: Number(defaultCommissionPct) || 0,
      notes: notes || undefined,
    };
    if (vendor) {
      update("vendors", vendor.id, payload);
      toast.success("Vendedor atualizado.");
    } else {
      add("vendors", { id: generateId("vendor"), spaceId, ...payload, createdAt: new Date().toISOString() });
      toast.success("Vendedor cadastrado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{vendor ? "Editar vendedor" : "Novo vendedor"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendor-name">Nome</Label>
          <Input id="vendor-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-whatsapp">WhatsApp</Label>
            <Input id="vendor-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5511999999999" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-email">E-mail</Label>
            <Input id="vendor-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-pct">Comissão padrão (%)</Label>
            <Input id="vendor-pct" type="number" min={0} max={100} value={defaultCommissionPct} onChange={(e) => setDefaultCommissionPct(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "ativo" | "inativo")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendor-notes">Observações</Label>
          <Textarea id="vendor-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{vendor ? "Salvar alterações" : "Cadastrar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
