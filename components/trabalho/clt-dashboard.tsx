"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, ChevronLeft, ChevronRight, Eye, Megaphone, MessageCircle, ShoppingCart, WalletCards, CheckSquare, ArrowRight, ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CltDashboardData } from "@/lib/supabase/repositories/clt.repository";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function monthKey(d: Date) { return d.toISOString().slice(0, 7); }
function daysUntil(date: string) {
  const a = new Date(today + "T12:00:00-03:00").getTime();
  const b = new Date(date + "T12:00:00-03:00").getTime();
  return Math.ceil((b - a) / 86400000);
}

export function CltDashboard({ data }: { data: CltDashboardData }) {
  const [month, setMonth] = useState(() => new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [responsible, setResponsible] = useState("all");
  const [company, setCompany] = useState("all");
  const mk = monthKey(month);

  const companyIds = useMemo(() => new Set(data.companies.filter(c => (responsible === "all" || c.responsible_id === responsible) && (company === "all" || c.id === company)).map(c => c.id)), [data.companies, responsible, company]);
  const companies = data.companies.filter(c => companyIds.has(c.id));
  const campaigns = data.campaigns.filter(c => companyIds.has(c.company_id));
  const monthly = campaigns.filter(c => c.starts_on.slice(0,7) === mk || c.ends_on.slice(0,7) === mk || (c.starts_on < mk + "-01" && c.ends_on >= mk + "-01"));
  const totalBalance = companies.reduce((s,c)=>s+Number(c.current_ad_balance),0);
  const spent = monthly.reduce((s,c)=>s+Number(c.spent_amount),0);
  const messages = monthly.reduce((s,c)=>s+c.messages,0), sales=monthly.reduce((s,c)=>s+c.sales,0), views=monthly.reduce((s,c)=>s+c.views,0);
  const active = campaigns.filter(c => c.starts_on <= today && c.ends_on >= today);
  const tasks = data.tasks.filter(t => (company === "all" || (t.company_id ? companyIds.has(t.company_id) : false)) && t.status === "pendente");
  const quickTasks = tasks.filter(t => !t.company_id);
  const companyTasks = tasks.filter(t => !!t.company_id);
  const lowBalance = companies.filter(c => Number(c.current_ad_balance) <= 100);
  const attentionCampaigns = active.filter(c => daysUntil(c.ends_on) <= 2).sort((a,b)=>a.ends_on.localeCompare(b.ends_on));
  const attentionTasks = tasks.filter(t => t.due_date && (t.due_date < today || (t.due_date === today && t.priority === "importante")));
  const companyName=(id:string)=>data.companies.find(c=>c.id===id)?.name ?? "Empresa";

  function shift(n:number){ setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth()+n, 1))); }

  const stats = [
    ["Empresas", companies.length, Building2], ["Tarefas pendentes", tasks.length, ListTodo],
    ["Saldo dos anúncios", money.format(totalBalance), WalletCards], ["Saldos baixos (até R$ 100)", lowBalance.length, AlertTriangle],
  ] as const;

  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div><h1 className="text-2xl font-bold">Trabalho / CLT</h1><p className="text-sm text-muted-foreground">Prioridades, tarefas rápidas e acompanhamento das empresas.</p></div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex items-center rounded-md border"><Button variant="ghost" size="icon" onClick={()=>shift(-1)}><ChevronLeft className="h-4 w-4"/></Button><span className="min-w-36 text-center text-sm capitalize">{monthFmt.format(month)}</span><Button variant="ghost" size="icon" onClick={()=>shift(1)}><ChevronRight className="h-4 w-4"/></Button></div>
        <Select value={responsible} onValueChange={v=>{setResponsible(v);setCompany("all")}}><SelectTrigger><SelectValue placeholder="Responsável"/></SelectTrigger><SelectContent><SelectItem value="all">Todos os responsáveis</SelectItem>{data.responsibles.map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>
        <Select value={company} onValueChange={setCompany}><SelectTrigger><SelectValue placeholder="Empresa"/></SelectTrigger><SelectContent><SelectItem value="all">Todas as empresas</SelectItem>{data.companies.filter(c=>responsible==="all"||c.responsible_id===responsible).map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stats.map(([label,value,Icon])=><Card key={label}><CardContent className="p-4"><div className="mb-2 flex items-center justify-between text-muted-foreground"><span className="text-xs">{label}</span><Icon className="h-4 w-4"/></div><p className="text-xl font-semibold">{value}</p></CardContent></Card>)}</div>

    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["/trabalho/tarefas","Central de tarefas","Tarefas rápidas e por empresa",CheckSquare],
        ["/trabalho/empresas","Empresas","Dados e saldos de cada empresa",Building2],
        ["/trabalho/campanhas","Campanhas","Anúncios e investimentos",Megaphone],
        ["/trabalho/relatorios","Relatórios","Resultados e histórico",Eye],
      ].map(([href,label,description,Icon])=><Link key={String(href)} href={String(href)} className="flex items-center justify-between rounded-xl border bg-card p-4 transition-colors hover:bg-accent"><div><p className="font-semibold">{String(label)}</p><p className="mt-1 text-xs text-muted-foreground">{String(description)}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground"/></Link>)}
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ListTodo className="h-4 w-4"/>Tarefas rápidas do CLT</CardTitle></CardHeader><CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">Tarefas gerais, sem empresa vinculada. Ex.: corrigir erro do sistema.</p>
        {quickTasks.length===0?<p className="text-sm text-muted-foreground">Nenhuma tarefa rápida pendente.</p>:quickTasks.slice(0,5).map(t=><div key={t.id} className="rounded-lg border p-3 text-sm"><b>{t.title}</b>{t.due_date&&<span className="ml-2 text-xs text-muted-foreground">{t.due_date.split("-").reverse().join("/")}</span>}</div>)}
        <Button asChild variant="outline" size="sm"><Link href="/trabalho/tarefas">Ver todas as tarefas</Link></Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4"/>Tarefas das empresas</CardTitle></CardHeader><CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">Cada empresa tem suas próprias tarefas e conclusão independente.</p>
        {companyTasks.length===0?<p className="text-sm text-muted-foreground">Nenhuma tarefa de empresa pendente.</p>:companyTasks.slice(0,6).map(t=><div key={t.id} className="rounded-lg border p-3 text-sm"><b>{companyName(t.company_id!)}</b> — {t.title}</div>)}
        <Button asChild variant="outline" size="sm"><Link href="/trabalho/tarefas">Gerenciar tarefas</Link></Button>
      </CardContent></Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4"/>Precisa da sua atenção</CardTitle></CardHeader><CardContent className="space-y-2">
        {attentionCampaigns.length===0&&attentionTasks.length===0&&lowBalance.length===0?<p className="text-sm text-muted-foreground">Nada urgente no momento.</p>:null}
        {lowBalance.map(co=><div key={co.id} className="rounded-lg border p-3 text-sm"><b>{co.name}</b> — saldo de anúncios: {money.format(co.current_ad_balance)}</div>)}
        {attentionCampaigns.map(c=><div key={c.id} className="rounded-lg border p-3 text-sm"><b>{companyName(c.company_id)}</b> — {c.name} {daysUntil(c.ends_on)===0?"encerra hoje":`encerra em ${daysUntil(c.ends_on)} dia(s)`}</div>)}
        {attentionTasks.map(t=><div key={t.id} className="rounded-lg border p-3 text-sm"><b>{t.company_id?companyName(t.company_id):"CLT geral"}</b> — {t.title} {t.due_date!<today?"está atrasada":"é importante hoje"}</div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Saldos das empresas</CardTitle></CardHeader><CardContent className="space-y-2">
        {companies.map(co=><div key={co.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="font-medium">{co.name}</span><span className={Number(co.current_ad_balance)<=100?"font-semibold text-amber-500":"font-semibold"}>{money.format(co.current_ad_balance)}</span></div>)}
        <Button asChild variant="outline" size="sm"><Link href="/trabalho/empresas">Gerenciar saldos</Link></Button>
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Campanhas em andamento</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th className="pb-2">Empresa</th><th>Campanha</th><th>Iniciou</th><th>Encerra</th><th className="text-right">Gasto</th></tr></thead><tbody>{active.map(c=><tr key={c.id} className="border-t"><td className="py-3 font-medium">{companyName(c.company_id)}</td><td>{c.name}</td><td>{new Date(c.starts_on+"T12:00:00").toLocaleDateString("pt-BR")}</td><td>{new Date(c.ends_on+"T12:00:00").toLocaleDateString("pt-BR")}</td><td className="text-right">{money.format(c.spent_amount)}</td></tr>)}</tbody></table>{active.length===0&&<p className="py-5 text-center text-sm text-muted-foreground">Nenhuma campanha ativa.</p>}</div></CardContent></Card>

    <Card><CardHeader><CardTitle>Resultados por empresa — <span className="capitalize">{monthFmt.format(month)}</span></CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th className="pb-2">Empresa</th><th className="text-right">Gasto</th><th className="text-right">Mensagens</th><th className="text-right">Vendas</th><th className="text-right">Visualizações</th></tr></thead><tbody>{companies.map(co=>{const cc=monthly.filter(c=>c.company_id===co.id);return <tr key={co.id} className="border-t"><td className="py-3 font-medium">{co.name}</td><td className="text-right">{money.format(cc.reduce((s,c)=>s+Number(c.spent_amount),0))}</td><td className="text-right">{cc.reduce((s,c)=>s+c.messages,0)}</td><td className="text-right">{cc.reduce((s,c)=>s+c.sales,0)}</td><td className="text-right">{cc.reduce((s,c)=>s+c.views,0).toLocaleString("pt-BR")}</td></tr>})}</tbody></table></div></CardContent></Card>


  </div>;
}
