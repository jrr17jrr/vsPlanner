"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateChargeAction } from "@/lib/supabase/financial-actions";
import type { FinancialCategory, FinancialCharge, FinancialReferenceType } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

export function EditChargeDialog({
  scope,
  charge,
  categories,
  referenceTypes,
  hasPayment,
  onOpenChange,
}: {
  scope: FinancialScope;
  charge: FinancialCharge;
  categories: FinancialCategory[];
  referenceTypes: FinancialReferenceType[];
  /** Se já tem pagamento, o servidor recusa mudar valor/data — só o aviso já ajuda o usuário a entender por quê. */
  hasPayment: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [description, setDescription] = useState(charge.description);
  const [categoryId, setCategoryId] = useState(charge.category_id ?? "");
  const [referenceTypeId, setReferenceTypeId] = useState(charge.reference_type_id ?? "");
  const [originalAmount, setOriginalAmount] = useState(String(charge.original_amount));
  const [discountAmount, setDiscountAmount] = useState(String(charge.discount_amount));
  const [additionAmount, setAdditionAmount] = useState(String(charge.addition_amount));
  const [dueDate, setDueDate] = useState(charge.due_date);
  const [competencyDate, setCompetencyDate] = useState(charge.competency_date ?? "");
  const [notes, setNotes] = useState(charge.notes ?? "");
  const [applyToFuture, setApplyToFuture] = useState(false);
  const [pending, setPending] = useState(false);

  const relevantCategories = categories.filter((c) => c.kind === charge.kind);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Descrição é obrigatória.");

    setPending(true);
    const result = await updateChargeAction(
      scope,
      charge.id,
      {
        description,
        categoryId: categoryId || null,
        referenceTypeId: referenceTypeId || null,
        originalAmount: parseFloat(originalAmount.replace(",", ".")) || 0,
        discountAmount: parseFloat(discountAmount.replace(",", ".")) || 0,
        additionAmount: parseFloat(additionAmount.replace(",", ".")) || 0,
        dueDate,
        competencyDate: competencyDate || null,
        notes,
      },
      applyToFuture
    );
    setPending(false);

    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Cobrança atualizada.");
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {charge.kind === "entrada" ? "entrada" : "saída"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
          {hasPayment && (
            <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
              Esta cobrança já tem pagamento registrado — valor e data ficam travados (histórico pago é imutável). Só descrição, categoria e observações podem mudar.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Descrição *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} autoFocus />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {charge.kind === "entrada" && (
              <div className="flex flex-col gap-1.5">
                <Label>Referente a</Label>
                <Select value={referenceTypeId || "nenhum"} onValueChange={(v) => setReferenceTypeId(v === "nenhum" ? "" : v)} disabled={pending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Não especificado</SelectItem>
                    {referenceTypes.filter((r) => r.is_active).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId || "nenhuma"} onValueChange={(v) => setCategoryId(v === "nenhuma" ? "" : v)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem categoria</SelectItem>
                  {relevantCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Valor original</Label>
              <Input inputMode="decimal" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} disabled={pending || hasPayment} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Desconto</Label>
              <Input inputMode="decimal" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} disabled={pending || hasPayment} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Acréscimo</Label>
              <Input inputMode="decimal" value={additionAmount} onChange={(e) => setAdditionAmount(e.target.value)} disabled={pending || hasPayment} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending || hasPayment} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Competência</Label>
              <Input type="date" value={competencyDate} onChange={(e) => setCompetencyDate(e.target.value)} disabled={pending} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <Label>Aplicar a</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={!applyToFuture ? "default" : "outline"} onClick={() => setApplyToFuture(false)} disabled={pending}>
                Somente este lançamento
              </Button>
              <Button type="button" size="sm" variant={applyToFuture ? "default" : "outline"} onClick={() => setApplyToFuture(true)} disabled={pending}>
                Este e os próximos
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              &quot;Este e os próximos&quot; só afeta parcelas/ocorrências da mesma origem que ainda não têm pagamento — nunca lançamentos já pagos.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
