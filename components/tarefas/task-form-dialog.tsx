"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTaskAction, updateTaskAction, type TaskFormInput } from "@/lib/supabase/personal-actions";
import { addDaysToKey, isRecurringTask, WEEKDAY_ORDER, WEEKDAY_SHORT } from "@/lib/tasks";
import { normalizeReminderOffsets, taskSchedule } from "@/lib/task-schedule";
import { ReminderOffsetsPicker } from "@/components/shared/reminder-offsets-picker";
import type { Task, TaskKind, TaskPriority } from "@/types/database.types";

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  todayKey,
  defaultKind = "dia",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
  /** "Hoje" calculado no servidor (America/Sao_Paulo). */
  todayKey: string;
  defaultKind?: TaskKind;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <TaskForm key={task?.id ?? "new"} onOpenChange={onOpenChange} task={task} todayKey={todayKey} defaultKind={defaultKind} />}
    </Dialog>
  );
}

/** Grupo de botões "um ou outro" — mais rápido de tocar no celular que um Select. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Colunas próprias (ex.: 2 no celular, 4 no PC); padrão = uma por opção. */
  className?: string;
}) {
  return (
    <div className={className ?? "grid gap-1.5"} style={className ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "outline"}
          onClick={() => onChange(o.value)}
          disabled={disabled || o.disabled}
          aria-pressed={value === o.value}
          className="h-9 px-1 text-xs sm:text-sm"
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
type WhenMode = "dia" | "semana" | "nenhum" | "organizadora";

function TaskForm({
  onOpenChange,
  task,
  todayKey,
  defaultKind,
}: {
  onOpenChange: (open: boolean) => void;
  task?: Task;
  todayKey: string;
  defaultKind: TaskKind;
}) {
  const editingRecurring = !!task && isRecurringTask(task);
  const initial = task ? taskSchedule(task) : null;
  const initialMode: WhenMode = task
    ? isRecurringTask(task) ? "semana" : task.kind === "organizadora" ? "organizadora" : task.kind === "dia" ? "dia" : "nenhum"
    : defaultKind === "dia" ? "dia" : "nenhum";

  const [title, setTitle] = useState(task?.title ?? "");
  const [mode, setMode] = useState<WhenMode>(initialMode);
  const [date, setDate] = useState(initial?.executionDate ?? (task ? "" : defaultKind === "dia" ? todayKey : ""));
  const [time, setTime] = useState(initial?.executionTime ?? "");
  const [deadlineDate, setDeadlineDate] = useState(initial?.deadlineDate ?? "");
  const [deadlineTime, setDeadlineTime] = useState(initial?.deadlineTime ?? "");
  const [reminders, setReminders] = useState<number[]>(normalizeReminderOffsets(task?.reminder_offsets));
  const [location, setLocation] = useState(task?.location ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal");
  const [weekdays, setWeekdays] = useState<number[]>(task?.weekdays ?? []);
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [pending, setPending] = useState(false);

  // Dias da semana sem nenhum dia marcado = tarefa organizadora (sem dia fixo, sem recorrência).
  const noDaysSelected = mode === "semana" && weekdays.length === 0;
  const organizer = mode === "organizadora" || noDaysSelected;
  const isRecurring = mode === "semana" && !noDaysSelected;
  const hasExecution = mode === "dia" || isRecurring;

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Dê um título para a tarefa.");
    if (mode === "dia" && !date) return toast.error("Escolha o dia de execução — ou marque “Sem dia definido”.");
    if (mode === "dia" && deadlineDate && deadlineDate < date) return toast.error("O prazo final não pode ser antes do dia de execução.");

    const kind: TaskKind = organizer ? "organizadora" : hasExecution ? "dia" : "prazo";
    const input: TaskFormInput = organizer ? {
      kind, title, description: description || undefined, priority, recurrence: "none", weekdays: [], reminderOffsets: [], notes: notes || undefined,
    } : {
      kind,
      title,
      description: description || undefined,
      date: mode === "dia" ? date : kind === "prazo" ? deadlineDate || undefined : undefined,
      time: hasExecution ? time || undefined : deadlineTime || undefined,
      deadlineDate: isRecurring ? undefined : deadlineDate || undefined,
      deadlineTime: isRecurring || !deadlineDate ? undefined : deadlineTime || undefined,
      reminderOffsets: hasExecution ? reminders : [],
      location: hasExecution ? location || undefined : undefined,
      priority,
      recurrence: isRecurring ? "weekly" : "none",
      weekdays: isRecurring ? weekdays : [],
      notes: notes || undefined,
    };

    setPending(true);
    const result = task ? await updateTaskAction(task.id, input) : await createTaskAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    if (result.warning) toast.warning(result.warning);
    else toast.success(result.success ?? "Tarefa salva.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-title">Título *</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            autoFocus
            placeholder={hasExecution ? "Gravar vídeos na Ótica" : "Finalizar site do cliente"}
          />
        </div>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Fazer no dia</legend>
          <Segmented
            value={mode}
            onChange={(v) => {
              setMode(v);
              if (v === "dia" && !date) setDate(todayKey);
            }}
            disabled={pending}
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
            options={[
              // Recorrente só pode virar organizadora pela edição (parar de repetir = "Encerrar repetição").
              { value: "dia", label: "Em um dia", disabled: editingRecurring },
              { value: "semana", label: "Dias da semana" },
              { value: "nenhum", label: "Sem dia", disabled: editingRecurring },
              { value: "organizadora", label: "Organizadora" },
            ]}
          />
          {editingRecurring && !organizer && (
            <p className="text-[11px] text-muted-foreground">
              Alterações valem a partir de hoje; dias anteriores ficam no histórico. Para parar de repetir, use “Encerrar repetição” — ou desmarque todos os dias para virar organizadora.
            </p>
          )}
          {mode === "nenhum" && (
            <p className="text-[11px] text-muted-foreground">Sem dia de execução — aparece em “Com prazo”.</p>
          )}
          {organizer && (
            <p className="rounded-md bg-secondary/60 px-2 py-1.5 text-[11px] text-muted-foreground">
              {noDaysSelected ? "Nenhum dia marcado: ao salvar, vira uma tarefa organizadora. " : ""}
              Organizadora não tem dia fixo nem prazo: não aparece como obrigação diária e nunca fica atrasada. Serve para agrupar subtarefas — cada uma com a própria programação (sem data, num dia ou repetindo nos dias escolhidos).
              {editingRecurring && " Os dias anteriores e as subtarefas continuam preservados."}
            </p>
          )}

          {mode === "dia" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-date">Data de execução *</Label>
              <Input id="task-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setDate(todayKey)} disabled={pending}>Hoje</Button>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setDate(addDaysToKey(todayKey, 1))} disabled={pending}>Amanhã</Button>
              </div>
            </div>
          )}

          {mode === "semana" && (
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_ORDER.map((day) => (
                <Button
                  key={day}
                  type="button"
                  size="sm"
                  variant={weekdays.includes(day) ? "default" : "outline"}
                  onClick={() => toggleWeekday(day)}
                  disabled={pending}
                  className="h-9 px-0 text-xs"
                  aria-pressed={weekdays.includes(day)}
                >
                  {WEEKDAY_SHORT[day]}
                </Button>
              ))}
            </div>
          )}

          {hasExecution && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-time">Horário de execução</Label>
                  <Input id="task-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={pending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-location">Local</Label>
                  <Input id="task-location" value={location} onChange={(e) => setLocation(e.target.value)} disabled={pending} placeholder="Opcional" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Lembretes</Label>
                <ReminderOffsetsPicker value={reminders} onChange={setReminders} disabled={pending} hasTime={!!time} />
              </div>
            </>
          )}
        </fieldset>

        {!isRecurring && !organizer && (
          <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">Prazo final</legend>
            <p className="-mt-1 text-[11px] text-muted-foreground">Até quando precisa estar pronta. Opcional e independente do dia de execução.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-deadline">Data limite</Label>
                <Input id="task-deadline" type="date" value={deadlineDate} min={mode === "dia" ? date || undefined : undefined} onChange={(e) => setDeadlineDate(e.target.value)} disabled={pending} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-deadline-time">Horário limite</Label>
                <Input id="task-deadline-time" type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} disabled={pending || !deadlineDate} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setDeadlineDate(todayKey)} disabled={pending}>Hoje</Button>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setDeadlineDate(addDaysToKey(todayKey, 7))} disabled={pending}>Em 7 dias</Button>
              {deadlineDate && (
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setDeadlineDate(""); setDeadlineTime(""); }} disabled={pending}>
                  Sem prazo
                </Button>
              )}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Prioridade</Label>
          <Segmented
            value={priority}
            onChange={setPriority}
            disabled={pending}
            options={[
              { value: "normal", label: "Normal" },
              { value: "importante", label: "Importante" },
            ]}
          />
          {priority === "importante" && (
            <p className="text-[11px] text-muted-foreground">Aparece também em “Precisa da sua atenção” no Início.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-description">Descrição (opcional)</Label>
          <Textarea id="task-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} rows={3} maxLength={10000} placeholder="Detalhes da tarefa — aparece recolhida na lista" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-notes">Observações</Label>
          <Textarea id="task-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : task ? "Salvar" : "Criar tarefa"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
