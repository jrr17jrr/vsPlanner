"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { groupSelectedByActivity, isRecurringActivity, type DeleteScope } from "@/lib/routine-delete";
import { deleteActivitiesAction } from "@/lib/supabase/personal-actions";
import type { RealActivityOccurrence } from "@/lib/routine-real";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dayLabel = (d: string) => `${WEEKDAY_SHORT[new Date(`${d}T12:00:00`).getDay()]}, ${ddmm(d)}`;
export const occurrenceKey = (o: { activity: { id: string }; date: string }) => `${o.activity.id}__${o.date}`;

/**
 * Atividade no modo "Selecionar". O quadrado de SELEÇÃO é diferente do
 * círculo/caixa de concluir e tocar aqui nunca conclui nada.
 */
export function SelectableOccurrence({ occ, title, selected, onToggle, showDate }: { occ: RealActivityOccurrence; title: string; selected: boolean; onToggle: () => void; showDate?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`Selecionar: ${title} (${dayLabel(occ.date)})`}
      onClick={onToggle}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition-colors sm:py-2.5",
        selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-secondary/40"
      )}
    >
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2", selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50")} aria-hidden="true">
        {selected && <Check className="h-4 w-4" />}
      </span>
      <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{occ.activity.start_time.slice(0, 5)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {showDate && <span>{dayLabel(occ.date)}</span>}
          {isRecurringActivity(occ.activity) ? <span>Repete: {occ.activity.weekdays.map((w) => WEEKDAY_SHORT[w]).join(", ")}</span> : <span>Só neste dia</span>}
          {occ.activity.task_id && <span className="flex items-center gap-0.5"><Link2 className="h-3 w-3" />Tarefa vinculada</span>}
          {occ.completed && <span>· concluída</span>}
        </span>
      </span>
    </button>
  );
}

/** Barra do modo de seleção: fica presa no rodapé da tela (celular e computador). */
export function SelectionBar({ count, visibleCount, allVisibleSelected, onSelectAll, onClear, onCancel, onDelete }: { count: number; visibleCount: number; allVisibleSelected: boolean; onSelectAll: () => void; onClear: () => void; onCancel: () => void; onDelete: () => void }) {
  return (
    <div className="sticky bottom-0 z-30 -mx-1 rounded-xl border bg-background/95 p-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80" role="toolbar" aria-label="Seleção de atividades">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium" aria-live="polite">{count} selecionada{count === 1 ? "" : "s"}</p>
        <Button type="button" variant="outline" size="sm" className="h-10 sm:h-9" onClick={onSelectAll} disabled={visibleCount === 0 || allVisibleSelected}>Selecionar todas</Button>
        <Button type="button" variant="outline" size="sm" className="h-10 sm:h-9" onClick={onClear} disabled={count === 0}>Desmarcar todas</Button>
        <Button type="button" variant="ghost" size="sm" className="h-10 sm:h-9" onClick={onCancel}>Cancelar</Button>
        <Button type="button" variant="destructive" size="sm" className="h-10 sm:h-9" onClick={onDelete} disabled={count === 0}><Trash2 className="h-4 w-4" /> Excluir selecionadas</Button>
      </div>
    </div>
  );
}

/**
 * Confirmação antes de excluir: quantidade, nomes e, para cada atividade que
 * se repete, a escolha explícita entre "somente neste dia" e "atividade
 * inteira". Nada é excluído sem "Confirmar exclusão".
 */
export function DeleteSelectedDialog({ open, onOpenChange, selected, titleOf, skipAvailable, onDeleted }: { open: boolean; onOpenChange: (open: boolean) => void; selected: RealActivityOccurrence[]; titleOf: (occ: RealActivityOccurrence) => string; skipAvailable: boolean; onDeleted: () => void }) {
  const groups = useMemo(() => groupSelectedByActivity(selected), [selected]);
  const [scopes, setScopes] = useState<Record<string, DeleteScope | undefined>>({});
  const [busy, start] = useTransition();

  // Padrão: "somente neste dia" (o mais seguro) quando disponível; sem a migration, a pessoa escolhe.
  // O componente é remontado a cada abertura (key no pai), então as escolhas começam do zero.
  const scopeOf = (a: RealActivityOccurrence["activity"]): DeleteScope | undefined => scopes[a.id] ?? (isRecurringActivity(a) && skipAvailable ? "dias" : undefined);

  const missingChoice = groups.some((g) => isRecurringActivity(g.activity) && !scopeOf(g.activity));
  const n = selected.length;

  function confirm() {
    if (missingChoice || busy) return;
    const requests = groups.map((g) => ({ activityId: g.activity.id, scope: (isRecurringActivity(g.activity) ? scopeOf(g.activity) : "toda") as DeleteScope, dates: g.dates }));
    start(async () => {
      const r = await deleteActivitiesAction(requests);
      if (r.error) { toast.error(r.error); return; }
      toast.success(r.success ?? "Excluído.");
      onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Excluir {n} atividade{n === 1 ? "" : "s"} selecionada{n === 1 ? "" : "s"}?</DialogTitle>
          <DialogDescription className="flex items-start gap-1.5 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> A exclusão não poderá ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1">
          {groups.map((g) => {
            const occ = selected.find((o) => o.activity.id === g.activity.id)!;
            const recurring = isRecurringActivity(g.activity);
            const days = g.dates.map(dayLabel).join("; ");
            const scope = scopeOf(g.activity);
            const name = `escopo-${g.activity.id}`;
            return (
              <li key={g.activity.id} className="rounded-lg border p-3">
                <p className="break-words text-sm font-medium">{titleOf(occ)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.activity.start_time.slice(0, 5)} · {recurring ? `repete: ${g.activity.weekdays.map((w) => WEEKDAY_SHORT[w]).join(", ")}` : `só em ${days}`}
                </p>
                {g.activity.task_id && <p className="mt-1 text-xs text-muted-foreground">Tarefa vinculada: só sai da rotina. A tarefa e as subtarefas continuam na página Tarefas.</p>}
                {recurring ? (
                  <fieldset className="mt-2 space-y-1.5">
                    <legend className="sr-only">O que excluir de {titleOf(occ)}</legend>
                    <label className={cn("flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm", scope === "dias" && "border-primary bg-primary/5", !skipAvailable && "cursor-not-allowed opacity-60")}>
                      <input type="radio" name={name} className="mt-0.5 h-4 w-4 accent-primary" checked={scope === "dias"} disabled={!skipAvailable || busy} onChange={() => setScopes((s) => ({ ...s, [g.activity.id]: "dias" }))} />
                      <span>
                        <span className="block font-medium">Excluir somente {g.dates.length === 1 ? "neste dia" : `nestes ${g.dates.length} dias`}</span>
                        <span className="block text-xs text-muted-foreground">{days}. Os outros dias continuam na rotina.</span>
                        {!skipAvailable && <span className="mt-1 block text-xs text-amber-500">Disponível depois de aplicar a migração 20261107100000 no Supabase.</span>}
                      </span>
                    </label>
                    <label className={cn("flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm", scope === "toda" && "border-destructive bg-destructive/5")}>
                      <input type="radio" name={name} className="mt-0.5 h-4 w-4 accent-destructive" checked={scope === "toda"} disabled={busy} onChange={() => setScopes((s) => ({ ...s, [g.activity.id]: "toda" }))} />
                      <span>
                        <span className="block font-medium">Excluir atividade inteira</span>
                        <span className="block text-xs text-muted-foreground">Remove a atividade e todas as repetições, em todos os dias.</span>
                      </span>
                    </label>
                  </fieldset>
                ) : null}
              </li>
            );
          })}
        </ul>

        {missingChoice && <p className="text-xs text-amber-500">Escolha o que excluir em cada atividade que se repete.</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="h-11 sm:h-9" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" variant="destructive" className="h-11 sm:h-9" disabled={missingChoice || busy || n === 0} onClick={confirm}>{busy ? "Excluindo…" : "Confirmar exclusão"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
