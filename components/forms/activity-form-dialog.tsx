"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useDbStore } from "@/store/db-store";
import { generateId } from "@/lib/ids";
import { toDateKey, weekdayLabel } from "@/lib/format";
import { ACTIVITY_CATEGORIES, type Activity, type Priority, type RecurrenceType } from "@/types/entities";

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  nenhuma: "Não repetir",
  diaria: "Todos os dias",
  segunda_sexta: "Segunda a sexta",
  semanal: "Semanal (mesmo dia)",
  dias_especificos: "Dias específicos",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity;
  spaceId: string;
  userId: string;
  defaultDate?: string;
}

export function ActivityFormDialog({ open, onOpenChange, activity, spaceId, userId, defaultDate }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ActivityForm
          key={activity?.id ?? "new"}
          onOpenChange={onOpenChange}
          activity={activity}
          spaceId={spaceId}
          userId={userId}
          defaultDate={defaultDate}
        />
      )}
    </Dialog>
  );
}

function ActivityForm({
  onOpenChange,
  activity,
  spaceId,
  userId,
  defaultDate,
}: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [title, setTitle] = useState(activity?.title ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [category, setCategory] = useState<string>(activity?.category ?? "Pessoal");
  const [priority, setPriority] = useState<Priority>(activity?.priority ?? "media");
  const [date, setDate] = useState(activity?.date ?? defaultDate ?? toDateKey(new Date()));
  const [startTime, setStartTime] = useState(activity?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(activity?.endTime ?? "");
  const [recurrence, setRecurrence] = useState<RecurrenceType>(activity?.recurrence ?? "nenhuma");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(activity?.recurrenceDays ?? []);

  function toggleDay(day: number) {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Dê um título para a atividade.");
      return;
    }

    if (activity) {
      update("activities", activity.id, {
        title,
        description: description || undefined,
        category: category as Activity["category"],
        priority,
        date,
        startTime,
        endTime: endTime || undefined,
        recurrence,
        recurrenceDays: recurrence === "dias_especificos" ? recurrenceDays : undefined,
      });
      toast.success("Atividade atualizada.");
    } else {
      add("activities", {
        id: generateId("act"),
        spaceId,
        userId,
        title,
        description: description || undefined,
        category: category as Activity["category"],
        priority,
        date,
        startTime,
        endTime: endTime || undefined,
        recurrence,
        recurrenceDays: recurrence === "dias_especificos" ? recurrenceDays : undefined,
        responsibleId: userId,
        status: "pendente",
        completedDates: [],
        createdAt: new Date().toISOString(),
      });
      toast.success("Atividade criada.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{activity ? "Editar atividade" : "Nova atividade"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="act-title">Título</Label>
          <Input id="act-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="act-desc">Descrição</Label>
          <Textarea id="act-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="act-date">Data</Label>
            <Input id="act-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="act-start">Início</Label>
            <Input id="act-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="act-end">Fim (opcional)</Label>
            <Input id="act-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Recorrência</Label>
          <Select value={recurrence} onValueChange={(v) => setRecurrence(v as RecurrenceType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recurrence === "dias_especificos" && (
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <label
                key={d}
                className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs"
              >
                <Checkbox checked={recurrenceDays.includes(d)} onCheckedChange={() => toggleDay(d)} />
                {weekdayLabel(d).slice(0, 3)}
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit">{activity ? "Salvar alterações" : "Criar atividade"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
