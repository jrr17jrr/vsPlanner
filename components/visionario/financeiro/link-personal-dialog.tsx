"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { findPersonalDuplicatesAction, linkPaymentToPersonalAccountAction, type PersonalDuplicateCandidate } from "@/lib/supabase/financial-personal-link-actions";
import { usePersonalAccounts } from "@/components/visionario/financeiro/use-personal-accounts";
import { PersonalCategoryPicker } from "@/components/visionario/financeiro/personal-category-picker";
import { PERSONAL_PAYER_NAME } from "@/lib/finance/personal-link";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FinancialPayment } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

/**
 * Pagamento ANTIGO (já registrado como pago pelo Júnior) → vincular a uma
 * conta do Financeiro Pessoal sem recriar o pagamento. Antes de descontar,
 * procura no Pessoal um lançamento que já registre esse gasto: se houver,
 * oferece só VINCULAR (sem desconto novo).
 */
export function LinkPersonalDialog({
  scope,
  payment,
  description,
  businessAccountName,
  onOpenChange,
  onSaved,
}: {
  scope: FinancialScope;
  payment: FinancialPayment;
  description: string;
  /** Conta da EMPRESA que este pagamento movimenta hoje (se houver). */
  businessAccountName: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const personal = usePersonalAccounts(scope, true);
  const [pickedAccountId, setAccountId] = useState("");
  const [checked, setChecked] = useState<{ accountId: string; candidates: PersonalDuplicateCandidate[]; failed?: boolean } | null>(null);
  const [choice, setChoice] = useState<string>("novo");
  const [categoryId, setCategoryId] = useState("");
  const [pending, setPending] = useState(false);
  const amount = Number(payment.amount);

  // Sugere a conta com o mesmo nome da usada no registro antigo (ex.: Nubank).
  const hint = `${businessAccountName ?? ""} ${payment.notes ?? ""}`.toLowerCase();
  const suggestedId = personal.accounts.find((a) => hint.includes(a.name.toLowerCase()))?.id ?? "";
  const accountId = pickedAccountId || suggestedId;

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    findPersonalDuplicatesAction(scope, payment.id, accountId)
      .then((r) => {
        if (cancelled) return;
        if (r.error) toast.error(r.error);
        if (r.alreadyLinked) toast.info("Este pagamento já está vinculado — nada será descontado de novo.");
        const candidates = r.candidates ?? [];
        setChecked({ accountId, candidates, failed: !!r.error || r.alreadyLinked });
        setChoice(candidates[0]?.id ?? "novo");
      })
      .catch(() => !cancelled && setChecked({ accountId, candidates: [], failed: true }));
    return () => {
      cancelled = true;
    };
  }, [accountId, payment.id, scope]);

  const selected = personal.accounts.find((a) => a.id === accountId);
  const checking = !!accountId && checked?.accountId !== accountId;
  const ready = !!checked && checked.accountId === accountId && !checked.failed;

  async function confirm() {
    if (!accountId || !ready) return;
    setPending(true);
    const result = await linkPaymentToPersonalAccountAction(scope, payment.id, accountId, {
      existingPersonalPaymentId: choice === "novo" ? undefined : choice,
      detachBusinessAccount: !!payment.account_id,
      personalCategoryId: choice === "novo" && categoryId ? categoryId : undefined,
    });
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Pagamento vinculado.");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular à conta pessoal</DialogTitle>
          <DialogDescription>
            {description} · {formatCurrency(amount)} · pago em {formatDate(payment.payment_date)} por {PERSONAL_PAYER_NAME}. O pagamento
            não é recriado.
          </DialogDescription>
        </DialogHeader>

        {personal.loading ? (
          <p className="text-sm text-muted-foreground">Carregando contas do Financeiro Pessoal…</p>
        ) : !personal.allowed ? (
          <p className="text-sm text-warning">Só o próprio {PERSONAL_PAYER_NAME} pode vincular pagamentos às contas pessoais dele.</p>
        ) : personal.accounts.length === 0 ? (
          <p className="text-sm text-warning">{personal.error ?? "Nenhuma conta ativa no Financeiro Pessoal."}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Conta pessoal de origem</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={pending}>
                <SelectTrigger aria-label="Conta pessoal"><SelectValue placeholder="Escolha a conta (Financeiro Pessoal)" /></SelectTrigger>
                <SelectContent>
                  {personal.accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} · saldo {formatCurrency(a.balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {payment.account_id && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
                Hoje este pagamento desconta da conta <strong>{businessAccountName ?? "da empresa"}</strong> da Visionário Dev. Ao vincular,
                ele deixa de descontar dessa conta (o dinheiro saiu do pessoal) — o gasto não conta duas vezes. Se desvincular depois, volta
                como era.
              </p>
            )}

            {accountId && checking && <p className="text-xs text-muted-foreground">Verificando se já existe esse gasto no Financeiro Pessoal…</p>}

            {ready && checked.candidates.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Já existe um lançamento parecido em {selected?.name}</p>
                <p className="text-xs text-muted-foreground">Para não descontar duas vezes, vincule ao lançamento existente.</p>
                {checked.candidates.map((c) => (
                  <label key={c.id} className="flex items-start gap-2 text-sm">
                    <input type="radio" name="dup" className="mt-1" checked={choice === c.id} onChange={() => setChoice(c.id)} disabled={pending} />
                    <span>Vincular a “{c.description}” · {formatCurrency(c.amount)} em {formatDate(c.payment_date)} <span className="text-muted-foreground">(sem novo desconto)</span></span>
                  </label>
                ))}
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="dup" className="mt-1" checked={choice === "novo"} onChange={() => setChoice("novo")} disabled={pending} />
                  <span>São gastos diferentes — descontar {formatCurrency(amount)} agora</span>
                </label>
              </div>
            )}

            {ready && choice === "novo" && (
              <PersonalCategoryPicker categories={personal.categories} value={categoryId} onChange={setCategoryId} onCreated={personal.addCategory} disabled={pending} />
            )}

            {ready && checked.candidates.length === 0 && selected && (
              <p className="text-xs text-muted-foreground">
                Nenhum lançamento correspondente no Financeiro Pessoal. Saldo de {selected.name}: {formatCurrency(selected.balance)} →{" "}
                {formatCurrency(payment.payment_date < selected.initial_balance_date ? selected.balance : selected.balance - amount)}.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={confirm} disabled={pending || !ready || !personal.allowed}>
            {pending ? "Vinculando…" : choice === "novo" ? "Vincular e descontar" : "Vincular sem descontar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
