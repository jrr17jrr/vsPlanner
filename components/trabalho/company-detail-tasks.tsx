"use client";
import {useTransition} from "react";
import {Subtasks} from "@/components/shared/subtasks";
import {VideoProduction} from "@/components/trabalho/video-production";import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Card,CardContent} from "@/components/ui/card";import {Checkbox} from "@/components/ui/checkbox";
import {Button} from "@/components/ui/button";
import {NewCltTaskButton,EditCltTaskButton} from "@/components/trabalho/new-clt-task-button";
import {toggleCltTaskStatusAction,toggleCltTaskOccurrenceAction} from "@/lib/supabase/clt-actions";
import type {CltTask,CltCompany} from "@/types/database.types";
type Occ={task_id:string;occurrence_date:string;status:string;completed_at:string|null};
const weekdays=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
export function CompanyDetailTasks({tasks,companies,occurrences,companyId}:{tasks:CltTask[];companies:CltCompany[];occurrences:Occ[];companyId:string}){
 const [pending,start]=useTransition();const router=useRouter();
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
 const wd=new Date(today+"T12:00:00").getDay();
 const current=tasks;
 function activeToday(t:CltTask){return t.recurrence!=="weekly"||(t.weekdays.includes(wd)&&(!t.recurrence_start||t.recurrence_start<=today)&&(!t.recurrence_until||t.recurrence_until>=today));}function done(t:CltTask){return t.recurrence==="weekly"?occurrences.some(o=>o.task_id===t.id&&o.occurrence_date===today&&o.status==="concluida"):t.status==="concluida";}
 function toggle(t:CltTask){if(!activeToday(t))return toast.error("Esta tarefa recorrente não está agendada para hoje.");start(async()=>{const result=t.recurrence==="weekly"?await toggleCltTaskOccurrenceAction(t.id,today,!done(t)):await toggleCltTaskStatusAction(t.id,!done(t));if(result.error)toast.error(result.error);else{toast.success("Tarefa atualizada.");router.refresh();}});}
 return <Card><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Tarefas da empresa</h2><p className="text-xs text-muted-foreground">As tarefas recorrentes podem ser concluídas separadamente a cada dia.</p></div><NewCltTaskButton companies={companies} defaultCompanyId={companyId}/></div>
 {current.length?current.map(t=><div key={t.id} className={"flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 transition-opacity "+(done(t)?"opacity-60":"")}>
 <Checkbox checked={done(t)} disabled={pending||!activeToday(t)} onCheckedChange={()=>toggle(t)} aria-label={"Concluir "+t.title} className="shrink-0"/>
 <div className="min-w-0 flex-1"><p className={"text-sm font-medium text-foreground "+(done(t)?"line-through":"")}>{t.title}</p>
 <p className="mt-0.5 text-xs text-muted-foreground">{t.recurrence==="weekly"?"Repete: "+t.weekdays.map(d=>weekdays[d]).join(", ")+(activeToday(t)?"":" · Não agendada para hoje"):t.due_date?"Data: "+t.due_date.split("-").reverse().join("/"):"Sem prazo"}{t.scheduled_time?" · "+t.scheduled_time.slice(0,5):""}{t.priority==="importante"?" · Importante":""}</p>{t.title === "Criar Vídeos | Meta Ads" ? <VideoProduction parentId={t.id} companyId={companyId} companies={companies}/> : <Subtasks parentType="clt" parentId={t.id}/>}</div>
 <EditCltTaskButton companies={companies} task={t}/></div>):<p className="text-sm text-muted-foreground">Nenhuma tarefa cadastrada para esta empresa.</p>}
 </CardContent></Card>;
}
