"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, ChevronDown, ExternalLink, ListTree, Pencil, Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MoveDatePopover } from "@/components/shared/move-date-popover";
import { Subtasks } from "@/components/shared/subtasks";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { groupSection, type BoardItem, type BoardSection, type MyDayBoard, type SectionRow } from "@/lib/my-day-board";
import type { Subtask } from "@/lib/task-schedule";
import { moveTaskDeadlineAction, rescheduleTaskExecutionAction, toggleTaskOccurrenceAction, toggleTaskStatusAction, togglePersonalWorkTaskStatusAction } from "@/lib/supabase/personal-actions";
import { rescheduleSubtaskAction, setSubtaskDone } from "@/lib/supabase/subtask-actions";
import { rescheduleCltTaskAction, toggleCltTaskOccurrenceAction, toggleCltTaskStatusAction } from "@/lib/supabase/clt-actions";
import { updateWorkItemStatusAction } from "@/lib/supabase/work-items-actions";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/database.types";

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const SECTIONS: { id: BoardSection; title: string; empty: string; dot: string }[] = [
  { id: "hoje", title: "Hoje", empty: "Nada programado para hoje.", dot: "bg-primary" },
  { id: "atrasadas", title: "Atrasadas", empty: "Nenhuma tarefa atrasada.", dot: "bg-destructive" },
  { id: "proximas", title: "Próximas", empty: "Nada nos próximos 7 dias.", dot: "bg-muted-foreground" },
  { id: "concluidas", title: "Concluídas", empty: "Nada concluído hoje ainda.", dot: "bg-emerald-500" },
];

/** Cor da borda: vermelho = prazo vencido, amarelo = execução atrasada, verde = concluída, neutro = hoje/próxima. */
const ACCENT: Record<BoardItem["status"], string> = {
  prazo_vencido: "border-l-destructive",
  execucao_atrasada: "border-l-amber-400",
  concluida: "border-l-emerald-500",
  hoje: "border-l-border",
  proxima: "border-l-border",
};

function dateLine(item: BoardItem, todayKey: string): string {
  if (item.status === "concluida") return item.completedOn === todayKey ? "Concluída hoje" : item.completedOn ? `Concluída em ${ddmm(item.completedOn)}` : "Concluída";
  const parts: string[] = [];
  if (item.executionDate) parts.push(`Execução: ${item.executionDate === todayKey ? "hoje" : ddmm(item.executionDate)}${item.executionTime ? ` · ${item.executionTime}` : ""}`);
  if (item.deadlineDate) parts.push(`Prazo final: ${item.deadlineDate === todayKey ? "hoje" : ddmm(item.deadlineDate)}${item.deadlineTime ? ` · ${item.deadlineTime}` : ""}`);
  return parts.join("  ·  ");
}

function hrefOf(item: BoardItem): string {
  if (item.source === "clt") return item.module === "mkt" ? "/visionario/mkt/tarefas" : "/trabalho/tarefas";
  if (item.source === "work") return "/visionario/trabalhos";
  if (item.source === "legacy") return "/trabalho";
  return "/tarefas";
}

function Row({
  item,
  todayKey,
  done,
  onToggle,
  subtasks,
  onEdit,
  onChanged,
  inGroup = false,
  group,
}: {
  /** Subtarefa dentro do agrupamento da tarefa principal (não repete o nome da tarefa). */
  inGroup?: boolean;
  /** Tarefa principal com subtarefas nesta seção: botão de mostrar/recolher. */
  group?: { open: boolean; count: number; onToggle: () => void; controls: string };
  item: BoardItem;
  todayKey: string;
  done: boolean;
  onToggle: (() => void) | null;
  subtasks?: Subtask[];
  onEdit?: (task: Task) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const nested = item.source === "subtask";
  const overdue = item.status === "prazo_vencido" || item.status === "execucao_atrasada";
  const canExpand = item.source === "task" || item.source === "clt" || !!item.description;

  function run(action: () => Promise<{ error?: string; success?: string | boolean }>) {
    start(async () => {
      const r = await action();
      if (r.error) toast.error(r.error);
      else { if (typeof r.success === "string") toast.success(r.success); onChanged(); }
    });
  }

  // Reprogramar: muda só a execução (o prazo final nunca muda junto).
  const reschedule =
    item.source === "task" && !item.recurring ? (d: string) => run(() => rescheduleTaskExecutionAction(item.task.id, d))
    : item.source === "subtask" ? (d: string) => run(() => rescheduleSubtaskAction("pessoal", item.parent.id, item.subtask.id, d))
    : item.source === "clt" && !item.occurrenceDate ? (d: string) => run(() => rescheduleCltTaskAction(item.cltTask.id, d))
    : null;
  const changeDeadline = item.source === "task" && !item.recurring && item.status === "prazo_vencido" ? (d: string) => run(() => moveTaskDeadlineAction(item.task.id, d)) : null;

  return (
    <li className={cn("rounded-lg border border-l-4 bg-card", ACCENT[item.status], nested && "ml-5 sm:ml-7", done && "opacity-80")}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        {/* Área de toque de 44px em volta do checkbox (iPhone). */}
        <label className="-my-2.5 -ml-3 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
          <Checkbox checked={done} disabled={!onToggle || busy} onCheckedChange={() => onToggle?.()} aria-label={`${done ? "Reabrir" : "Concluir"}: ${item.title}`} className="h-5 w-5" />
        </label>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => canExpand && setOpen((v) => !v)} aria-expanded={canExpand ? open : undefined}>
          {nested && !inGroup && <p className="truncate text-[11px] text-muted-foreground">↳ {item.parent.title}</p>}
          <p className={cn("break-words text-sm font-medium", done && "text-muted-foreground line-through")}>
            {item.title}
            {item.important && !done && <span className="ml-1.5 align-middle text-[11px] font-semibold text-destructive">Importante</span>}
          </p>
          <p className={cn("mt-0.5 text-xs", item.status === "concluida" ? "text-emerald-500" : "text-muted-foreground")}>
            {item.areaLabel && <span className="mr-1.5 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-foreground/80">{item.areaLabel}</span>}
            {dateLine(item, todayKey)}
          </p>
          {overdue && (
            <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", item.status === "prazo_vencido" ? "bg-destructive/15 text-destructive" : "bg-amber-400/15 text-amber-300")}>
              {item.status === "prazo_vencido" ? "Prazo vencido" : "Execução atrasada"}
            </span>
          )}
          {item.note && <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Repeat className="h-3 w-3" />{item.note}</p>}
        </button>
        {canExpand && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary" aria-label={open ? "Fechar detalhes" : "Ver detalhes"}>
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>

      {(overdue && (reschedule || changeDeadline)) && !done && (
        <div className="flex flex-wrap gap-2 px-3 pb-2.5 pl-14">
          {reschedule && (
            <MoveDatePopover onMove={reschedule}>
              <Button type="button" variant="outline" size="sm" className="h-9" disabled={busy}><CalendarClock className="h-3.5 w-3.5" /> Reprogramar{item.source === "clt" && item.cltTask.kind === "prazo" ? "" : " execução"}</Button>
            </MoveDatePopover>
          )}
          {changeDeadline && (
            <MoveDatePopover onMove={changeDeadline}>
              <Button type="button" variant="ghost" size="sm" className="h-9" disabled={busy}>Alterar prazo</Button>
            </MoveDatePopover>
          )}
        </div>
      )}

      {group && <GroupToggle {...group} className="px-3 pb-1.5 pl-12" />}

      {open && (
        <div className="space-y-2 border-t px-3 py-2.5 pl-14">
          {item.description && <ExpandableDescription text={item.description} />}
          {item.source === "task" && (
            <Subtasks parentType="pessoal" parentId={item.task.id} initialItems={subtasks ?? []} initialOpen={!!subtasks?.length} onChanged={onChanged} />
          )}
          {item.source === "clt" && <Subtasks parentType="clt" parentId={item.cltTask.id} onChanged={onChanged} />}
          <div className="flex flex-wrap gap-2">
            {item.source === "task" && onEdit && !item.task.archived_at && (
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => onEdit(item.task)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
            )}
            <Button asChild variant="ghost" size="sm" className="h-9"><Link href={hrefOf(item)}><ExternalLink className="h-3.5 w-3.5" /> Abrir na página</Link></Button>
          </div>
        </div>
      )}
    </li>
  );
}

function GroupToggle({ open, count, onToggle, controls, className }: { open: boolean; count: number; onToggle: () => void; controls: string; className?: string }) {
  return (
    <div className={className}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} className="flex min-h-9 items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
        {open ? "Recolher" : "Mostrar"} {count} subtarefa{count > 1 ? "s" : ""}
      </button>
    </div>
  );
}

/**
 * Tarefa principal que aparece SÓ como agrupamento (não está programada
 * para esta seção): sem caixa de concluir e fora da contagem.
 */
function GroupHeader({ parent, count, open, onToggle, controls, onEdit }: { parent: Task; count: number; open: boolean; onToggle: () => void; controls: string; onEdit?: (task: Task) => void }) {
  return (
    <li className="flex items-center gap-1 rounded-lg border border-dashed bg-secondary/30 pr-1">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="min-w-0">
          <span className="block break-words text-sm font-medium">{parent.title}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><ListTree className="h-3 w-3" />Tarefa principal · {count} subtarefa{count > 1 ? "s" : ""}</span>
        </span>
      </button>
      {onEdit && !parent.archived_at && (
        <button type="button" onClick={() => onEdit(parent)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary" aria-label={`Editar tarefa: ${parent.title}`}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <Link href="/tarefas" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary" aria-label={`Abrir na página: ${parent.title}`}>
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </li>
  );
}

/**
 * Meu Dia em quatro seções (regra em lib/my-day-board.ts). Concluir/reabrir
 * usa as ações de sempre de cada módulo; depois a página é recarregada do
 * servidor e o item muda de seção sozinho.
 */
export function MyDayBoardView({ board, todayKey, subtasksByTask, onEditTask }: { board: MyDayBoard; todayKey: string; subtasksByTask: Record<string, Subtask[]>; onEditTask: (task: Task) => void }) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();
  const [showDone, setShowDone] = useState(true);
  // Agrupamentos recolhidos (por seção + tarefa principal). Começam abertos; recolher não muda nada nos dados.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const refresh = () => router.refresh();

  function toggler(item: BoardItem): (() => void) | null {
    const current = overrides[item.key] ?? item.status === "concluida";
    const next = !current;
    let action: (() => Promise<{ error?: string }>) | null = null;
    if (item.source === "task") {
      if (item.recurring) action = item.entry ? () => toggleTaskOccurrenceAction(item.task.id, item.entry!.date, next) : null;
      else action = () => toggleTaskStatusAction(item.task.id, next ? "concluida" : "pendente");
    } else if (item.source === "subtask") action = () => setSubtaskDone("pessoal", item.parent.id, item.subtask.id, next);
    else if (item.source === "clt") action = item.occurrenceDate ? () => toggleCltTaskOccurrenceAction(item.cltTask.id, item.occurrenceDate!, next) : () => toggleCltTaskStatusAction(item.cltTask.id, next);
    else if (item.source === "work") action = () => updateWorkItemStatusAction(item.workItem.id, next ? "concluido" : "pendente");
    else if (item.source === "legacy") action = () => togglePersonalWorkTaskStatusAction(item.workTask.id, next ? "concluida" : "pendente");
    if (!action) return null;
    const run = action;
    return () => {
      setOverrides((o) => ({ ...o, [item.key]: next }));
      start(async () => {
        const r = await run();
        if (r?.error) { toast.error(r.error); setOverrides((o) => ({ ...o, [item.key]: current })); return; }
        router.refresh();
      });
    };
  }

  const counts = { hoje: board.hoje.length, atrasadas: board.atrasadas.length, proximas: board.proximas.length, concluidas: board.concluidas.length };

  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map((section) => {
        const items = board[section.id];
        const collapsible = section.id === "concluidas";
        const visible = !collapsible || showDone;
        return (
          <section key={section.id} aria-labelledby={`meu-dia-${section.id}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id={`meu-dia-${section.id}`} className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn("h-2 w-2 rounded-full", section.dot)} aria-hidden="true" />
                {section.title}
                <span className="text-xs font-normal text-muted-foreground">{counts[section.id]}</span>
              </h2>
              {collapsible && items.length > 0 ? (
                <button type="button" onClick={() => setShowDone((v) => !v)} className="min-h-9 px-1 text-xs text-primary hover:underline" aria-expanded={showDone}>
                  {showDone ? "Recolher" : "Mostrar"}
                </button>
              ) : section.id === "concluidas" ? (
                <Link href="/historico" className="min-h-9 px-1 text-xs text-primary hover:underline">Histórico</Link>
              ) : null}
            </div>
            {items.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                {section.id === "atrasadas" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {section.empty}
              </p>
            ) : visible ? (
              <ul className="flex flex-col gap-2">
                {groupSection(items).map((row: SectionRow) => {
                  const rowProps = (item: BoardItem) => ({
                    item,
                    todayKey,
                    done: overrides[item.key] ?? item.status === "concluida",
                    onToggle: toggler(item),
                    subtasks: item.source === "task" ? subtasksByTask[item.task.id] : undefined,
                    onEdit: onEditTask,
                    onChanged: refresh,
                  });
                  if (row.kind === "item") return <Row key={row.item.key} {...rowProps(row.item)} />;
                  const id = `${section.id}:${row.key}`;
                  const open = !collapsed[id];
                  const toggle = { open, count: row.children.length, controls: `meu-dia-${section.id}-${row.parent.id}`, onToggle: () => setCollapsed((c) => ({ ...c, [id]: open })) };
                  return (
                    <Fragment key={row.key}>
                      {row.parentItem ? <Row {...rowProps(row.parentItem)} group={toggle} /> : <GroupHeader parent={row.parent} onEdit={onEditTask} {...toggle} />}
                      {open && (
                        <li id={toggle.controls} className="list-none">
                          <ul className="flex flex-col gap-2" aria-label={`Subtarefas de ${row.parent.title}`}>
                            {row.children.map((child) => <Row key={child.key} {...rowProps(child)} inGroup />)}
                          </ul>
                        </li>
                      )}
                    </Fragment>
                  );
                })}
              </ul>
            ) : null}
            {section.id === "concluidas" && items.length > 0 && visible && (
              <p className="mt-2 text-right text-xs"><Link href="/historico" className="text-primary hover:underline">Ver histórico</Link></p>
            )}
          </section>
        );
      })}
    </div>
  );
}
