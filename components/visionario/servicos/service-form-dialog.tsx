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
  createServiceAction,
  updateServiceAction,
  type ServiceFormInput,
} from "@/lib/supabase/services-actions";
import type { Service, ServiceBillingType, ServiceStatus } from "@/types/database.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service;
}

export function ServiceFormDialog({ open, onOpenChange, service }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ServiceForm key={service?.id ?? "new"} onOpenChange={onOpenChange} service={service} />}
    </Dialog>
  );
}

function ServiceForm({ onOpenChange, service }: Omit<Props, "open">) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [defaultPrice, setDefaultPrice] = useState(String(service?.default_price ?? 0));
  const [billingType, setBillingType] = useState<ServiceBillingType>(service?.billing_type ?? "unico");
  const [status, setStatus] = useState<ServiceStatus>(service?.status ?? "ativo");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Dê um nome para o serviço.");
      return;
    }
    const price = Number(defaultPrice.replace(",", "."));
    if (Number.isNaN(price) || price < 0) {
      toast.error("Valor inválido.");
      return;
    }

    const input: ServiceFormInput = {
      name,
      description: description || undefined,
      defaultPrice: price,
      billingType,
      status,
    };

    startTransition(async () => {
      const result = service
        ? await updateServiceAction(service.id, input)
        : await createServiceAction(input);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? (service ? "Serviço atualizado." : "Serviço criado."));
      onOpenChange(false);
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-name">Nome *</Label>
          <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-desc">Descrição</Label>
          <Textarea
            id="service-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="service-price">Preço sugerido</Label>
            <Input
              id="service-price"
              inputMode="decimal"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cobrança</Label>
            <Select value={billingType} onValueChange={(v) => setBillingType(v as ServiceBillingType)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unico">Pagamento único</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ServiceStatus)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : service ? "Salvar alterações" : "Criar serviço"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
