"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowUp, ArrowDown, AlignLeft, SlidersHorizontal, CalendarClock, Flag, Repeat, History, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { SubtaskDescriptionField, SubtaskDetailsFields } from "@/components/shared/subtask-fields";
import { listSubtasks, saveSubtask, setSubtaskDone, setSubtaskOccurrenceDone, setSubtaskPriority, deleteSubtask, moveSubtask, type Subtask, type SubtaskParent } from "@/lib/supabase/subtask-actions";
import { EMPTY_SUBTASK_DRAFT, subtaskDraftToInput, validateSubtaskDraft, type SubtaskDraft } from "@/lib/subtask-draft";
import { groupSubtasks, normalizeReminderOffsets, type SubtaskEntry } from "@/lib/task-schedule";
import { isRecurringSubtask, missedSubtaskDates, resolveSubtasksForDay, subtaskHistory } from "@/lib/subtask-recurrence";
import { filterChecklist, type ChecklistFilter } from "@/lib/checklist-priority";
import { formatWeekdays } from "@/lib/tasks";
import { nowTimeSaoPaulo, parseLocalDate, todayKeySaoPaulo, weekdayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type ActionResult = { error?: string; warning?: string; pendingChecklist?: string[] };

function shortDay(dateKey: string) {
  const d = parseLocalDate(dateKey);
  return `${weekdayLabel(d.getDay()).slice(0, 3)} ${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

type FormState = SubtaskDraft & { showDescription: boolean; showMore: boolean };

const EMPTY_FORM: FormState = { ...EMPTY_SUBTASK_DRAFT, showDescription: false, showMore: false };

/** Celular (abaixo de `sm`): o formulário abre em diálogo próprio, com rolagem vertical. */
const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

/** Comando "Expandir todas / Recolher todas" vindo da página (muda `version` a cada clique). */
export type ExpandSignal = { open: boolean; version: number };

/**
 * Subtarefas de UMA tarefa (pessoal, CLT ou Visionário) — o mesmo
 * componente na página Tarefas, no Meu Dia e na Minha Rotina. Lê e grava
 * sempre o registro original em `task_subtasks`: concluir aqui conclui em
 * todas as telas (router.refresh via `onChanged`).
 *
 * Subtarefa recorrente (programação própria): o checkbox conclui SÓ a
 * execução do dia exibido; dias anteriores pendentes aparecem com a data.
 *
 * Organização (ordem fixa): 1. Para fazer hoje → 2. Atrasadas → 3. Todas.
 */
export function Subtasks({
  parentType,
  parentId,
  initialOpen = false,
  initialItems,
  dateKey,
  onChanged,
  embedded = false,
  expandSignal,
}: {
  /** Dentro do card da tarefa (Tarefas/Meu Dia): sem caixa própria, separador no topo e linha lateral nas subtarefas. */
  embedded?: boolean;
  parentType: SubtaskParent;
  parentId: string;
  initialOpen?: boolean;
  /** Já carregadas no servidor (Rotina/Meu Dia) — evita o carregamento ao abrir. */
  initialItems?: Subtask[];
  /** Dia de referência de "Para fazer hoje" (Rotina pode olhar outro dia). Padrão: hoje em São Paulo. */
  dateKey?: string;
  /** Chamado depois de qualquer alteração gravada (ex.: router.refresh no pai). */
  onChanged?: () => void;
  expandSignal?: ExpandSignal;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [items, setItems] = useState<Subtask[]>(initialItems ?? []);
  const [loaded, setLoaded] = useState(!!initialItems);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [parentForNew, setParentForNew] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<boolean | null>(null);
  const [phoneForm, setPhoneForm] = useState(false);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  /** Itens do checklist que impediram a conclusão (destacados até serem marcados). */
  const [blocking, setBlocking] = useState<string[]>([]);
  const [checklistFilter, setChecklistFilter] = useState<ChecklistFilter>({ priority: "todos", importantFirst: true });
  const [pending, start] = useTransition();

  // Dados novos do servidor (outra tela concluiu/editou) substituem os locais.
  const [lastInitial, setLastInitial] = useState(initialItems);
  if (initialItems && initialItems !== lastInitial) {
    setLastInitial(initialItems);
    setItems(initialItems);
  }
  // Expandir/Recolher todas (comando da página): abre a lista e os checklists.
  const [lastSignal, setLastSignal] = useState(expandSignal?.version);
  if (expandSignal && expandSignal.version !== lastSignal) {
    setLastSignal(expandSignal.version);
    setOpen(expandSignal.open);
    setShowAll(expandSignal.open ? true : null);
    setExpanded(expandSignal.open ? items.filter((x) => items.some((c) => c.parent_subtask_id === x.id)).map((x) => x.id) : []);
  }

  async function reload() {
    try { setItems(await listSubtasks(parentType, parentId)); setLoaded(true); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar subtarefas."); }
  }
  // reload() só altera estado depois do await (carregamento sob demanda ao abrir).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (open && !loaded) void reload(); }, [open, loaded, parentId]);

  const todayKey = todayKeySaoPaulo();
  const dayKey = dateKey ?? todayKey;
  // Recorrentes viram "a execução deste dia"; as demais ficam como estão.
  const resolved = resolveSubtasksForDay(items, dayKey);
  const sections = groupSubtasks(resolved, { todayKey, nowTime: nowTimeSaoPaulo(), dateKey: dayKey });
  // Recorrente sem execução hoje mas com dia anterior pendente: também é "atrasada" (com as datas).
  const inSections = new Set([...sections.today, ...sections.overdue].map((e) => e.subtask.id));
  const missedOnly = dayKey === todayKey
    ? sections.all.filter((e) => !e.subtask.parent_subtask_id && !inSections.has(e.subtask.id) && missedSubtaskDates(items.find((x) => x.id === e.subtask.id) ?? e.subtask, todayKey).length > 0)
    : [];
  const highlighted = new Map<string, "hoje" | "atrasada">([
    ...sections.today.map((e) => [e.subtask.id, "hoje"] as const),
    ...sections.overdue.map((e) => [e.subtask.id, "atrasada"] as const),
    ...missedOnly.map((e) => [e.subtask.id, "atrasada"] as const),
  ]);
  const hasHighlights = highlighted.size > 0;
  const allOpen = showAll ?? !hasHighlights;
  const roots = resolved.filter(x => !x.parent_subtask_id);
  const viewingToday = dayKey === todayKey;
  const rawById = new Map(items.map((x) => [x.id, x]));

  function patch(values: Partial<FormState>) { setForm(f => ({ ...f, ...values })); }
  function resetForm() { setForm(EMPTY_FORM); setEditing(null); setParentForNew(null); }
  /** Nova subtarefa (ou item do checklist de `parent`). No celular abre o diálogo. */
  function startNew(parent: string | null = null) {
    resetForm();
    setParentForNew(parent);
    if (isPhone()) { setForm({ ...EMPTY_FORM, showDescription: true, showMore: true }); setPhoneForm(true); }
  }
  function startEdit(item: Subtask) {
    const raw = rawById.get(item.id) ?? item;
    setEditing(raw.id); setParentForNew(raw.parent_subtask_id);
    const weekly = isRecurringSubtask(raw);
    const showMore = weekly || !!(raw.scheduled_date || raw.scheduled_time || raw.deadline_time || raw.priority === "importante" || raw.reminder_offsets?.length);
    setForm({
      title: raw.title,
      description: raw.description ?? "",
      showDescription: !!raw.description,
      scheduledDate: weekly ? "" : raw.scheduled_date ?? "",
      scheduledTime: raw.scheduled_time?.slice(0, 5) ?? "",
      dueDate: weekly ? "" : raw.due_date ?? "",
      deadlineTime: raw.deadline_time?.slice(0, 5) ?? "",
      priority: raw.priority === "importante" ? "importante" : "normal",
      reminders: normalizeReminderOffsets(raw.reminder_offsets),
      recurrence: weekly ? "weekly" : "none",
      weekdays: raw.weekdays ?? [],
      recurrenceStart: weekly ? raw.recurrence_start ?? "" : "",
      recurrenceUntil: weekly ? raw.recurrence_until ?? "" : "",
      showMore,
    });
    if (isPhone()) setPhoneForm(true);
  }

  /** Marca/desmarca. Recorrente: SÓ a execução de `date` (padrão: o dia exibido). */
  function toggleDone(item: Subtask, checked: boolean, date: string = dayKey) {
    const raw = rawById.get(item.id) ?? item;
    const recurring = isRecurringSubtask(raw);
    const optimistic = (done: boolean) => (current: Subtask[]) => current.map((x) => {
      if (x.id !== item.id) return x;
      if (!recurring) return { ...x, is_done: done };
      const others = (x.occurrences ?? []).filter((o) => o.occurrence_date !== date);
      return { ...x, occurrences: [...others, { subtask_id: x.id, occurrence_date: date, status: done ? "concluida" as const : "pendente" as const, completed_at: done ? new Date().toISOString() : null }] };
    });
    const before = items;
    setItems(optimistic(checked));
    if (checked) setBlocking((b) => b.filter((id) => id !== item.id));
    start(async () => {
      try {
        const result = recurring
          ? await setSubtaskOccurrenceDone(parentType, parentId, item.id, date, checked)
          : await setSubtaskDone(parentType, parentId, item.id, checked);
        if (result.error) {
          setItems(before);
          toast.error(result.error);
          // Checklist pendente: abre o checklist e destaca o que falta.
          if (result.pendingChecklist?.length) {
            setOpen(true); setShowAll(true);
            setExpanded((a) => (a.includes(item.id) ? a : [...a, item.id]));
            setBlocking(result.pendingChecklist);
          }
        } else onChanged?.();
      } catch (error) {
        setItems(before);
        toast.error(error instanceof Error ? error.message : "Erro ao salvar subtarefa.");
      }
    });
  }
  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      try {
        const r = await action();
        if (r.error) toast.error(r.error);
        else { if (r.warning) toast.warning(r.warning); await reload(); onChanged?.(); }
      }
      catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
    });
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const draft: SubtaskDraft = parentForNew ? { ...form, recurrence: "none", weekdays: [] } : form;
    const invalid = validateSubtaskDraft(draft);
    if (invalid) { toast.error(invalid); return; }
    run(async () => {
      const r = await saveSubtask(parentType, parentId, {
        ...subtaskDraftToInput(draft, form.showDescription || !!editing),
        id: editing ?? undefined,
        parentSubtaskId: parentForNew,
      });
      if (!r.error) { resetForm(); setPhoneForm(false); }
      return r;
    });
  }
  function togglePriority(item: Subtask) {
    const next = item.priority === "importante" ? "normal" : "importante";
    setItems((current) => current.map((x) => (x.id === item.id ? { ...x, priority: next } : x)));
    run(() => setSubtaskPriority(parentType, parentId, item.id, next));
  }

  function scheduleMeta(entry: SubtaskEntry) {
    const { schedule, state, subtask } = entry;
    const raw = rawById.get(subtask.id) ?? subtask;
    const recurring = isRecurringSubtask(raw);
    return <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      {recurring && <span className="inline-flex items-center gap-0.5"><Repeat className="h-3 w-3"/>{formatWeekdays(raw.weekdays ?? [])}{raw.scheduled_time && ` · ${raw.scheduled_time.slice(0, 5)}`}</span>}
      {recurring && subtask.day && !subtask.day.occurs && subtask.day.nextDate && <span>Próxima: {shortDay(subtask.day.nextDate)}</span>}
      {!recurring && schedule.executionDate && <span className={cn(state.executionOverdue && "font-medium text-warning")}>
        <CalendarClock className="mr-0.5 inline h-3 w-3"/>Fazer {shortDay(schedule.executionDate)}{schedule.executionTime && ` · ${schedule.executionTime}`}
      </span>}
      {schedule.deadlineDate && <span className={cn(state.deadlineOverdue && "font-medium text-destructive", state.deadlineToday && "font-medium text-foreground")}>
        <Flag className="mr-0.5 inline h-3 w-3"/>Prazo {shortDay(schedule.deadlineDate)}{schedule.deadlineTime && ` · ${schedule.deadlineTime}`}
      </span>}
      {subtask.priority === "importante" && <Badge variant="destructive" className="h-5 border-0 px-1.5 text-[10px]">Importante</Badge>}
      {entry.parentTitle && <span>em {entry.parentTitle}</span>}
    </div>;
  }

  /** Execuções anteriores pendentes de uma recorrente — cada dia com o próprio checkbox. */
  function missedRow(item: Subtask) {
    const raw = rawById.get(item.id);
    if (!raw || !isRecurringSubtask(raw) || !viewingToday) return null;
    const missed = missedSubtaskDates(raw, todayKey);
    if (!missed.length) return null;
    return <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-7 text-[11px]">
      <span className="font-medium text-warning">Pendente:</span>
      {missed.map((d) => <label key={d} className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-amber-400/50 px-1.5">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={false} onChange={(e) => toggleDone(item, e.target.checked, d)} aria-label={`Concluir ${item.title} de ${shortDay(d)}`}/>{shortDay(d)}
      </label>)}
    </div>;
  }

  function historyPanel(item: Subtask) {
    const raw = rawById.get(item.id);
    if (!raw || historyOf !== item.id) return null;
    const history = subtaskHistory(raw, todayKey);
    return <div className="ml-7 mt-1.5 rounded-md bg-muted/40 p-2 text-[11px]">
      <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Histórico de execuções</p>
      {history.length === 0 ? <p className="text-muted-foreground">Nenhuma execução ainda.</p> : <ul className="grid grid-cols-1 gap-0.5 min-[400px]:grid-cols-2">
        {history.map((h) => <li key={h.date} className="flex items-center justify-between gap-2"><span>{shortDay(h.date)}{h.date === todayKey && " (hoje)"}</span><span className={h.done ? "text-emerald-500" : h.date < todayKey ? "text-warning" : "text-muted-foreground"}>{h.done ? "Concluída" : h.date < todayKey ? "Pendente" : "A fazer"}</span></li>)}
      </ul>}
    </div>;
  }

  function overdueBadges(entry: SubtaskEntry) {
    return <div className="mt-1 flex flex-wrap gap-1">
      {entry.state.deadlineOverdue && <Badge variant="destructive" className="border-0">Prazo final vencido{entry.schedule.deadlineDate ? ` · ${shortDay(entry.schedule.deadlineDate)}` : ""}</Badge>}
      {entry.state.executionOverdue && <Badge variant="warning" className="border-0">Execução prevista {entry.schedule.executionDate ? shortDay(entry.schedule.executionDate) : ""}</Badge>}
    </div>;
  }

  function checkbox(item: Subtask) {
    const notToday = !!item.day && !item.day.occurs;
    return <input aria-label={`${item.is_done ? "Reabrir" : "Concluir"} ${item.title}${item.day?.occurs ? ` (${shortDay(dayKey)})` : ""}`} type="checkbox" className="h-5 w-5 shrink-0 accent-primary disabled:opacity-40" disabled={notToday} title={notToday ? "Esta subtarefa não se repete neste dia" : undefined} checked={item.is_done} onChange={e => toggleDone(item, e.target.checked)}/>;
  }

  function iconButton(label: string, onClick: () => void, children: React.ReactNode, disabled?: boolean, pressed?: boolean) {
    return <button key={label} type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40">{children}</button>;
  }

  /** Card de destaque (hoje/atrasadas): concluir, ver datas e editar sem sair da tela. */
  function highlightRow(entry: SubtaskEntry, overdue?: boolean) {
    const item = entry.subtask;
    const tone = overdue ? (entry.state.deadlineOverdue ? "border-destructive/60" : "border-amber-400/60") : embedded ? "border-primary/50" : "border-border";
    return <div key={entry.subtask.id} className={cn(embedded ? "border-l-2 py-1 pl-2.5 pr-1" : "rounded-md border p-2", tone, item.is_done && "opacity-60")}>
      <div className="flex min-h-10 items-center gap-2">
        {checkbox(item)}
        <div className="min-w-0 flex-1">
          <span className={cn("break-words", item.is_done && "line-through text-muted-foreground")}>{item.title}</span>
          {scheduleMeta(entry)}
          {overdue && overdueBadges(entry)}
        </div>
        {isRecurringSubtask(rawById.get(item.id) ?? item) && iconButton(historyOf === item.id ? "Fechar histórico" : "Ver histórico de execuções", () => setHistoryOf((h) => (h === item.id ? null : item.id)), <History className="h-4 w-4"/>, false, historyOf === item.id)}
        {iconButton(`Editar ${item.title}`, () => startEdit(item), <Pencil className="h-4 w-4"/>, pending)}
      </div>
      <ExpandableDescription text={item.description} className="pl-7"/>
      {missedRow(item)}
      {historyPanel(item)}
    </div>;
  }

  const entryById = new Map(sections.all.map(e => [e.subtask.id, e]));
  function tag(id: string) {
    const h = highlighted.get(id);
    if (!h) return null;
    return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", h === "hoje" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{h === "hoje" ? (viewingToday ? "↑ Hoje" : "↑ Neste dia") : "↑ Atrasada"}</span>;
  }

  const hasAnyChecklist = resolved.some((x) => x.parent_subtask_id);
  const hasItems = loaded && items.length > 0;
  const missedCount = viewingToday ? items.filter((x) => !x.parent_subtask_id).reduce((n, x) => n + missedSubtaskDates(x, todayKey).length, 0) : 0;
  return <div className={cn("text-sm", embedded ? "mt-2.5 border-t border-border/60 pt-1.5" : "mt-2 rounded-lg border border-border/70 p-2")}>
    <button type="button" className={cn("flex w-full items-center justify-between gap-2 text-left", embedded ? "min-h-9 text-xs" : "min-h-9")} aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className={cn("flex items-center gap-1", embedded ? "font-medium text-muted-foreground" : "font-medium")}>
        {open ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
        {embedded ? (hasItems ? <>Subtarefas <span className="tabular-nums text-foreground">{sections.done}/{sections.total}</span></> : loaded ? "Adicionar subtarefas" : "Subtarefas") : <>Subtarefas {loaded ? `(${sections.done}/${sections.total})` : ""}</>}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {loaded && sections.overdue.length + missedCount > 0 && <span className="font-medium text-destructive">{sections.overdue.length + missedCount} atrasada{sections.overdue.length + missedCount > 1 ? "s" : ""}</span>}
        {loaded && sections.today.some(e => !e.subtask.is_done) && <span className="font-medium text-primary">{sections.today.filter(e => !e.subtask.is_done).length} {viewingToday ? "hoje" : "no dia"}</span>}
        {hasItems && embedded && <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-secondary min-[400px]:block" role="progressbar" aria-valuenow={sections.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso das subtarefas"><span className="block h-full bg-primary/80 transition-all" style={{width: `${sections.progress}%`}}/></span>}
        {hasItems && <span className="tabular-nums">{sections.progress}%</span>}
      </span>
    </button>
    {hasItems && !embedded && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={sections.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso das subtarefas"><div className="h-full bg-primary transition-all" style={{width: `${sections.progress}%`}}/></div>}
    {open && <div className={cn("space-y-4", embedded ? "mt-2 pl-1" : "mt-3")}>
      {sections.today.length > 0 && <section aria-label="Para fazer hoje">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">{viewingToday ? "Para fazer hoje" : `Para fazer em ${shortDay(dayKey)}`} ({sections.today.length})</h4>
        <div className="space-y-2">{sections.today.map(e => highlightRow(e))}</div>
      </section>}

      {sections.overdue.length + missedOnly.length > 0 && <section aria-label="Atrasadas">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">Atrasadas ({sections.overdue.length + missedOnly.length})</h4>
        <div className="space-y-2">{sections.overdue.map(e => highlightRow(e, true))}{missedOnly.map(e => highlightRow(e))}</div>
      </section>}

      <section aria-label="Todas as subtarefas">
        <button type="button" className="mb-1.5 flex min-h-9 w-full items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-expanded={allOpen} onClick={() => setShowAll(!allOpen)}>
          {allOpen ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>} Todas as subtarefas ({roots.length})
          {hasHighlights && <span className="ml-1 font-normal normal-case tracking-normal">· {highlighted.size} destacada{highlighted.size > 1 ? "s" : ""} acima</span>}
        </button>
        {allOpen && hasAnyChecklist && <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]" role="group" aria-label="Filtro dos checklists">
          <span className="text-muted-foreground">Checklists:</span>
          {(["todos", "importante", "normal"] as const).map((p) => <button key={p} type="button" aria-pressed={checklistFilter.priority === p} onClick={() => setChecklistFilter((f) => ({ ...f, priority: p }))} className={cn("min-h-8 rounded-md border px-2", checklistFilter.priority === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{p === "todos" ? "Todos" : p === "importante" ? "Importantes" : "Normais"}</button>)}
          <button type="button" aria-pressed={checklistFilter.importantFirst} onClick={() => setChecklistFilter((f) => ({ ...f, importantFirst: !f.importantFirst }))} className={cn("min-h-8 rounded-md border px-2", checklistFilter.importantFirst ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>Importantes primeiro</button>
        </div>}
        {allOpen && <div className={embedded ? "space-y-1.5" : "space-y-2"}>
          {roots.length === 0 && <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Nenhuma subtarefa ainda.</p>}
          {roots.map((item, i) => {
            const entry = entryById.get(item.id)!;
            const allChildren = resolved.filter(x => x.parent_subtask_id === item.id);
            const children = filterChecklist(allChildren, checklistFilter);
            const doneChildren = allChildren.filter((c) => c.is_done).length;
            const recurring = isRecurringSubtask(rawById.get(item.id) ?? item);
            return <div key={item.id} className={embedded ? "border-l-2 border-border/80 py-0.5 pl-2" : "rounded-md border p-2"}><div className="flex min-h-10 flex-wrap items-center gap-1 sm:flex-nowrap">
              {checkbox(item)}
              <div className="min-w-0 flex-1 basis-40 pl-1">
                <span className={"break-words " + (item.is_done ? "line-through text-muted-foreground" : "")}>{item.title}</span> {tag(item.id)}
                {scheduleMeta(entry)}
              </div>
              <div className="flex items-center">
                {iconButton("Subir", () => run(() => moveSubtask(parentType,parentId,item.id,-1)), <ArrowUp className="h-4 w-4"/>, pending || i === 0)}
                {iconButton("Descer", () => run(() => moveSubtask(parentType,parentId,item.id,1)), <ArrowDown className="h-4 w-4"/>, pending || i === roots.length-1)}
                {recurring && iconButton(historyOf === item.id ? "Fechar histórico" : "Ver histórico de execuções", () => setHistoryOf((h) => (h === item.id ? null : item.id)), <History className="h-4 w-4"/>, false, historyOf === item.id)}
                {iconButton("Adicionar checklist", () => {startNew(item.id);setExpanded(a=>a.includes(item.id)?a:[...a,item.id]);}, <Plus className="h-4 w-4"/>, pending)}
                <button type="button" className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-primary" aria-label={`Mostrar checklist de ${item.title}`} aria-expanded={expanded.includes(item.id)} onClick={()=>setExpanded(a=>a.includes(item.id)?a.filter(x=>x!==item.id):[...a,item.id])}>{expanded.includes(item.id)?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>} Checklist {allChildren.length ? <span className="tabular-nums">{doneChildren}/{allChildren.length}</span> : "(0)"}</button>
                {iconButton("Editar", () => startEdit(item), <Pencil className="h-4 w-4"/>, pending)}
                {iconButton("Excluir", () => {if(confirm(recurring ? "Excluir esta subtarefa? Se já tiver execuções registradas, o histórico é mantido." : "Excluir esta subtarefa?"))run(() => deleteSubtask(parentType,parentId,item.id));}, <Trash2 className="h-4 w-4"/>, pending)}
              </div>
            </div>
            <ExpandableDescription text={item.description} className="pl-7"/>
            {!highlighted.has(item.id) && missedRow(item)}
            {!highlighted.has(item.id) && historyPanel(item)}
            {expanded.includes(item.id) && <div className="ml-5 mt-2 space-y-2 border-l pl-3">
              {children.length === 0 && allChildren.length > 0 && <p className="text-[11px] text-muted-foreground">Nenhum item com esse filtro.</p>}
              {children.map(child=><div key={child.id} className={cn("rounded-md bg-muted/40 p-2", blocking.includes(child.id) && !child.is_done && "ring-2 ring-amber-400/70")}><div className="flex items-center gap-2">
                {checkbox(child)}
                <div className="min-w-0 flex-1"><span className={`break-words ${child.is_done?"line-through text-muted-foreground":""}`}>{child.title}</span> {tag(child.id)}{scheduleMeta(entryById.get(child.id)!)}</div>
                {iconButton(child.priority === "importante" ? `Marcar como normal: ${child.title}` : `Marcar como importante: ${child.title}`, () => togglePriority(child), <Star className={cn("h-4 w-4", child.priority === "importante" && "fill-current text-destructive")}/>, pending, child.priority === "importante")}
                {iconButton("Editar item", ()=>startEdit(child), <Pencil className="h-4 w-4"/>)}
                {iconButton("Excluir item", ()=>{if(confirm("Excluir este item?"))run(()=>deleteSubtask(parentType,parentId,child.id));}, <Trash2 className="h-4 w-4"/>)}
              </div><ExpandableDescription text={child.description} className="pl-7"/></div>)}
              <button type="button" className="min-h-9 text-xs text-primary" onClick={()=>startNew(item.id)}>+ Novo item nesta etapa</button>
            </div>}
            </div>;
          })}
        </div>}
      </section>

      {/* PC: criação/edição inline, como sempre foi. */}
      {(parentForNew || editing) && !phoneForm && <div className="hidden items-center justify-between rounded-md bg-muted p-2 text-xs sm:flex"><span>{editing ? `Editando: ${items.find(x=>x.id===editing)?.title ?? ""}` : `Adicionando item em: ${roots.find(x=>x.id===parentForNew)?.title}`}</span><button type="button" className="min-h-8 px-2" onClick={resetForm}>✕ Cancelar</button></div>}
      <form className="hidden min-w-0 flex-wrap gap-2 sm:flex" onSubmit={submit}>
        <Input className="min-w-40 flex-1" placeholder={parentForNew ? "Novo item do checklist" : "Nova subtarefa"} value={form.title} onChange={e=>patch({title:e.target.value})} required maxLength={300} aria-label="Título da subtarefa"/>
        {parentForNew && <div className="flex items-center gap-1" role="group" aria-label="Prioridade do item">
          {(["normal", "importante"] as const).map((p) => <Button key={p} type="button" size="sm" className="h-9" variant={form.priority === p ? "default" : "outline"} aria-pressed={form.priority === p} onClick={() => patch({ priority: p })}>{p === "normal" ? "Normal" : "Importante"}</Button>)}
        </div>}
        <Button size="sm" type="submit" className="h-9" disabled={pending || !form.title.trim()}><Plus className="h-4 w-4"/>{editing ? "Salvar" : "Adicionar"}</Button>
        <div className="flex basis-full flex-wrap gap-3">
          <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs text-primary" aria-expanded={form.showMore} onClick={()=>patch({showMore:!form.showMore})}><SlidersHorizontal className="h-3 w-3"/>{form.showMore ? "Menos opções" : parentForNew ? "Datas e lembretes" : "Programação, prioridade e lembretes"}</button>
          {!form.showDescription && <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs text-primary" onClick={()=>patch({showDescription:true})}><AlignLeft className="h-3 w-3"/>Adicionar descrição</button>}
        </div>
        {form.showMore && <SubtaskDetailsFields idPrefix={`inline-${parentId}`} value={form} onChange={patch} allowRecurrence={!parentForNew} className="basis-full rounded-md border border-border p-2"/>}
        {form.showDescription && <div className="basis-full"><SubtaskDescriptionField id={`inline-desc-${parentId}`} value={form.description} onChange={v=>patch({description:v})}/></div>}
      </form>
      {/* Celular: botão grande que abre o formulário completo em diálogo. */}
      <Button type="button" variant="outline" className="h-10 w-full sm:hidden" disabled={pending} onClick={()=>startNew()}><Plus className="h-4 w-4"/>Adicionar subtarefa</Button>
    </div>}
    <Dialog open={phoneForm} onOpenChange={o=>{setPhoneForm(o); if(!o) resetForm();}}>
      {phoneForm && <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar subtarefa" : parentForNew ? "Novo item do checklist" : "Nova subtarefa"}</DialogTitle>
          {parentForNew && !editing && <p className="text-xs text-muted-foreground">Em: {roots.find(x=>x.id===parentForNew)?.title}</p>}
        </DialogHeader>
        <form className="flex max-h-[70vh] min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1" onSubmit={submit}>
          <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`phone-title-${parentId}`}>Título *</Label><Input id={`phone-title-${parentId}`} value={form.title} onChange={e=>patch({title:e.target.value})} required maxLength={300} autoFocus={!editing}/></div>
          <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`phone-desc-${parentId}`}>Descrição</Label><SubtaskDescriptionField id={`phone-desc-${parentId}`} value={form.description} onChange={v=>patch({description:v, showDescription:true})}/></div>
          <SubtaskDetailsFields idPrefix={`phone-${parentId}`} value={form} onChange={patch} allowRecurrence={!parentForNew}/>
          <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={()=>{setPhoneForm(false); resetForm();}}>Cancelar</Button><Button type="submit" disabled={pending || !form.title.trim()}>{pending ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar subtarefa"}</Button></DialogFooter>
        </form>
      </DialogContent>}
    </Dialog>
  </div>;
}
