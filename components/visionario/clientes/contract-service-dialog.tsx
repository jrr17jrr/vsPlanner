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
  createClientServiceAction,
  updateClientServiceAction,
  type ClientServiceFormInput,
} from "@/lib/supabase/client-services-actions";
import { toDateKey } from "@/lib/format";
import type {
  ClientService,
  ClientServiceBillingType,
  ClientServiceFrequency,
  ClientServiceStatus,
  Service,
} from "@/types/database.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  services: Service[];
  contract?: ClientService;
}

export function ContractServiceDialog({ open, onOpenChange, clientId, services, contract }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ContractServiceForm
          key={contract?.id ?? "new"}
          onOpenChange={onOpenChange}
          clientId={clientId}
          services={services}
          contract={contract}
        />
      )}
    </Dialog>
  );
}

function ContractServiceForm({ onOpenChange, clientId, services, contract }: Omit<Props, "open">) {
  const [serviceId, setServiceId] = useState(contract?.service_id ?? services[0]?.id ?? "");
  const [price, setPrice] = useState(
    String(contract?.price ?? services.find((s) => s.id === serviceId)?.default_price ?? 0)
  );
  const [billingType, setBillingType] = useState<ClientServiceBillingType>(
    contract?.billing_type ?? "unico"
  );
  const [frequency, setFrequency] = useState<ClientServiceFrequency>(contract?.frequency ?? "mensal");
  const [dueDay, setDueDay] = useState(String(contract?.due_day ?? 10));
  const [startDate, setStartDate] = useState(contract?.start_date ?? toDateKey(new Date()));
  const [status, setStatus] = useState<ClientServiceStatus>(contract?.status ?? "ativo");
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [pending, startTransition] = useTransition();

  function handleServiceChange(id: string) {
    setServiceId(id);
    if (!contract) {
      const svc = services.find((s) => s.id === id);
      if (svc) {
        setPrice(String(svc.default_price));
        setBillingType(svc.billing_type === "mensal" ? "recorrente" : "unico");
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceNum = Number(price.replace(",", "."));
    if (Number.isNaN(priceNum) || priceNum <= 0) {
      toast.error("Valor precisa ser maior que zero.");
      return;
    }

    const input: ClientServiceFormInput = {
      serviceId,
      price: priceNum,
      billingType,
      frequency: billingType === "recorrente" ? frequency : undefined,
      dueDay: billingType === "recorrente" ? Number(dueDay) : undefined,
      startDate,
      status,
      notes: notes || undefined,
    };

    startTransition(async () => {
      const result = contract
        ? await updateClientServiceAction(contract.id, clientId, input)
        : await createClientServiceAction(clientId, input);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? (contract ? "Contrato atualizado." : "Serviço contratado."));
      onOpenChange(false);
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{contract ? "Editar serviço contratado" : "Contratar serviço"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Serviço</Label>
          <Select value={serviceId} onValueChange={handleServiceChange} disabled={pending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-price">Valor</Label>
            <Input id="cs-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cobrança</Label>
            <Select value={billingType} onValueChange={(v) => setBillingType(v as ClientServiceBillingType)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unico">Pagamento único</SelectItem>
                <SelectItem value="recorrente">Recorrente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {billingType === "recorrente" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Frequência</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as ClientServiceFrequency)} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs-due-day">Dia de vencimento</Label>
              <Input
                id="cs-due-day"
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-start">Início</Label>
            <Input
              id="cs-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ClientServiceStatus)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-notes">Observações</Label>
          <Textarea id="cs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : contract ? "Salvar alterações" : "Contratar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
