"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValueModeToggle } from "@/components/financeiro/installments/installment-fields";
import {
  addCreditAction,
  cancelPurchaseAction,
  createCardAction,
  createPurchaseAction,
  createSubscriptionAction,
  payHolderAction,
  updateCardAction,
  updatePurchaseAction,
  updateSubscriptionAction,
  type CardInput,
} from "@/lib/supabase/credit-card-actions";
import {
  CARD_COLORS,
  cardLabel,
  invoiceCycleDates,
  monthKeyOf,
  planCardPurchase,
  validateCardInput,
  type CardInvoice,
  type CardPurchase,
  type CardSubscription,
  type CreditCard,
} from "@/lib/finance/credit-card";
import type { InstallmentValueMode } from "@/lib/finance/installments";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { formatCurrency, formatDate, parseMoneyInput, todayKeySaoPaulo } from "@/lib/format";
import type { FinancialAccount, FinancialCategory, FinancialPaymentMethod } from "@/types/database.types";
import { cn } from "@/lib/utils";

const money = (v: number | null | undefined) => (v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ","));
const monthLabel = (month: string) => {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function useSubmit() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run(fn: () => Promise<{ error?: string; success?: string }>, onDone: () => void) {
    setPending(true);
    try {
      const r = await fn();
      if (r.error) return toast.error(r.error);
      toast.success(r.success ?? "Salvo.");
      onDone();
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  return { pending, run };
}

function CategorySelect({ categories, value, onChange, disabled }: { categories: FinancialCategory[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Categoria</Label>
      <Select value={value || "nenhuma"} onValueChange={(v) => onChange(v === "nenhuma" ? "" : v)} disabled={disabled}>
        <SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="nenhuma">Sem categoria</SelectItem>
          {categories.filter((c) => c.kind === "saida" && c.is_active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function CardSelect({ cards, value, onChange, disabled }: { cards: CreditCard[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Cartão *</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label="Cartão"><SelectValue placeholder="Escolha o cartão" /></SelectTrigger>
        <SelectContent>
          {cards.map((c) => <SelectItem key={c.id} value={c.id}>{cardLabel(c)}{c.ownership === "terceiro" ? " · terceiro" : ""}{c.status === "inativo" ? " · inativo" : ""}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Cadastro de cartão
// -----------------------------------------------------------------------------

export function CardFormDialog({ card, onOpenChange }: { card?: CreditCard; onOpenChange: (open: boolean) => void }) {
  const { pending, run } = useSubmit();
  const [name, setName] = useState(card?.name ?? "");
  const [bank, setBank] = useState(card?.bank ?? "");
  const [holder, setHolder] = useState(card?.holder_name ?? "");
  const [ownership, setOwnership] = useState<CardInput["ownership"]>(card?.ownership ?? "proprio");
  const [nickname, setNickname] = useState(card?.nickname ?? "");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [limit, setLimit] = useState(money(card?.credit_limit));
  const [closingDay, setClosingDay] = useState(String(card?.closing_day ?? 20));
  const [dueDay, setDueDay] = useState(String(card?.due_day ?? 27));
  const [color, setColor] = useState(card?.color ?? CARD_COLORS[0]);
  const [status, setStatus] = useState<CardInput["status"]>(card?.status ?? "ativo");

  const input: CardInput = {
    name, bank, holderName: holder, ownership, nickname, last4,
    creditLimit: limit.trim() ? parseMoneyInput(limit) : null,
    closingDay: Number(closingDay), dueDay: Number(dueDay), color, status,
  };
  const invalid = validateCardInput(input);
  const example = !invalid ? invoiceCycleDates(monthKeyOf(todayKeySaoPaulo()), input.closingDay, input.dueDay) : null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{card ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          <DialogDescription>Nunca informe o número completo, o CVV ou a senha — só os 4 últimos dígitos, se quiser.</DialogDescription>
        </DialogHeader>
        <form className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); if (invalid) return toast.error(invalid); run(() => (card ? updateCardAction(card.id, input) : createCardAction(input)), () => onOpenChange(false)); }}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo do cartão">
            {([["proprio", "Próprio", "Controla a fatura inteira"], ["terceiro", "Terceiro", "Só a sua dívida com o titular"]] as const).map(([v, l, h]) => (
              <button key={v} type="button" role="radio" aria-checked={ownership === v} onClick={() => setOwnership(v)} className={cn("rounded-lg border p-3 text-left text-sm", ownership === v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                <span className="font-medium">{l}</span><span className="block text-xs text-muted-foreground">{h}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label htmlFor="card-name">Nome do cartão *</Label><Input id="card-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={ownership === "terceiro" ? "Cartão do cunhado" : "Meu Nubank"} autoFocus /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="card-bank">Banco</Label><Input id="card-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Nubank" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="card-holder">Titular{ownership === "terceiro" ? " *" : ""}</Label><Input id="card-holder" value={holder} onChange={(e) => setHolder(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="card-nick">Apelido</Label><Input id="card-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="card-last4">Últimos 4 dígitos</Label><Input id="card-last4" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Opcional" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="card-limit">Limite total</Label><Input id="card-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Opcional" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="card-close">Dia de fechamento *</Label><Input id="card-close" type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="card-due">Dia de vencimento *</Label><Input id="card-due" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></div>
          </div>
          {example && <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">Ex.: a fatura de {monthLabel(monthKeyOf(todayKeySaoPaulo())).toLowerCase()} fecha em {formatDate(example.closingDate)} e vence em {formatDate(example.dueDate)}. Compra depois do fechamento entra na fatura seguinte.{card ? " Mudar os dias só afeta faturas futuras sem pagamento." : ""}</p>}
          <div className="flex flex-col gap-1.5">
            <Label>Cor de identificação</Label>
            <div className="flex flex-wrap gap-2">
              {CARD_COLORS.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("h-8 w-8 rounded-full border-2", color === c ? "border-foreground" : "border-transparent")} style={{ background: c }} />)}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <div className="flex gap-2">{(["ativo", "inativo"] as const).map((s) => <Button key={s} type="button" size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s === "ativo" ? "Ativo" : "Inativo"}</Button>)}</div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar cartão"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Compra no cartão (à vista / parcelada) — criar e editar
// -----------------------------------------------------------------------------

export function PurchaseDialog({
  cards,
  categories,
  invoices,
  purchase,
  lockedMoney = false,
  defaultCardId,
  onOpenChange,
}: {
  cards: CreditCard[];
  categories: FinancialCategory[];
  invoices: CardInvoice[];
  purchase?: CardPurchase;
  /** true = parte da compra já está em fatura paga: só descrição/categoria/observações. */
  lockedMoney?: boolean;
  defaultCardId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { pending, run } = useSubmit();
  const today = todayKeySaoPaulo();
  const usable = cards.filter((c) => c.status === "ativo" || c.id === purchase?.card_id);
  const [cardId, setCardId] = useState(purchase?.card_id ?? defaultCardId ?? usable[0]?.id ?? "");
  const [description, setDescription] = useState(purchase?.description ?? "");
  const [categoryId, setCategoryId] = useState(purchase?.category_id ?? "");
  const [purchaseDate, setPurchaseDate] = useState(purchase?.purchase_date ?? today);
  const [type, setType] = useState<"avista" | "parcelada">(purchase?.purchase_type === "parcelada" ? "parcelada" : "avista");
  const [mode, setMode] = useState<InstallmentValueMode>("total");
  const [amount, setAmount] = useState(money(purchase?.total_amount));
  const [count, setCount] = useState(String(purchase?.installment_count && purchase.installment_count > 1 ? purchase.installment_count : 2));
  const [manualFirst, setManualFirst] = useState(false);
  const [firstMonth, setFirstMonth] = useState((purchase?.first_invoice_month ?? monthKeyOf(today)).slice(0, 7));
  const [customAmounts, setCustomAmounts] = useState<string[] | null>(null);
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const card = cards.find((c) => c.id === cardId);
  const isSubscription = purchase?.purchase_type === "assinatura";

  const plan = useMemo(() => {
    if (!card) return null;
    return planCardPurchase(card, { type, mode, amount: parseMoneyInput(amount), count: parseInt(count, 10) || 0, purchaseDate, firstInvoiceMonth: manualFirst ? `${firstMonth}-01` : null }, invoices.filter((i) => i.card_id === card.id));
  }, [card, type, mode, amount, count, purchaseDate, manualFirst, firstMonth, invoices]);
  const amounts = customAmounts && plan && customAmounts.length === plan.items.length ? customAmounts.map(parseMoneyInput) : plan?.items.map((i) => i.amount) ?? [];
  const total = Math.round(amounts.reduce((s, a) => s + (a || 0), 0) * 100) / 100;
  const editingMoney = !purchase || (!lockedMoney && !isSubscription);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Informe a descrição.");
    if (editingMoney && (!plan || plan.error)) return toast.error(plan?.error ?? "Escolha o cartão.");
    const input = {
      cardId, description, categoryId: categoryId || null, purchaseDate, type, mode, amount: parseMoneyInput(amount), count: parseInt(count, 10) || 1,
      firstInvoiceMonth: manualFirst ? `${firstMonth}-01` : null, amounts: customAmounts ? amounts : undefined, notes,
    };
    run(() => (purchase ? updatePurchaseAction(purchase.id, { ...input, replan: editingMoney }) : createPurchaseAction(input)), () => onOpenChange(false));
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{purchase ? "Editar compra no cartão" : "Nova compra no cartão"}</DialogTitle>
          <DialogDescription>Forma de pagamento: cartão de crédito. A compra não sai da conta agora — o dinheiro só sai ao pagar a fatura.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex max-h-[72vh] flex-col gap-3 overflow-y-auto pr-1">
          {purchase && !editingMoney && (
            <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
              {isSubscription ? "Cobrança de assinatura: valor e data seguem a assinatura." : "Parte desta compra já está em fatura paga: valor, parcelas, data e cartão ficam travados. Para corrigir, use \"Estorno/crédito\"."}
            </p>
          )}
          <div className="flex flex-col gap-1.5"><Label htmlFor="purchase-desc">Descrição *</Label><Input id="purchase-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="PS5" autoFocus /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CardSelect cards={usable} value={cardId} onChange={(v) => { setCardId(v); setCustomAmounts(null); }} disabled={pending || !editingMoney} />
            <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} disabled={pending} />
            <div className="flex flex-col gap-1.5"><Label htmlFor="purchase-date">Data da compra *</Label><Input id="purchase-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} disabled={pending || !editingMoney} /></div>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo de compra</Label>
              <div className="flex gap-2">{(["avista", "parcelada"] as const).map((t) => <Button key={t} type="button" size="sm" variant={type === t ? "default" : "outline"} onClick={() => { setType(t); setCustomAmounts(null); }} disabled={pending || !editingMoney}>{t === "avista" ? "À vista" : "Parcelada"}</Button>)}</div>
            </div>
          </div>
          {editingMoney && (
            <>
              {type === "parcelada" && <ValueModeToggle mode={mode} onChange={(m) => { setMode(m); setCustomAmounts(null); }} disabled={pending} />}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5"><Label htmlFor="purchase-amount">{type === "avista" ? "Valor *" : mode === "total" ? "Valor total *" : "Valor de cada parcela *"}</Label><Input id="purchase-amount" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setCustomAmounts(null); }} placeholder="0,00" /></div>
                {type === "parcelada" && <div className="flex flex-col gap-1.5"><Label htmlFor="purchase-count">Número de parcelas *</Label><Input id="purchase-count" type="number" inputMode="numeric" min={2} max={120} value={count} onChange={(e) => { setCount(e.target.value); setCustomAmounts(null); }} /></div>}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manualFirst} onChange={(e) => setManualFirst(e.target.checked)} className="h-4 w-4" /> Escolher a primeira fatura manualmente</label>
              {manualFirst && <div className="flex flex-col gap-1.5 sm:max-w-[14rem]"><Label htmlFor="purchase-first">Primeira fatura</Label><Input id="purchase-first" type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} /></div>}
              {plan?.error ? <p className="text-xs text-destructive">{plan.error}</p> : plan && plan.items.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">Prévia: {plan.items.length}x · total {formatCurrency(total)} · 1ª fatura {monthLabel(plan.firstInvoiceMonth)}</p>
                    {plan.items.length > 1 && <button type="button" className="text-primary hover:underline" onClick={() => setCustomAmounts(customAmounts ? null : plan.items.map((i) => money(i.amount)))}>{customAmounts ? "Usar valores automáticos" : "Ajustar valores individuais"}</button>}
                  </div>
                  <ol className="max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
                    {plan.items.map((i, idx) => (
                      <li key={i.number} className="flex items-center justify-between gap-2 px-2 py-1">
                        <span className="text-muted-foreground">{i.total > 1 ? `Parcela ${i.number}/${i.total}` : "À vista"}</span>
                        <span>Fatura {monthLabel(i.invoiceMonth)}</span>
                        {customAmounts ? <Input aria-label={`Valor da parcela ${i.number}`} className="h-7 w-24 text-right" inputMode="decimal" value={customAmounts[idx]} onChange={(e) => setCustomAmounts(customAmounts.map((v, k) => (k === idx ? e.target.value : v)))} /> : <span className="font-medium tabular-nums">{formatCurrency(i.amount)}</span>}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-1.5 text-muted-foreground">Se alguma dessas faturas já estiver paga, a compra vai para a próxima em aberto (fatura paga nunca muda).</p>
                </div>
              )}
            </>
          )}
          <div className="flex flex-col gap-1.5"><Label htmlFor="purchase-notes">Observações</Label><Textarea id="purchase-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending || usable.length === 0}>{pending ? "Salvando…" : purchase ? "Salvar compra" : "Lançar compra"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Estorno / crédito e cancelamento de compra
// -----------------------------------------------------------------------------

export function CreditDialog({ purchase, onOpenChange }: { purchase: CardPurchase; onOpenChange: (open: boolean) => void }) {
  const { pending, run } = useSubmit();
  const [amount, setAmount] = useState(money(purchase.total_amount));
  const [month, setMonth] = useState(todayKeySaoPaulo().slice(0, 7));
  const [description, setDescription] = useState("");
  const [cancel, setCancel] = useState(false);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Estorno, crédito ou cancelamento</DialogTitle>
          <DialogDescription>{purchase.description} · {formatCurrency(Number(purchase.total_amount))}. Faturas já pagas nunca são alteradas: o ajuste entra numa fatura em aberto, rastreável.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {([[false, "Estorno/crédito parcial"], [true, "Cancelar a compra"]] as const).map(([v, l]) => (
            <Button key={String(v)} type="button" size="sm" variant={cancel === v ? "default" : "outline"} role="radio" aria-checked={cancel === v} onClick={() => setCancel(v)}>{l}</Button>
          ))}
        </div>
        {cancel ? (
          <p className="text-sm text-muted-foreground">As parcelas em faturas não pagas saem das faturas. O que já estava em fatura paga vira estorno na próxima fatura em aberto. O histórico fica preservado.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><Label htmlFor="credit-amount">Valor</Label><Input id="credit-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="credit-month">A partir da fatura</Label><Input id="credit-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="credit-desc">Descrição</Label><Input id="credit-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={`Estorno · ${purchase.description}`} /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Voltar</Button>
          <Button variant={cancel ? "destructive" : "default"} disabled={pending} onClick={() => run(() => (cancel ? cancelPurchaseAction(purchase.id) : addCreditAction(purchase.id, parseMoneyInput(amount), `${month}-01`, description)), () => onOpenChange(false))}>
            {pending ? "Salvando…" : cancel ? "Cancelar compra" : "Registrar estorno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Assinatura
// -----------------------------------------------------------------------------

export function SubscriptionDialog({ cards, categories, subscription, defaultCardId, onOpenChange }: { cards: CreditCard[]; categories: FinancialCategory[]; subscription?: CardSubscription; defaultCardId?: string; onOpenChange: (open: boolean) => void }) {
  const { pending, run } = useSubmit();
  const today = todayKeySaoPaulo();
  const usable = cards.filter((c) => c.status === "ativo" || c.id === subscription?.card_id);
  const [cardId, setCardId] = useState(subscription?.card_id ?? defaultCardId ?? usable[0]?.id ?? "");
  const [description, setDescription] = useState(subscription?.description ?? "");
  const [categoryId, setCategoryId] = useState(subscription?.category_id ?? "");
  const [amount, setAmount] = useState(money(subscription?.amount));
  const [startDate, setStartDate] = useState(subscription?.start_date ?? today);
  const [billingDay, setBillingDay] = useState(String(subscription?.billing_day ?? Number(today.slice(8, 10))));
  const [hasEnd, setHasEnd] = useState(!!subscription?.end_date);
  const [endDate, setEndDate] = useState(subscription?.end_date ?? "");
  const [notes, setNotes] = useState(subscription?.notes ?? "");
  const input = { cardId, description, categoryId: categoryId || null, amount: parseMoneyInput(amount), billingDay: Number(billingDay), startDate, endDate: hasEnd ? endDate : null, notes };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{subscription ? "Editar assinatura" : "Nova assinatura"}</DialogTitle>
          <DialogDescription>Compra recorrente no cartão (Netflix, ChatGPT…). Cada mês entra uma única cobrança na fatura.{subscription ? " Mudanças valem para as próximas cobranças." : ""}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => (subscription ? updateSubscriptionAction(subscription.id, input) : createSubscriptionAction(input)), () => onOpenChange(false)); }}>
          <div className="flex flex-col gap-1.5"><Label htmlFor="sub-desc">Nome *</Label><Input id="sub-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Netflix" autoFocus /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CardSelect cards={usable} value={cardId} onChange={setCardId} disabled={pending} />
            <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} disabled={pending} />
            <div className="flex flex-col gap-1.5"><Label htmlFor="sub-amount">Valor mensal *</Label><Input id="sub-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="39,90" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="sub-day">Dia da cobrança *</Label><Input id="sub-day" type="number" min={1} max={31} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="sub-start">Início *</Label><Input id="sub-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!!subscription} /></div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={hasEnd} onChange={(e) => setHasEnd(e.target.checked)} /> Tem término</label>
              {hasEnd && <Input aria-label="Término" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
            </div>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="sub-notes">Observações</Label><Textarea id="sub-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending || usable.length === 0}>{pending ? "Salvando…" : "Salvar assinatura"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Pagar ao titular (cartão de terceiro)
// -----------------------------------------------------------------------------

export function PayHolderDialog({ card, owed, accounts, onOpenChange }: { card: CreditCard; owed: number; accounts: FinancialAccount[]; onOpenChange: (open: boolean) => void }) {
  const { pending, run } = useSubmit();
  const active = accounts.filter((a) => a.is_active);
  const [amount, setAmount] = useState(money(owed));
  const [date, setDate] = useState(todayKeySaoPaulo());
  const [method, setMethod] = useState<FinancialPaymentMethod>("pix");
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const value = parseMoneyInput(amount);
  const left = Math.max(0, Math.round((owed - (value || 0)) * 100) / 100);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar ao titular</DialogTitle>
          <DialogDescription>{cardLabel(card)} · você deve {formatCurrency(owed)} para {card.holder_name}. O valor sai da conta escolhida e abate primeiro as parcelas mais antigas.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="holder-amount">Valor</Label><Input id="holder-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="holder-date">Data</Label><Input id="holder-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Conta de origem</Label>
              <Select value={accountId} onValueChange={setAccountId}><SelectTrigger aria-label="Conta"><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                <SelectContent>{active.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Forma</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as FinancialPaymentMethod)}><SelectTrigger aria-label="Forma de pagamento"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(PAYMENT_METHOD_LABEL) as FinancialPaymentMethod[]).map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="holder-notes">Observações</Label><Input id="holder-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {value > owed ? <p className="text-xs text-destructive">Valor maior do que você deve ({formatCurrency(owed)}).</p> : value > 0 && <p className="text-xs text-muted-foreground">{left > 0 ? `Continuam pendentes ${formatCurrency(left)}.` : "Quita tudo o que você deve ao titular."}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button disabled={pending || !(value > 0) || value > owed || !accountId} onClick={() => run(() => payHolderAction(card.id, { amount: value, paymentDate: date, paymentMethod: method, accountId, notes }), () => onOpenChange(false))}>
            {pending ? "Registrando…" : "Registrar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
