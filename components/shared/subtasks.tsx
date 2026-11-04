"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowUp, ArrowDown, AlignLeft, SlidersHorizontal, CalendarClock, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { SubtaskDescriptionField, SubtaskDetailsFields } from "@/components/shared/subtask-fields";
import { listSubtasks, saveSubtask, setSubtaskDone, deleteSubtask, moveSubtask, type Subtask, type SubtaskParent } from "@/lib/supabase/subtask-actions";
import { EMPTY_SUBTASK_DRAFT, subtaskDraftToInput, validateSubtaskDraft, type SubtaskDraft } from "@/lib/subtask-draft";
import { groupSubtasks, normalizeReminderOffsets, type SubtaskEntry } from "@/lib/task-schedule";
import { nowTimeSaoPaulo, parseLocalDate, todayKeySaoPaulo, weekdayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type ActionResult = { error?: string; warning?: string };

function shortDay(dateKey: string) {
  const d = parseLocalDate(dateKey);
  return `${weekdayLabel(d.getDay()).slice(0, 3)} ${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

type FormState = SubtaskDraft & { showDescription: boolean; showMore: boolean };

const EMPTY_FORM: FormState = { ...EMPTY_SUBTASK_DRAFT, showDescription: false, showMore: false };

/** Celular (abaixo de `sm`): o formulário abre em diálogo próprio, com rolagem vertical. */
const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

/**
 * Subtarefas de UMA tarefa (pessoal, CLT ou Visionário) — o mesmo
 * componente na página Tarefas, no Meu Dia e na Minha Rotina. Lê e grava
 * sempre o registro original em `task_subtasks`: concluir aqui conclui em
 * todas as telas (router.refresh via `onChanged`).
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
  const [pending, start] = useTransition();

  // Dados novos do servidor (outra tela concluiu/editou) substituem os locais.
  const [lastInitial, setLastInitial] = useState(initialItems);
  if (initialItems && initialItems !== lastInitial) {
    setLastInitial(initialItems);
    setItems(initialItems);
  }

  async function reload() {
    try { setItems(await listSubtasks(parentType, parentId)); setLoaded(true); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar subtarefas."); }
  }
  // reload() só altera estado depois do await (carregamento sob demanda ao abrir).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (open && !loaded) void reload(); }, [open, loaded, parentId]);

  const todayKey = todayKeySaoPaulo();
  const sections = groupSubtasks(items, { todayKey, nowTime: nowTimeSaoPaulo(), dateKey: dateKey ?? todayKey });
  const highlighted = new Map<string, "hoje" | "atrasada">([
    ...sections.today.map((e) => [e.subtask.id, "hoje"] as const),
    ...sections.overdue.map((e) => [e.subtask.id, "atrasada"] as const),
  ]);
  const hasHighlights = highlighted.size > 0;
  const allOpen = showAll ?? !hasHighlights;
  const roots = items.filter(x => !x.parent_subtask_id);
  const viewingToday = !dateKey || dateKey === todayKey;

  function patch(values: Partial<FormState>) { setForm(f => ({ ...f, ...values })); }
  function resetForm() { setForm(EMPTY_FORM); setEditing(null); setParentForNew(null); }
  /** Nova subtarefa (ou item do checklist de `parent`). No celular abre o diálogo. */
  function startNew(parent: string | null = null) {
    resetForm();
    setParentForNew(parent);
    if (isPhone()) { setForm({ ...EMPTY_FORM, showDescription: true, showMore: true }); setPhoneForm(true); }
  }
  function startEdit(item: Subtask) {
    setEditing(item.id); setParentForNew(item.parent_subtask_id);
    const showMore = !!(item.scheduled_date || item.scheduled_time || item.deadline_time || item.priority === "importante" || item.reminder_offsets?.length);
    setForm({
      title: item.title,
      description: item.description ?? "",
      showDescription: !!item.description,
      scheduledDate: item.scheduled_date ?? "",
      scheduledTime: item.scheduled_time?.slice(0, 5) ?? "",
      dueDate: item.due_date ?? "",
      deadlineTime: item.deadline_time?.slice(0, 5) ?? "",
      priority: item.priority === "importante" ? "importante" : "normal",
      reminders: normalizeReminderOffsets(item.reminder_offsets),
      showMore,
    });
    if (isPhone()) setPhoneForm(true);
  }
  function toggleDone(item: Subtask, checked: boolean) {
    setItems(current => current.map(x => x.id === item.id ? {...x, is_done: checked} : x));
    start(async () => {
      try {
        const result = await setSubtaskDone(parentType, parentId, item.id, checked);
        if (result.error) {
          setItems(current => current.map(x => x.id === item.id ? {...x, is_done: item.is_done} : x));
          toast.error(result.error);
        } else onChanged?.();
      } catch (error) {
        setItems(current => current.map(x => x.id === item.id ? {...x, is_done: item.is_done} : x));
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
    const invalid = validateSubtaskDraft(form);
    if (invalid) { toast.error(invalid); return; }
    run(async () => {
      const r = await saveSubtask(parentType, parentId, {
        ...subtaskDraftToInput(form, form.showDescription || !!editing),
        id: editing ?? undefined,
        parentSubtaskId: parentForNew,
      });
      if (!r.error) { resetForm(); setPhoneForm(false); }
      return r;
    });
  }

  function scheduleMeta(entry: SubtaskEntry) {
    const { schedule, state, subtask } = entry;
    return <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      {schedule.executionDate && <span className={cn(state.executionOverdue && "font-medium text-warning")}>
        <CalendarClock className="mr-0.5 inline h-3 w-3"/>Fazer {shortDay(schedule.executionDate)}{schedule.executionTime && ` · ${schedule.executionTime}`}
      </span>}
      {schedule.deadlineDate && <span className={cn(state.deadlineOverdue && "font-medium text-destructive", state.deadlineToday && "font-medium text-foreground")}>
        <Flag className="mr-0.5 inline h-3 w-3"/>Prazo {shortDay(schedule.deadlineDate)}{schedule.deadlineTime && ` · ${schedule.deadlineTime}`}
      </span>}
      {subtask.priority === "importante" && <Badge variant="destructive" className="h-5 border-0 px-1.5 text-[10px]">Importante</Badge>}
      {entry.parentTitle && <span>em {entry.parentTitle}</span>}
    </div>;
  }

  function overdueBadges(entry: SubtaskEntry) {
    return <div className="mt-1 flex flex-wrap gap-1">
      {entry.state.deadlineOverdue && <Badge variant="destructive" className="border-0">Prazo final vencido{entry.schedule.deadlineDate ? ` · ${shortDay(entry.schedule.deadlineDate)}` : ""}</Badge>}
      {entry.state.executionOverdue && <Badge variant="warning" className="border-0">Execução prevista {entry.schedule.executionDate ? shortDay(entry.schedule.executionDate) : ""}</Badge>}
    </div>;
  }

  function checkbox(item: Subtask) {
    return <input aria-label={`${item.is_done ? "Reabrir" : "Concluir"} ${item.title}`} type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={item.is_done} onChange={e => toggleDone(item, e.target.checked)}/>;
  }

  function iconButton(label: string, onClick: () => void, children: React.ReactNode, disabled?: boolean) {
    return <button key={label} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40">{children}</button>;
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
        {iconButton(`Editar ${item.title}`, () => startEdit(item), <Pencil className="h-4 w-4"/>, pending)}
      </div>
      <ExpandableDescription text={item.description} className="pl-7"/>
    </div>;
  }

  const entryById = new Map(sections.all.map(e => [e.subtask.id, e]));
  function tag(id: string) {
    const h = highlighted.get(id);
    if (!h) return null;
    return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", h === "hoje" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{h === "hoje" ? (viewingToday ? "↑ Hoje" : "↑ Neste dia") : "↑ Atrasada"}</span>;
  }

  const hasItems = loaded && items.length > 0;
  return <div className={cn("text-sm", embedded ? "mt-2.5 border-t border-border/60 pt-1.5" : "mt-2 rounded-lg border border-border/70 p-2")}>
    <button type="button" className={cn("flex w-full items-center justify-between gap-2 text-left", embedded ? "min-h-9 text-xs" : "min-h-9")} aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className={cn("flex items-center gap-1", embedded ? "font-medium text-muted-foreground" : "font-medium")}>
        {open ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
        {embedded ? (hasItems ? <>Subtarefas <span className="tabular-nums text-foreground">{sections.done}/{sections.total}</span></> : loaded ? "Adicionar subtarefas" : "Subtarefas") : <>Subtarefas {loaded ? `(${sections.done}/${sections.total})` : ""}</>}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {loaded && sections.overdue.length > 0 && <span className="font-medium text-destructive">{sections.overdue.length} atrasada{sections.overdue.length > 1 ? "s" : ""}</span>}
        {loaded && sections.today.some(e => !e.subtask.is_done) && <span className="font-medium text-primary">{sections.today.filter(e => !e.subtask.is_done).length} {viewingToday ? "hoje" : "no dia"}</span>}
        {hasItems && embedded && <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-secondary min-[400px]:block" role="progressbar" aria-valuenow={sections.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso das subtarefas"><span className="block h-full bg-primary/80 transition-all" style={{width: `${sections.progress}%`}}/></span>}
        {hasItems && <span className="tabular-nums">{sections.progress}%</span>}
      </span>
    </button>
    {hasItems && !embedded && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={sections.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso das subtarefas"><div className="h-full bg-primary transition-all" style={{width: `${sections.progress}%`}}/></div>}
    {open && <div className={cn("space-y-4", embedded ? "mt-2 pl-1" : "mt-3")}>
      {sections.today.length > 0 && <section aria-label="Para fazer hoje">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">{viewingToday ? "Para fazer hoje" : `Para fazer em ${shortDay(dateKey!)}`} ({sections.today.length})</h4>
        <div className="space-y-2">{sections.today.map(e => highlightRow(e))}</div>
      </section>}

      {sections.overdue.length > 0 && <section aria-label="Atrasadas">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">Atrasadas ({sections.overdue.length})</h4>
        <div className="space-y-2">{sections.overdue.map(e => highlightRow(e, true))}</div>
      </section>}

      <section aria-label="Todas as subtarefas">
        <button type="button" className="mb-1.5 flex min-h-9 w-full items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-expanded={allOpen} onClick={() => setShowAll(!allOpen)}>
          {allOpen ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>} Todas as subtarefas ({items.length})
          {hasHighlights && <span className="ml-1 font-normal normal-case tracking-normal">· {highlighted.size} destacada{highlighted.size > 1 ? "s" : ""} acima</span>}
        </button>
        {allOpen && <div className={embedded ? "space-y-1.5" : "space-y-2"}>
          {roots.length === 0 && <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Nenhuma subtarefa ainda.</p>}
          {roots.map((item, i) => {
            const entry = entryById.get(item.id)!;
            const children = items.filter(x => x.parent_subtask_id === item.id);
            return <div key={item.id} className={embedded ? "border-l-2 border-border/80 py-0.5 pl-2" : "rounded-md border p-2"}><div className="flex min-h-10 flex-wrap items-center gap-1 sm:flex-nowrap">
              {checkbox(item)}
              <div className="min-w-0 flex-1 basis-40 pl-1">
                <span className={"break-words " + (item.is_done ? "line-through text-muted-foreground" : "")}>{item.title}</span> {tag(item.id)}
                {scheduleMeta(entry)}
              </div>
              <div className="flex items-center">
                {iconButton("Subir", () => run(() => moveSubtask(parentType,parentId,item.id,-1)), <ArrowUp className="h-4 w-4"/>, pending || i === 0)}
                {iconButton("Descer", () => run(() => moveSubtask(parentType,parentId,item.id,1)), <ArrowDown className="h-4 w-4"/>, pending || i === roots.length-1)}
                {iconButton("Adicionar checklist", () => {startNew(item.id);setExpanded(a=>a.includes(item.id)?a:[...a,item.id]);}, <Plus className="h-4 w-4"/>, pending)}
                <button type="button" className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-primary" aria-label={`Mostrar checklist de ${item.title}`} aria-expanded={expanded.includes(item.id)} onClick={()=>setExpanded(a=>a.includes(item.id)?a.filter(x=>x!==item.id):[...a,item.id])}>{expanded.includes(item.id)?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>} Checklist ({children.length})</button>
                {iconButton("Editar", () => startEdit(item), <Pencil className="h-4 w-4"/>, pending)}
                {iconButton("Excluir", () => {if(confirm("Excluir esta subtarefa?"))run(() => deleteSubtask(parentType,parentId,item.id));}, <Trash2 className="h-4 w-4"/>, pending)}
              </div>
            </div>
            <ExpandableDescription text={item.description} className="pl-7"/>
            {expanded.includes(item.id) && <div className="ml-5 mt-2 space-y-2 border-l pl-3">
              {children.map(child=><div key={child.id} className="rounded-md bg-muted/40 p-2"><div className="flex items-center gap-2">
                {checkbox(child)}
                <div className="min-w-0 flex-1"><span className={`break-words ${child.is_done?"line-through text-muted-foreground":""}`}>{child.title}</span> {tag(child.id)}{scheduleMeta(entryById.get(child.id)!)}</div>
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
        <Button size="sm" type="submit" className="h-9" disabled={pending || !form.title.trim()}><Plus className="h-4 w-4"/>{editing ? "Salvar" : "Adicionar"}</Button>
        <div className="flex basis-full flex-wrap gap-3">
          <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs text-primary" aria-expanded={form.showMore} onClick={()=>patch({showMore:!form.showMore})}><SlidersHorizontal className="h-3 w-3"/>{form.showMore ? "Menos opções" : "Datas, prioridade e lembretes"}</button>
          {!form.showDescription && <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs text-primary" onClick={()=>patch({showDescription:true})}><AlignLeft className="h-3 w-3"/>Adicionar descrição</button>}
        </div>
        {form.showMore && <SubtaskDetailsFields idPrefix={`inline-${parentId}`} value={form} onChange={patch} className="basis-full rounded-md border border-border p-2"/>}
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
        <form className="flex min-w-0 flex-col gap-4" onSubmit={submit}>
          <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`phone-title-${parentId}`}>Título *</Label><Input id={`phone-title-${parentId}`} value={form.title} onChange={e=>patch({title:e.target.value})} required maxLength={300} autoFocus={!editing}/></div>
          <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`phone-desc-${parentId}`}>Descrição</Label><SubtaskDescriptionField id={`phone-desc-${parentId}`} value={form.description} onChange={v=>patch({description:v, showDescription:true})}/></div>
          <SubtaskDetailsFields idPrefix={`phone-${parentId}`} value={form} onChange={patch}/>
          <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={()=>{setPhoneForm(false); resetForm();}}>Cancelar</Button><Button type="submit" disabled={pending || !form.title.trim()}>{pending ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar subtarefa"}</Button></DialogFooter>
        </form>
      </DialogContent>}
    </Dialog>
  </div>;
}
