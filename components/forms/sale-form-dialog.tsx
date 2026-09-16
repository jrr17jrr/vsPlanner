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
import type { Sale, Vendor } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale?: Sale;
  spaceId: string;
  vendors: Vendor[];
  clients: { id: string; name: string }[];
  services: { id: string; name: string }[];
}

export function SaleFormDialog({ open, onOpenChange, sale, spaceId, vendors, clients, services }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SaleForm
          key={sale?.id ?? "new"}
          onOpenChange={onOpenChange}
          sale={sale}
          spaceId={spaceId}
          vendors={vendors}
          clients={clients}
          services={services}
        />
      )}
    </Dialog>
  );
}

function SaleForm({ onOpenChange, sale, spaceId, vendors, clients, services }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);
  const commissions = useDbStore((s) => s.commissions);

  const [vendorId, setVendorId] = useState(sale?.vendorId ?? vendors[0]?.id ?? "");
  const [clientId, setClientId] = useState(sale?.clientId ?? "none");
  const [serviceId, setServiceId] = useState(sale?.serviceId ?? "none");
  const [amount, setAmount] = useState(sale ? String(sale.amount) : "");
  const [commissionPct, setCommissionPct] = useState(
    sale ? String(sale.commissionPct) : String(vendors[0]?.defaultCommissionPct ?? 15)
  );
  const [date, setDate] = useState(sale?.date ?? toDateKey(new Date()));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    const pct = Number(commissionPct);
    if (!vendorId || !value) {
      toast.error("Selecione o vendedor e informe o valor da venda.");
      return;
    }
    const commissionAmount = Math.round(((value * pct) / 100) * 100) / 100;

    if (sale) {
      update("sales", sale.id, {
        vendorId,
        clientId: clientId === "none" ? undefined : clientId,
        serviceId: serviceId === "none" ? undefined : serviceId,
        amount: value,
        commissionPct: pct,
        date,
      });
      const commission = commissions.find((c) => c.saleId === sale.id);
      if (commission) {
        update("commissions", commission.id, { vendorId, amount: commissionAmount });
      }
      toast.success("Venda atualizada.");
    } else {
      const saleId = generateId("sale");
      add("sales", {
        id: saleId,
        spaceId,
        vendorId,
        clientId: clientId === "none" ? undefined : clientId,
        serviceId: serviceId === "none" ? undefined : serviceId,
        amount: value,
        commissionPct: pct,
        date,
        createdAt: new Date().toISOString(),
      });
      add("commissions", {
        id: generateId("comm"),
        saleId,
        spaceId,
        vendorId,
        amount: commissionAmount,
        status: "pendente",
      });
      toast.success("Venda registrada e comissão calculada.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{sale ? "Editar venda" : "Registrar venda"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Vendedor</Label>
          <Select
            value={vendorId}
            onValueChange={(v) => {
              setVendorId(v);
              const vendor = vendors.find((x) => x.id === v);
              if (vendor && !sale) setCommissionPct(String(vendor.defaultCommissionPct));
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente (opcional)</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Serviço (opcional)</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-amount">Valor (R$)</Label>
            <Input id="sale-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-pct">Comissão (%)</Label>
            <Input id="sale-pct" type="number" min={0} max={100} value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-date">Data</Label>
            <Input id="sale-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {amount && commissionPct && (
          <p className="text-xs text-muted-foreground">
            Vendedor recebe {commissionPct}% (R$
            {" "}
            {((Number(amount.replace(",", ".")) || 0) * (Number(commissionPct) || 0) / 100).toFixed(2)}
            ) · Visionário fica com o restante.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{sale ? "Salvar alterações" : "Registrar venda"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
