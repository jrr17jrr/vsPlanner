"use client";

import { MoreVertical, Pencil, Trash2, CalendarClock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoveDatePopover } from "@/components/shared/move-date-popover";
import { cn } from "@/lib/utils";

/** Item de checklist genérico — usado por Hoje, Trabalho/CLT e outras listas de tarefas simples. */
export function ChecklistItem({
  title,
  done,
  time,
  badges,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  className,
}: {
  title: string;
  done: boolean;
  time?: string;
  badges?: React.ReactNode;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMove?: (newDate: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5",
        done && "opacity-60",
        className
      )}
    >
      <Checkbox checked={done} onCheckedChange={onToggle} className="shrink-0" />
      {time && (
        <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{time}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium text-foreground", done && "line-through")}>{title}</p>
        {badges && <div className="mt-0.5 flex flex-wrap items-center gap-1.5">{badges}</div>}
      </div>

      {onMove && (
        <MoveDatePopover onMove={onMove}>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <CalendarClock className="h-4 w-4" />
          </Button>
        </MoveDatePopover>
      )}

      {(onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Editar
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
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const variant =
    priority === "urgente" || priority === "alta"
      ? "destructive"
      : priority === "media" || priority === "normal"
        ? "warning"
        : "secondary";
  const label: Record<string, string> = {
    baixa: "Baixa",
    media: "Média",
    normal: "Normal",
    alta: "Alta",
    urgente: "Urgente",
  };
  return <Badge variant={variant} className="border-0">{label[priority] ?? priority}</Badge>;
}
