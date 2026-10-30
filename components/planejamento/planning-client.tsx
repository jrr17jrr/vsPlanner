"use client";
import {useState,useTransition} from "react";
import {importCltAudiencesJsonAction} from "@/lib/supabase/clt-audience-actions";
import {importCltCampaignJsonAction} from "@/lib/supabase/clt-actions";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {importPlanningItemsAction,updatePlanningItemAction,deletePlanningItemAction,createCampaignFromPlanningAction,type PlanningInput,type PlanningArea} from "@/lib/supabase/planning-actions";
type ImportedAd={name:string;format:string;spent:number|null;messages:number|null;views:number|null;sales:number|null;revenue:number|null};
type ImportedCampaign={publicos?:{nome:string;tipo:string;configuracoes?:Record<string,unknown>;origem?:string;incluidos?:string[];excluidos?:string[]}[];name:string;spent:number|null;messages:number|null;views:number|null;sales:number|null;revenue:number|null;status?:string;sets?:{name:string;publico?:string;ads:ImportedAd[]}[]};
type Company={id:string;name:string;current_ad_balance:number};
type Item={id:string;area:PlanningArea;company_id:string|null;title:string;notes:string|null;planned_date:string|null;objective:string|null;planned_amount:number;actual_amount:number;views:number;messages:number;completed:boolean;campaign_id:string|null};
type Draft=PlanningInput & {selected:boolean;companyName?:string};
const money=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
const areas:{value:PlanningArea;label:string}[]=[{value:"clt",label:"Trabalho / CLT"},{value:"pessoal",label:"Tarefas pessoais"},{value:"rotina",label:"Rotina"},{value:"visionario",label:"Visionário Dev"}];
export function PlanningClient({initial,companies,loadError}:{initial:Item[];companies:Company[];loadError?:string}){
 const [items,setItems]=useState(initial),[draft,setDraft]=useState<Draft[]>([]),[filter,setFilter]=useState("all"),[busy,start]=useTransition();
 const [campaignDraft,setCampaignDraft]=useState<ImportedCampaign[]>([]);
 const [audienceDraft,setAudienceDraft]=useState<Record<string,unknown>[]>([]);
 const [campaignCompany,setCampaignCompany]=useState("");
 const [referenceDate,setReferenceDate]=useState(new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}));
 const [fileSummary,setFileSummary]=useState("");
 const companyName=(id?:string|null)=>companies.find(c=>c.id===id)?.name||"";
 const readFile=async(file?:File)=>{
 if(!file)return;
 try{
 if(file.size>1024*1024)throw new Error("Arquivo acima de 1 MB.");
 const data=JSON.parse(await file.text());
 const raw=Array.isArray(data)?data:data.items;
 if(Array.isArray(data.publicos)&&!Array.isArray(data.campanhas)&&!Array.isArray(raw)){if(!data.publicos.length||data.publicos.length>100)throw Error("Lista de públicos inválida.");setAudienceDraft(data.publicos);setCampaignDraft([]);setDraft([]);setFileSummary(data.publicos.length+" públicos reconhecidos. Selecione a empresa e confirme a importação.");const companyLabel=String(data.empresa||"");setCampaignCompany(companies.find(c=>c.name.toLowerCase()===companyLabel.toLowerCase())?.id||"");return;}
 setAudienceDraft([]);
 if(!Array.isArray(raw)&&Array.isArray(data.campanhas)){
  const companyLabel=String(data.empresa||data.company||data.nome_empresa||"").trim();
  const matched=companies.find(c=>c.name.toLowerCase()===companyLabel.toLowerCase());
  setCampaignCompany(matched?.id||"");
  const metric=(v:unknown):number|null=>{if(v===null||v===undefined||v==="")return null;const n=typeof v==="number"?v:Number(String(v).replace(/\\./g,"").replace(",","."));if(!Number.isFinite(n)||n<0)throw Error("Valor inválido no arquivo.");return n;};
  const parsed:ImportedCampaign[]=data.campanhas.map((c:Record<string,unknown>)=>({name:String(c.nome||c.name||"").trim(),spent:metric(c.investimento??c.spent),messages:metric(c.conversas??c.messages),views:metric(c.visualizacoes??c.views),sales:metric(c.vendas??c.sales),revenue:metric(c.faturamento??c.revenue),status:String(c.status||""),publicos:Array.isArray(c.publicos)?c.publicos:Array.isArray(data.publicos)?data.publicos:[],sets:Array.isArray(c.conjuntos)?(c.conjuntos as Record<string,unknown>[]).map(set=>({name:String(set.nome||"").trim(),publico:String(set.publico||""),ads:Array.isArray(set.anuncios)?(set.anuncios as Record<string,unknown>[]).map(ad=>{const m=(ad.resultados&&typeof ad.resultados==="object"?ad.resultados:{}) as Record<string,unknown>;return {name:String(ad.nome||"").trim(),format:String(ad.formato||"outro").toLowerCase(),spent:metric(m.investimento),messages:metric(m.conversas),views:metric(m.visualizacoes),sales:metric(m.vendas),revenue:metric(m.faturamento)};}):[]})):undefined}));
  if(!parsed.length||parsed.length>50||parsed.some((c:{name:string})=>!c.name))throw Error("Lista de campanhas inválida (máximo 50).");
  if(parsed.some(c=>c.sets?.some(set=>!set.name||!set.ads.length||set.ads.some(ad=>!ad.name||!["imagem","video","carrossel","outro"].includes(ad.format)))))throw Error("Conjunto ou anúncio inválido.");setCampaignDraft(parsed);setDraft([]);
  setFileSummary("Relatório de campanhas: "+parsed.length+" campanhas; "+(companyLabel?"empresa informada: "+companyLabel:"empresa não informada")+". Estrutura: "+parsed.reduce((n,c)=>n+(c.sets?.length||0),0)+" conjuntos e "+parsed.reduce((n,c)=>n+(c.sets?.reduce((a,set)=>a+set.ads.length,0)||0),0)+" anúncios. Revise a empresa e a data antes de importar.");
  toast.success("Relatório reconhecido. Confira o resumo antes de salvar.");return;
 }
 if(!Array.isArray(raw))throw Error("Formato não reconhecido. Aceitamos planejamento com items ou relatório com campanhas. Nenhum dado foi salvo.");
 if(!Array.isArray(raw)||raw.length>150)throw new Error("Arquivo inválido: use um JSON com items (máximo 150).");
 const parsed:Draft[]=raw.map((x:Record<string,unknown>,i:number)=>{
 const area=String(x.area||"clt") as PlanningArea;
 if(!areas.some(a=>a.value===area)||typeof x.title!=="string"||!x.title.trim())throw new Error("Item "+(i+1)+" sem título ou área válida.");
 const name=String(x.companyName||x.company||"").trim();
 const company=companies.find(c=>c.name.toLowerCase()===name.toLowerCase())||companies.find(c=>c.id===x.companyId);
 if(area==="clt"&&name&&!company)throw new Error("Empresa não encontrada: "+name+". Cadastre-a antes de importar.");
 const amount=Number(x.plannedAmount||0),daily=Number(x.dailyBudget||0);
 if(!Number.isFinite(amount)||amount<0||!Number.isFinite(daily)||daily<0)throw new Error("Orçamento inválido no item "+(i+1));
 return {area,title:x.title.trim(),companyId:area==="clt"?company?.id:null,companyName:name,notes:String(x.notes||""),plannedDate:String(x.plannedDate||""),endsOn:String(x.endsOn||""),scheduledTime:String(x.scheduledTime||""),weekdays:Array.isArray(x.weekdays)?x.weekdays.map(Number):[],objective:String(x.objective||""),dailyBudget:daily,plannedAmount:amount,subtasks:Array.isArray(x.subtasks)?x.subtasks.map((t:unknown)=>typeof t==="string"?t:typeof t==="object"&&t!==null?t as {title:string;dueDate?:string;subtasks?:Array<string|{title:string;dueDate?:string}>}:String(t)):[],priority:x.priority==="importante"?"importante":"normal",selected:true};
 });
 setCampaignDraft([]);setFileSummary("Planejamento: "+parsed.length+" itens identificados. Confira antes de importar.");setDraft(parsed);toast.success("Arquivo lido. Confira a prévia antes de salvar.");
 }catch(e){toast.error(e instanceof Error?e.message:"Arquivo inválido.");setDraft([]);setCampaignDraft([]);setFileSummary("");}
 };
 const saveAudiences=()=>start(async()=>{if(!campaignCompany){toast.error("Escolha a empresa.");return;}const result=await importCltAudiencesJsonAction(campaignCompany,{publicos:audienceDraft});if(result.error){toast.error(result.error);return;}toast.success(result.success);setAudienceDraft([]);setFileSummary("");window.location.reload();});
 const saveCampaigns=()=>start(async()=>{if(!campaignCompany){toast.error("Escolha a empresa de destino.");return;}const r=await importCltCampaignJsonAction({companyId:campaignCompany,date:referenceDate,campaigns:campaignDraft});if(r.error){toast.error(r.error);return;}toast.success(r.success);setCampaignDraft([]);setFileSummary("");window.location.reload();});
 const save=()=>start(async()=>{
 const chosen=draft.filter(d=>d.selected).map(({selected,companyName,...rest})=>rest);
 if(!chosen.length){toast.error("Selecione pelo menos um item.");return;}
 const r=await importPlanningItemsAction(chosen);
 if(r.error){toast.error(r.error);return;}
 toast.success(r.success);setDraft([]);window.location.reload();
 });
 const change=(id:string,patch:{completed?:boolean;actualAmount?:number;views?:number;messages?:number})=>start(async()=>{
 const r=await updatePlanningItemAction(id,patch);if(r.error){toast.error(r.error);return;}
 setItems(old=>old.map(x=>x.id===id?{...x,...(patch.completed!==undefined?{completed:patch.completed}:{}),...(patch.actualAmount!==undefined?{actual_amount:patch.actualAmount}:{})}:x));
 });
 const remove=(id:string)=>{if(!confirm("Excluir este item do planejamento?"))return;start(async()=>{const r=await deletePlanningItemAction(id);if(r.error){toast.error(r.error);return;}setItems(old=>old.filter(x=>x.id!==id));});};
 const create=(id:string)=>{if(!confirm("Criar registro desta campanha no VSPlanner? Isso NÃO publica anúncios no Meta Ads."))return;start(async()=>{const r=await createCampaignFromPlanningAction(id);if(r.error){toast.error(r.error);return;}toast.success(r.success);window.location.reload();});};
 const filtered=items.filter(i=>filter==="all"||i.area===filter||i.company_id===filter);
 const planned=filtered.reduce((s,i)=>s+Number(i.planned_amount||0),0),actual=filtered.reduce((s,i)=>s+Number(i.actual_amount||0),0);
 return <div className="space-y-6">
 <div><h1 className="text-2xl font-semibold">Planejamento</h1><p className="text-sm text-muted-foreground">Importe campanhas e tarefas diretamente nos módulos corretos. Revise antes de confirmar.</p></div>
 {loadError&&<p className="rounded-lg border border-amber-500 p-3 text-sm">A tabela de planejamento ainda precisa da migração SQL no Supabase: {loadError}</p>}
 <section className="space-y-3 rounded-xl border p-4">
 <h2 className="font-semibold">Importar JSON · Planejamentos e resultados</h2>
 <p className="text-sm text-muted-foreground">Aceita planejamento (items), públicos (publicos) ou campanhas completas (campanhas). O sistema identifica o tipo e mostra um resumo antes de salvar.</p>
 <Input type="file" accept=".json,application/json" onChange={e=>readFile(e.target.files?.[0])}/>
 {fileSummary&&<p className="rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3 text-sm">{fileSummary}</p>}
 {audienceDraft.length>0&&<div className="space-y-3 rounded-lg border p-3"><h3 className="font-semibold">Prévia: {audienceDraft.length} públicos</h3><select className="w-full rounded border bg-background p-2" value={campaignCompany} onChange={e=>setCampaignCompany(e.target.value)}><option value="">Selecione a empresa</option>{companies.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><div className="max-h-48 overflow-auto">{audienceDraft.map((a,i)=><p key={i} className="border-b py-1 text-sm">{String(a.nome||"Sem nome")} · {String(a.tipo||"")}</p>)}</div><Button disabled={busy||!campaignCompany} onClick={saveAudiences}>Criar ou atualizar públicos</Button></div>}
 {campaignDraft.length>0&&<div className="space-y-3 rounded-lg border p-3"><h3 className="font-semibold">Prévia do relatório de campanhas</h3><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">Empresa de destino<select className="w-full rounded border bg-background p-2" value={campaignCompany} onChange={e=>setCampaignCompany(e.target.value)}><option value="">Selecione a empresa</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="space-y-1 text-sm">Data de referência<input className="w-full rounded border bg-background p-2" type="date" value={referenceDate} onChange={e=>setReferenceDate(e.target.value)}/></label></div><p className="text-xs text-muted-foreground">Resultados acumulados entram no mês da data escolhida. O período real da campanha pode ser diferente. Campanhas já cadastradas serão atualizadas somente nos campos informados, considerando a data de referência. Se não houver registro nessa data, será criado um novo lançamento. Confira a data para não somar resultados acumulados duas vezes.</p><div className="max-h-64 space-y-2 overflow-y-auto">{campaignDraft.map((c,i)=><div key={i} className="rounded border p-2 text-xs"><b>{c.name}</b>{c.sets?.map((set,j)=><div key={j} className="ml-3 mt-1 border-l pl-2"><b>Conjunto: {set.name}</b>{set.ads.map((ad,k)=><p key={k}>Anúncio: {ad.name} ({ad.format}) · Gasto: {ad.spent===null?"Não informado":money(ad.spent)} · Conversas: {ad.messages??"—"} · Vendas: {ad.sales??"—"} · Faturamento: {ad.revenue===null?"—":money(ad.revenue)}</p>)}</div>)}<p>Investimento: {c.spent===null?"Não informado":money(c.spent)} · Visualizações: {c.views??"Não informado"} · Conversas: {c.messages??"Não informado"} · Vendas: {c.sales??"Não informado"} · Faturamento: {c.revenue===null?"Não informado":money(c.revenue)}</p></div>)}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>{setCampaignDraft([]);setFileSummary("");}}>Cancelar</Button><Button disabled={busy||!campaignCompany} onClick={saveCampaigns}>Criar ou atualizar campanhas</Button></div></div>}
 {draft.length>0&&<div className="space-y-3 rounded-lg border p-3">
 <div className="flex flex-wrap items-center justify-between gap-2"><b>Prévia: {draft.filter(x=>x.selected).length} de {draft.length} selecionados</b><Button variant="outline" size="sm" onClick={()=>setDraft(old=>old.map(x=>({...x,selected:!old.every(d=>d.selected)})))}>Selecionar/desmarcar todos</Button></div>
 {draft.map((d,i)=><div key={i} className="flex items-start gap-3 border-b py-2">
 <Checkbox checked={d.selected} onCheckedChange={v=>setDraft(old=>old.map((x,j)=>i===j?{...x,selected:v===true}:x))}/>
 <div className="min-w-0 flex-1"><p className="text-sm font-medium">{d.title}</p><p className="text-xs text-muted-foreground">{areas.find(a=>a.value===d.area)?.label} {d.companyId?"· "+companyName(d.companyId):""} {d.plannedDate?"· "+d.plannedDate:""} {d.plannedAmount?"· Previsto "+money(d.plannedAmount):""}</p>{d.notes&&<p className="text-xs text-muted-foreground">{d.notes}</p>}{!!d.subtasks?.length&&<p className="text-xs text-muted-foreground">{d.subtasks.length} etapas serão criadas, com seus checklists</p>}</div>
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
 <p className="text-xs text-muted-foreground">Novas importações criam registros diretamente em Campanhas, Tarefas ou Rotina. Não publicam anúncios nem alteram o saldo real da Meta. Os itens importados anteriormente continuam nesta lista.</p>
 </div>;
}
