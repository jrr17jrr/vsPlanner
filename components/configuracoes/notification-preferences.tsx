"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveNotificationPreferencesAction, type NotificationPreferences, type NotificationCategory } from "@/lib/supabase/notification-preferences-actions";

const OPTIONS: Array<{key:NotificationCategory;label:string;description:string}> = [
 {key:"tasks",label:"Tarefas",description:"Lembretes das tarefas com data e horário."},
 {key:"routine",label:"Rotina",description:"Compromissos e atividades da rotina."},
 {key:"meetings",label:"Reuniões",description:"Avisos de reuniões agendadas."},
 {key:"finance",label:"Financeiro",description:"Contas a pagar, receber e vencimentos."},
 {key:"clt",label:"Trabalho / CLT",description:"Tarefas e compromissos do trabalho."},
];
export function NotificationPreferencesPanel({initial,canAccessClt}:{initial:NotificationPreferences;canAccessClt:boolean}){
 const [value,setValue]=useState(initial);
 const [pending,startTransition]=useTransition();
 return <Card className="p-4"><h2 className="mb-1 text-sm font-medium">O que quero receber</h2><p className="mb-4 text-xs text-muted-foreground">Escolha os tipos de notificações. É necessário ativar o push no aparelho para receber avisos fora do aplicativo.</p>
 <div className="space-y-3">{OPTIONS.filter(o=>o.key!=="clt"||canAccessClt).map(o=><label key={o.key} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border p-3">
 <span><span className="block text-sm font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{o.description}</span></span>
 <input type="checkbox" className="h-5 w-5 accent-primary" checked={value[o.key]} onChange={e=>setValue(v=>({...v,[o.key]:e.target.checked}))}/>
 </label>)}</div>
 <Button className="mt-4" size="sm" disabled={pending} onClick={()=>startTransition(async()=>{const result=await saveNotificationPreferencesAction(value);if(result.error)toast.error(result.error);else toast.success(result.success);})}>{pending?"Salvando...":"Salvar preferências"}</Button>
 </Card>;
}
