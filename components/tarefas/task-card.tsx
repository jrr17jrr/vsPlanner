"use client";

import { CalendarClock, CircleStop, FolderTree, History, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoveDatePopover } from "@/components/shared/move-date-popover";
import { CARD_ACCENT } from "@/components/shared/task-section";
import { cn } from "@/lib/utils";

/**
 * Card ÚNICO de uma tarefa principal (página Tarefas): cabeçalho com
 * checkbox, horário, título, prioridade, prazo e ações; o resto (descrição,
 * subtarefas) entra como `children`, dentro do mesmo card.
 */
export function TaskCard({
  title,
  done,
  onToggle,
  time,
  accent = "default",
  important,
  meta,
  onEdit,
  onDelete,
  onEndRecurrence,
  onMove,
  moveLabel = "Alterar data",
  onHistory,
  children,
}: {
  title: string;
  done: boolean;
  /** Sem checkbox (tarefa organizadora: não se conclui, só agrupa subtarefas). */
  onToggle?: () => void;
  onHistory?: () => void;
  time?: string;
  accent?: keyof typeof CARD_ACCENT;
  important?: boolean;
  /** Prazo, recorrência, categoria… (texto pequeno, uma linha que quebra no celular). */
  meta?: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  onEndRecurrence?: () => void;
  onMove?: (date: string) => void;
  moveLabel?: string;
  children?: React.ReactNode;
}) {
  const hasMenu = onEdit || onDelete || onEndRecurrence || onHistory;
  return (
    <article className={cn("rounded-xl border border-l-[3px] border-border/70 bg-card px-3 py-2.5 shadow-sm shadow-black/10 transition-colors", CARD_ACCENT[accent], done && "opacity-70")}>
      <div className="flex items-start gap-2">
        {/* Área de toque de 44px em volta do checkbox (celular). */}
        {onToggle ? (
          <label className="-my-1.5 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
            <Checkbox checked={done} onCheckedChange={onToggle} aria-label={`${done ? "Reabrir" : "Concluir"}: ${title}`} className="h-5 w-5" />
          </label>
        ) : (
          <span className="-my-1.5 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
            <FolderTree className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-medium leading-snug text-foreground", done && "text-muted-foreground")}>
            {time && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-px text-xs font-semibold tabular-nums text-primary">{time}</span>}
            <span className={cn("min-w-0 break-words", done && "line-through")}>{title}</span>
            {important && !done && <Badge variant="destructive" className="h-5 border-0 px-1.5 text-[10px]">Importante</Badge>}
          </p>
          {meta && <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">{meta}</div>}
        </div>
        <div className="-mr-1 flex shrink-0 items-center">
          {onMove && (
            <MoveDatePopover onMove={onMove}>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={moveLabel} title={moveLabel}>
                <CalendarClock className="h-4 w-4" />
              </Button>
            </MoveDatePopover>
          )}
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`Mais ações: ${title}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>}
                {onHistory && <DropdownMenuItem onClick={onHistory}><History className="h-4 w-4" /> Histórico de execuções</DropdownMenuItem>}
                {onEndRecurrence && <DropdownMenuItem onClick={onEndRecurrence}><CircleStop className="h-4 w-4" /> Encerrar repetição</DropdownMenuItem>}
                {onDelete && <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Excluir</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {children && <div className="sm:pl-9">{children}</div>}
    </article>
  );
}
