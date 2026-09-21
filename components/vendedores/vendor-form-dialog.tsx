"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createVendorAction, updateVendorAction, type VendorFormInput } from "@/lib/supabase/vendors-actions";
import type { Vendor } from "@/types/database.types";

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <VendorForm key={vendor?.id ?? "new"} onOpenChange={onOpenChange} vendor={vendor} />}
    </Dialog>
  );
}

function VendorForm({ onOpenChange, vendor }: { onOpenChange: (open: boolean) => void; vendor?: Vendor }) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [contactName, setContactName] = useState(vendor?.contact_name ?? "");
  const [whatsapp, setWhatsapp] = useState(vendor?.whatsapp ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Dê um nome para o vendedor.");

    const input: VendorFormInput = {
      name,
      contactName: contactName || undefined,
      whatsapp: whatsapp || undefined,
      email: email || undefined,
      notes: notes || undefined,
    };

    setPending(true);
    const result = vendor ? await updateVendorAction(vendor.id, input) : await createVendorAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Vendedor salvo.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{vendor ? "Editar vendedor" : "Novo vendedor"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Nome *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={pending} autoFocus />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Contato</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>WhatsApp</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={pending} placeholder="(11) 99999-9999" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} placeholder="Opcional" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
