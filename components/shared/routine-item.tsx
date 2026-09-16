"use client";

import { MoreVertical, Pencil, Trash2, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Activity } from "@/types/entities";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  Pessoal: "bg-sky-500/15 text-sky-400",
  CLT: "bg-amber-500/15 text-amber-400",
  "Visionário Dev": "bg-violet-500/15 text-violet-400",
  TikTok: "bg-pink-500/15 text-pink-400",
  Treino: "bg-emerald-500/15 text-emerald-400",
  Faculdade: "bg-blue-500/15 text-blue-400",
  Alura: "bg-orange-500/15 text-orange-400",
  Curso: "bg-teal-500/15 text-teal-400",
  Outros: "bg-zinc-500/15 text-zinc-400",
};

export function RoutineItem({
  activity,
  completed,
  onToggle,
  onEdit,
  onDelete,
}: {
  activity: Activity;
  completed: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-opacity",
        completed && "opacity-60"
      )}
    >
      <Checkbox checked={completed} onCheckedChange={onToggle} className="shrink-0" />
      <div className="w-14 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {activity.startTime}
        {activity.endTime && <span className="block text-[10px]">{activity.endTime}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium text-foreground",
            completed && "line-through"
          )}
        >
          {activity.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge className={cn("border-0", CATEGORY_COLORS[activity.category])}>
            {activity.category}
          </Badge>
          {activity.priority === "alta" && (
            <Badge variant="destructive" className="border-0">
              Prioridade alta
            </Badge>
          )}
          {activity.workItemId && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Link2 className="h-3 w-3" /> vinculado a trabalho
            </span>
          )}
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
