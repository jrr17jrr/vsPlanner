"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PersonalCategoryPicker } from "@/components/visionario/financeiro/personal-category-picker";
import { updatePersonalMovementCategoryAction, type PersonalCategoryOption } from "@/lib/supabase/financial-personal-link-actions";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FinancialCharge, FinancialPayment } from "@/types/database.types";

/**
 * Financeiro Pessoal → "Categoria" de uma saída. Só a categoria muda; valor,
 * conta, data e vínculo com a Visionário Dev ficam como estão.
 */
export function EditPersonalCategoryDialog({
  charge,
  payment,
  accountName,
  categories,
  linkedToBusiness,
  onOpenChange,
  onSaved,
}: {
  charge: FinancialCharge;
  payment: FinancialPayment;
  accountName: string | null;
  categories: PersonalCategoryOption[];
  linkedToBusiness: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [list, setList] = useState(categories);
  const [categoryId, setCategoryId] = useState(charge.category_id ?? "");
  const [pending, setPending] = useState(false);

  async function save() {
    if (!categoryId) return toast.error("Escolha a categoria.");
    if (categoryId === charge.category_id) return onOpenChange(false);
    setPending(true);
    const r = await updatePersonalMovementCategoryAction(charge.id, categoryId);
    setPending(false);
    if (r.error) return toast.error(r.error);
    toast.success(r.success ?? "Categoria atualizada.");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar categoria</DialogTitle>
          <DialogDescription>
            {charge.description} · {formatCurrency(Number(payment.amount))} · {formatDate(payment.payment_date)}
            {accountName ? ` · ${accountName}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <PersonalCategoryPicker
            label="Categoria"
            allowDefault={false}
            categories={list}
            value={categoryId}
            onChange={setCategoryId}
            onCreated={(c) => setList((l) => (l.some((x) => x.id === c.id) ? l : [...l, c].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))))}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Só a categoria muda. Valor, conta, data do pagamento{linkedToBusiness ? " e o vínculo com a Visionário Dev" : ""} continuam iguais — nada é descontado de novo.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={save} disabled={pending || !categoryId}>{pending ? "Salvando…" : "Salvar categoria"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
