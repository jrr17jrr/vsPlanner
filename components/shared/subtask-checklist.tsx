"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { setSubtaskDone, type SubtaskParent } from "@/lib/supabase/subtask-actions";
import { checklistProgress, filterChecklist } from "@/lib/checklist-priority";
import type { Subtask } from "@/lib/task-schedule";
import { cn } from "@/lib/utils";

/**
 * Checklist de UMA subtarefa, direto no Meu Dia (sem abrir a página
 * Tarefas). Marca/desmarca o item ORIGINAL em `task_subtasks` — nada é
 * copiado — e avisa o pai (`onChanged` → router.refresh) para todas as
 * telas sincronizarem. Importantes primeiro; `blocking` = itens que
 * impediram concluir a subtarefa (destacados).
 */
export function SubtaskChecklist({ parentType, parentId, items, blocking = [], onChanged }: {
  parentType: SubtaskParent;
  parentId: string;
  items: Subtask[];
  blocking?: string[];
  onChanged?: () => void;
}) {
  const [local, setLocal] = useState(items);
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) { setLastItems(items); setLocal(items); }
  const [onlyImportant, setOnlyImportant] = useState(false);
  const [busy, start] = useTransition();
  const progress = checklistProgress(local);
  const shown = filterChecklist(local, { priority: onlyImportant ? "importante" : "todos", importantFirst: true });
  const hasImportant = local.some((i) => i.priority === "importante");

  function toggle(item: Subtask, done: boolean) {
    setLocal((cur) => cur.map((x) => (x.id === item.id ? { ...x, is_done: done } : x)));
    start(async () => {
      const r = await setSubtaskDone(parentType, parentId, item.id, done);
      if (r.error) { toast.error(r.error); setLocal((cur) => cur.map((x) => (x.id === item.id ? { ...x, is_done: item.is_done } : x))); }
      else onChanged?.();
    });
  }

  if (local.length === 0) return null;
  return (
    <div className="space-y-1.5" aria-label="Checklist da subtarefa">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">Checklist · <span className="tabular-nums text-foreground">{progress.label}</span></span>
        {hasImportant && (
          <button type="button" aria-pressed={onlyImportant} onClick={() => setOnlyImportant((v) => !v)} className={cn("min-h-8 rounded-md border px-2", onlyImportant ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            Só importantes
          </button>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total} aria-label="Progresso do checklist">
        <div className="h-full bg-primary/80 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
      </div>
      <ul className="space-y-1">
        {shown.map((item) => {
          const highlight = blocking.includes(item.id) && !item.is_done;
          return (
            <li key={item.id} className={cn("rounded-md bg-muted/40 px-2 py-1", highlight && "ring-2 ring-amber-400/70")}>
              <label className="flex min-h-10 cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={item.is_done} disabled={busy} onChange={(e) => toggle(item, e.target.checked)} aria-label={`${item.is_done ? "Reabrir" : "Concluir"} item: ${item.title}`} />
                <span className={cn("min-w-0 flex-1 break-words text-[13px]", item.is_done && "text-muted-foreground line-through")}>{item.title}</span>
                {item.priority === "importante" && <Badge variant="destructive" className="h-5 shrink-0 border-0 px-1.5 text-[10px]">Importante</Badge>}
                {highlight && <span className="shrink-0 text-[10px] font-medium text-warning">Falta</span>}
              </label>
              <ExpandableDescription text={item.description} className="pl-7" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
