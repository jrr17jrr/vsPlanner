"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, Link2, Link2Off, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { deletePaymentAction } from "@/lib/supabase/financial-actions";
import { unlinkPersonalAccountAction } from "@/lib/supabase/financial-personal-link-actions";
import { LinkPersonalDialog } from "@/components/visionario/financeiro/link-personal-dialog";
import { PERSONAL_PAYER_NAME, activeLinksIndex } from "@/lib/finance/personal-link";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { formatCurrency, formatDate, formatMonthYear, currentMonthKeySaoPaulo } from "@/lib/format";
import type { Client, FinancialAccount, FinancialCharge, FinancialKind, FinancialPayment, FinancialPersonalLink } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

/**
 * Movimentações = CAIXA real: cada linha é um `financial_payment` (o
 * dinheiro que de fato entrou/saiu, na data real, na conta escolhida).
 * Cobranças pendentes nunca aparecem aqui — ficam em A receber/A pagar.
 */
export function MovementsList({
  scope,
  charges,
  payments,
  accounts,
  clients,
  canEdit,
  personalLinks = [],
}: {
  personalLinks?: FinancialPersonalLink[];
  scope: FinancialScope;
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  clients: Client[];
  canEdit: boolean;
}) {
  const [month, setMonth] = useState(currentMonthKeySaoPaulo());
  const [kindFilter, setKindFilter] = useState<"todos" | FinancialKind>("todos");
  const [accountFilter, setAccountFilter] = useState("todas");
  const [undoing, setUndoing] = useState<FinancialPayment | null>(null);
  const [linking, setLinking] = useState<FinancialPayment | null>(null);
  const [unlinking, setUnlinking] = useState<FinancialPersonalLink | null>(null);
  const router = useRouter();
  const links = useMemo(() => activeLinksIndex(personalLinks), [personalLinks]);
  const reversed = useMemo(() => personalLinks.filter((l) => l.status !== "ativo"), [personalLinks]);

  const chargeById = useMemo(() => new Map(charges.map((c) => [c.id, c])), [charges]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const months = useMemo(() => {
    const set = new Set(payments.map((p) => p.payment_date.slice(0, 7)));
    set.add(currentMonthKeySaoPaulo());
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [payments]);

  const rows = useMemo(
    () =>
      payments
        .filter((p) => month === "todos" || p.payment_date.startsWith(month))
        .filter((p) => kindFilter === "todos" || chargeById.get(p.charge_id)?.kind === kindFilter)
        .filter((p) => accountFilter === "todas" || p.account_id === accountFilter)
        .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at)),
    [payments, month, kindFilter, accountFilter, chargeById]
  );

  const totals = rows.reduce(
    (acc, p) => {
      const kind = chargeById.get(p.charge_id)?.kind;
      if (kind === "entrada") acc.in += Number(p.amount);
      if (kind === "saida") acc.out += Number(p.amount);
      return acc;
    },
    { in: 0, out: 0 }
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger aria-label="Mês"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{formatMonthYear(`${m}-01`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
          <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Entradas e saídas</SelectItem>
            <SelectItem value="entrada">Só entradas</SelectItem>
            <SelectItem value="saida">Só saídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger aria-label="Conta"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as contas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">Entradas: <span className="font-semibold text-success">{formatCurrency(totals.in)}</span></span>
        <span className="text-muted-foreground">Saídas: <span className="font-semibold text-destructive">{formatCurrency(totals.out)}</span></span>
        <span className="text-muted-foreground">
          Resultado:{" "}
          <span className={`font-semibold ${totals.in - totals.out >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(totals.in - totals.out)}
          </span>
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma movimentação no período" description="Recebimentos e pagamentos registrados aparecem aqui, pela data real." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => {
            const charge = chargeById.get(p.charge_id);
            const isIn = charge?.kind === "entrada";
            const client = charge?.client_id ? clientById.get(charge.client_id) : undefined;
            const businessLink = links.byBusinessPayment.get(p.id);
            const personalLink = links.byPersonalPayment.get(p.id);
            const canLink = scope !== "pessoal" && !isIn && p.payer_label === "junior" && !businessLink;
            return (
              <li key={p.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {isIn ? (
                    <ArrowUpCircle className="h-4 w-4 shrink-0 text-success" aria-label="Entrada" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4 shrink-0 text-destructive" aria-label="Saída" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{charge?.description ?? "Movimentação"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.payment_date)} · {PAYMENT_METHOD_LABEL[p.payment_method]} · {(p.payer_label === "guilherme" ? "Pago por Guilherme" : p.payer_label === "junior" ? `Pago por ${PERSONAL_PAYER_NAME} · ${businessLink ? `${businessLink.account_name} (Financeiro Pessoal)` : p.account_id ? accountById.get(p.account_id)?.name ?? "Conta" : "Sem conta"}` : p.account_id ? accountById.get(p.account_id)?.name ?? "Conta" : "Sem conta")}
                      {client && ` · ${client.name}`}
                    </p>
                    {businessLink && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-primary"><Link2 className="h-3 w-3 shrink-0" /> Descontado de {businessLink.account_name} no Financeiro Pessoal</p>
                    )}
                    {personalLink && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-primary"><Link2 className="h-3 w-3 shrink-0" /> Usado para pagar “{personalLink.description}” da Visionário Dev</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1">
                  <span className={`text-sm font-semibold tabular-nums ${isIn ? "text-success" : "text-destructive"}`}>
                    {isIn ? "+" : "−"}
                    {formatCurrency(Number(p.amount))}
                  </span>
                  {canEdit && canLink && (
                    <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => setLinking(p)} aria-label="Vincular à conta pessoal">
                      <Link2 className="h-3.5 w-3.5" /> Conta pessoal
                    </Button>
                  )}
                  {canEdit && businessLink && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUnlinking(businessLink)} aria-label="Desvincular conta pessoal">
                      <Link2Off className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canEdit && !personalLink && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUndoing(p)} aria-label="Desfazer pagamento">
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reversed.length > 0 && (
        <details className="rounded-lg border border-border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">Histórico de estornos com conta pessoal ({reversed.length})</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {reversed.map((l) => (
              <li key={l.id} className="flex flex-col text-xs text-muted-foreground sm:flex-row sm:justify-between sm:gap-3">
                <span>{l.description} · {formatCurrency(Number(l.amount))} · pago em {formatDate(l.payment_date)}</span>
                <span>
                  {l.status === "estornado" ? "Estornado" : "Desvinculado"} em {l.reversed_at ? formatDate(l.reversed_at.slice(0, 10)) : "—"}
                  {l.link_mode === "existente" && l.status === "desvinculado" ? ` · lançamento mantido em ${l.account_name}` : ` · valor devolvido a ${l.account_name}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {undoing && (
        <AsyncConfirmDialog
          open
          onOpenChange={(open) => !open && setUndoing(null)}
          title="Desfazer este pagamento?"
          description={
            links.byBusinessPayment.get(undoing.id)
              ? `O pagamento é cancelado, a despesa volta a ficar em aberto e ${formatCurrency(Number(undoing.amount))} voltam para ${links.byBusinessPayment.get(undoing.id)!.account_name} (Financeiro Pessoal) — a mesma conta de onde saíram. Fica registrado no histórico.`
              : "O lançamento de caixa é removido, o saldo da conta volta ao que era e a cobrança volta a ficar em aberto. Fica registrado no histórico. Use se registrou por engano."
          }
          confirmLabel="Desfazer"
          onConfirm={() => deletePaymentAction(scope, undoing.id)}
        />
      )}

      {unlinking && (
        <AsyncConfirmDialog
          open
          onOpenChange={(open) => !open && setUnlinking(null)}
          title="Desvincular a conta pessoal?"
          description={`A despesa continua paga por ${PERSONAL_PAYER_NAME}, mas ${formatCurrency(Number(unlinking.amount))} ${unlinking.link_mode === "existente" ? "deixam de estar ligados ao lançamento pessoal (o lançamento continua lá)" : `voltam para ${unlinking.account_name} (Financeiro Pessoal)`}.`}
          confirmLabel="Desvincular"
          onConfirm={() => unlinkPersonalAccountAction(scope, unlinking.id)}
        />
      )}

      {linking && (
        <LinkPersonalDialog
          scope={scope}
          payment={linking}
          description={chargeById.get(linking.charge_id)?.description ?? "Pagamento"}
          businessAccountName={linking.account_id ? accountById.get(linking.account_id)?.name ?? null : null}
          onOpenChange={(open) => !open && setLinking(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
