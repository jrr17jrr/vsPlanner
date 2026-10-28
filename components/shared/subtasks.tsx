"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSubtasks, saveSubtask, setSubtaskDone, deleteSubtask, moveSubtask, type Subtask, type SubtaskParent } from "@/lib/supabase/subtask-actions";

export function Subtasks({ parentType, parentId, initialOpen = false }: { parentType: SubtaskParent; parentId: string; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [items, setItems] = useState<Subtask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  async function reload() {
    try { setItems(await listSubtasks(parentType, parentId)); setLoaded(true); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar subtarefas."); }
  }
  useEffect(() => { if (open && !loaded) void reload(); }, [open, loaded, parentId]);
  const done = items.filter(x => x.is_done).length;
  const pct = items.length ? Math.round(done / items.length * 100) : 0;
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
  function run(action: () => Promise<{ error?: string }>) {
    start(async () => {
      try { const r = await action(); if (r.error) toast.error(r.error); else await reload(); }
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
      {items.map((item, i) => <div key={item.id} className="flex min-h-12 items-center gap-2 rounded-md border p-2.5">
        <input aria-label={`Concluir ${item.title}`} type="checkbox" checked={item.is_done} onChange={e => toggleDone(item, e.target.checked)}/>
        <div className="min-w-0 flex-1"><span className={item.is_done ? "line-through text-muted-foreground" : ""}>{item.title}</span>{item.due_date && <div className="text-xs text-muted-foreground">Prazo: {item.due_date.split("-").reverse().join("/")}</div>}</div>
        <button disabled={pending || i === 0} aria-label="Subir" onClick={() => run(() => moveSubtask(parentType,parentId,item.id,-1))}><ArrowUp className="h-4 w-4"/></button>
        <button disabled={pending || i === items.length-1} aria-label="Descer" onClick={() => run(() => moveSubtask(parentType,parentId,item.id,1))}><ArrowDown className="h-3.5 w-3.5"/></button>
        <button disabled={pending} aria-label="Editar" onClick={() => {setEditing(item.id);setTitle(item.title);setDueDate(item.due_date ?? "");}}><Pencil className="h-3.5 w-3.5"/></button>
        <button disabled={pending} aria-label="Excluir" onClick={() => {if(confirm("Excluir esta subtarefa?"))run(() => deleteSubtask(parentType,parentId,item.id));}}><Trash2 className="h-3.5 w-3.5"/></button>
      </div>)}
      <form className="flex flex-wrap gap-2" onSubmit={e => {e.preventDefault();run(async()=>{const r=await saveSubtask(parentType,parentId,{id:editing??undefined,title,dueDate});if(!r.error){setTitle("");setDueDate("");setEditing(null);}return r;});}}>
        <Input className="min-w-40 flex-1" placeholder="Nova subtarefa" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={300}/>
        <Input className="w-36" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} aria-label="Prazo opcional"/>
        <Button size="sm" type="submit" disabled={pending || !title.trim()}><Plus className="h-4 w-4"/>{editing ? "Salvar" : "Adicionar"}</Button>
        {editing && <Button size="sm" variant="ghost" type="button" onClick={()=>{setEditing(null);setTitle("");setDueDate("");}}>Cancelar</Button>}
      </form>
    </div>}
  </div>;
}
