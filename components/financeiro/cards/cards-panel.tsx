"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  CreditCard as CardIcon,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Receipt,
  Repeat,
  Undo2,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, ScrollableTabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { UndoPaymentDialog } from "@/components/visionario/financeiro/undo-payment-dialog";
import { CardFormDialog, CreditDialog, PayHolderDialog, PurchaseDialog, SubscriptionDialog } from "@/components/financeiro/cards/card-dialogs";
import { setSubscriptionStatusAction } from "@/lib/supabase/credit-card-actions";
import {
  buildInvoiceView,
  cardLabel,
  cardMonthReport,
  cardSummary,
  currentInvoiceMonth,
  monthKeyOf,
  nextSubscriptionCharge,
  shiftMonth,
  type CardPurchase,
  type CardSubscription,
  type CardsData,
  type CreditCard,
  type InvoiceStatus,
} from "@/lib/finance/credit-card";
import { formatCurrency, formatDate, todayKeySaoPaulo } from "@/lib/format";
import type { FinancialAccount, FinancialCategory, FinancialCharge, FinancialPayment } from "@/types/database.types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  aberta: "Aberta", fechada: "Fechada", vencida: "Vencida", parcial: "Paga parcialmente", paga: "Paga", sem_lancamentos: "Sem lançamentos", futura: "Futura",
};
const STATUS_BADGE: Record<InvoiceStatus, string> = {
  aberta: "agendada", fechada: "pendente", vencida: "atrasado", parcial: "parcial", paga: "pago", sem_lancamentos: "encerrado", futura: "agendada",
};
const SUB_LABEL = { ativa: "Ativa", pausada: "Pausada", cancelada: "Cancelada" } as const;
const SUB_BADGE = { ativa: "ativo", pausada: "pausado", cancelada: "cancelada" } as const;
const EVENT_LABEL = { criada: "Criada", pausada: "Pausada", reativada: "Reativada", cancelada: "Cancelada", valor_alterado: "Valor alterado", editada: "Editada" } as const;

function monthLabel(month: string) {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Dialog =
  | { type: "card"; card?: CreditCard }
  | { type: "purchase"; purchase?: CardPurchase; lockedMoney?: boolean }
  | { type: "credit"; purchase: CardPurchase }
  | { type: "subscription"; subscription?: CardSubscription }
  | { type: "holder"; card: CreditCard; owed: number }
  | { type: "pay"; charge: FinancialCharge; remaining: number }
  | { type: "undo"; payment: FinancialPayment }
  | { type: "status"; subscription: CardSubscription; status: "ativa" | "pausada" | "cancelada" }
  | null;

/**
 * Financeiro Pessoal → Cartões de crédito. Cartões próprios mostram a
 * fatura inteira; de terceiro, só a sua parte (o que você deve ao titular).
 * Tudo é calculado de `lib/finance/credit-card.ts`; o dinheiro só sai da
 * conta no pagamento da fatura/ao titular (nunca na compra).
 */
export function CardsPanel({
  data,
  charges,
  payments,
  accounts,
  categories,
  permissions,
}: {
  data: CardsData;
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  categories: FinancialCategory[];
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
}) {
  const router = useRouter();
  const today = todayKeySaoPaulo();
  const [view, setView] = useState<"cartoes" | "assinaturas" | "relatorio">("cartoes");
  const [selectedId, setSelectedId] = useState<string | null>(data.cards.find((c) => c.status === "ativo")?.id ?? data.cards[0]?.id ?? null);
  const selected = data.cards.find((c) => c.id === selectedId) ?? data.cards[0] ?? null;
  const [monthOffset, setMonthOffset] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reportMonth, setReportMonth] = useState(today.slice(0, 7));

  const chargeById = useMemo(() => new Map(charges.map((c) => [c.id, c])), [charges]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const purchaseById = useMemo(() => new Map(data.purchases.map((p) => [p.id, p])), [data.purchases]);
  const money = useMemo(() => charges.map((c) => ({ id: c.id, amount: Number(c.amount), status: c.status })), [charges]);
  const summaries = useMemo(() => new Map(data.cards.map((c) => [c.id, cardSummary(c, data, money, payments, today)])), [data, money, payments, today]);

  if (!data.available) {
    return (
      <Card className="flex flex-col gap-2 p-5">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Cartões de crédito ainda não estão ativos</p>
        <p className="text-sm text-muted-foreground">Aplique a migration <code>20261113100000_installments_credit_cards.sql</code> no Supabase (SQL Editor → colar → Run). Nada do Financeiro atual muda até lá.</p>
      </Card>
    );
  }

  const activeSubs = data.subscriptions.filter((s) => s.status === "ativa");
  const monthlySubs = Math.round(activeSubs.reduce((s, x) => s + Number(x.amount), 0) * 100) / 100;
  const report = cardMonthReport(reportMonth, data, charges.map((c) => ({ id: c.id, amount: Number(c.amount), status: c.status, kind: c.kind, due_date: c.due_date, card_invoice_id: c.card_invoice_id })), payments, today);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <ScrollableTabsList aria-label="Cartões de crédito">
            <TabsTrigger value="cartoes">Cartões e faturas</TabsTrigger>
            <TabsTrigger value="assinaturas">Assinaturas</TabsTrigger>
            <TabsTrigger value="relatorio">Relatório</TabsTrigger>
          </ScrollableTabsList>
        </Tabs>
        {permissions.canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog({ type: "card" })}><Plus className="h-4 w-4" /> Novo cartão</Button>
            {data.cards.some((c) => c.status === "ativo") && <>
              <Button size="sm" variant="outline" onClick={() => setDialog({ type: "subscription" })}><Repeat className="h-4 w-4" /> Assinatura</Button>
              <Button size="sm" onClick={() => setDialog({ type: "purchase" })}><Plus className="h-4 w-4" /> Compra no cartão</Button>
            </>}
          </div>
        )}
      </div>

      {view === "cartoes" && (data.cards.length === 0 ? (
        <EmptyState icon={CardIcon} title="Nenhum cartão cadastrado" description="Cadastre seus cartões (próprios ou de terceiros) para lançar compras à vista, parceladas e assinaturas nas faturas certas." />
      ) : (
        <>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Escolha o cartão">
            {data.cards.map((c) => {
              const s = summaries.get(c.id)!;
              const active = selected?.id === c.id;
              return (
                <button key={c.id} type="button" role="tab" aria-selected={active} onClick={() => { setSelectedId(c.id); setMonthOffset(0); }}
                  className={cn("min-w-[13rem] snap-start rounded-xl border p-3 text-left transition-colors", active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/40", c.status === "inativo" && "opacity-60")}>
                  <span className="mb-2 block h-1.5 w-10 rounded-full" style={{ background: c.color ?? "var(--primary)" }} aria-hidden />
                  <span className="block truncate text-sm font-semibold text-foreground">{cardLabel(c)}</span>
                  <span className="block text-xs text-muted-foreground">{c.ownership === "terceiro" ? `Terceiro · ${c.holder_name}` : c.bank ?? "Próprio"}{c.status === "inativo" ? " · inativo" : ""}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">{c.ownership === "terceiro" ? "Você deve" : "Fatura atual"}</span>
                  <span className="block text-base font-semibold tabular-nums">{formatCurrency(c.ownership === "terceiro" ? s.owed : s.current.remaining || s.current.total)}</span>
                </button>
              );
            })}
          </div>
          {selected && <CardDetail
            card={selected}
            data={data}
            summary={summaries.get(selected.id)!}
            monthOffset={monthOffset}
            setMonthOffset={setMonthOffset}
            charges={money}
            payments={payments}
            chargeById={chargeById}
            categoryById={categoryById}
            purchaseById={purchaseById}
            today={today}
            permissions={permissions}
            onDialog={setDialog}
          />}
        </>
      ))}

      {view === "assinaturas" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Total mensal previsto" value={formatCurrency(monthlySubs)} />
            <Tile label="Assinaturas ativas" value={String(activeSubs.length)} />
            <Tile label="Pausadas" value={String(data.subscriptions.filter((s) => s.status === "pausada").length)} />
          </div>
          {data.subscriptions.length === 0 ? <EmptyState icon={Repeat} title="Nenhuma assinatura" description="Netflix, ChatGPT e outras cobranças mensais no cartão entram aqui." /> : (
            <ul className="flex flex-col gap-2">
              {data.subscriptions.map((s) => {
                const card = data.cards.find((c) => c.id === s.card_id);
                const next = nextSubscriptionCharge(s, today);
                const charged = data.purchases.filter((p) => p.subscription_id === s.id).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
                const events = data.events.filter((e) => e.subscription_id === s.id);
                return (
                  <li key={s.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.description}</p>
                        <p className="text-xs text-muted-foreground">{card ? cardLabel(card) : "Cartão"} · dia {s.billing_day}{s.category_id ? ` · ${categoryById.get(s.category_id) ?? ""}` : ""}{s.end_date ? ` · até ${formatDate(s.end_date)}` : ""}</p>
                        <p className="text-xs text-muted-foreground">Próxima cobrança: {next && s.status === "ativa" ? formatDate(next) : s.status === "pausada" ? "pausada" : "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={SUB_BADGE[s.status]} label={SUB_LABEL[s.status]} />
                        <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(s.amount))}/mês</span>
                        {permissions.canEdit && s.status !== "cancelada" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${s.description}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDialog({ type: "subscription", subscription: s })}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>
                              {s.status === "ativa" ? <DropdownMenuItem onClick={() => setDialog({ type: "status", subscription: s, status: "pausada" })}><Pause className="h-4 w-4" /> Pausar</DropdownMenuItem>
                                : <DropdownMenuItem onClick={() => setDialog({ type: "status", subscription: s, status: "ativa" })}><Play className="h-4 w-4" /> Reativar</DropdownMenuItem>}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDialog({ type: "status", subscription: s, status: "cancelada" })}><Ban className="h-4 w-4" /> Cancelar</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    {(charged.length > 0 || events.length > 0) && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-primary">Histórico ({charged.length} cobrança(s))</summary>
                        <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                          {[...charged.map((p) => ({ at: p.purchase_date, text: `Cobrança ${formatCurrency(Number(p.total_amount))}${p.status === "cancelada" ? " (cancelada)" : ""}` })),
                            ...events.map((e) => ({ at: e.effective_date, text: `${EVENT_LABEL[e.action]}${e.note ? ` · ${e.note}` : ""}` }))]
                            .sort((a, b) => b.at.localeCompare(a.at))
                            .map((h, i) => <li key={i}>{formatDate(h.at)} · {h.text}</li>)}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {view === "relatorio" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1 self-start rounded-lg border border-border bg-card px-2 py-1">
            <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => setReportMonth(shiftMonth(`${reportMonth}-01`, -1).slice(0, 7))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(`${reportMonth}-01`)}</span>
            <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => setReportMonth(shiftMonth(`${reportMonth}-01`, 1).slice(0, 7))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Compras realizadas" value={formatCurrency(report.purchases)} hint="Consumo no cartão pela data da compra" />
            <Tile label="Saídas efetivas de dinheiro" value={formatCurrency(report.cashOut)} hint="Tudo o que saiu das contas no mês" />
            <Tile label="Pagamentos de faturas" value={formatCurrency(report.invoicePayments)} hint="Já incluídos nas saídas efetivas" />
            <Tile label="Dívidas futuras" value={formatCurrency(report.futureDebt)} hint="Faturas a vencer ainda não pagas" />
          </div>
          <p className="text-xs text-muted-foreground">Comprar no cartão não é saída de dinheiro: o valor só sai da conta quando a fatura (ou o titular) é paga — e conta uma única vez.</p>
        </div>
      )}

      {dialog?.type === "card" && <CardFormDialog card={dialog.card} onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.type === "purchase" && <PurchaseDialog cards={data.cards} categories={categories} invoices={data.invoices} purchase={dialog.purchase} lockedMoney={dialog.lockedMoney} defaultCardId={selected?.status === "ativo" ? selected.id : undefined} onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.type === "credit" && <CreditDialog purchase={dialog.purchase} onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.type === "subscription" && <SubscriptionDialog cards={data.cards} categories={categories} subscription={dialog.subscription} defaultCardId={selected?.status === "ativo" ? selected.id : undefined} onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.type === "holder" && <PayHolderDialog card={dialog.card} owed={dialog.owed} accounts={accounts} onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.type === "pay" && <MarkPaymentDialog scope="pessoal" charge={dialog.charge} remaining={dialog.remaining} accounts={accounts} onOpenChange={(o) => !o && setDialog(null)} onSaved={() => { setDialog(null); router.refresh(); }} />}
      {dialog?.type === "undo" && <UndoPaymentDialog scope="pessoal" payment={dialog.payment} charge={chargeById.get(dialog.payment.charge_id)} accountName={accounts.find((a) => a.id === dialog.payment.account_id)?.name ?? null} onOpenChange={(o) => !o && setDialog(null)} onSaved={() => router.refresh()} />}
      {dialog?.type === "status" && (
        <AsyncConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          destructive={dialog.status === "cancelada"}
          title={dialog.status === "cancelada" ? `Cancelar ${dialog.subscription.description}?` : dialog.status === "pausada" ? `Pausar ${dialog.subscription.description}?` : `Reativar ${dialog.subscription.description}?`}
          description={dialog.status === "cancelada" ? "Nenhuma cobrança nova será gerada. As cobranças antigas continuam nas faturas e no histórico." : dialog.status === "pausada" ? "As cobranças param até você reativar. Os meses pausados não são cobrados depois." : "As cobranças voltam a partir de hoje; os meses em que ficou pausada não são cobrados."}
          confirmLabel={dialog.status === "cancelada" ? "Cancelar assinatura" : dialog.status === "pausada" ? "Pausar" : "Reativar"}
          onConfirm={() => setSubscriptionStatusAction(dialog.subscription.id, dialog.status)}
        />
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CardDetail({
  card,
  data,
  summary,
  monthOffset,
  setMonthOffset,
  charges,
  payments,
  chargeById,
  categoryById,
  purchaseById,
  today,
  permissions,
  onDialog,
}: {
  card: CreditCard;
  data: CardsData;
  summary: ReturnType<typeof cardSummary>;
  monthOffset: number;
  setMonthOffset: (fn: (n: number) => number) => void;
  charges: { id: string; amount: number; status: string }[];
  payments: FinancialPayment[];
  chargeById: Map<string, FinancialCharge>;
  categoryById: Map<string, string>;
  purchaseById: Map<string, CardPurchase>;
  today: string;
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
  onDialog: (d: Dialog) => void;
}) {
  const third = card.ownership === "terceiro";
  const cardInvoices = data.invoices.filter((i) => i.card_id === card.id);
  const baseMonth = currentInvoiceMonth(card, today, cardInvoices);
  const month = shiftMonth(baseMonth, monthOffset);
  const view = buildInvoiceView(card, month, data, charges, payments, today);
  const charge = view.invoice?.charge_id ? chargeById.get(view.invoice.charge_id) : undefined;
  const invoicePayments = charge ? payments.filter((p) => p.charge_id === charge.id).sort((a, b) => b.payment_date.localeCompare(a.payment_date)) : [];
  const history = cardInvoices.map((i) => buildInvoiceView(card, i.reference_month, data, charges, payments, today)).filter((v) => v.total !== 0 || v.paid > 0).sort((a, b) => b.month.localeCompare(a.month));
  const allPayments = history.flatMap((v) => {
    const cid = v.invoice?.charge_id;
    return cid ? payments.filter((p) => p.charge_id === cid) : [];
  }).sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  const upcoming = history.filter((v) => v.remaining > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paidInvoiceIds = new Set(history.filter((v) => v.status === "paga" && v.invoice).map((v) => v.invoice!.id));

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold">{cardLabel(card)}</p>
          <p className="text-xs text-muted-foreground">
            {third ? `Cartão de ${card.holder_name} — aqui ficam só as suas compras e o que você deve ao titular.` : `${card.bank ?? "Cartão próprio"} · fecha dia ${card.closing_day} · vence dia ${card.due_day}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {third && summary.owed > 0 && permissions.canEdit && <Button size="sm" onClick={() => onDialog({ type: "holder", card, owed: summary.owed })}><Wallet className="h-4 w-4" /> Pagar ao titular</Button>}
          {permissions.canEdit && <Button size="sm" variant="outline" onClick={() => onDialog({ type: "card", card })}><Pencil className="h-4 w-4" /> Editar cartão</Button>}
        </div>
      </div>

      {third ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Quanto devo" value={formatCurrency(summary.owed)} />
          <Tile label="Já paguei" value={formatCurrency(summary.paidTotal)} />
          <Tile label="Próximo pagamento" value={upcoming[0] ? formatDate(upcoming[0].dueDate) : "—"} hint={upcoming[0] ? formatCurrency(upcoming[0].remaining) : undefined} />
          <Tile label="Compras no mês" value={formatCurrency(summary.spentThisMonth)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Fatura atual" value={formatCurrency(summary.current.total)} hint={`Vence ${formatDate(summary.current.dueDate)} · ${STATUS_LABEL[summary.current.status]}`} />
          <Tile label="Próxima fatura" value={formatCurrency(summary.next.total)} hint={`Vence ${formatDate(summary.next.dueDate)}`} />
          <Tile label="Total gasto no mês" value={formatCurrency(summary.spentThisMonth)} />
          <Tile label="Próximo vencimento" value={summary.nextDueDate ? formatDate(summary.nextDueDate) : "—"} />
          <Tile label="Limite total" value={summary.limit === null ? "—" : formatCurrency(summary.limit)} />
          <Tile label="Limite utilizado" value={formatCurrency(summary.limitUsed)} hint="Tudo que ainda não foi pago" />
          <Tile label="Limite disponível" value={summary.limitAvailable === null ? "—" : formatCurrency(summary.limitAvailable)} />
          <Tile label="Parcelamentos · assinaturas" value={`${summary.activeInstallmentPurchases} · ${summary.activeSubscriptions}`} />
        </div>
      )}
      {!third && summary.limit !== null && summary.limit > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`Limite utilizado ${Math.round((summary.limitUsed / summary.limit) * 100)}%`}>
          <div className={cn("h-full", summary.limitUsed > summary.limit ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, (summary.limitUsed / summary.limit) * 100)}%` }} />
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Fatura anterior" onClick={() => setMonthOffset((n) => n - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-40 text-center">
              <p className="text-sm font-semibold">Fatura de {monthLabel(month)}</p>
              <p className="text-[11px] text-muted-foreground">Fecha {formatDate(view.closingDate)} · vence {formatDate(view.dueDate)}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Próxima fatura" onClick={() => setMonthOffset((n) => n + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-2">
            {monthOffset !== 0 && <Button size="sm" variant="outline" onClick={() => setMonthOffset(() => 0)}>Fatura atual</Button>}
            <StatusBadge status={STATUS_BADGE[view.status]} label={STATUS_LABEL[view.status]} />
          </div>
        </div>

        {view.items.length === 0 ? <p className="py-2 text-sm text-muted-foreground">Nenhum lançamento nesta fatura.</p> : (
          <ul className="divide-y divide-border">
            {view.items.map((it) => {
              const p = purchaseById.get(it.purchase_id);
              const lockedMoney = !!p && data.items.some((x) => x.purchase_id === p.id && x.status === "ativo" && paidInvoiceIds.has(x.invoice_id));
              return (
                <li key={it.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{it.item_type === "parcela" ? p?.description : it.description}</p>
                    <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                      <span>{p ? formatDate(p.purchase_date) : ""}</span>
                      {p?.category_id && <span>· {categoryById.get(p.category_id)}</span>}
                      {it.item_type === "parcela" && (it.installment_total ?? 1) > 1 && <span>· Parcela {it.installment_number}/{it.installment_total}</span>}
                      {p?.purchase_type === "assinatura" && <span className="inline-flex items-center gap-0.5">· <Repeat className="h-3 w-3" aria-hidden /> assinatura</span>}
                      {it.item_type === "estorno" && <span className="text-success">· estorno/crédito</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className={cn("font-semibold tabular-nums", it.amount < 0 && "text-success")}>{formatCurrency(Number(it.amount))}</span>
                    {permissions.canEdit && p && p.status === "ativa" && it.item_type === "parcela" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações da compra ${p.description}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onDialog({ type: "purchase", purchase: p, lockedMoney })}><Pencil className="h-4 w-4" /> Editar compra</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDialog({ type: "credit", purchase: p })}><Undo2 className="h-4 w-4" /> Estorno, crédito ou cancelar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Total da fatura</p><p className="font-semibold tabular-nums">{formatCurrency(view.due)}</p></div>
          <div><p className="text-xs text-muted-foreground">Pago</p><p className="font-semibold tabular-nums text-success">{formatCurrency(view.paid)}</p></div>
          <div><p className="text-xs text-muted-foreground">Restante</p><p className="font-semibold tabular-nums">{formatCurrency(view.remaining)}</p></div>
        </div>
        {charge && view.remaining > 0 && permissions.canEdit && !third && (
          <Button className="self-start" onClick={() => onDialog({ type: "pay", charge, remaining: view.remaining })}><Receipt className="h-4 w-4" /> Pagar fatura</Button>
        )}
        {invoicePayments.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Pagamentos desta fatura</p>
            <ul className="flex flex-col gap-1">
              {invoicePayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>{formatDate(p.payment_date)}{p.notes ? ` · ${p.notes}` : ""}</span>
                  <span className="flex items-center gap-1 tabular-nums">{formatCurrency(Number(p.amount))}
                    {permissions.canEdit && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onDialog({ type: "undo", payment: p })}><Undo2 className="h-3.5 w-3.5" /> Desfazer</Button>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">{third ? "Próximos pagamentos ao titular" : "Histórico de faturas"}</p>
        {history.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma fatura com lançamentos ainda.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(third ? upcoming : history).map((v) => (
              <li key={v.month}>
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40" onClick={() => {
                  const [by, bm] = baseMonth.split("-").map(Number);
                  const [vy, vm] = v.month.split("-").map(Number);
                  setMonthOffset(() => (vy - by) * 12 + (vm - bm));
                }}>
                  <span className="font-medium">{monthLabel(v.month)}</span>
                  <span className="text-xs text-muted-foreground">vence {formatDate(v.dueDate)}</span>
                  <span className="tabular-nums">{formatCurrency(v.due)}{v.paid > 0 && v.remaining > 0 ? ` · resta ${formatCurrency(v.remaining)}` : ""}</span>
                  <StatusBadge status={STATUS_BADGE[v.status]} label={STATUS_LABEL[v.status]} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {third && (
        <div>
          <p className="mb-2 text-sm font-medium">Histórico de transferências ao titular</p>
          {allPayments.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum pagamento ao titular ainda.</p> : (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {allPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>{formatDate(p.payment_date)}{p.notes ? ` · ${p.notes}` : ""}</span>
                  <span className="flex items-center gap-1 tabular-nums">{formatCurrency(Number(p.amount))}
                    {permissions.canEdit && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onDialog({ type: "undo", payment: p })}><Undo2 className="h-3.5 w-3.5" /> Desfazer</Button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Dica: compras feitas até o dia {card.closing_day} entram na fatura que fecha nesse dia; depois disso, na fatura seguinte. Mês sem esse dia usa o último dia do mês.</p>
      {monthKeyOf(month) < monthKeyOf(baseMonth) && view.status === "paga" && <p className="text-[11px] text-muted-foreground">Fatura paga: compras novas com data deste período vão para a próxima fatura em aberto.</p>}
    </Card>
  );
}
