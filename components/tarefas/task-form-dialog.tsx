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
import { cn } from "@/lib/utils";
import type { Task, TaskKind, TaskPriority, TaskRecurrence } from "@/types/database.types";

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
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "outline"}
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className="h-9"
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

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

  const [title, setTitle] = useState(task?.title ?? "");
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? defaultKind);
  const [date, setDate] = useState(task?.due_date ?? (task ? "" : defaultKind === "dia" ? todayKey : ""));
  const [time, setTime] = useState(task?.scheduled_time?.slice(0, 5) ?? "");
  const [location, setLocation] = useState(task?.location ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal");
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(task?.recurrence ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(task?.weekdays ?? []);
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [pending, setPending] = useState(false);

  const isDay = kind === "dia";
  const isRecurring = isDay && recurrence === "weekly";

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Dê um título para a tarefa.");
    if (isRecurring && weekdays.length === 0) return toast.error("Escolha pelo menos um dia da semana.");
    if (isDay && !isRecurring && !date) return toast.error("Escolha a data da tarefa.");

    const input: TaskFormInput = {
      kind,
      title,
      description: description || undefined,
      date: isRecurring ? undefined : date || undefined,
      time: time || undefined,
      location: isDay ? location || undefined : undefined,
      priority,
      recurrence: isDay ? recurrence : "none",
      weekdays: isRecurring ? weekdays : [],
      notes: notes || undefined,
    };

    setPending(true);
    const result = task ? await updateTaskAction(task.id, input) : await createTaskAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Tarefa salva.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-title">Título *</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            autoFocus
            placeholder={isDay ? "Gravar vídeos na Ótica" : "Finalizar site do cliente"}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Segmented
            value={kind}
            onChange={(v) => {
              setKind(v);
              if (v === "dia" && !date) setDate(todayKey);
            }}
            disabled={pending || editingRecurring}
            options={[
              { value: "dia", label: "Tarefa do dia" },
              { value: "prazo", label: "Com prazo" },
            ]}
          />
          <p className="text-[11px] text-muted-foreground">
            {isDay ? "Algo para fazer em um dia específico." : "Algo que precisa estar pronto até uma data."}
          </p>
        </div>

        {isDay && (
          <div className="flex flex-col gap-1.5">
            <Label>Repetir</Label>
            <Segmented
              value={recurrence}
              onChange={setRecurrence}
              disabled={pending || editingRecurring}
              options={[
                { value: "none", label: "Não repetir" },
                { value: "weekly", label: "Dias da semana" },
              ]}
            />
            {editingRecurring && (
              <p className="text-[11px] text-muted-foreground">
                Alterações valem a partir de hoje; dias anteriores ficam no histórico. Para parar de repetir, use “Encerrar repetição”.
              </p>
            )}
            {isRecurring && (
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
          </div>
        )}

        {!isRecurring && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-date">{isDay ? "Data *" : "Prazo"}</Label>
            <Input id="task-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => setDate(todayKey)} disabled={pending}>
                Hoje
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDate(addDaysToKey(todayKey, 1))} disabled={pending}>
                Amanhã
              </Button>
              {!isDay && date && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDate("")} disabled={pending}>
                  Sem prazo
                </Button>
              )}
            </div>
          </div>
        )}

        <div className={cn("grid grid-cols-1 gap-3", isDay && "sm:grid-cols-2")}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-time">Horário</Label>
            <Input id="task-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={pending} />
          </div>
          {isDay && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-location">Local</Label>
              <Input
                id="task-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={pending}
                placeholder="Opcional"
              />
            </div>
          )}
        </div>

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

        {task?.description && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-description">Descrição</Label>
            <Textarea id="task-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} rows={2} />
          </div>
        )}

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
