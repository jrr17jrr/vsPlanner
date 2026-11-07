"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { undoPaymentAction } from "@/lib/supabase/financial-actions";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FinancialCharge, FinancialPayment, FinancialPersonalLink } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

/**
 * "Desfazer pagamento": pergunta se o dinheiro volta para a conta de origem.
 *  - Sim: lançamento removido, valor volta à conta, desconto/acréscimo deste
 *    pagamento revertido.
 *  - Não: cobrança reabre e o mesmo lançamento vira "Sem devolução · …"
 *    (saldo igual, travado — nunca devolvido depois).
 * Pagamento ligado à Visionário Dev: devolução sempre à mesma conta pessoal,
 * e pelo lado pessoal só pela Visionário Dev.
 */
export function UndoPaymentDialog({
  scope,
  payment,
  charge,
  accountName,
  businessLink,
  personalLink,
  locked,
  onOpenChange,
  onSaved,
}: {
  scope: FinancialScope;
  payment: FinancialPayment;
  charge: FinancialCharge | undefined;
  accountName: string | null;
  /** Este pagamento (da empresa) saiu de uma conta pessoal. */
  businessLink?: FinancialPersonalLink;
  /** Este lançamento (pessoal) pagou uma despesa da Visionário Dev. */
  personalLink?: FinancialPersonalLink;
  /** Lançamento de um pagamento já desfeito sem devolução. */
  locked?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [refund, setRefund] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const amount = Number(payment.amount);
  const discount = Number(payment.settle_discount ?? 0);
  const addition = Number(payment.settle_addition ?? 0);
  const noAccount = !payment.account_id && !businessLink;
  const originName = businessLink ? `${businessLink.account_name} (Financeiro Pessoal)` : accountName ?? "conta de origem";
  const blocked = locked || !!personalLink;
  const onlyRefund = !!businessLink || noAccount;
  const choice = onlyRefund ? true : refund;

  async function confirm() {
    if (choice === null) return toast.error("Escolha se o dinheiro volta para a conta.");
    setPending(true);
    const r = await undoPaymentAction(scope, payment.id, choice, note);
    setPending(false);
    if (r.error) return toast.error(r.error);
    toast.success(r.success ?? "Pagamento desfeito.");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desfazer pagamento</DialogTitle>
          <DialogDescription>
            {charge?.description ?? "Pagamento"} · {formatCurrency(amount)} em {formatDate(payment.payment_date)} · {PAYMENT_METHOD_LABEL[payment.payment_method]}
            {accountName || businessLink ? ` · ${originName}` : " · sem conta"}
          </DialogDescription>
        </DialogHeader>

        {(discount > 0 || addition > 0) && !blocked && (
          <p className="rounded-lg border p-3 text-xs text-muted-foreground">
            Este pagamento quitou a cobrança com {discount > 0 ? `desconto de ${formatCurrency(discount)}` : `acréscimo de ${formatCurrency(addition)}`}. Ao desfazer,
            {discount > 0 ? " o desconto" : " o acréscimo"} é revertido e a cobrança volta ao valor anterior.
          </p>
        )}

        {locked ? (
          <p className="text-sm text-warning">
            Este lançamento registra um pagamento já desfeito <strong>sem devolução</strong>: o dinheiro não voltou para a conta, então ele não pode ser
            desfeito de novo.
          </p>
        ) : personalLink ? (
          <p className="text-sm text-warning">
            Este lançamento pagou “{personalLink.description}” da Visionário Dev. Desfaça o pagamento pelo Financeiro da Visionário Dev — o valor volta
            para esta mesma conta, uma única vez.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Deseja devolver o dinheiro para a conta de origem?</p>
            {noAccount ? (
              <p className="text-xs text-muted-foreground">Este pagamento foi registrado sem movimentar conta — desfazer não altera nenhum saldo.</p>
            ) : (
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Devolver o dinheiro">
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${choice === true ? "border-primary bg-primary/5" : ""}`}>
                  <input type="radio" name="refund" className="mt-1" checked={choice === true} onChange={() => setRefund(true)} disabled={pending} />
                  <span>
                    <span className="font-medium">Sim, devolver o dinheiro à conta original</span>
                    <span className="block text-xs text-muted-foreground">{formatCurrency(amount)} voltam para {originName}. A cobrança volta a ficar em aberto.</span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${businessLink ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${choice === false ? "border-primary bg-primary/5" : ""}`}>
                  <input type="radio" name="refund" className="mt-1" checked={choice === false} onChange={() => setRefund(false)} disabled={pending || !!businessLink} />
                  <span>
                    <span className="font-medium">Não, apenas desfazer o pagamento sem movimentar o saldo</span>
                    <span className="block text-xs text-muted-foreground">
                      {businessLink
                        ? "Indisponível: pagamento feito com conta pessoal sempre devolve à mesma conta. Para manter o valor fora dela, use “Desvincular conta pessoal” nas movimentações."
                        : `A cobrança reabre e o saldo de ${originName} não muda. O valor fica registrado como “Sem devolução · ${charge?.description ?? ""}” e não pode ser devolvido depois.`}
                    </span>
                  </span>
                </label>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="undo-note">Motivo (opcional)</Label>
              <Input id="undo-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={pending} placeholder="Ex.: paguei a conta errada" />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{blocked ? "Fechar" : "Cancelar"}</Button>
          {!blocked && (
            <Button type="button" variant="destructive" onClick={confirm} disabled={pending || choice === null}>
              {pending ? "Desfazendo…" : "Desfazer pagamento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
