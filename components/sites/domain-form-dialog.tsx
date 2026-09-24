"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDomainAction, updateDomainAction, type DomainFormInput } from "@/lib/supabase/domains-actions";
import { parseMoneyInput } from "@/lib/format";
import { addMonthsKey } from "@/lib/recurrence";
import type { Client, ClientSite, Domain, DomainStatus } from "@/types/database.types";

export const DOMAIN_STATUS_LABEL: Record<DomainStatus, string> = {
  ativo: "Ativo",
  expirado: "Expirado",
  cancelado: "Cancelado",
  transferido: "Transferido",
};

const PERIOD_OPTIONS = [
  { value: "12", label: "Anual (12 meses)" },
  { value: "24", label: "2 anos" },
  { value: "36", label: "3 anos" },
  { value: "60", label: "5 anos" },
  { value: "120", label: "10 anos" },
  { value: "1", label: "Mensal" },
];

const NONE = "__nenhum__";

function moneyString(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : Number(value).toFixed(2).replace(".", ",");
}

export function DomainFormDialog({
  open,
  onOpenChange,
  domain,
  clients,
  sites,
  canUseFinance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain?: Domain;
  clients: Client[];
  sites: ClientSite[];
  /** Pode criar/editar no Financeiro (lançar a renovação em A pagar). */
  canUseFinance: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DomainForm
          key={domain?.id ?? "new"}
          onOpenChange={onOpenChange}
          domain={domain}
          clients={clients}
          sites={sites}
          canUseFinance={canUseFinance}
        />
      )}
    </Dialog>
  );
}

function DomainForm({
  onOpenChange,
  domain,
  clients,
  sites,
  canUseFinance,
}: {
  onOpenChange: (open: boolean) => void;
  domain?: Domain;
  clients: Client[];
  sites: ClientSite[];
  canUseFinance: boolean;
}) {
  const [name, setName] = useState(domain?.domain ?? "");
  const [registrar, setRegistrar] = useState(domain?.registrar ?? "");
  const [purchaseDate, setPurchaseDate] = useState(domain?.purchase_date ?? "");
  const [purchasePrice, setPurchasePrice] = useState(moneyString(domain?.purchase_price));
  const [periodMonths, setPeriodMonths] = useState(String(domain?.period_months ?? 12));
  const [renewalDate, setRenewalDate] = useState(domain?.renewal_date ?? "");
  const [renewalPrice, setRenewalPrice] = useState(moneyString(domain?.renewal_price));
  const [status, setStatus] = useState<DomainStatus>(domain?.status ?? "ativo");
  const [clientId, setClientId] = useState(domain?.client_id ?? "");
  const [siteId, setSiteId] = useState(domain?.site_id ?? "");
  const [notes, setNotes] = useState(domain?.notes ?? "");
  const [trackFinance, setTrackFinance] = useState(!!domain?.financial_origin_id);
  const [pending, startTransition] = useTransition();

  const periodOptions = PERIOD_OPTIONS.some((o) => o.value === periodMonths)
    ? PERIOD_OPTIONS
    : [...PERIOD_OPTIONS, { value: periodMonths, label: `${periodMonths} meses` }];
  const sitesForClient = clientId ? sites.filter((s) => s.client_id === clientId || s.id === siteId) : sites;

  function handlePurchaseDate(value: string) {
    setPurchaseDate(value);
    // Sugere a renovação a partir da compra + período, sem sobrescrever o que já foi digitado.
    if (value && !renewalDate) setRenewalDate(addMonthsKey(value, Number(periodMonths)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const purchase = purchasePrice ? parseMoneyInput(purchasePrice) : undefined;
    const renewal = renewalPrice ? parseMoneyInput(renewalPrice) : undefined;
    if (!name.trim()) return void toast.error("Informe o domínio.");
    if (purchase !== undefined && !Number.isFinite(purchase)) return void toast.error("Valor pago inválido.");
    if (renewal !== undefined && !Number.isFinite(renewal)) return void toast.error("Valor de renovação inválido.");

    const input: DomainFormInput = {
      domain: name,
      registrar: registrar || undefined,
      purchaseDate: purchaseDate || undefined,
      purchasePrice: purchase,
      periodMonths: Number(periodMonths),
      renewalDate: renewalDate || undefined,
      renewalPrice: renewal,
      status,
      notes: notes || undefined,
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      trackRenewalInFinance: trackFinance,
    };

    startTransition(async () => {
      const result = domain ? await updateDomainAction(domain.id, input) : await createDomainAction(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? "Domínio salvo.");
      if (result.warning) toast.warning(result.warning);
      onOpenChange(false);
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{domain ? "Editar domínio" : "Novo domínio"}</DialogTitle>
        <DialogDescription>Domínios que você comprou ou administra.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dom-name">Domínio *</Label>
            <Input id="dom-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="exemplo.com.br" disabled={pending} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dom-registrar">Registrador / onde comprou</Label>
            <Input id="dom-registrar" value={registrar} onChange={(e) => setRegistrar(e.target.value)} disabled={pending} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dom-purchase-date">Data da compra</Label>
            <Input id="dom-purchase-date" type="date" value={purchaseDate} onChange={(e) => handlePurchaseDate(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dom-purchase-price">Valor pago na compra</Label>
            <Input id="dom-purchase-price" inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0,00" disabled={pending} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Período</Label>
            <Select value={periodMonths} onValueChange={setPeriodMonths} disabled={pending}>
              <SelectTrigger aria-label="Período"><SelectValue /></SelectTrigger>
              <SelectContent>
                {periodOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dom-renewal-date">Renovação / vencimento</Label>
            <Input id="dom-renewal-date" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dom-renewal-price">Valor da renovação</Label>
            <Input id="dom-renewal-price" inputMode="decimal" value={renewalPrice} onChange={(e) => setRenewalPrice(e.target.value)} placeholder="Igual à compra" disabled={pending} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DomainStatus)} disabled={pending}>
              <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DOMAIN_STATUS_LABEL) as DomainStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{DOMAIN_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cliente</Label>
            <Select value={clientId || NONE} onValueChange={(v) => setClientId(v === NONE ? "" : v)} disabled={pending}>
              <SelectTrigger aria-label="Cliente"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum (meu)</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Site</Label>
            <Select value={siteId || NONE} onValueChange={(v) => setSiteId(v === NONE ? "" : v)} disabled={pending}>
              <SelectTrigger aria-label="Site"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {sitesForClient.map((s) => <SelectItem key={s.id} value={s.id}>{s.project_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(canUseFinance || domain?.financial_origin_id) && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div className="text-sm">
              <p className="font-medium text-foreground">Lançar renovação em A pagar</p>
              <p className="text-xs text-muted-foreground">
                Cria uma despesa recorrente no Financeiro a partir da data de renovação. Ao pagar, a próxima renovação é
                calculada sozinha. {status !== "ativo" && "Só vale para domínios ativos."}
              </p>
            </div>
            <Switch
              checked={trackFinance}
              onCheckedChange={setTrackFinance}
              disabled={pending || !canUseFinance}
              aria-label="Lançar renovação em A pagar"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dom-notes">Observações</Label>
          <Textarea id="dom-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={pending} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : domain ? "Salvar alterações" : "Cadastrar domínio"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
