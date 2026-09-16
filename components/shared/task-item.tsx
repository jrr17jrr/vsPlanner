"use client";

import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Task } from "@/types/entities";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRIORITY_VARIANT: Record<Task["priority"], "secondary" | "warning" | "destructive"> = {
  baixa: "secondary",
  media: "warning",
  alta: "destructive",
};

export function TaskItem({
  task,
  onToggle,
  onEdit,
  onDelete,
  extra,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  extra?: React.ReactNode;
}) {
  const done = task.status === "concluida";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5",
        done && "opacity-60"
      )}
    >
      <Checkbox checked={done} onCheckedChange={onToggle} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium text-foreground", done && "line-through")}>
          {task.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary" className="border-0">{task.category}</Badge>
          <Badge variant={PRIORITY_VARIANT[task.priority]} className="border-0">
            {task.priority}
          </Badge>
          {!done && task.status === "em_andamento" && (
            <Badge variant="outline">Em andamento</Badge>
          )}
          {task.dueDate && <span>prazo {formatDate(task.dueDate)}</span>}
          {extra}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
