"use client";
import { formatMoneyPrecise } from "@/lib/format";
import {useState,useTransition} from "react";
import {toast} from "sonner";
import {useRouter} from "next/navigation";
import {addCltAdAccountMovementAction,saveCltReportPreferencesAction} from "@/lib/supabase/clt-report-actions";
import {messagingCost,monthLabel as historyMonthLabel,shiftMonth,type MessagingPoint} from "@/lib/clt/history";
import {followerPeriodSummary,followerLocalDate,formatFollowerDiff,formatFollowerPct,type FollowerRecord} from "@/lib/clt/followers";
import {change,costPerMessage,periodBounds,periodMetrics,previousPeriod,reportPeriodDates,reportPeriodLabel,spanInPeriod,type ReportPeriod,type ReportResult} from "@/lib/clt/report-period";
import {fmtRate,reportRateRows,type AdRateRow} from "@/lib/clt/video-rates";
import {DEFAULT_REPORT_METRICS,REPORT_METRICS,REPORT_SECTIONS,REPORT_SECTION_TITLES,formatReportValue,selectedValueMetrics,type ReportMetricDef,type ReportSection} from "@/lib/clt/report-metrics";
import {formatMetric} from "@/lib/clt/result-metrics";
import {useCltModule} from "@/components/trabalho/module-context";
import {PeriodPicker} from "@/components/shared/period-picker";
import {CollapsibleSection} from "@/components/trabalho/company/collapsible-section";
type Company={id:string;name:string;current_ad_balance:number};
type Campaign={id:string;company_id:string;name:string;starts_on:string;ends_on:string;planned_amount:number|null|undefined};
type Movement={company_id:string;movement_date:string;kind:string;amount:number};
type Comparison={company_id:string;old_campaign_ids:string[];new_campaign_ids:string[]};
const br=(n: number) => formatMoneyPrecise(n);
const num=(n:number)=>n.toLocaleString("pt-BR");
const pctText=(p:number|null)=>p===null?"—":(p>0?"+":p<0?"−":"")+Math.abs(p).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%";
/** Seções com métricas de valor (prévia/PDF): "Blocos do relatório" não tem valor. */
const VALUE_SECTIONS=REPORT_SECTIONS.filter(s=>s!=="conteudo");
const sameSet=(a:string[],b:string[])=>a.length===b.length&&a.every(x=>b.includes(x));
/** Diferença formatada (com sinal) no formato da métrica. */
const diffText=(def:ReportMetricDef,d:number)=>(d>0?"+":d<0?"−":"")+formatMetric(Math.abs(d),def.format??"int");
/** Verde = melhora (custos: cair é melhor). */
const tone=(def:ReportMetricDef,d:number|null)=>d===null||d===0?"":(d>0)!==!!def.lowerIsBetter?"up":"down";

/**
 * Relatórios (CLT e MKT). "Personalizar relatório": cada empresa tem a sua
 * seleção de métricas (salva como padrão no banco, ajustável antes de cada
 * relatório). A seleção controla prévia, PDF, tabelas por campanha e
 * comparação com o período anterior — os resultados cadastrados não mudam.
 */
export function CltReportClient({companies,campaigns,results,movements,movementError,comparisons,messaging=[],followers=[],preferences={},preferencesAvailable=true,adRates=[],adNames={}}:{companies:Company[];campaigns:(Campaign&{name:string})[];results:ReportResult[];movements:Movement[];movementError:string;comparisons:Comparison[];messaging?:MessagingPoint[];followers?:FollowerRecord[];preferences?:Record<string,string[]>;preferencesAvailable?:boolean;adRates?:AdRateRow[];adNames?:Record<string,string>}){
 const M=useCltModule();
 const now=new Date();const todayKey=now.toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});const thisMonth=todayKey.slice(0,7);
 // Período: o mesmo seletor e os mesmos cálculos da Visão Geral e da página Empresas.
 const [period,setPeriod]=useState<ReportPeriod>({kind:"month",month:thisMonth});
 const [periodError,setPeriodError]=useState<string|null>(null);
 const [compareChecked,setCompare]=useState(false);
 const compare=compareChecked&&period.kind!=="all";
 const prev=previousPeriod(period);
 const bounds=periodError?null:periodBounds(period);
 const [selected,setSelected]=useState<string[]>(companies.map(c=>c.id));const [entryCompany,setEntryCompany]=useState(companies[0]?.id||"");
 const [kind,setKind]=useState<"deposito"|"credito">("deposito");const [date,setDate]=useState(todayKey);const [amount,setAmount]=useState("");const [notes,setNotes]=useState("");const [busy,start]=useTransition();const router=useRouter();
 // Seleção de métricas por empresa: padrão salvo (ou o padrão do sistema) + ajustes deste relatório.
 const [savedPrefs,setSavedPrefs]=useState<Record<string,string[]>>(preferences);
 const [custom,setCustom]=useState<Record<string,string[]>>(()=>Object.fromEntries(companies.map(c=>[c.id,preferences[c.id]??DEFAULT_REPORT_METRICS])));
 const selFor=(id:string)=>custom[id]??savedPrefs[id]??DEFAULT_REPORT_METRICS;
 const [customOpen,setCustomOpen]=useState(false);
 const [editingCompany,setEditingCompany]=useState("");
 const editId=selected.includes(editingCompany)?editingCompany:selected[0]??"";
 const [savingPrefs,startSaving]=useTransition();
 /** Indicadores de UMA empresa no período (campanhas "antigas" do comparativo manual ficam fora, como antes). */
 const metricsFor=(companyId:string,p:ReportPeriod)=>{const cs=campaigns.filter(x=>x.company_id===companyId);const historical=new Set(comparisons.filter(v=>v.company_id===companyId).flatMap(v=>v.old_campaign_ids));return periodMetrics({period:p,campaignIds:new Set(cs.filter(x=>!historical.has(x.id)).map(x=>x.id)),results,messaging,movements:movements.filter(m=>m.company_id===companyId),campaigns:cs});};
 // Sem useMemo manual: o React Compiler memoiza.
 const rows=periodError?[]:companies.filter(c=>selected.includes(c.id)).map(c=>({...c,m:metricsFor(c.id,period),prev:compare?metricsFor(c.id,prev):null}));
 const partialTotal=rows.reduce((a,r)=>a+r.m.partial,0);
 // Seguidores do Instagram no período (contagem manual TOTAL; separada dos resultados de tráfego e dos novos seguidores dos anúncios).
 const followerRows=bounds?rows.map(r=>({id:r.id,name:r.name,records:followers.filter(f=>f.company_id===r.id)})).filter(r=>r.records.length).map(r=>({id:r.id,name:r.name,summary:followerPeriodSummary(r.records,bounds.from,bounds.to)})):[];
 const label=reportPeriodLabel(period),dates=periodError?"":reportPeriodDates(period),prevLabel=reportPeriodLabel(prev);
 /** Taxas de Gancho/Retenção informadas, por anúncio (nunca somadas): registros cujo período está dentro do filtro. */
 const ratesFor=(companyId:string)=>periodError?[]:reportRateRows({rows:adRates,campaigns:campaigns.filter(c=>c.company_id===companyId),adNames,inPeriod:span=>spanInPeriod(span,period)==="in"});

 const setSel=(id:string,ids:string[])=>setCustom(c=>({...c,[id]:REPORT_METRICS.filter(m=>ids.includes(m.id)).map(m=>m.id)}));
 const toggle=(id:string,metric:string,on:boolean)=>{const cur=selFor(id);setSel(id,on?[...cur,metric]:cur.filter(x=>x!==metric));};
 const savePrefs=(id:string)=>startSaving(async()=>{const r=await saveCltReportPreferencesAction(id,selFor(id));if(r.error){toast.error(r.error);return;}setSavedPrefs(p=>({...p,[id]:r.metrics??selFor(id)}));toast.success(r.success);});

 const exportPdf=()=>{
 if(periodError){toast.error(periodError);return;}
 if(!rows.length){toast.error("Selecione uma empresa.");return;}
 const safe=(s:string)=>s.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
 const empty=rows.filter(r=>!selFor(r.id).length);
 if(empty.length){toast.error(`Selecione ao menos um indicador para ${empty.map(r=>r.name).join(", ")}.`);return;}
 type Row=(typeof rows)[number];
 const table=(headers:string[],bodyRows:string[][])=>`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${safe(h)}</th>`).join("")}</tr></thead><tbody>${bodyRows.map(cells=>`<tr>${cells.map(v=>`<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
 const companyNames=rows.map(r=>r.name).join(", ");
 const oldCampaignIds=new Set(comparisons.flatMap(c=>c.old_campaign_ids));
 const pages=rows.map((company:Row,index)=>{
  const sel=selFor(company.id);
  const included=(id:string)=>sel.includes(id);
  const m=company.m;
  // Cards do resumo por seção (resultado após anúncios tem destaque próprio).
  const cardSections=VALUE_SECTIONS.map(s=>{const defs=REPORT_METRICS.filter(d=>d.section===s&&included(d.id)&&d.id!=="resultado"&&(d.value||d.id==="saldo"));return {s,defs};}).filter(x=>x.defs.length);
  const cards=cardSections.map(({s,defs})=>`<h3>${safe(REPORT_SECTION_TITLES[s])}</h3><div class="metrics">${defs.map(d=>`<div class="metric"><span>${safe(d.label)}</span><strong>${d.id==="saldo"?br(company.current_ad_balance):formatReportValue(d,m)}</strong></div>`).join("")}</div>`).join("");
  const resultCard=included("resultado")?`<div class="result"><span>Resultado após anúncios</span><strong>${br(m.resultado)}</strong></div>`:"";
  const config=comparisons.find(x=>x.company_id===company.id);
  const totalsFor=(ids:string[])=>{const e=messagingCost(messaging.filter(p=>ids.includes(p.campaign_id)));return {spent:e.spend,messages:e.messages};};
  const old=config?totalsFor(config.old_campaign_ids):null;
  const current=config?totalsFor(config.new_campaign_ids):null;
  const valid=!!old&&!!current&&old.messages>0&&current.messages>0;
  const oldCost=valid?old!.spent/old!.messages:0,currentCost=valid?current!.spent/current!.messages:0;
  const campaignChange=valid&&oldCost>0?(oldCost-currentCost)/oldCost*100:null;
  const comparisonSection=config?`<section><h2>Comparativo de desempenho — custo por mensagem</h2>${valid?`<div class="metrics"><div class="metric"><span>Custo anterior</span><strong>${br(oldCost)}</strong></div><div class="metric"><span>Custo atual</span><strong>${br(currentCost)}</strong></div><div class="metric"><span>${campaignChange===null?"Variação":campaignChange>=0?"Redução":"Aumento"} no custo</span><strong>${campaignChange===null?"—":Math.abs(campaignChange).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%"}</strong></div></div><p class="note">Comparação das campanhas escolhidas manualmente, com resultados acumulados registrados. Campanhas antigas não entram nos totais atuais.</p>`:`<p class="muted">Comparativo configurado, mas faltam conversas registradas nas campanhas selecionadas para calcular os custos.</p>`}</section>`:"";
  // Comparação com o período anterior equivalente (opcional): só as métricas escolhidas para a empresa.
  const periodComparison=company.prev?(()=>{const list=selectedValueMetrics(sel,d=>d.compare!==false);if(!list.length)return "";return `<section><h2>Comparação com o período anterior</h2><p class="muted">${safe(label)} × ${safe(prevLabel)} (${safe(reportPeriodDates(prev))})</p>${table(["Indicador","Atual","Anterior","Diferença","Variação"],list.map(d=>{const c=change(d.value!(m),d.value!(company.prev!));const good=tone(d,c.diff);return [safe(d.label),formatReportValue(d,m),formatReportValue(d,company.prev!),c.diff===null?"—":`<span class="${good}">${diffText(d,c.diff)}</span>`,`<span class="${good}">${pctText(c.pct)}</span>`];}))}</section>`;})():"";
  // Resultados por campanha: uma tabela por seção (evita colunas demais no A4).
  const campaignDefs=selectedValueMetrics(sel,d=>!!d.perCampaign);
  const own=campaigns.filter(c=>c.company_id===company.id&&!oldCampaignIds.has(c.id)).map(c=>({...c,m:periodMetrics({period,campaignIds:new Set([c.id]),results,messaging})})).filter(c=>c.m.gasto||c.m.views||c.m.messages||c.m.sales||c.m.faturamento||campaignDefs.some(d=>{const x=d.value!(c.m);return x!==null&&x!==0;}));
  const detail=included("campanhas")&&campaignDefs.length?`<section><h2>Resultados por campanha</h2>${own.length?VALUE_SECTIONS.map(s=>{const defs=campaignDefs.filter(d=>d.section===s);return defs.length?`<h3>${safe(REPORT_SECTION_TITLES[s])}</h3>${table(["Campanha",...defs.map(d=>d.short??d.label)],own.map(c=>[safe(c.name),...defs.map(d=>formatReportValue(d,c.m))]))}`:"";}).join(""):`<p class="muted">Nenhuma campanha com resultados registrados no período.</p>`}</section>`:"";
  const rateList=included("taxasVideo")?ratesFor(company.id):[];
  const ratesSection=included("taxasVideo")?`<section><h2>Taxa de Gancho e Taxa de Retenção — por anúncio</h2>${rateList.length?table(["Anúncio","Campanha","Taxa de Gancho","Taxa de Retenção"],rateList.map(r=>[safe(r.ad),safe(r.campaign),fmtRate(r.hook?.value),fmtRate(r.hold?.value)])):`<p class="muted">Nenhuma taxa informada nos anúncios deste período.</p>`}<p class="note">Percentuais informados (Meta Ads), exatamente como cadastrados. Não são calculados, somados nem convertidos em média entre anúncios; havendo mais de um registro no período, vale o mais recente.</p></section>`:"";
  const points:string[]=[];
  const bestSales=[...own].sort((a,b)=>b.m.sales-a.m.sales)[0];
  const bestMessages=[...own].sort((a,b)=>b.m.messages-a.m.messages)[0];
  const cheapest=[...own].filter(c=>costPerMessage(c.m)!==null).sort((a,b)=>costPerMessage(a.m)!-costPerMessage(b.m)!)[0];
  if(included("sales")&&bestSales?.m.sales>0)points.push(`${safe(bestSales.name)} registrou ${num(bestSales.m.sales)} ${bestSales.m.sales===1?"venda":"vendas"}${included("faturamento")&&bestSales.m.faturamento>0?", com "+br(bestSales.m.faturamento)+" em faturamento informado":""}.`);
  if(included("messages")&&bestMessages?.m.messages>0)points.push(`${safe(bestMessages.name)} gerou ${num(bestMessages.m.messages)} conversas.`);
  if(included("cpmsg")&&cheapest)points.push(`${safe(cheapest.name)} teve o menor custo por mensagem registrado: ${br(costPerMessage(cheapest.m)!)}.`);
  // Evolução mensal (6 meses até o fim do período) — todas as campanhas da empresa, inclusive finalizadas.
  const companyCampaignIds=new Set(campaigns.filter(c=>c.company_id===company.id).map(c=>c.id));
  const endMonth=period.kind==="all"?thisMonth:periodBounds(period).to.slice(0,7);
  const evoRows=Array.from({length:6},(_,i)=>shiftMonth(endMonth,i-5)).map(mo=>({mo,m:periodMetrics({period:{kind:"month",month:mo},campaignIds:companyCampaignIds,results,messaging})})).filter(r=>r.m.gasto||r.m.msgMessages||r.m.sales||r.m.faturamento);
  const ratio=(v:number|null)=>v===null?"—":br(v);
  const historySection=included("historico")?`<section><h2>Evolução mensal</h2>${evoRows.length?table(["Mês","Investimento","Conversas (mensagens)","Custo por mensagem","Vendas","Faturamento"],evoRows.map(r=>[safe(historyMonthLabel(r.mo)),br(r.m.gasto),num(r.m.msgMessages),ratio(costPerMessage(r.m)),num(r.m.sales),br(r.m.faturamento)])):`<p class="muted">Sem resultados registrados nos 6 meses até o fim do período.</p>`}</section>`:"";
  const highlights=included("destaques")&&points.length?`<section><h2>Destaques do período</h2><div class="highlight">${points.join(" ")}</div></section>`:"";
  const fol=followerRows.find(f=>f.id===company.id)?.summary;
  const dayBR=(iso:string)=>followerLocalDate(iso).split("-").reverse().join("/");
  const growthColor=(d:number)=>d>0?"#0f766e":d<0?"#b91c1c":"#0f172a";
  const followersSection=included("seguidores")&&fol?`<section><h2>Instagram — Seguidores totais do perfil</h2>${fol.enough?`<div class="metrics"><div class="metric"><span>Seguidores no início (${dayBR(fol.start!.recorded_at)})</span><strong>${num(fol.start!.followers)}</strong></div><div class="metric"><span>Seguidores no final (${dayBR(fol.end!.recorded_at)})</span><strong>${num(fol.end!.followers)}</strong></div><div class="metric"><span>${fol.growth!.diff<0?"Perda de seguidores":"Crescimento no perfil"}</span><strong style="color:${growthColor(fol.growth!.diff)}">${formatFollowerDiff(fol.growth!.diff)}</strong></div><div class="metric"><span>Crescimento</span><strong style="color:${growthColor(fol.growth!.diff)}">${formatFollowerPct(fol.growth!.pct)}</strong></div></div>`:fol.end?`<div class="metrics"><div class="metric"><span>Seguidores (${dayBR(fol.end.recorded_at)})</span><strong>${num(fol.end.followers)}</strong></div></div><p class="muted">Histórico insuficiente para calcular o crescimento no período (é preciso ao menos dois registros).</p>`:`<p class="muted">Nenhum registro de seguidores neste período.</p>`}<p class="note">Contagem TOTAL de seguidores do perfil, registrada manualmente no VSPlanner. Não é a métrica “Novos seguidores (anúncios)” do Meta Ads e não faz parte dos resultados das campanhas de tráfego pago.</p></section>`:"";
  const partialNote=m.partial?`<p class="warn">${m.partial} resultado(s) importado(s) por período começam antes ou terminam depois das datas escolhidas e não foram incluídos — os valores não são divididos entre dias. Para incluí-los, escolha um intervalo que cubra o período importado inteiro ou use mês/intervalo de meses.</p>`:"";
  const costNote=["cpc","ctr","cpm"].some(included)?" CPC = investimento ÷ cliques no link; CTR = cliques ÷ impressões; CPM = investimento ÷ impressões × 1000 — só com registros que informaram os dois valores; sem base, “—”.":"";
  const followNote=included("newFollowers")?" Novos seguidores (anúncios) são atribuídos às campanhas pelo Meta Ads e não equivalem ao total de seguidores do Instagram.":"";
  return `<article class="report-page"><header class="head"><div class="eyebrow">RELATÓRIO DE DESEMPENHO</div><h1>${safe(company.name)}</h1><div class="subtitle">${safe(label)} · ${safe(dates)}</div>${rows.length>1?`<div class="companies">Empresas no relatório: ${safe(companyNames)}</div>`:""}</header>${partialNote}${cards?`<section><h2>Resumo de desempenho</h2>${cards}</section>`:""}${resultCard}${periodComparison}${comparisonSection}${detail}${ratesSection}${historySection}${highlights}${followersSection}<p class="note">Dados registrados no VSPlanner de ${safe(dates)}. ${period.kind==="days"?"Intervalo de dias: resultados importados por período só entram quando o período inteiro está dentro das datas escolhidas.":"Resultados importados por período entram no mês em que o período termina."} Vendas e faturamento dependem de lançamento manual. Resultado após anúncios = faturamento informado − investimento publicitário; não é lucro líquido. Custo por mensagem considera somente o investimento de conjuntos/campanhas de mensagens (ThruPlay e engajamento não entram); custo por venda usa o investimento total.${costNote}${followNote}</p><footer>Relatório gerado em ${new Date().toLocaleDateString("pt-BR")} · Período ${safe(dates)} · Empresa ${index+1} de ${rows.length}</footer></article>`;
 }).join("");
 const back=M.basePath+"/relatorios";
 const body=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório ${safe(label)}</title><style>@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#182536;margin:0;background:white;font-size:11px}.report-page{break-after:page;page-break-after:always;padding:0 4px}.report-page:last-child{break-after:auto;page-break-after:auto}.head{background:#111827;color:white;padding:23px 25px;border-radius:10px;border-bottom:4px solid #00e1ff}.eyebrow{color:#67e8f9;font-size:10px;letter-spacing:1.4px;font-weight:bold}h1{font-size:24px;margin:9px 0 6px}h2{font-size:14px;margin:0 0 11px;color:#111827}h3{font-size:11px;margin:12px 0 7px;color:#334155;text-transform:uppercase;letter-spacing:.6px}section{margin-top:20px}.subtitle{font-size:12px;color:#cbd5e1}.companies{margin-top:6px;font-size:10px;color:#94a3b8}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.metric{padding:13px 11px;border:1px solid #e0e7ef;background:#f7fafc;border-radius:9px;min-width:0}.metric span,.result span{display:block;color:#526276;font-size:10px;margin-bottom:7px}.metric strong{display:block;font-size:16px;color:#0f172a;overflow-wrap:anywhere}.result{margin-top:13px;padding:13px 15px;border:1px solid #d8e7e9;border-radius:9px}.result strong{font-size:21px;color:#0f766e}.table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:9px;table-layout:fixed}th,td{border-bottom:1px solid #e1e7ed;padding:8px 5px;text-align:right;overflow-wrap:anywhere}th:first-child,td:first-child{text-align:left;width:30%}th{background:#eef7f9;color:#253548}tbody tr:nth-child(even){background:#f8fafc}.up{color:#0f766e;font-weight:bold}.down{color:#b91c1c;font-weight:bold}.highlight{padding:12px 15px;border-left:3px solid #00bfd9;background:#f3f8fa;border-radius:4px;line-height:1.6}.warn{margin-top:14px;padding:10px 12px;border:1px solid #f59e0b;background:#fffbeb;border-radius:6px;line-height:1.5}.note{margin-top:19px;line-height:1.5;font-size:9px;color:#64748b}.muted{color:#64748b}footer{border-top:1px solid #e2e8f0;margin-top:15px;padding-top:9px;font-size:9px;color:#94a3b8}.report-toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;background:#111827;color:white;font-size:13px}.report-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap}.report-toolbar button{border:1px solid #67e8f9;border-radius:7px;padding:9px 12px;background:#111827;color:white;font:inherit;cursor:pointer}.report-toolbar .primary{background:#00e1ff;color:#111827;font-weight:bold}@media (max-width:600px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.head{padding:18px}h1{font-size:20px}}@media print{.report-toolbar{display:none!important}.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.head,.metric,th,.highlight,.result,.warn{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2,h3{break-after:avoid}tr,.metric,.highlight{break-inside:avoid}}</style></head><body><nav class="report-toolbar" aria-label="Controles do relatório"><span>Prévia do relatório</span><div class="report-toolbar-actions"><button type="button" onclick="if(window.opener && !window.opener.closed){window.opener.focus();window.close()}else{window.location.href=\'${back}\'}">Voltar ao VS Planner</button><button class="primary" type="button" onclick="window.print()">Salvar PDF</button></div></nav>${pages}</body></html>`;
 setCustomOpen(false);const w=window.open("","_blank");if(!w){toast.error("Permita pop-ups para gerar o PDF.");return;}w.document.open();w.document.write(body);w.document.close();w.focus();setTimeout(()=>w.print(),350);
 };
 const save=()=>{const n=Number(amount.replace(",","."));if(!entryCompany||!Number.isFinite(n)||n<=0){toast.error("Informe empresa e valor.");return;}start(async()=>{const r=await addCltAdAccountMovementAction({companyId:entryCompany,date,kind,amount:n,notes});if(r.error)toast.error(r.error);else{toast.success(r.success);setAmount("");setNotes("");router.refresh();}})};
 const field="min-w-0 rounded border bg-background p-2 text-sm";
 const editName=companies.find(c=>c.id===editId)?.name??"";
 const editSel=editId?selFor(editId):[];
 const editSaved=editId?(savedPrefs[editId]??null):null;
 const dirty=editId?!sameSet(editSel,editSaved??DEFAULT_REPORT_METRICS):false;
 return <div className="space-y-5">
 {movementError&&<p className="rounded-lg border border-amber-500 p-3 text-sm">Para registrar depósitos e créditos, execute a migração SQL 20261021_clt_ad_account_movements.sql no Supabase. {movementError}</p>}
 <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Empresas e período do relatório</h2>
 <div className="space-y-2">
  <PeriodPicker idPrefix="relatorio" onChange={(p,err)=>{setPeriod(p);setPeriodError(err);}}/>
  {period.kind==="days"&&!periodError&&<p className="text-xs text-muted-foreground">Intervalo de dias: resultados importados por período só entram se o período inteiro estiver dentro das datas.</p>}
  {period.kind!=="all"&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/>Comparar com o período anterior{!periodError&&<span className="text-xs text-muted-foreground">({prevLabel} · {reportPeriodDates(prev)})</span>}</label>}
 </div>
 <div className="flex flex-wrap gap-2"><button className="rounded border px-3 py-1 text-sm" onClick={()=>setSelected(companies.map(c=>c.id))}>Marcar todas</button><button className="rounded border px-3 py-1 text-sm" onClick={()=>setSelected([])}>Desmarcar todas</button></div><div className="grid gap-2 sm:grid-cols-3">{companies.map(c=><label key={c.id} className="flex min-w-0 items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,c.id]:v.filter(x=>x!==c.id))}/><span className="min-w-0 break-words">{c.name}</span></label>)}</div>
 <div className="flex flex-wrap gap-2"><button onClick={()=>setCustomOpen(true)} disabled={!rows.length} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Personalizar relatório</button><button onClick={()=>setCustomOpen(true)} disabled={!rows.length||!!periodError} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">Gerar PDF das selecionadas</button></div><p className="text-xs text-muted-foreground">Escolha as métricas de cada empresa em “Personalizar relatório” (vale para a prévia, o PDF, as tabelas e as comparações). O PDF abre a impressão do navegador: escolha “Salvar como PDF” para baixar.</p></section>
 {customOpen&&<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 py-4 touch-pan-y [-webkit-overflow-scrolling:touch] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Personalizar relatório"><div className="w-full max-w-2xl min-h-0 max-h-[calc(100dvh-2rem)] space-y-4 overflow-y-auto overscroll-contain rounded-2xl border bg-background p-4 shadow-xl touch-pan-y [-webkit-overflow-scrolling:touch] sm:p-5">
  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-semibold">Personalizar relatório</h2><p className="text-sm text-muted-foreground">{label} · {dates}{compare?` · comparado com ${prevLabel}`:""}</p></div><button aria-label="Fechar" className="rounded border px-2 py-1" onClick={()=>setCustomOpen(false)}>✕</button></div>
  {rows.length>1&&<label className="flex flex-col gap-1 text-sm"><span className="text-xs text-muted-foreground">Empresa (cada uma tem a sua seleção)</span><select className="h-10 rounded-md border bg-background px-2" value={editId} onChange={e=>setEditingCompany(e.target.value)}>{rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
  <div className="flex flex-wrap gap-2"><button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>setSel(editId,REPORT_METRICS.map(m=>m.id))}>Selecionar todas</button><button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>setSel(editId,[])}>Desmarcar todas</button>{rows.length>1&&<button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>{for(const r of rows)setSel(r.id,editSel);toast.success("Seleção aplicada às empresas deste relatório.");}}>Usar esta seleção em todas as empresas</button>}</div>
  <div className="space-y-2">{REPORT_SECTIONS.map(s=>{const defs=REPORT_METRICS.filter(d=>d.section===s);const on=defs.filter(d=>editSel.includes(d.id)).length;return <CollapsibleSection key={s} compact className="shadow-none" title={REPORT_SECTION_TITLES[s as ReportSection]} defaultOpen={s==="principal"} summary={`${on} de ${defs.length} incluída(s)`}>
   <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{defs.map(d=><label key={d.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="h-4 w-4 shrink-0" checked={editSel.includes(d.id)} onChange={e=>toggle(editId,d.id,e.target.checked)}/><span className="min-w-0"><span className="block break-words">{d.label}</span><span className="block text-[11px] text-muted-foreground">Incluir no relatório</span></span></label>)}</div>
  </CollapsibleSection>;})}</div>
  <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><p>{editName}: {dirty?<b className="text-foreground">ajustes valem só para este relatório até você salvar.</b>:editSaved?"seleção salva como padrão desta empresa.":"usando a seleção padrão do sistema."}</p>{!preferencesAvailable&&<p>Para salvar preferências por empresa, aplique a migração 20261106100000_clt_ad_engagement_video_metrics.sql. A seleção continua valendo para este relatório.</p>}<p>A seleção só muda o que aparece na prévia e no PDF (inclusive tabelas e comparações). As métricas ocultas continuam armazenadas.</p></div>
  <div className="flex flex-wrap justify-end gap-2"><button type="button" className="rounded border px-4 py-2 text-sm disabled:opacity-50" disabled={!editId||savingPrefs||!preferencesAvailable} onClick={()=>savePrefs(editId)}>{savingPrefs?"Salvando…":"Salvar como padrão desta empresa"}</button><button type="button" className="rounded border px-4 py-2 text-sm" onClick={()=>setCustomOpen(false)}>Aplicar à prévia</button><button type="button" disabled={!!periodError} className="rounded bg-cyan-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" onClick={exportPdf}>Gerar PDF</button></div>
 </div></div>}
 <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Registrar depósito ou crédito recebido na conta</h2><div className="grid gap-2 sm:grid-cols-5"><select className={field} value={entryCompany} onChange={e=>setEntryCompany(e.target.value)}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select className={field} value={kind} onChange={e=>setKind(e.target.value as "deposito"|"credito")}><option value="deposito">Valor depositado</option><option value="credito">Valor creditado na conta</option></select><input className={field} type="date" value={date} onChange={e=>setDate(e.target.value)}/><input className={field} placeholder="Valor (R$)" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/><button disabled={busy||!!movementError} className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-black disabled:opacity-50" onClick={save}>Salvar lançamento</button></div><input className="w-full rounded border bg-background p-2 text-sm" placeholder="Observações (opcional)" value={notes} onChange={e=>setNotes(e.target.value)}/><p className="text-xs text-muted-foreground">Esses lançamentos não alteram automaticamente o saldo atual da Meta, evitando dupla contagem.</p></section>
 {partialTotal>0&&<p className="rounded-lg border border-amber-500 p-3 text-sm">{partialTotal} resultado(s) importado(s) por período começam antes ou terminam depois das datas escolhidas e <b>não foram incluídos</b> — os valores não são divididos entre dias. Para incluí-los, escolha um intervalo que cubra o período importado inteiro ou use mês/intervalo de meses.</p>}
 <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Prévia do período{!periodError&&<span className="ml-2 text-sm font-normal text-muted-foreground">{label} · {dates}</span>}</h2>
  {compare&&!periodError&&<p className="text-xs text-muted-foreground">Comparação: {label} × {prevLabel} ({reportPeriodDates(prev)}). Verde = melhora (para custos, cair é melhor). Sem base no período anterior, a variação aparece como “—”.</p>}
  {!rows.length&&<p className="text-sm text-muted-foreground">Selecione ao menos uma empresa.</p>}
  {rows.map(r=>{const sel=selFor(r.id);const sections=VALUE_SECTIONS.map(s=>({s,defs:REPORT_METRICS.filter(d=>d.section===s&&sel.includes(d.id)&&(d.value||d.id==="saldo"))})).filter(x=>x.defs.length);return <article key={r.id} className="space-y-2 rounded-lg border p-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{r.name}</h3><button type="button" className="text-xs text-primary hover:underline" onClick={()=>{setEditingCompany(r.id);setCustomOpen(true);}}>Personalizar ({sel.length} item(ns))</button></div>
   {!sections.length&&<p className="text-xs text-muted-foreground">Nenhuma métrica selecionada para esta empresa.</p>}
   {sections.map(({s,defs})=><CollapsibleSection key={s} compact className="shadow-none" title={REPORT_SECTION_TITLES[s]} defaultOpen={s==="principal"||s==="custos"} summary={`${defs.length} métrica(s)`}>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">{defs.map(d=>{const value=d.id==="saldo"?br(Number(r.current_ad_balance||0)):formatReportValue(d,r.m);const c=r.prev&&d.value?change(d.value(r.m),d.value(r.prev)):null;const t=c&&d.value?tone(d,c.diff):"";return <div key={d.id} className="min-w-0 rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{d.label}</p><p className="mt-1 break-words text-lg font-semibold tabular-nums">{value}</p>{c&&<p className="text-[11px] text-muted-foreground">Anterior: {formatReportValue(d,r.prev!)} · <span className={t==="up"?"text-success":t==="down"?"text-destructive":""}>{c.diff===null?"—":diffText(d,c.diff)} ({pctText(c.pct)})</span></p>}</div>;})}</div>
   </CollapsibleSection>)}
   {sel.includes("taxasVideo")&&(()=>{const list=ratesFor(r.id);return <CollapsibleSection compact className="shadow-none" title="Taxa de Gancho e Taxa de Retenção — por anúncio" defaultOpen summary={`${list.length} anúncio(s)`}>
    {list.length?<ul className="divide-y rounded-lg border text-sm">{list.map((x,i)=><li key={i} className="flex flex-col gap-1 p-2 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 break-words"><b>{x.ad}</b> <span className="text-xs text-muted-foreground">· {x.campaign}</span></span><span className="tabular-nums">Gancho {fmtRate(x.hook?.value)} · Retenção {fmtRate(x.hold?.value)}</span></li>)}</ul>:<p className="text-xs text-muted-foreground">Nenhuma taxa informada nos anúncios deste período.</p>}
    <p className="mt-2 text-[11px] text-muted-foreground">Percentuais informados, sem cálculo e sem soma ou média entre anúncios (vale o registro mais recente do período).</p>
   </CollapsibleSection>;})()}
  </article>;})}
  <p className="text-xs text-muted-foreground">Resultado após anúncios = faturamento atribuído menos gasto em anúncios, não lucro líquido. O saldo atual não é a sobra histórica do período. Novos seguidores (anúncios) vêm do Meta Ads; os seguidores totais do Instagram aparecem abaixo, separados.</p>
 </section>
 {followerRows.length>0&&<section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Instagram — seguidores totais do perfil no período</h2><ul className="divide-y rounded-lg border">{followerRows.map(({id,name,summary:s})=><li key={id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-medium">{name}</span>{s.enough?<span className="tabular-nums">{num(s.start!.followers)} → {num(s.end!.followers)} · <span className={s.growth!.diff>0?"text-success":s.growth!.diff<0?"text-destructive":"text-muted-foreground"}>{formatFollowerDiff(s.growth!.diff)} ({formatFollowerPct(s.growth!.pct)})</span></span>:<span className="text-xs text-muted-foreground">{s.end?`${num(s.end.followers)} seguidores · histórico insuficiente para calcular o crescimento`:"Nenhum registro neste período"}</span>}</li>)}</ul><p className="text-xs text-muted-foreground">Início = último registro antes do período (ou o primeiro dentro dele); final = último registro do período. Contagem manual do total do perfil — separada dos resultados de tráfego pago e dos “Novos seguidores (anúncios)”. No PDF, aparece quando “Seguidores do Instagram” está incluído.</p></section>}
 </div>;
}

