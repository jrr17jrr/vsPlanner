"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {Card,CardContent} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import type {CltCampaignResultEntry} from "@/types/database.types";
const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function CompanyResultsSummary({results}:{results:CltCampaignResultEntry[]}){
 const [period,setPeriod]=useState("month");
 const [chosenMonth,setChosenMonth]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}).slice(0,7));
 const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
 const [year,month]=today.slice(0,7).split("-").map(Number);
 const previous=new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);
 const filtered=useMemo(()=>results.filter(r=>period==="all"||period==="month"&&r.entry_date.startsWith(today.slice(0,7))||period==="previous"&&r.entry_date.startsWith(previous)||period==="choose"&&r.entry_date.startsWith(chosenMonth)||period==="year"&&r.entry_date.startsWith(String(year)+"-")),[results,period,chosenMonth,today,previous,year]);
 const sum=(key:keyof CltCampaignResultEntry)=>filtered.reduce((n,r)=>n+Number(r[key]||0),0);
 const spent=sum("spent_amount"),revenue=sum("generated_revenue"),messages=sum("messages"),views=sum("views"),impressions=sum("impressions"),thruplays=sum("thruplays"),sales=sum("sales");
 return <Card><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Resultados da empresa</h2><div className="flex flex-wrap items-center gap-2"><select aria-label="Período dos resultados" className="h-9 rounded-md border bg-background px-2 text-sm" value={period} onChange={e=>setPeriod(e.target.value)}><option value="month">Este mês</option><option value="previous">Mês anterior</option><option value="choose">Escolher mês</option><option value="year">Este ano</option><option value="all">Todo o período</option></select>{period==="choose"&&<Input aria-label="Escolher mês" type="month" className="w-40" value={chosenMonth} onChange={e=>setChosenMonth(e.target.value)}/>}<Link className="text-sm text-primary hover:underline" href="/trabalho/analises">Comparar em Análises</Link></div></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Mensagens",messages.toLocaleString("pt-BR")],["Visualizações",views.toLocaleString("pt-BR")],["Impressões",impressions.toLocaleString("pt-BR")],["ThruPlays",thruplays.toLocaleString("pt-BR")],["Vendas",sales.toLocaleString("pt-BR")],["Faturamento bruto",money(revenue)],["Gasto em anúncios",money(spent)],["Resultado após anúncios",money(revenue-spent)],["Custo por mensagem",messages?money(spent/messages):"—"],["ROAS",spent?(revenue/spent).toFixed(2)+"x":"—"]].map(([label,value])=><div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div><p className="text-xs text-muted-foreground">Resultado após anúncios = faturamento bruto menos gasto com anúncios; não é lucro líquido. Outros custos não estão incluídos.</p></CardContent></Card>;
}