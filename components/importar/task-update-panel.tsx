"use client";

import { useEffect, useId } from "react";
import { GitMerge, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { fieldDisplay, planSummary, planTaskUpdate, type UpdatableField } from "@/lib/import/task-update";
import type { TaskDraft } from "@/lib/import/tasks";
import type { TaskImportTarget } from "@/lib/supabase/import-center-actions";
import { cn } from "@/lib/utils";

type Option = { id: string; title: string; companyId: string | null };

/**
 * "Criar nova tarefa" × "Atualizar tarefa existente" de UM item da prévia.
 * Atualizar só ACRESCENTA subtarefas e itens de checklist (o que já existe
 * com o mesmo título não é duplicado) e muda apenas os campos marcados —
 * substituir um campo preenchido exige marcar a caixa (vem desmarcada).
 */
export function TaskUpdatePanel({ draft, companyId, matches, options, target, onChange, onNeedTarget }: {
  draft: TaskDraft;
  companyId: string | null;
  matches: string[];
  options: Option[];
  target: TaskImportTarget | undefined;
  onChange: (patch: Partial<TaskDraft>) => void;
  onNeedTarget: (id: string) => void;
}) {
  const uid = useId();
  const update = draft.mode === "update";
  const sameScope = options.filter((o) => (o.companyId ?? null) === companyId);
  const ordered = [...sameScope.filter((o) => matches.includes(o.id)), ...sameScope.filter((o) => !matches.includes(o.id))];
  useEffect(() => { if (update && draft.targetId && !target) onNeedTarget(draft.targetId); }, [update, draft.targetId, target, onNeedTarget]);

  const plan = update && target ? planTaskUpdate(draft, target.task, target.subtasks, draft.updateFields as UpdatableField[] | undefined) : null;
  const chosen = new Set(plan ? plan.chosenChanges.map((c) => c.field) : []);
  const toggleField = (f: UpdatableField, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(f); else next.delete(f);
    onChange({ updateFields: [...next] });
  };

  if (!ordered.length && !update) return null;
  return (
    <div className="space-y-2 rounded-md border border-border/70 p-2">
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="O que fazer com esta tarefa">
        <button type="button" role="radio" aria-checked={!update} onClick={() => onChange({ mode: "create", targetId: undefined, updateFields: undefined })}
          className={cn("flex min-h-10 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium", !update ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
          <Plus className="h-3.5 w-3.5" /> Criar nova tarefa
        </button>
        <button type="button" role="radio" aria-checked={update} disabled={!ordered.length}
          onClick={() => onChange({ mode: "update", targetId: draft.targetId ?? ordered[0]?.id, updateFields: undefined })}
          className={cn("flex min-h-10 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium disabled:opacity-50", update ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
          <GitMerge className="h-3.5 w-3.5" /> Atualizar tarefa existente
        </button>
      </div>
      {update && (
        <>
          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">Tarefa que será atualizada</span>
            <select id={uid} className="h-11 w-full rounded-md border bg-background px-2 text-sm" value={draft.targetId ?? ""} onChange={(e) => onChange({ targetId: e.target.value || undefined, updateFields: undefined })}>
              <option value="">Selecione…</option>
              {ordered.map((o) => <option key={o.id} value={o.id}>{o.title}{matches.includes(o.id) ? " (mesmo título)" : ""}</option>)}
            </select>
          </label>
          {draft.targetId && !target && <p className="text-xs text-muted-foreground">Carregando a tarefa…</p>}
          {plan && (
            <div className="space-y-2 text-xs">
              <p className="font-medium">Prévia das alterações: {planSummary(plan)}</p>
              {plan.newSubtasks.length > 0 && (
                <ul className="space-y-0.5">{plan.newSubtasks.map((s, i) => <li key={i} className="text-emerald-400">+ {s.title}{s.children.length ? ` (${s.children.length} item(ns) de checklist)` : ""}</li>)}</ul>
              )}
              {plan.newChecklist.map((c) => (
                <div key={c.subtaskId}><span className="text-muted-foreground">Checklist de “{c.subtaskTitle}”:</span><ul>{c.items.map((x, i) => <li key={i} className="pl-3 text-emerald-400">+ {x.title}{x.priority === "importante" ? " · importante" : ""}</li>)}</ul></div>
              ))}
              {(plan.existingSubtasks.length > 0 || plan.existingChecklist.length > 0) && (
                <p className="text-muted-foreground">Já existem (não serão duplicados): {[...plan.existingSubtasks, ...plan.existingChecklist].join(" · ")}</p>
              )}
              {plan.fieldChanges.length > 0 && (
                <fieldset className="space-y-1">
                  <legend className="text-muted-foreground">Campos da tarefa (só muda o que estiver marcado):</legend>
                  {plan.fieldChanges.map((c) => (
                    <label key={c.field} className="flex min-h-9 items-start gap-2">
                      <Checkbox className="mt-0.5" checked={chosen.has(c.field)} onCheckedChange={(v) => toggleField(c.field, v === true)} aria-label={`Atualizar ${c.label}`} />
                      <span className="min-w-0 break-words"><strong>{c.label}</strong>: {fieldDisplay(c.field, c.before)} → {fieldDisplay(c.field, c.after)}{c.overwrite && <span className="text-amber-300"> · substitui o valor atual</span>}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {plan.empty && <p className="text-amber-300">Nada novo para acrescentar a esta tarefa — ela será ignorada.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
