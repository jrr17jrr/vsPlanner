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
import type { ClientService, Service } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientService?: ClientService;
  services: Service[];
}

export function ClientServiceFormDialog({ open, onOpenChange, clientId, clientService, services }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ClientServiceForm
          key={clientService?.id ?? "new"}
          onOpenChange={onOpenChange}
          clientId={clientId}
          clientService={clientService}
          services={services}
        />
      )}
    </Dialog>
  );
}

function ClientServiceForm({
  onOpenChange,
  clientId,
  clientService,
  services,
}: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [serviceId, setServiceId] = useState(clientService?.serviceId ?? services[0]?.id ?? "");
  const [price, setPrice] = useState(
    clientService ? String(clientService.price) : services[0] ? String(services[0].defaultPrice) : ""
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(price.replace(",", "."));
    if (!serviceId || !value) {
      toast.error("Selecione um serviço e informe o valor.");
      return;
    }
    if (clientService) {
      update("clientServices", clientService.id, { serviceId, price: value });
      toast.success("Serviço atualizado.");
    } else {
      add("clientServices", {
        id: generateId("cs"),
        clientId,
        serviceId,
        price: value,
        createdAt: new Date().toISOString(),
      });
      toast.success("Serviço adicionado ao cliente.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{clientService ? "Editar serviço" : "Adicionar serviço"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Serviço</Label>
          <Select
            value={serviceId}
            onValueChange={(v) => {
              setServiceId(v);
              const svc = services.find((s) => s.id === v);
              if (svc && !clientService) setPrice(String(svc.defaultPrice));
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-price">Valor (R$)</Label>
          <Input id="cs-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{clientService ? "Salvar" : "Adicionar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
