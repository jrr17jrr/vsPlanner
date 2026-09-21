"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSaleAction, type SaleFormInput } from "@/lib/supabase/vendors-actions";
import { toDateKey } from "@/lib/format";
import type { Client, SaleStatus, Service, Vendor } from "@/types/database.types";

const STATUS_LABEL: Record<SaleStatus, string> = { pendente: "Pendente", confirmada: "Confirmada", cancelada: "Cancelada" };

export function SaleFormDialog({
  open,
  onOpenChange,
  vendors,
  clients,
  services,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: Vendor[];
  clients: Client[];
  services: Service[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SaleForm onOpenChange={onOpenChange} vendors={vendors} clients={clients} services={services} />}
    </Dialog>
  );
}

function SaleForm({
  onOpenChange,
  vendors,
  clients,
  services,
}: {
  onOpenChange: (open: boolean) => void;
  vendors: Vendor[];
  clients: Client[];
  services: Service[];
}) {
  const [vendorId, setVendorId] = useState("");
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [saleDate, setSaleDate] = useState(toDateKey(new Date()));
  const [status, setStatus] = useState<SaleStatus>("confirmada");
  const [commissionPct, setCommissionPct] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) return toast.error("Escolha um vendedor.");
    const amountValue = parseFloat(amount.replace(",", "."));
    if (!amountValue || amountValue <= 0) return toast.error("Informe um valor válido.");

    const input: SaleFormInput = {
      vendorId,
      clientId: clientId || undefined,
      serviceId: serviceId || undefined,
      amount: amountValue,
      saleDate,
      status,
      notes: notes || undefined,
      commissionPercentage: commissionPct ? parseFloat(commissionPct.replace(",", ".")) : undefined,
    };

    setPending(true);
    const result = await createSaleAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Venda registrada.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Registrar venda</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label>Vendedor *</Label>
          <Select value={vendorId} onValueChange={setVendorId} disabled={pending}>
            <SelectTrigger><SelectValue placeholder="Escolha um vendedor" /></SelectTrigger>
            <SelectContent>
              {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente</Label>
            <Select value={clientId || "nenhum"} onValueChange={(v) => setClientId(v === "nenhum" ? "" : v)} disabled={pending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem cliente</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Serviço</Label>
            <Select value={serviceId || "nenhum"} onValueChange={(v) => setServiceId(v === "nenhum" ? "" : v)} disabled={pending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem serviço</SelectItem>
                {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Valor *</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} placeholder="0,00" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Data</Label>
            <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} disabled={pending} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SaleStatus)} disabled={pending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as SaleStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Comissão (%)</Label>
            <Input inputMode="decimal" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Registrar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
