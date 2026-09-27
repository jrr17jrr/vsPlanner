"use client";

import { Check, MapPin, MoreVertical, Pencil, Repeat, Square, Trash2, CircleStop } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDateShort, weekdayLabel } from "@/lib/format";
import { formatWeekdays, weekdayOfKey, type DayTaskEntry } from "@/lib/tasks";
import { cn } from "@/lib/utils";

/**
 * Uma tarefa do dia (ou um dia de uma recorrente) — usado no Meu Dia e em
 * Tarefas. Campos vazios (horário, local) simplesmente não aparecem.
 * Botão grande de concluir pensando no uso pelo celular.
 */
export function DayTaskItem({
  entry,
  done,
  onToggle,
  onEdit,
  onDelete,
  onEndRecurrence,
}: {
  entry: DayTaskEntry;
  done: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onEndRecurrence?: () => void;
}) {
  const overdue = entry.overdue && !done;
  const hasMenu = onEdit || onDelete || onEndRecurrence;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5",
        overdue ? "border-warning/40" : entry.important && !done ? "border-destructive/40" : "border-border",
        done && "opacity-60"
      )}
    >
      {entry.time ? (
        <span className="w-11 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-foreground">{entry.time}</span>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className={cn("break-words text-sm font-medium text-foreground", done && "line-through")}>{entry.title}</p>
        {entry.location && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="break-words">{entry.location}</span>
          </p>
        )}
        {(entry.important || entry.recurring || overdue) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {overdue && (
              <Badge variant="warning" className="border-0">
                Pendente · {weekdayLabel(weekdayOfKey(entry.date)).slice(0, 3)} {formatDateShort(entry.date)}
              </Badge>
            )}
            {entry.important && <Badge variant="destructive" className="border-0">Importante</Badge>}
            {entry.recurring && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Repeat className="h-3 w-3" /> {formatWeekdays(entry.task.weekdays)}
              </span>
            )}
          </div>
        )}
        {entry.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.notes}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={done ? "secondary" : "outline"}
          onClick={onToggle}
          className="h-9 gap-1.5 px-3"
          aria-label={done ? "Marcar como não concluída" : "Concluir"}
        >
          {done ? <Check className="h-4 w-4 text-success" /> : <Square className="h-4 w-4" />}
          <span className="hidden min-[380px]:inline">{done ? "Feita" : "Concluir"}</span>
        </Button>

        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais ações">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4" /> Editar
                </DropdownMenuItem>
              )}
              {onEndRecurrence && (
                <DropdownMenuItem onClick={onEndRecurrence}>
                  <CircleStop className="h-4 w-4" /> Encerrar repetição
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4" /> Excluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
