"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REMINDER_OFFSETS, REMINDER_OFFSET_LABELS, type ReminderOffset } from "@/lib/task-schedule";

/**
 * Seleção dos lembretes antes da execução — o mesmo controle em tarefas,
 * subtarefas e atividades da Rotina. Botões grandes (h-9) para o celular.
 */
export function ReminderOffsetsPicker({
  value,
  onChange,
  disabled,
  hasTime,
}: {
  value: number[];
  onChange: (value: ReminderOffset[]) => void;
  disabled?: boolean;
  /** Sem horário, os avisos "no horário"/"min antes" saem às 08:00 do dia. */
  hasTime: boolean;
}) {
  function toggle(offset: ReminderOffset) {
    const next = value.includes(offset) ? value.filter((v) => v !== offset) : [...value, offset];
    onChange((next as ReminderOffset[]).sort((a, b) => a - b));
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lembretes">
        {REMINDER_OFFSETS.map((offset) => {
          const active = value.includes(offset);
          return (
            <Button
              key={offset}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-9"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(offset)}
            >
              {active && <Bell className="h-3.5 w-3.5" />}
              {REMINDER_OFFSET_LABELS[offset]}
            </Button>
          );
        })}
      </div>
      {!hasTime && value.some((v) => v !== 1440) && (
        <p className="text-[11px] text-muted-foreground">Sem horário definido, o lembrete do dia sai às 08:00.</p>
      )}
    </div>
  );
}
