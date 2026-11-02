"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReminderOffsetsPicker } from "@/components/shared/reminder-offsets-picker";
import { createActivityAction, updateActivityAction, type ActivityFormInput } from "@/lib/supabase/personal-actions";
import { normalizeReminderOffsets } from "@/lib/task-schedule";
import { formatDate, weekdayLabel } from "@/lib/format";
import { WEEKDAY_ORDER } from "@/lib/tasks";
import type { Activity, Task } from "@/types/database.types";

type Mode = "normal" | "tarefa";
type Repeat = "semanal" | "unica";

export function ActivityFormDialog({
  open,
  onOpenChange,
  activity,
  defaultWeekday,
  defaultDate,
  tasks = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity;
  defaultWeekday?: number;
  /** Data do dia clicado (para "Somente uma vez"). */
  defaultDate?: string;
  /** Tarefas que podem ser vinculadas (pendentes/recorrentes, não arquivadas). */
  tasks?: Task[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ActivityForm key={activity?.id ?? "new"} onOpenChange={onOpenChange} activity={activity} defaultWeekday={defaultWeekday} defaultDate={defaultDate} tasks={tasks} />
      )}
    </Dialog>
  );
}

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <Button key={o.value} type="button" size="sm" className="h-9" variant={value === o.value ? "default" : "outline"} aria-pressed={value === o.value} onClick={() => onChange(o.value)} disabled={disabled}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function ActivityForm({
  onOpenChange,
  activity,
  defaultWeekday,
  defaultDate,
  tasks,
}: {
  onOpenChange: (open: boolean) => void;
  activity?: Activity;
  defaultWeekday?: number;
  defaultDate?: string;
  tasks: Task[];
}) {
  const [mode, setMode] = useState<Mode>(activity?.task_id ? "tarefa" : "normal");
  const [taskId, setTaskId] = useState(activity?.task_id ?? "");
  const [repeat, setRepeat] = useState<Repeat>(activity?.specific_date ? "unica" : "semanal");
  const [specificDate, setSpecificDate] = useState(activity?.specific_date ?? defaultDate ?? "");
  const [title, setTitle] = useState(activity?.title ?? "");
  const [category, setCategory] = useState(activity?.category ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(activity?.weekdays?.length ? activity.weekdays : defaultWeekday !== undefined ? [defaultWeekday] : []);
  const [startTime, setStartTime] = useState(activity?.start_time?.slice(0, 5) ?? "08:00");
  const [endTime, setEndTime] = useState(activity?.end_time?.slice(0, 5) ?? "");
  const [reminders, setReminders] = useState<number[]>(normalizeReminderOffsets(activity?.reminder_offsets));
  const [notes, setNotes] = useState(activity?.notes ?? "");
  const [pending, setPending] = useState(false);

  const linked = mode === "tarefa";
  const selectedTask = tasks.find((t) => t.id === taskId);

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (linked && !taskId) return toast.error("Escolha a tarefa que vai entrar na rotina.");
    if (!linked && !title.trim()) return toast.error("Dê um título para a atividade.");
    if (repeat === "semanal" && weekdays.length === 0) return toast.error("Escolha pelo menos um dia da semana.");
    if (repeat === "unica" && !specificDate) return toast.error("Escolha o dia.");

    const input: ActivityFormInput = {
      title: linked ? selectedTask?.title ?? title : title,
      category: category || undefined,
      weekdays: repeat === "semanal" ? weekdays : [],
      specificDate: repeat === "unica" ? specificDate : null,
      startTime,
      endTime: endTime || undefined,
      notes: notes || undefined,
      taskId: linked ? taskId : null,
      reminderOffsets: reminders,
    };

    setPending(true);
    const result = activity ? await updateActivityAction(activity.id, input) : await createActivityAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    if (result.warning) toast.warning(result.warning);
    else toast.success(result.success ?? "Atividade salva.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{activity ? (activity.task_id ? "Editar tarefa na rotina" : "Editar atividade") : "Nova atividade"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
        {!activity && (
          <div className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <Segmented
              value={mode}
              onChange={setMode}
              disabled={pending}
              options={[
                { value: "normal", label: "Atividade normal" },
                { value: "tarefa", label: "Vincular tarefa" },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">
              {linked ? "Usa a tarefa original da página Tarefas — nada é duplicado. Concluir subtarefas aqui conclui em todo lugar." : "Acordar, treino, estudo, jantar…"}
            </p>
          </div>
        )}

        {linked ? (
          <div className="flex flex-col gap-1.5">
            <Label>Tarefa *</Label>
            {tasks.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Nenhuma tarefa pendente para vincular. Crie a tarefa na página Tarefas primeiro.</p>
            ) : (
              <Select value={taskId} onValueChange={setTaskId} disabled={pending || !!activity}>
                <SelectTrigger className="h-10 w-full" aria-label="Tarefa"><SelectValue placeholder="Escolha uma tarefa" /></SelectTrigger>
                <SelectContent>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="activity-title">Título *</Label>
              <Input id="activity-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} autoFocus placeholder="Treino, Faculdade, Leitura…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="activity-category">Categoria</Label>
              <Input id="activity-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={pending} placeholder="Opcional" />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Quando</Label>
          <Segmented
            value={repeat}
            onChange={setRepeat}
            disabled={pending}
            options={[
              { value: "semanal", label: "Toda semana" },
              { value: "unica", label: "Somente uma vez" },
            ]}
          />
          {repeat === "semanal" ? (
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_ORDER.map((day) => (
                <Button key={day} type="button" size="sm" variant={weekdays.includes(day) ? "default" : "outline"} aria-pressed={weekdays.includes(day)} onClick={() => toggleWeekday(day)} disabled={pending} className="h-9 px-0 text-xs">
                  {weekdayLabel(day).slice(0, 3)}
                </Button>
              ))}
            </div>
          ) : (
            <>
              <Input type="date" aria-label="Dia" value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} disabled={pending} />
              {specificDate && <p className="text-[11px] text-muted-foreground">Aparece só em {formatDate(specificDate)}.</p>}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-start">Início *</Label>
            <Input id="activity-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-end">Fim</Label>
            <Input id="activity-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={pending} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Notificações</Label>
          <ReminderOffsetsPicker value={reminders} onChange={setReminders} disabled={pending} hasTime />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="activity-notes">Observações</Label>
          <Textarea id="activity-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending || (linked && tasks.length === 0)}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
