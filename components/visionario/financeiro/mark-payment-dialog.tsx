"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registerPaymentAction } from "@/lib/supabase/financial-actions";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { PERSONAL_PAYER_NAME } from "@/lib/finance/personal-link";
import { formatCurrency, formatDate, parseMoneyInput as parseMoney, todayKeySaoPaulo } from "@/lib/format";
import { usePersonalAccounts } from "@/components/visionario/financeiro/use-personal-accounts";
import { PersonalCategoryPicker } from "@/components/visionario/financeiro/personal-category-picker";
import type { FinancialAccount, FinancialCharge, FinancialPaymentMethod } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

/**
 * "Marcar como recebido/pago": registra o movimento REAL de caixa (valor,
 * data, forma e conta que de fato recebeu/pagou). O valor pode ser
 * diferente do cobrado — com "Quitar" ligado a diferença vira
 * desconto/acréscimo na própria cobrança e ela sai de A receber/A pagar;
 * desligado, é um pagamento parcial e o restante continua em aberto.
 *
 * Despesa da Visionário Dev paga pelo Ricardo Júnior: com "Descontar de
 * uma conta" ligado, o valor sai de uma conta do Financeiro PESSOAL (numa
 * única transação no banco); desligado, só registra quem pagou.
 */
export function MarkPaymentDialog({
  scope,
  charge,
  remaining,
  accounts,
  onOpenChange,
  onSaved,
}: {
  scope: FinancialScope;
  charge: FinancialCharge;
  remaining: number;
  accounts: FinancialAccount[];
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const activeAccounts = accounts.filter((a) => a.is_active);
  const isEntrada = charge.kind === "entrada";
  const payerChoice = scope === "visionario" && !isEntrada;

  const [amount, setAmount] = useState(remaining.toFixed(2).replace(".", ","));
  const [paymentDate, setPaymentDate] = useState(todayKeySaoPaulo());
  const [paymentMethod, setPaymentMethod] = useState<FinancialPaymentMethod>("pix");
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? "");
  const [personalAccountId, setPersonalAccountId] = useState("");
  const [personalCategoryId, setPersonalCategoryId] = useState("");
  const [settle, setSettle] = useState(true);
  const [notes, setNotes] = useState("");
  const [payerLabel, setPayerLabel] = useState<"junior" | "empresa">("empresa");
  const [moveAccount, setMoveAccount] = useState(true);
  const [pending, setPending] = useState(false);

  const juniorPays = payerChoice && payerLabel === "junior";
  const personal = usePersonalAccounts(scope, juniorPays && moveAccount);
  const recordOnly = !moveAccount || (juniorPays && !personal.allowed && personal.loaded);

  const verb = isEntrada ? "recebido" : "pago";
  const value = parseMoney(amount);
  const validValue = Number.isFinite(value) && value > 0;
  const diff = validValue ? Math.round((value - remaining) * 100) / 100 : 0;
  const selectedAccount = activeAccounts.find((a) => a.id === accountId);
  const selectedPersonal = personal.accounts.find((a) => a.id === personalAccountId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validValue) return toast.error("Informe um valor válido.");
    if (!paymentDate) return toast.error("Informe a data do pagamento.");
    if (moveAccount && juniorPays) {
      if (personal.loading) return toast.error("Aguarde carregar as contas pessoais.");
      if (personal.allowed && !personalAccountId) return toast.error("Escolha a conta pessoal de onde o valor saiu.");
    }
    if (moveAccount && !juniorPays && !accountId) return toast.error("Escolha a conta financeira.");

    setPending(true);
    const result = await registerPaymentAction(scope, charge.id, {
      amount: value,
      paymentDate,
      paymentMethod,
      accountId: juniorPays ? "" : accountId,
      recordOnly,
      ...(payerChoice ? { payerLabel } : {}),
      ...(juniorPays && !recordOnly ? { personalAccountId, personalCategoryId: personalCategoryId || undefined } : {}),
      settle,
      notes: notes || undefined,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.success ?? "Pagamento registrado.");
    onOpenChange(false);
    onSaved?.();
  }

  const noCompanyAccounts = activeAccounts.length === 0 && !payerChoice;

  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como {verb}</DialogTitle>
          <DialogDescription>
            {charge.description} · vencimento {formatDate(charge.due_date)} · em aberto {formatCurrency(remaining)}
          </DialogDescription>
        </DialogHeader>

        {noCompanyAccounts && moveAccount ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Nenhuma conta financeira ativa neste espaço. Cadastre (ou reative) uma conta em{" "}
              <span className="font-medium text-foreground">Contas e categorias</span> para registrar o que foi {verb}, ou
              registre sem movimentar conta.
            </p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setMoveAccount(false)}>Registrar sem conta</Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {payerChoice && (
              <div className="flex flex-col gap-1.5">
                <Label>Quem pagou?</Label>
                <Select value={payerLabel} onValueChange={(v) => setPayerLabel(v as typeof payerLabel)} disabled={pending}>
                  <SelectTrigger aria-label="Quem pagou"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empresa">Visionário Dev (caixa da empresa)</SelectItem>
                    <SelectItem value="junior">{PERSONAL_PAYER_NAME}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-amount">Valor efetivamente {verb}</Label>
                <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-date">Data do pagamento</Label>
                <Input id="pay-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={pending} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as FinancialPaymentMethod)} disabled={pending}>
                <SelectTrigger aria-label="Forma de pagamento"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABEL) as FinancialPaymentMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{isEntrada ? "Lançar em uma conta" : "Descontar de uma conta"}</p>
                <p className="text-xs text-muted-foreground">
                  {moveAccount
                    ? juniorPays
                      ? "O valor sai de uma conta do Financeiro Pessoal. Nenhuma conta da empresa é movimentada."
                      : `O saldo da conta escolhida ${isEntrada ? "aumenta" : "diminui"} com este lançamento.`
                    : "Registra o pagamento sem alterar o saldo de nenhuma conta (valores já descontados antes)."}
                </p>
              </div>
              <Switch checked={moveAccount} onCheckedChange={setMoveAccount} disabled={pending} aria-label={isEntrada ? "Lançar em uma conta" : "Descontar de uma conta"} />
            </div>

            {moveAccount && !juniorPays && (
              <div className="flex flex-col gap-1.5">
                <Label>Conta que {isEntrada ? "recebeu" : "pagou"}</Label>
                <Select value={accountId} onValueChange={setAccountId} disabled={pending}>
                  <SelectTrigger aria-label="Conta financeira"><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedAccount && paymentDate && paymentDate < selectedAccount.initial_balance_date && (
                  <p className="text-xs text-warning">
                    A data é anterior ao saldo inicial desta conta ({formatDate(selectedAccount.initial_balance_date)}) — o
                    saldo da conta não será alterado por este lançamento (considera-se já incluído no saldo inicial).
                  </p>
                )}
              </div>
            )}

            {moveAccount && juniorPays && (
              <div className="flex flex-col gap-1.5">
                <Label>Conta pessoal de origem</Label>
                {personal.loading ? (
                  <p className="text-xs text-muted-foreground">Carregando contas do Financeiro Pessoal…</p>
                ) : !personal.allowed ? (
                  <p className="text-xs text-warning">
                    Só o próprio {PERSONAL_PAYER_NAME} pode descontar de uma conta pessoal. O pagamento será registrado como
                    feito por ele, sem movimentar nenhuma conta.
                  </p>
                ) : personal.accounts.length === 0 ? (
                  <p className="text-xs text-warning">
                    {personal.error ?? "Nenhuma conta ativa no Financeiro Pessoal. Cadastre a conta lá (ex.: Nubank) ou desligue “Descontar de uma conta”."}
                  </p>
                ) : (
                  <>
                    <Select value={personalAccountId} onValueChange={setPersonalAccountId} disabled={pending}>
                      <SelectTrigger aria-label="Conta pessoal"><SelectValue placeholder="Escolha a conta (Financeiro Pessoal)" /></SelectTrigger>
                      <SelectContent>
                        {personal.accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name} · saldo {formatCurrency(a.balance)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPersonal && validValue && (
                      <p className="text-xs text-muted-foreground">
                        {paymentDate < selectedPersonal.initial_balance_date
                          ? `A data é anterior ao saldo inicial de ${selectedPersonal.name} (${formatDate(selectedPersonal.initial_balance_date)}) — o saldo não muda.`
                          : `Saldo de ${selectedPersonal.name}: ${formatCurrency(selectedPersonal.balance)} → ${formatCurrency(selectedPersonal.balance - value)}. A movimentação pessoal indicará que pagou “${charge.description}” da Visionário Dev.`}
                      </p>
                    )}
                    <PersonalCategoryPicker
                      categories={personal.categories}
                      value={personalCategoryId}
                      onChange={setPersonalCategoryId}
                      onCreated={personal.addCategory}
                      disabled={pending}
                    />
                  </>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium text-foreground">Quitar a dívida com este pagamento</p>
                  <p className="text-xs text-muted-foreground">
                    {!validValue
                      ? "Informe o valor efetivamente pago."
                      : diff === 0
                        ? `O valor cobre o que está em aberto — a cobrança fica ${verb}.`
                        : settle
                          ? diff < 0
                            ? `A diferença de ${formatCurrency(-diff)} vira desconto e a dívida fica quitada.`
                            : `A diferença de ${formatCurrency(diff)} vira acréscimo (juros/extra) e a dívida fica quitada.`
                          : diff < 0
                            ? `Pagamento parcial — continuam em aberto ${formatCurrency(-diff)}. A diferença não vira desconto.`
                            : "Desligado, o valor não pode passar do que está em aberto."}
                  </p>
                </div>
                <Switch checked={settle} onCheckedChange={setSettle} disabled={pending} aria-label="Quitar a dívida com este pagamento" />
              </div>
              {validValue && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-3">
                  {(
                    [
                      ["Valor original", Number(charge.original_amount)],
                      ...(Number(charge.amount) - remaining > 0 ? [["Já pago", Math.round((Number(charge.amount) - remaining) * 100) / 100]] : []),
                      ["Em aberto", remaining],
                      ["Valor pago agora", value],
                      ...(settle && diff < 0 ? [["Desconto", -diff]] : []),
                      ...(settle && diff > 0 ? [["Acréscimo", diff]] : []),
                      ["Restante após", settle || diff >= 0 ? 0 : -diff],
                    ] as [string, number][]
                  ).map(([label, v]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">{formatCurrency(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {validValue && moveAccount && (
                <p className="text-[11px] text-muted-foreground">Da conta sai/entra apenas o valor realmente {verb}: {formatCurrency(value)}.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-notes">Observação</Label>
              <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} placeholder="Opcional" />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? "Salvando…" : `Confirmar ${verb}`}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
