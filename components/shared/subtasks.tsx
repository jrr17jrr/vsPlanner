"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowUp, ArrowDown, AlignLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { listSubtasks, saveSubtask, setSubtaskDone, deleteSubtask, moveSubtask, type Subtask, type SubtaskParent } from "@/lib/supabase/subtask-actions";
import { SUBTASK_DESCRIPTION_MAX } from "@/lib/subtask-description";

type ActionResult = { error?: string; warning?: string };

export function Subtasks({ parentType, parentId, initialOpen = false }: { parentType: SubtaskParent; parentId: string; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [items, setItems] = useState<Subtask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [parentForNew, setParentForNew] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  async function reload() {
    try { setItems(await listSubtasks(parentType, parentId)); setLoaded(true); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar subtarefas."); }
  }
  // reload() só altera estado depois do await (carregamento sob demanda ao abrir).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (open && !loaded) void reload(); }, [open, loaded, parentId]);
  const roots = items.filter(x => !x.parent_subtask_id);
  const done = items.filter(x => x.is_done).length;
  const pct = items.length ? Math.round(done / items.length * 100) : 0;
  function resetForm() { setTitle(""); setDueDate(""); setDescription(""); setShowDescription(false); setEditing(null); setParentForNew(null); }
  function startEdit(item: Subtask, parentSubtaskId: string | null) {
    setEditing(item.id); setParentForNew(parentSubtaskId); setTitle(item.title); setDueDate(item.due_date ?? "");
    setDescription(item.description ?? ""); setShowDescription(!!item.description);
  }
  function toggleDone(item: Subtask, checked: boolean) {
    setItems(current => current.map(x => x.id === item.id ? {...x, is_done: checked} : x));
    start(async () => {
      try {
        const result = await setSubtaskDone(parentType, parentId, item.id, checked);
        if (result.error) {
          setItems(current => current.map(x => x.id === item.id ? {...x, is_done: item.is_done} : x));
          toast.error(result.error);
        }
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
        else { if (r.warning) toast.warning(r.warning); await reload(); }
      }
      catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
    });
  }
  return <div className="mt-2 rounded-lg border border-border/70 p-2 text-sm">
    <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)}>
      <span className="flex items-center gap-1 font-medium">{open ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>} Subtarefas {loaded ? `(${done}/${items.length})` : ""}</span>
      {loaded && items.length > 0 && <span className="text-xs text-muted-foreground">{pct}%</span>}
    </button>
    {loaded && items.length > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{width: `${pct}%`}}/></div>}
    {open && <div className="mt-3 space-y-2">
      {roots.map((item, i) => <div key={item.id} className="rounded-md border p-2.5"><div className="flex min-h-10 items-center gap-2">
        <input aria-label={`Concluir ${item.title}`} type="checkbox" checked={item.is_done} onChange={e => toggleDone(item, e.target.checked)}/>
        <div className="min-w-0 flex-1"><span className={"break-words " + (item.is_done ? "line-through text-muted-foreground" : "")}>{item.title}</span>{item.due_date && <div className="text-xs text-muted-foreground">Prazo: {item.due_date.split("-").reverse().join("/")}</div>}</div>
        <button disabled={pending || i === 0} aria-label="Subir" onClick={() => run(() => moveSubtask(parentType,parentId,item.id,-1))}><ArrowUp className="h-4 w-4"/></button>
        <button disabled={pending || i === roots.length-1} aria-label="Descer" onClick={() => run(() => moveSubtask(parentType,parentId,item.id,1))}><ArrowDown className="h-3.5 w-3.5"/></button>
        <button type="button" disabled={pending} aria-label="Adicionar checklist" title="Adicionar checklist" onClick={() => {resetForm();setParentForNew(item.id);setExpanded(a=>a.includes(item.id)?a:[...a,item.id]);}}><Plus className="h-4 w-4"/></button>
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-primary" aria-label={`Mostrar checklist de ${item.title}`} onClick={()=>setExpanded(a=>a.includes(item.id)?a.filter(x=>x!==item.id):[...a,item.id])}>{expanded.includes(item.id)?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>} Checklist ({items.filter(x=>x.parent_subtask_id===item.id).length})</button>
        <button disabled={pending} aria-label="Editar" onClick={() => startEdit(item, null)}><Pencil className="h-3.5 w-3.5"/></button>
        <button disabled={pending} aria-label="Excluir" onClick={() => {if(confirm("Excluir esta subtarefa?"))run(() => deleteSubtask(parentType,parentId,item.id));}}><Trash2 className="h-3.5 w-3.5"/></button>
      </div>
      <ExpandableDescription text={item.description} className="pl-5"/>
      {expanded.includes(item.id) && <div className="ml-5 mt-2 space-y-2 border-l pl-3">
        {items.filter(child=>child.parent_subtask_id===item.id).map(child=><div key={child.id} className="rounded-md bg-muted/40 p-2"><div className="flex items-center gap-2">
          <input type="checkbox" checked={child.is_done} aria-label={`Concluir ${child.title}`} onChange={e=>toggleDone(child,e.target.checked)}/>
          <span className={`min-w-0 flex-1 break-words ${child.is_done?"line-through text-muted-foreground":""}`}>{child.title}{child.due_date && <small className="block text-muted-foreground">{child.due_date.split("-").reverse().join("/")}</small>}</span>
          <button type="button" aria-label="Editar item" onClick={()=>startEdit(child, item.id)}><Pencil className="h-4 w-4"/></button>
          <button type="button" aria-label="Excluir item" onClick={()=>{if(confirm("Excluir este item?"))run(()=>deleteSubtask(parentType,parentId,child.id));}}><Trash2 className="h-4 w-4"/></button>
        </div><ExpandableDescription text={child.description} className="pl-5"/></div>)}
        <button type="button" className="text-xs text-primary" onClick={()=>{resetForm();setParentForNew(item.id);}}>+ Novo item nesta etapa</button>
      </div>}
      </div>)}
      {parentForNew && <div className="flex items-center justify-between rounded-md bg-muted p-2 text-xs"><span>Adicionando item em: {roots.find(x=>x.id===parentForNew)?.title}</span><button type="button" onClick={resetForm}>✕ Cancelar</button></div>}
      <form className="flex flex-wrap gap-2" onSubmit={e => {e.preventDefault();run(async()=>{const r=await saveSubtask(parentType,parentId,{id:editing??undefined,title,dueDate,parentSubtaskId:parentForNew,description:showDescription||editing?description:undefined});if(!r.error)resetForm();return r;});}}>
        <Input className="min-w-40 flex-1" placeholder={parentForNew ? "Novo item do checklist" : "Nova subtarefa"} value={title} onChange={e=>setTitle(e.target.value)} required maxLength={300}/>
        <Input className="w-36" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} aria-label="Prazo opcional"/>
        <Button size="sm" type="submit" disabled={pending || !title.trim()}><Plus className="h-4 w-4"/>{editing ? "Salvar" : "Adicionar"}</Button>
        {editing && <Button size="sm" variant="ghost" type="button" onClick={resetForm}>Cancelar</Button>}
        {showDescription
          ? <Textarea className="basis-full" rows={3} maxLength={SUBTASK_DESCRIPTION_MAX} placeholder="Descrição opcional (aparece recolhida)" value={description} onChange={e=>setDescription(e.target.value)} aria-label="Descrição opcional"/>
          : <button type="button" className="inline-flex basis-full items-center gap-1 text-xs text-primary" onClick={()=>setShowDescription(true)}><AlignLeft className="h-3 w-3"/>Adicionar descrição</button>}
      </form>
    </div>}
  </div>;
}
