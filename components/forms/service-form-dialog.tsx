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
import type { BillingType, Service } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service;
  spaceId: string;
}

export function ServiceFormDialog({ open, onOpenChange, service, spaceId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ServiceForm key={service?.id ?? "new"} onOpenChange={onOpenChange} service={service} spaceId={spaceId} />
      )}
    </Dialog>
  );
}

function ServiceForm({ onOpenChange, service, spaceId }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [defaultPrice, setDefaultPrice] = useState(service ? String(service.defaultPrice) : "");
  const [billingType, setBillingType] = useState<BillingType>(service?.billingType ?? "mensal");
  const [status, setStatus] = useState<"ativo" | "inativo">(service?.status ?? "ativo");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Informe o nome do serviço.");
      return;
    }
    const payload = {
      name,
      description: description || undefined,
      defaultPrice: Number(defaultPrice.replace(",", ".")) || 0,
      billingType,
      status,
    };
    if (service) {
      update("services", service.id, payload);
      toast.success("Serviço atualizado.");
    } else {
      add("services", { id: generateId("service"), spaceId, ...payload, createdAt: new Date().toISOString() });
      toast.success("Serviço criado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="svc-name">Nome</Label>
          <Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="svc-desc">Descrição</Label>
          <Textarea id="svc-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc-price">Valor padrão (R$)</Label>
            <Input id="svc-price" inputMode="decimal" value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cobrança</Label>
            <Select value={billingType} onValueChange={(v) => setBillingType(v as BillingType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unico">Único</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{service ? "Salvar alterações" : "Criar serviço"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
