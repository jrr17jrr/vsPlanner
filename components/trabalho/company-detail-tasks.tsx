"use client";
import {useTransition} from "react";
import {toast} from "sonner";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {NewCltTaskButton,EditCltTaskButton} from "@/components/trabalho/new-clt-task-button";
import {toggleCltTaskStatusAction,toggleCltTaskOccurrenceAction} from "@/lib/supabase/clt-actions";
import type {CltTask,CltCompany} from "@/types/database.types";
type Occ={task_id:string;occurrence_date:string;status:string;completed_at:string|null};
const weekdays=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
export function CompanyDetailTasks({tasks,companies,occurrences}:{tasks:CltTask[];companies:CltCompany[];occurrences:Occ[]}){
 const [pending,start]=useTransition();
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
 const wd=new Date(today+"T12:00:00").getDay();
 const current=tasks.filter(t=>t.recurrence!=="weekly"||t.weekdays.includes(wd)&&(!t.recurrence_start||t.recurrence_start<=today)&&(!t.recurrence_until||t.recurrence_until>=today));
 function done(t:CltTask){return t.recurrence==="weekly"?occurrences.some(o=>o.task_id===t.id&&o.occurrence_date===today&&o.status==="concluida"):t.status==="concluida";}
 function toggle(t:CltTask){start(async()=>{const result=t.recurrence==="weekly"?await toggleCltTaskOccurrenceAction(t.id,today,!done(t)):await toggleCltTaskStatusAction(t.id,!done(t));if(result.error)toast.error(result.error);else toast.success("Tarefa atualizada.");});}
 return <Card><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Tarefas da empresa</h2><p className="text-xs text-muted-foreground">As tarefas recorrentes podem ser concluídas separadamente a cada dia.</p></div><NewCltTaskButton companies={companies}/></div>
 {current.length?current.map(t=><div key={t.id} className="flex items-center gap-2 rounded-lg border p-3"><input aria-label={"Concluir "+t.title} type="checkbox" checked={done(t)} disabled={pending} onChange={()=>toggle(t)} className="h-4 w-4"/><div className="min-w-0 flex-1"><p className={done(t)?"text-sm line-through text-muted-foreground":"text-sm font-medium"}>{t.title}</p><p className="text-xs text-muted-foreground">{t.recurrence==="weekly"?"Repete: "+t.weekdays.map(d=>weekdays[d]).join(", "):t.due_date?"Data: "+t.due_date.split("-").reverse().join("/"):"Sem prazo"}{t.scheduled_time?" · "+t.scheduled_time.slice(0,5):""}{t.priority==="importante"?" · Importante":""}</p></div><EditCltTaskButton companies={companies} task={t}/></div>):<p className="text-sm text-muted-foreground">Nenhuma tarefa para hoje ou tarefa avulsa cadastrada.</p>}
 {tasks.some(t=>t.recurrence==="weekly"&&!current.includes(t))&&<p className="text-xs text-muted-foreground">Há tarefas recorrentes agendadas para outros dias da semana. Consulte a página de tarefas para ver todas.</p>}
 </CardContent></Card>;
}
