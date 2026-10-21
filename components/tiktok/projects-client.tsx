"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {addTikTokProjectEntry,deleteTikTokProjectEntry} from "@/lib/supabase/tiktok-project-actions";
import {formatCurrency,formatDate,todayKeySaoPaulo} from "@/lib/format";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
type Entry={id:string;project:string;kind:string;description:string;amount:number;entry_date:string};
export function TikTokProjectsClient({entries}:{entries:Entry[]}){
 const [project,setProject]=useState<"sofia"|"maria">("sofia");
 const [share,setShare]=useState(50);
 const [pending,start]=useTransition();
 const router=useRouter();
 const filtered=entries.filter(e=>e.project===project);
 const incoming=filtered.filter(e=>e.kind==="entrada").reduce((s,e)=>s+Number(e.amount),0);
 const outgoing=filtered.filter(e=>e.kind==="saida").reduce((s,e)=>s+Number(e.amount),0);
 const profit=incoming-outgoing;
 return <div className="flex flex-col gap-6">
 <div><h1 className="text-2xl font-semibold">TikTok — Projetos</h1><p className="text-sm text-muted-foreground">Dinheiro da Sofia e da Maria separado, com histórico independente.</p></div>
 <div className="grid grid-cols-2 gap-3">{(["sofia","maria"] as const).map(k=><button key={k} onClick={()=>setProject(k)} className={`rounded-xl border p-4 text-left transition-colors ${project===k?"border-primary bg-primary/10":"border-border bg-card"}`}><p className="font-semibold">{k==="sofia"?"Sofia IA":"TikTok Real — Maria"}</p><p className="mt-1 text-xs text-muted-foreground">{k==="sofia"?"Projeto individual":"Parceria com sua irmã"}</p><p className="mt-2 font-semibold">{formatCurrency(entries.filter(e=>e.project===k).reduce((s,e)=>s+(e.kind==="entrada"?1:-1)*Number(e.amount),0))}</p></button>)}</div>
 <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[["Receitas",incoming],["Despesas",outgoing],["Lucro / saldo",profit]].map(([label,value])=><div key={String(label)} className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{formatCurrency(Number(value))}</p></div>)}</div>
 {project==="maria"&&<div className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">Divisão do lucro</h2><p className="mt-1 text-xs text-muted-foreground">Simulação sobre o lucro registrado; não realiza transferências nem registra retiradas.</p><div className="mt-3 flex items-center gap-3"><Label htmlFor="share">Sua porcentagem (%)</Label><Input id="share" type="number" min="0" max="100" className="w-24" value={share} onChange={e=>setShare(Math.max(0,Math.min(100,Number(e.target.value)||0)))}/></div><div className="mt-3 grid grid-cols-2 gap-3"><div>Você: <strong>{formatCurrency(profit*share/100)}</strong></div><div>Sua irmã: <strong>{formatCurrency(profit*(100-share)/100)}</strong></div></div></div>}
 <form className="rounded-xl border border-border bg-card p-4" action={form=>start(async()=>{form.set("project",project);const r=await addTikTokProjectEntry(form);if(r.error)toast.error(r.error);else{toast.success("Movimentação registrada");router.refresh();}})}>
 <h2 className="mb-4 font-semibold">Nova movimentação — {project==="sofia"?"Sofia IA":"Maria"}</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-4">
 <div><Label>Tipo</Label><select name="kind" className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="entrada">Receita</option><option value="saida">Despesa</option></select></div>
 <div><Label>Descrição</Label><Input name="description" required placeholder="Ex.: Comissão TikTok Shop"/></div>
 <div><Label>Valor (R$)</Label><Input name="amount" required inputMode="decimal" placeholder="100,00"/></div>
 <div><Label>Data</Label><Input name="entryDate" type="date" required defaultValue={todayKeySaoPaulo()}/></div>
 </div><Button className="mt-4" disabled={pending}>Salvar movimentação</Button></form>
 <section><h2 className="mb-3 font-semibold">Histórico — {project==="sofia"?"Sofia IA":"Maria"}</h2>{filtered.length===0?<p className="text-sm text-muted-foreground">Nenhuma movimentação neste projeto.</p>:<div className="space-y-2">{filtered.map(e=><div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"><div><p className="text-sm font-medium">{e.description}</p><p className="text-xs text-muted-foreground">{formatDate(e.entry_date)}</p></div><div className="flex items-center gap-3"><span className={e.kind==="entrada"?"text-success":"text-destructive"}>{e.kind==="entrada"?"+":"−"}{formatCurrency(Number(e.amount))}</span><button type="button" className="text-xs text-muted-foreground hover:text-destructive" disabled={pending} onClick={()=>{if(!window.confirm("Excluir esta movimentação?"))return;start(async()=>{const r=await deleteTikTokProjectEntry(e.id);if(r.error)toast.error(r.error);else router.refresh()})}}>Excluir</button></div></div>)}</div>}</section>
 </div>;
}
