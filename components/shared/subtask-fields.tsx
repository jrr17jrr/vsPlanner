"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReminderOffsetsPicker } from "@/components/shared/reminder-offsets-picker";
import { SUBTASK_DESCRIPTION_MAX } from "@/lib/subtask-description";
import { isBlankSubtaskDraft, type SubtaskDraft } from "@/lib/subtask-draft";
import { formatWeekdays, WEEKDAY_ORDER, WEEKDAY_SHORT } from "@/lib/tasks";
import { cn } from "@/lib/utils";

/**
 * Campos de agenda de UMA subtarefa (execução, prazo, prioridade,
 * lembretes) — o mesmo bloco no formulário inline (PC), no diálogo do
 * celular e na seção "Subtarefas" do Criar tarefa. Nunca passa da largura
 * da tela: colunas `minmax(0,1fr)` e campos `min-w-0`.
 */
type ScheduleMode = "sem" | "data" | "semanal";

export function SubtaskDetailsFields({ value, onChange, idPrefix, disabled, className, allowRecurrence = true }: {
  value: SubtaskDraft;
  onChange: (patch: Partial<SubtaskDraft>) => void;
  idPrefix: string;
  disabled?: boolean;
  className?: string;
  /** Itens de checklist não repetem sozinhos (a repetição é da subtarefa). */
  allowRecurrence?: boolean;
}) {
  const field = "flex min-w-0 flex-col gap-1";
  const weekly = allowRecurrence && value.recurrence === "weekly";
  const mode: ScheduleMode = weekly ? "semanal" : value.scheduledDate ? "data" : "sem";
  function setMode(next: ScheduleMode) {
    if (next === "semanal") onChange({ recurrence: "weekly", scheduledDate: "", dueDate: "", deadlineTime: "" });
    else if (next === "data") onChange({ recurrence: "none", weekdays: [], scheduledDate: value.scheduledDate || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) });
    else onChange({ recurrence: "none", weekdays: [], scheduledDate: "", scheduledTime: "", reminders: [] });
  }
  const toggleDay = (d: number) => onChange({ weekdays: value.weekdays.includes(d) ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d] });
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {allowRecurrence && (
        <div className="col-span-2 flex min-w-0 flex-col gap-1">
          <Label className="text-xs">Programação</Label>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Programação da subtarefa">
            {([["sem", "Sem data"], ["data", "Em um dia"], ["semanal", "Repetir"]] as const).map(([m, label]) => (
              <Button key={m} type="button" size="sm" className="h-9 px-1 text-xs" disabled={disabled} variant={mode === m ? "default" : "outline"} aria-pressed={mode === m} onClick={() => setMode(m)}>{label}</Button>
            ))}
          </div>
        </div>
      )}
      {weekly ? (
        <>
          <div className="col-span-2 flex min-w-0 flex-col gap-1">
            <Label className="text-xs">Dias da semana</Label>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_ORDER.map((d) => (
                <Button key={d} type="button" size="sm" className="h-9 px-0 text-xs" disabled={disabled} variant={value.weekdays.includes(d) ? "default" : "outline"} aria-pressed={value.weekdays.includes(d)} onClick={() => toggleDay(d)}>{WEEKDAY_SHORT[d]}</Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {value.weekdays.length ? `Aparece no Meu Dia: ${formatWeekdays(value.weekdays)}. Cada dia é concluído separadamente.` : "Escolha os dias em que esta subtarefa se repete."}
            </p>
          </div>
          <div className={field}><Label className="text-xs" htmlFor={`${idPrefix}-st`}>Horário</Label><Input id={`${idPrefix}-st`} type="time" value={value.scheduledTime} disabled={disabled} onChange={(e) => onChange({ scheduledTime: e.target.value })} /></div>
          <div />
          <div className={field}><Label className="text-xs" htmlFor={`${idPrefix}-rs`}>Início</Label><Input id={`${idPrefix}-rs`} type="date" value={value.recurrenceStart} disabled={disabled} onChange={(e) => onChange({ recurrenceStart: e.target.value })} /></div>
          <div className={field}><Label className="text-xs" htmlFor={`${idPrefix}-ru`}>Término</Label><Input id={`${idPrefix}-ru`} type="date" value={value.recurrenceUntil} min={value.recurrenceStart || undefined} disabled={disabled} onChange={(e) => onChange({ recurrenceUntil: e.target.value })} /></div>
          <p className="col-span-2 -mt-1 text-[11px] text-muted-foreground">Início em branco = hoje. Término em branco = sem fim. Dias anteriores ao início nunca ficam pendentes.</p>
        </>
      ) : (
        <>
      {(!allowRecurrence || mode === "data") && <div className={field}><Label className="text-xs" htmlFor={`${idPrefix}-sd`}>Fazer no dia</Label><Input id={`${idPrefix}-sd`} type="date" value={value.scheduledDate} disabled={disabled} onChange={(e) => onChange({ scheduledDate: e.target.value })} /></div>}
      {(!allowRecurrence || mode === "data") && <div className={field}><Label className="text-xs" htmlFor={`${idPrefix}-st`}>Horário</Label><Input id={`${idPrefix}-st`} type="time" value={value.scheduledTime} disabled={disabled || !value.scheduledDate} onChange={(e) => onChange({ scheduledTime: e.target.value })} /></div>}
      <div className={field}><Label className="text-xs" htmlFor={`${idPrefix}-dd`}>Prazo final</Label><Input id={`${idPrefix}-dd`} type="date" value={value.dueDate} min={value.scheduledDate || undefined} disabled={disabled} onChange={(e) => onChange({ dueDate: e.target.value })} /></div>
      <div className={field}><Label className="text-xs" htmlFor={`${idPrefix}-dt`}>Horário limite</Label><Input id={`${idPrefix}-dt`} type="time" value={value.deadlineTime} disabled={disabled || !value.dueDate} onChange={(e) => onChange({ deadlineTime: e.target.value })} /></div>
        </>
      )}
      <div className="col-span-2 flex min-w-0 flex-col gap-1"><Label className="text-xs">Prioridade</Label><div className="grid grid-cols-2 gap-1.5">
        {(["normal", "importante"] as const).map((p) => <Button key={p} type="button" size="sm" className="h-9" disabled={disabled} variant={value.priority === p ? "default" : "outline"} aria-pressed={value.priority === p} onClick={() => onChange({ priority: p })}>{p === "normal" ? "Normal" : "Importante"}</Button>)}
      </div></div>
      {value.scheduledDate || weekly
        ? <div className="col-span-2 flex min-w-0 flex-col gap-1"><Label className="text-xs">Lembretes</Label><ReminderOffsetsPicker value={value.reminders} onChange={(r) => onChange({ reminders: r })} hasTime={!!value.scheduledTime} disabled={disabled} /></div>
        : <p className="col-span-2 text-[11px] text-muted-foreground">Escolha o dia de execução (ou a repetição) para configurar lembretes.</p>}
    </div>
  );
}

/** Campo de descrição opcional da subtarefa (mesmo limite do banco). */
export function SubtaskDescriptionField({ value, onChange, id, disabled }: { value: string; onChange: (v: string) => void; id: string; disabled?: boolean }) {
  return <Textarea id={id} rows={3} maxLength={SUBTASK_DESCRIPTION_MAX} disabled={disabled} placeholder="Descrição opcional (aparece recolhida)" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Descrição opcional" />;
}

/**
 * Subtarefas AINDA NÃO SALVAS do Criar tarefa: adicionar rápido (só o
 * título; Enter cria a próxima), expandir detalhes, editar e remover.
 * Quem grava é a ação da tarefa principal, tudo junto.
 */
export function DraftSubtasksEditor({ drafts, onChange, newDraft, disabled }: {
  drafts: SubtaskDraft[];
  onChange: (drafts: SubtaskDraft[]) => void;
  /** Rascunho inicial (herda a data da tarefa principal). */
  newDraft: () => SubtaskDraft;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<number[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const update = (i: number, patch: Partial<SubtaskDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const add = () => { onChange([...drafts, newDraft()]); setFocusIndex(drafts.length); };
  const remove = (i: number) => { onChange(drafts.filter((_, j) => j !== i)); setOpen((o) => o.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))); };
  const toggle = (i: number) => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
  const filled = drafts.filter((d) => !isBlankSubtaskDraft(d)).length;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Subtarefas</Label>
        {drafts.length > 0 && <span className="text-xs text-muted-foreground">{filled} para salvar</span>}
      </div>
      {drafts.map((d, i) => {
        const expanded = open.includes(i);
        const summary = [d.recurrence === "weekly" && `repete ${formatWeekdays(d.weekdays)}`, d.scheduledDate && `fazer ${d.scheduledDate.split("-").reverse().slice(0, 2).join("/")}${d.scheduledTime ? " " + d.scheduledTime : ""}`, d.dueDate && `prazo ${d.dueDate.split("-").reverse().slice(0, 2).join("/")}`, d.priority === "importante" && "importante", d.reminders.length && `${d.reminders.length} lembrete(s)`].filter(Boolean).join(" · ");
        return (
          <div key={i} className="min-w-0 rounded-md border border-border p-2">
            <div className="flex min-w-0 items-center gap-1">
              <Input
                aria-label={`Título da subtarefa ${i + 1}`}
                placeholder={`Subtarefa ${i + 1}`}
                value={d.title}
                maxLength={300}
                disabled={disabled}
                autoFocus={focusIndex === i}
                onChange={(e) => update(i, { title: e.target.value })}
                // Enter não envia a tarefa: cria a próxima subtarefa.
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (d.title.trim()) add(); } }}
                className="min-w-0 flex-1"
              />
              <button type="button" aria-label={expanded ? `Recolher detalhes da subtarefa ${i + 1}` : `Detalhes da subtarefa ${i + 1}`} aria-expanded={expanded} disabled={disabled} onClick={() => toggle(i)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <button type="button" aria-label={`Remover subtarefa ${i + 1}`} disabled={disabled} onClick={() => remove(i)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {!expanded && summary && <button type="button" className="mt-1 block max-w-full truncate text-left text-[11px] text-muted-foreground" onClick={() => toggle(i)}>{summary}</button>}
            {expanded && (
              <div className="mt-2 flex min-w-0 flex-col gap-2">
                <SubtaskDescriptionField id={`draft-${i}-desc`} value={d.description} disabled={disabled} onChange={(v) => update(i, { description: v })} />
                <SubtaskDetailsFields idPrefix={`draft-${i}`} value={d} disabled={disabled} onChange={(p) => update(i, p)} />
              </div>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="h-9 self-start" disabled={disabled} onClick={add}><Plus className="h-4 w-4" />Adicionar subtarefa</Button>
      {drafts.length > 0 && <p className="text-[11px] text-muted-foreground">As subtarefas são salvas junto com a tarefa. Toque na seta para data, prazo, prioridade, lembretes e descrição.</p>}
    </div>
  );
}
