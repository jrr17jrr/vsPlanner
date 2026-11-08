"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/format";
import { firstDueShortcut, type InstallmentPlan, type InstallmentValueMode } from "@/lib/finance/installments";
import { cn } from "@/lib/utils";

/** Escolha "valor total" × "valor de cada parcela" (cadastro e edição de parcelamentos). */
export function ValueModeToggle({ mode, onChange, disabled }: { mode: InstallmentValueMode; onChange: (m: InstallmentValueMode) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Como deseja informar o valor?</Label>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como deseja informar o valor?">
        {([
          ["total", "Valor total da dívida"],
          ["parcela", "Valor de cada parcela"],
        ] as const).map(([value, label]) => (
          <Button key={value} type="button" size="sm" role="radio" aria-checked={mode === value} variant={mode === value ? "default" : "outline"} onClick={() => onChange(value)} disabled={disabled} className="h-auto whitespace-normal py-2">
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** "Primeiro vencimento" com atalhos Este mês / Próximo mês (mantém o dia escolhido). */
export function FirstDueField({ value, onChange, today, disabled, label = "Primeiro vencimento", id = "first-due" }: { value: string; onChange: (v: string) => void; today: string; disabled?: boolean; label?: string; id?: string }) {
  const day = Number((value || today).slice(8, 10));
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label} *</Label>
      <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(firstDueShortcut(today, day, "este_mes"))} disabled={disabled}>Este mês</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(firstDueShortcut(today, day, "proximo_mes"))} disabled={disabled}>Próximo mês</Button>
      </div>
    </div>
  );
}

/** Resumo + prévia das parcelas que serão criadas. */
export function InstallmentPreview({ plan, className, title = "Resumo do parcelamento" }: { plan: InstallmentPlan | null; className?: string; title?: string }) {
  if (!plan) return <p className={cn("rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground", className)}>Informe valor, quantidade e primeiro vencimento para ver a prévia das parcelas.</p>;
  const first = plan.installments[0];
  const last = plan.installments[plan.installments.length - 1];
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3", className)} aria-label={title}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Valor total</dt><dd className="font-semibold tabular-nums text-foreground">{formatCurrency(plan.total)}</dd></div>
        <div><dt className="text-muted-foreground">Parcelas</dt><dd className="font-semibold tabular-nums text-foreground">{plan.installments.length}x</dd></div>
        <div>
          <dt className="text-muted-foreground">Valor individual</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {plan.uniform ? formatCurrency(first.amount) : `${formatCurrency(first.amount)} (última ${formatCurrency(last.amount)})`}
          </dd>
        </div>
        <div><dt className="text-muted-foreground">1º vencimento</dt><dd className="tabular-nums text-foreground">{formatDate(plan.firstDue)}</dd></div>
        <div><dt className="text-muted-foreground">Último vencimento</dt><dd className="tabular-nums text-foreground">{formatDate(plan.lastDue)}</dd></div>
        {(plan.discount > 0 || plan.addition > 0) && (
          <div>
            <dt className="text-muted-foreground">Ajustes</dt>
            <dd className="tabular-nums text-foreground">
              {formatCurrency(plan.gross)}
              {plan.discount > 0 && ` − desconto ${formatCurrency(plan.discount)}`}
              {plan.addition > 0 && ` + acréscimo ${formatCurrency(plan.addition)}`}
            </dd>
          </div>
        )}
      </dl>
      <ol className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card text-xs" aria-label="Prévia das parcelas">
        {plan.installments.map((i) => (
          <li key={i.number} className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span className="text-muted-foreground">Parcela {i.number}/{i.total}</span>
            <span className="tabular-nums">{formatDate(i.dueDate)}</span>
            <span className="font-medium tabular-nums text-foreground">{formatCurrency(i.amount)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
