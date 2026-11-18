"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { setSubtaskDone, setSubtaskPriority, type SubtaskParent } from "@/lib/supabase/subtask-actions";
import { checklistProgress, filterChecklist } from "@/lib/checklist-priority";
import type { Subtask } from "@/lib/task-schedule";
import { cn } from "@/lib/utils";

/**
 * Checklist de UMA subtarefa, direto no Meu Dia (sem abrir a página
 * Tarefas). Marca/desmarca o item ORIGINAL em `task_subtasks` — nada é
 * copiado — e avisa o pai (`onChanged` → router.refresh) para todas as
 * telas sincronizarem. Marcar um item NUNCA conclui a subtarefa (nem a
 * tarefa principal). Importantes primeiro; a estrela troca a prioridade do
 * item (só dele). `blocking` = itens que impediram concluir a subtarefa
 * (destacados). Recolher/expandir só muda a exibição.
 */
export function SubtaskChecklist({ parentType, parentId, items, blocking = [], onChanged, onProgress }: {
  parentType: SubtaskParent;
  parentId: string;
  items: Subtask[];
  blocking?: string[];
  onChanged?: () => void;
  /** Progresso atualizado na hora (antes da resposta do servidor). */
  onProgress?: (p: { done: number; total: number }) => void;
}) {
  const [local, setLocal] = useState(items);
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) { setLastItems(items); setLocal(items); }
  const [onlyImportant, setOnlyImportant] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, start] = useTransition();
  const progress = checklistProgress(local);
  const shown = filterChecklist(local, { priority: onlyImportant ? "importante" : "todos", importantFirst: true });
  const hasImportant = local.some((i) => i.priority === "importante");

  function apply(next: Subtask[]) {
    setLocal(next);
    const p = checklistProgress(next);
    onProgress?.({ done: p.done, total: p.total });
  }

  function toggle(item: Subtask, done: boolean) {
    const before = local;
    apply(local.map((x) => (x.id === item.id ? { ...x, is_done: done } : x)));
    start(async () => {
      const r = await setSubtaskDone(parentType, parentId, item.id, done);
      if (r.error) { toast.error(r.error); apply(before); }
      else onChanged?.();
    });
  }

  function togglePriority(item: Subtask) {
    const next = item.priority === "importante" ? "normal" : "importante";
    const before = local;
    apply(local.map((x) => (x.id === item.id ? { ...x, priority: next } : x)));
    start(async () => {
      const r = await setSubtaskPriority(parentType, parentId, item.id, next);
      if (r.error) { toast.error(r.error); apply(before); }
      else onChanged?.();
    });
  }

  if (local.length === 0) return null;
  return (
    <div className="space-y-1.5" aria-label="Checklist da subtarefa">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <button type="button" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed} className="flex min-h-8 items-center gap-1 font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} />
          Checklist · <span className="tabular-nums text-foreground">{progress.label}</span>
        </button>
        {hasImportant && !collapsed && (
          <button type="button" aria-pressed={onlyImportant} onClick={() => setOnlyImportant((v) => !v)} className={cn("min-h-8 rounded-md border px-2", onlyImportant ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            Só importantes
          </button>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total} aria-label="Progresso do checklist">
        <div className="h-full bg-primary/80 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
      </div>
      {!collapsed && (
        <ul className="space-y-1">
          {shown.map((item) => {
            const highlight = blocking.includes(item.id) && !item.is_done;
            const important = item.priority === "importante";
            return (
              <li key={item.id} className={cn("rounded-md bg-muted/40 px-2 py-1", highlight && "ring-2 ring-amber-400/70")}>
                <div className="flex min-h-10 items-center gap-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={item.is_done} disabled={busy} onChange={(e) => toggle(item, e.target.checked)} aria-label={`${item.is_done ? "Reabrir" : "Concluir"} item: ${item.title}`} />
                    <span className={cn("min-w-0 flex-1 break-words text-[13px]", item.is_done && "text-muted-foreground line-through")}>{item.title}</span>
                  </label>
                  {important && <Badge variant="destructive" className="h-5 shrink-0 border-0 px-1.5 text-[10px]">Importante</Badge>}
                  {highlight && <span className="shrink-0 text-[10px] font-medium text-warning">Falta</span>}
                  <button type="button" disabled={busy} onClick={() => togglePriority(item)} aria-pressed={important}
                    aria-label={important ? `Marcar como normal: ${item.title}` : `Marcar como importante: ${item.title}`} title={important ? "Prioridade: Importante (tocar para Normal)" : "Prioridade: Normal (tocar para Importante)"}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary">
                    <Star className={cn("h-4 w-4", important && "fill-current text-destructive")} />
                  </button>
                </div>
                <ExpandableDescription text={item.description} className="pl-7" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
