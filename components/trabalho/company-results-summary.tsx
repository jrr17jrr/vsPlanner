"use client";
import {useState} from "react";
import Link from "next/link";
import {Card,CardContent} from "@/components/ui/card";
import {PeriodPicker} from "@/components/shared/period-picker";
import type {MessagingPoint} from "@/lib/clt/history";
import {campaignsInPeriod,costPerMessage,periodMetrics,reportPeriodLabel,roas,type PeriodCampaign,type ReportPeriod,type ReportResult} from "@/lib/clt/report-period";
const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num=(n:number)=>n.toLocaleString("pt-BR");
const todaySP=()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
/**
 * Visão Geral da empresa — UM filtro de período controla tudo: campanhas do
 * período, investimento, mensagens, vendas, faturamento, resultado, custo por
 * mensagem, ROAS e volume. Mesmos cálculos dos cards de Empresas e dos
 * Relatórios (lib/clt/report-period.ts). Saldo da Meta e tarefas ficam fora
 * (são situação atual, não métrica do período).
 */
export function CompanyResultsSummary({results,messaging=[],campaigns=[],analysesHref="/trabalho/analises"}:{results:ReportResult[];messaging?:MessagingPoint[];campaigns?:PeriodCampaign[];analysesHref?:string}){
 const today=todaySP();
 const [period,setPeriod]=useState<ReportPeriod>({kind:"month",month:today.slice(0,7)});
 // Resultados e mensagens já vêm só desta empresa: contam todas as campanhas deles (e as cadastradas).
 const m=periodMetrics({period,campaignIds:new Set([...campaigns.map(c=>c.id),...results.map(r=>r.campaign_id),...messaging.map(p=>p.campaign_id)]),results,messaging});
 const inPeriod=campaignsInPeriod(campaigns,period,today);
 const status=(s:string)=>inPeriod.filter(c=>c.campaign_status===s).length;
 const cpm=costPerMessage(m),r=roas(m);
 const empty=!inPeriod.length&&!m.gasto&&!m.messages&&!m.sales&&!m.faturamento&&!m.impressions&&!m.views;
 return <Card><CardContent className="space-y-4 p-4">
  <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="font-semibold">Resultados da empresa</h2><Link className="text-sm text-primary hover:underline" href={analysesHref}>Comparar em Análises</Link></div>
  <PeriodPicker idPrefix="visao-geral" label="Período" onChange={(p,err)=>{if(!err)setPeriod(p);}}/>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
   <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Campanhas do período</p><p className="mt-1 text-xl font-semibold">{inPeriod.length}</p><p className="text-[11px] text-muted-foreground">{campaigns.length} no histórico</p></div>
   <div className="col-span-1 rounded-lg border p-3 lg:col-span-3"><p className="text-xs text-muted-foreground">Status atual das campanhas que rodaram no período</p><p className="mt-1 text-sm"><span className="font-semibold text-emerald-500">{status("ativa")} ativa(s) agora</span> · {status("pausada")} pausada(s) · {status("finalizada")} finalizada(s){status("planejada")?` · ${status("planejada")} planejada(s)`:""}</p><p className="text-[11px] text-muted-foreground">Campanha que atravessa meses aparece nos dois; os resultados entram pela data de referência de cada registro.</p></div>
  </div>
  {/* Hierarquia: investimento e retorno em destaque; volume e alcance abaixo. */}
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{([["Investimento em anúncios",money(m.gasto)],["Faturamento bruto",money(m.faturamento)],["Resultado após anúncios",money(m.resultado)],["Custo por mensagem",cpm===null?"—":money(cpm)],["ROAS",r===null?"—":r.toFixed(2).replace(".",",")+"x"]] as const).map(([label,value],i)=><div key={label} className={"rounded-lg border border-primary/20 bg-primary/[0.04] p-3"+(i===4?" col-span-2 lg:col-span-1":"")}><p className="text-xs text-muted-foreground">{label}</p><p className={"mt-1 text-xl font-semibold"+(label==="Resultado após anúncios"&&m.resultado<0?" text-destructive":"")}>{value}</p></div>)}</div>
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{([["Mensagens",m.messages],["Vendas",m.sales],["Impressões",m.impressions],["Alcance (soma)",m.reach],["Visualizações",m.views],["ThruPlays",m.thruplays],["Cliques no link",m.linkClicks],["Leads",m.leads],["Interações",m.engagements]] as const).map(([label,value])=><div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{num(value)}</p></div>)}</div>
  {empty&&<p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Sem campanhas em execução nem resultados em {reportPeriodLabel(period).toLowerCase()}.</p>}
  {m.partial>0&&<p className="rounded-md border border-amber-500/60 p-3 text-xs">{m.partial} resultado(s) registrados por período começam antes ou terminam depois das datas escolhidas e não foram incluídos — os valores não são divididos entre dias.</p>}
  <p className="text-xs text-muted-foreground">Resultado após anúncios = faturamento bruto menos investimento em anúncios; não é lucro líquido. Custo por mensagem considera só campanhas/conjuntos de mensagens. ROAS = faturamento ÷ investimento.</p>
 </CardContent></Card>;
}
