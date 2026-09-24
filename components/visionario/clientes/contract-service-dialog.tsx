"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
import { CONTRACT_STATUS_LABEL } from "@/lib/finance-labels";
import { formatCurrency, formatDate, parseMoneyInput, todayKeySaoPaulo } from "@/lib/format";
import { firstDueOnOrAfter } from "@/lib/recurrence";
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
  /** true = o contrato já tem cobranças no Financeiro (mostra o aviso do que muda). */
  hasFinance?: boolean;
}

export function ContractServiceDialog({ open, onOpenChange, clientId, services, contract, hasFinance }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ContractServiceForm
          key={contract?.id ?? "new"}
          onOpenChange={onOpenChange}
          clientId={clientId}
          services={services}
          contract={contract}
          hasFinance={hasFinance}
        />
      )}
    </Dialog>
  );
}

const BILLING_LABEL: Record<ClientServiceBillingType, string> = {
  unico: "Único",
  recorrente: "Recorrente",
  parcelado: "Parcelado",
};

function ContractServiceForm({ onOpenChange, clientId, services, contract, hasFinance }: Omit<Props, "open">) {
  const today = todayKeySaoPaulo();
  // Serviço do contrato pode estar inativo no catálogo — continua selecionável na edição.
  const initialServiceId = contract?.service_id ?? services.find((s) => s.status === "ativo")?.id ?? "";
  const selectableServices = services.filter((s) => s.status === "ativo" || s.id === contract?.service_id);
  const initialService = services.find((s) => s.id === initialServiceId);

  const [serviceId, setServiceId] = useState(initialServiceId);
  const [price, setPrice] = useState(
    Number(contract?.price ?? initialService?.default_price ?? 0).toFixed(2).replace(".", ",")
  );
  const [billingType, setBillingType] = useState<ClientServiceBillingType>(
    contract?.billing_type ?? (initialService?.billing_type === "mensal" ? "recorrente" : "unico")
  );
  const [frequency, setFrequency] = useState<ClientServiceFrequency>(contract?.frequency ?? "mensal");
  const [dueDay, setDueDay] = useState(String(contract?.due_day ?? Number(today.slice(8, 10))));
  const [installmentCount, setInstallmentCount] = useState(String(contract?.installment_count ?? 2));
  const [firstDueDate, setFirstDueDate] = useState(contract?.first_due_date ?? today);
  const [startDate, setStartDate] = useState(contract?.start_date ?? today);
  const [status, setStatus] = useState<ClientServiceStatus>(contract?.status ?? "ativo");
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [pending, startTransition] = useTransition();

  const priceNum = parseMoneyInput(price);
  const dueDayNum = Number(dueDay);
  const countNum = Number(installmentCount);

  function handleServiceChange(id: string) {
    setServiceId(id);
    if (!contract) {
      const svc = services.find((s) => s.id === id);
      if (svc) {
        // Preço padrão é só sugestão — o valor do cliente continua editável.
        setPrice(Number(svc.default_price).toFixed(2).replace(".", ","));
        setBillingType(svc.billing_type === "mensal" ? "recorrente" : "unico");
      }
    }
  }

  const preview = (() => {
    if (!Number.isFinite(priceNum) || priceNum <= 0) return null;
    if (billingType === "recorrente") {
      if (!(dueDayNum >= 1 && dueDayNum <= 31)) return null;
      const monthStart = `${today.slice(0, 7)}-01`;
      const from = startDate > monthStart ? startDate : monthStart;
      const first = firstDueOnOrAfter(from, dueDayNum);
      const monthly = frequency === "anual" ? priceNum / 12 : frequency === "semanal" ? (priceNum * 52) / 12 : priceNum;
      return `Receita recorrente: ${formatCurrency(monthly)}/mês · 1ª cobrança em ${formatDate(first)}`;
    }
    if (billingType === "parcelado") {
      if (!(countNum >= 2)) return null;
      return `${countNum}x de ${formatCurrency(priceNum / countNum)} · 1ª parcela em ${formatDate(firstDueDate)}`;
    }
    return `Cobrança única de ${formatCurrency(priceNum)} em ${formatDate(firstDueDate)}`;
  })();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceId) return void toast.error("Escolha um serviço.");
    if (!Number.isFinite(priceNum) || priceNum <= 0) return void toast.error("Valor precisa ser maior que zero.");
    if (billingType === "recorrente" && !(dueDayNum >= 1 && dueDayNum <= 31)) {
      return void toast.error("Dia de vencimento precisa ser entre 1 e 31.");
    }
    if (billingType === "parcelado" && !(countNum >= 2 && countNum <= 120)) {
      return void toast.error("Informe de 2 a 120 parcelas.");
    }

    const input: ClientServiceFormInput = {
      serviceId,
      price: priceNum,
      billingType,
      frequency: billingType === "recorrente" ? frequency : undefined,
      dueDay: billingType === "recorrente" ? dueDayNum : undefined,
      installmentCount: billingType === "parcelado" ? countNum : undefined,
      firstDueDate: billingType === "recorrente" ? undefined : firstDueDate,
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
      toast.success(result.success ?? (contract ? "Serviço atualizado." : "Serviço contratado."));
      if (result.warning) toast.warning(result.warning);
      onOpenChange(false);
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{contract ? "Editar serviço contratado" : "Adicionar serviço"}</DialogTitle>
        <DialogDescription>
          O preço do catálogo é só sugestão — o valor aqui é o contratado por este cliente.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label>Serviço</Label>
          <Select value={serviceId} onValueChange={handleServiceChange} disabled={pending}>
            <SelectTrigger aria-label="Serviço">
              <SelectValue placeholder="Escolha um serviço" />
            </SelectTrigger>
            <SelectContent>
              {selectableServices.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.default_price > 0 ? ` · ${formatCurrency(s.default_price)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Tipo de cobrança</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de cobrança">
            {(Object.keys(BILLING_LABEL) as ClientServiceBillingType[]).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                role="radio"
                aria-checked={billingType === t}
                variant={billingType === t ? "default" : "outline"}
                onClick={() => setBillingType(t)}
                disabled={pending}
              >
                {BILLING_LABEL[t]}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-price">
              {billingType === "parcelado" ? "Valor total contratado" : billingType === "recorrente" ? "Valor por cobrança" : "Valor contratado"}
            </Label>
            <Input id="cs-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={pending} />
          </div>

          {billingType === "recorrente" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Recorrência</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as ClientServiceFrequency)} disabled={pending}>
                <SelectTrigger aria-label="Recorrência">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  {contract?.frequency === "semanal" && <SelectItem value="semanal">Semanal</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          ) : billingType === "parcelado" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs-installments">Parcelas</Label>
              <Input
                id="cs-installments"
                type="number"
                min={2}
                max={120}
                value={installmentCount}
                onChange={(e) => setInstallmentCount(e.target.value)}
                disabled={pending}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs-first-due">Vencimento</Label>
              <Input id="cs-first-due" type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} disabled={pending} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-start">Data de início</Label>
            <Input id="cs-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={pending} />
          </div>
          {billingType === "recorrente" ? (
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
          ) : billingType === "parcelado" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs-first-due">Vencimento da 1ª parcela</Label>
              <Input id="cs-first-due" type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} disabled={pending} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ClientServiceStatus)} disabled={pending}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CONTRACT_STATUS_LABEL) as ClientServiceStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {CONTRACT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preview && <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">{preview}</p>}
        {contract && hasFinance && (
          <p className="text-xs text-muted-foreground">
            Mudanças de valor valem para as cobranças em aberto a partir de hoje. Mudar tipo, frequência ou vencimento
            encerra a série atual e começa outra na próxima competência. Pagamentos já registrados nunca são alterados.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-notes">Observações</Label>
          <Textarea id="cs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : contract ? "Salvar alterações" : "Adicionar serviço"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
