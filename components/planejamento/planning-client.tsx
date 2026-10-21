"use client";
import {useState,useTransition} from "react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {importPlanningItemsAction,updatePlanningItemAction,deletePlanningItemAction,createCampaignFromPlanningAction,type PlanningInput,type PlanningArea} from "@/lib/supabase/planning-actions";
type Company={id:string;name:string;current_ad_balance:number};
type Item={id:string;area:PlanningArea;company_id:string|null;title:string;notes:string|null;planned_date:string|null;objective:string|null;planned_amount:number;actual_amount:number;views:number;messages:number;completed:boolean;campaign_id:string|null};
type Draft=PlanningInput & {selected:boolean;companyName?:string};
const money=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
const areas:{value:PlanningArea;label:string}[]=[{value:"clt",label:"Trabalho / CLT"},{value:"pessoal",label:"Tarefas pessoais"},{value:"rotina",label:"Rotina"},{value:"visionario",label:"Visionário Dev"}];
export function PlanningClient({initial,companies,loadError}:{initial:Item[];companies:Company[];loadError?:string}){
 const [items,setItems]=useState(initial),[draft,setDraft]=useState<Draft[]>([]),[filter,setFilter]=useState("all"),[busy,start]=useTransition();
 const companyName=(id?:string|null)=>companies.find(c=>c.id===id)?.name||"";
 const readFile=async(file?:File)=>{
 if(!file)return;
 try{
 if(file.size>1024*1024)throw new Error("Arquivo acima de 1 MB.");
 const data=JSON.parse(await file.text());
 const raw=Array.isArray(data)?data:data.items;
 if(!Array.isArray(raw)||raw.length>150)throw new Error("Arquivo inválido: use um JSON com items (máximo 150).");
 const parsed:Draft[]=raw.map((x:Record<string,unknown>,i:number)=>{
 const area=String(x.area||"clt") as PlanningArea;
 if(!areas.some(a=>a.value===area)||typeof x.title!=="string"||!x.title.trim())throw new Error("Item "+(i+1)+" sem título ou área válida.");
 const name=String(x.companyName||x.company||"").trim();
 const company=companies.find(c=>c.name.toLowerCase()===name.toLowerCase())||companies.find(c=>c.id===x.companyId);
 if(area==="clt"&&name&&!company)throw new Error("Empresa não encontrada: "+name+". Cadastre-a antes de importar.");
 const amount=Number(x.plannedAmount||0),daily=Number(x.dailyBudget||0);
 if(!Number.isFinite(amount)||amount<0||!Number.isFinite(daily)||daily<0)throw new Error("Orçamento inválido no item "+(i+1));
 return {area,title:x.title.trim(),companyId:area==="clt"?company?.id:null,companyName:name,notes:String(x.notes||""),plannedDate:String(x.plannedDate||""),scheduledTime:String(x.scheduledTime||""),weekdays:Array.isArray(x.weekdays)?x.weekdays.map(Number):[],objective:String(x.objective||""),dailyBudget:daily,plannedAmount:amount,selected:true};
 });
 setDraft(parsed);toast.success("Arquivo lido. Confira a prévia antes de salvar.");
 }catch(e){toast.error(e instanceof Error?e.message:"Arquivo inválido.");setDraft([]);}
 };
 const save=()=>start(async()=>{
 const chosen=draft.filter(d=>d.selected).map(({selected,companyName,...rest})=>rest);
 if(!chosen.length)return toast.error("Selecione pelo menos um item.");
 const r=await importPlanningItemsAction(chosen);
 if(r.error)return toast.error(r.error);
 toast.success(r.success);setDraft([]);window.location.reload();
 });
 const change=(id:string,patch:{completed?:boolean;actualAmount?:number;views?:number;messages?:number})=>start(async()=>{
 const r=await updatePlanningItemAction(id,patch);if(r.error)return toast.error(r.error);
 setItems(old=>old.map(x=>x.id===id?{...x,...(patch.completed!==undefined?{completed:patch.completed}:{}),...(patch.actualAmount!==undefined?{actual_amount:patch.actualAmount}:{})}:x));
 });
 const remove=(id:string)=>{if(!confirm("Excluir este item do planejamento?"))return;start(async()=>{const r=await deletePlanningItemAction(id);if(r.error)return toast.error(r.error);setItems(old=>old.filter(x=>x.id!==id));});};
 const create=(id:string)=>{if(!confirm("Criar registro desta campanha no VSPlanner? Isso NÃO publica anúncios no Meta Ads."))return;start(async()=>{const r=await createCampaignFromPlanningAction(id);if(r.error)return toast.error(r.error);toast.success(r.success);window.location.reload();});};
 const filtered=items.filter(i=>filter==="all"||i.area===filter||i.company_id===filter);
 const planned=filtered.reduce((s,i)=>s+Number(i.planned_amount||0),0),actual=filtered.reduce((s,i)=>s+Number(i.actual_amount||0),0);
 return <div className="space-y-6">
 <div><h1 className="text-2xl font-semibold">Planejamento</h1><p className="text-sm text-muted-foreground">Checklist semanal, campanhas, rotina e tarefas. Importe apenas o que escolher.</p></div>
 {loadError&&<p className="rounded-lg border border-amber-500 p-3 text-sm">A tabela de planejamento ainda precisa da migração SQL no Supabase: {loadError}</p>}
 <section className="space-y-3 rounded-xl border p-4">
 <h2 className="font-semibold">Importar planejamento JSON</h2>
 <p className="text-sm text-muted-foreground">Selecione um arquivo .json. Nada será salvo antes de você revisar e confirmar.</p>
 <Input type="file" accept=".json,application/json" onChange={e=>readFile(e.target.files?.[0])}/>
 {draft.length>0&&<div className="space-y-3 rounded-lg border p-3">
 <div className="flex flex-wrap items-center justify-between gap-2"><b>Prévia: {draft.filter(x=>x.selected).length} de {draft.length} selecionados</b><Button variant="outline" size="sm" onClick={()=>setDraft(old=>old.map(x=>({...x,selected:!old.every(d=>d.selected)})))}>Selecionar/desmarcar todos</Button></div>
 {draft.map((d,i)=><div key={i} className="flex items-start gap-3 border-b py-2">
 <Checkbox checked={d.selected} onCheckedChange={v=>setDraft(old=>old.map((x,j)=>i===j?{...x,selected:v===true}:x))}/>
 <div className="min-w-0 flex-1"><p className="text-sm font-medium">{d.title}</p><p className="text-xs text-muted-foreground">{areas.find(a=>a.value===d.area)?.label} {d.companyId?"· "+companyName(d.companyId):""} {d.plannedDate?"· "+d.plannedDate:""} {d.plannedAmount?"· Previsto "+money(d.plannedAmount):""}</p>{d.notes&&<p className="text-xs text-muted-foreground">{d.notes}</p>}</div>
 </div>)}
 <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Total previsto selecionado: <b>{money(draft.filter(x=>x.selected).reduce((s,x)=>s+(x.plannedAmount||0),0))}</b></span><div className="flex gap-2"><Button variant="outline" onClick={()=>setDraft([])}>Cancelar</Button><Button disabled={busy||!draft.some(x=>x.selected)} onClick={save}>Confirmar importação</Button></div></div>
 </div>}
 </section>
 <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Checklist</h2><select className="rounded-md border bg-background p-2 text-sm" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas as áreas</option>{areas.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
 <div className="grid gap-3 sm:grid-cols-3">{[["Investimento previsto",planned],["Gasto real informado",actual],["Diferença",planned-actual]].map(([label,value])=><div key={String(label)} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{money(Number(value))}</p></div>)}</div>
 {filtered.length===0&&<p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhum item. Importe um planejamento para começar.</p>}
 {filtered.map(item=><div key={item.id} className="flex flex-wrap items-start gap-3 rounded-xl border p-3"><Checkbox checked={item.completed} onCheckedChange={v=>change(item.id,{completed:v===true})}/><div className="min-w-0 flex-1 space-y-1"><p className={item.completed?"font-medium line-through opacity-60":"font-medium"}>{item.title}</p><p className="text-xs text-muted-foreground">{areas.find(a=>a.value===item.area)?.label}{item.company_id?" · "+companyName(item.company_id):""}{item.planned_date?" · "+item.planned_date:""}</p>{item.notes&&<p className="text-xs text-muted-foreground">{item.notes}</p>}{item.planned_amount>0&&<p className="text-xs">Previsto: {money(Number(item.planned_amount))} · Real: {money(Number(item.actual_amount||0))}</p>}
 {item.area==="clt"&&item.company_id&&!item.campaign_id&&<Button size="sm" variant="outline" disabled={busy||!item.planned_date} onClick={()=>create(item.id)}>Criar campanha no VSPlanner</Button>}{item.campaign_id&&<span className="text-xs text-emerald-600">Campanha vinculada</span>}
 </div><Button variant="ghost" size="sm" disabled={busy} onClick={()=>remove(item.id)}>Excluir</Button></div>)}
 </section>
 <p className="text-xs text-muted-foreground">Importações adicionam itens ao planejamento, não publicam anúncios e não alteram automaticamente o saldo real da Meta.</p>
 </div>;
}
