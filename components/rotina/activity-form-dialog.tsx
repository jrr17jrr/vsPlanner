"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createActivityAction, updateActivityAction, type ActivityFormInput } from "@/lib/supabase/personal-actions";
import { weekdayLabel } from "@/lib/format";
import type { Activity } from "@/types/database.types";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function ActivityFormDialog({
  open,
  onOpenChange,
  activity,
  defaultWeekday,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity;
  defaultWeekday?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ActivityForm key={activity?.id ?? "new"} onOpenChange={onOpenChange} activity={activity} defaultWeekday={defaultWeekday} />
      )}
    </Dialog>
  );
}

function ActivityForm({
  onOpenChange,
  activity,
  defaultWeekday,
}: {
  onOpenChange: (open: boolean) => void;
  activity?: Activity;
  defaultWeekday?: number;
}) {
  const [title, setTitle] = useState(activity?.title ?? "");
  const [category, setCategory] = useState(activity?.category ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(activity?.weekdays ?? (defaultWeekday !== undefined ? [defaultWeekday] : []));
  const [startTime, setStartTime] = useState(activity?.start_time?.slice(0, 5) ?? "08:00");
  const [endTime, setEndTime] = useState(activity?.end_time?.slice(0, 5) ?? "");
  const [notes, setNotes] = useState(activity?.notes ?? "");
  const [pending, setPending] = useState(false);

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Dê um título para a atividade.");
    if (weekdays.length === 0) return toast.error("Escolha pelo menos um dia da semana.");

    const input: ActivityFormInput = {
      title,
      category: category || undefined,
      weekdays,
      startTime,
      endTime: endTime || undefined,
      notes: notes || undefined,
    };

    setPending(true);
    const result = activity ? await updateActivityAction(activity.id, input) : await createActivityAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Atividade salva.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{activity ? "Editar atividade" : "Nova atividade"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} autoFocus placeholder="Treino, Faculdade, Leitura…" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Categoria</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} disabled={pending} placeholder="Opcional" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Dias da semana *</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={weekdays.includes(day) ? "default" : "outline"}
                onClick={() => toggleWeekday(day)}
                disabled={pending}
                className="w-14"
              >
                {weekdayLabel(day).slice(0, 3)}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Início *</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fim</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={pending} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
