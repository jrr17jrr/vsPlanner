import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock, ExternalLink, Mail, Phone, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCltDashboardData } from "@/lib/supabase/repositories/clt.repository";
import { CompanyDetailTasks } from "@/components/trabalho/company-detail-tasks";
import { CompanyDetailBalance } from "@/components/trabalho/company-detail-balance";

const money = (n:number) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmt = (s:string) => s.split("-").reverse().join("/");
export default async function CompanyPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const data=await getCltDashboardData();
 const company=data.companies.find(c=>c.id===id);
 if(!company)notFound();
 const responsible=data.responsibles.find(r=>r.id===company.responsible_id);
 const tasks=data.tasks.filter(t=>t.company_id===id&&!t.archived_at);
 const campaigns=data.campaigns.filter(c=>c.company_id===id);
 const pending=tasks.filter(t=>t.status==="pendente").length;
 const spent=campaigns.reduce((a,c)=>a+Number(c.spent_amount||0),0);
 const messages=campaigns.reduce((a,c)=>a+Number(c.messages||0),0);
 const sales=campaigns.reduce((a,c)=>a+Number(c.sales||0),0);
 return <div className="space-y-5">
 <Link href="/trabalho/empresas" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Voltar para empresas</Link>
 <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Building2 className="h-6 w-6 text-primary"/><h1 className="text-2xl font-semibold">{company.name}</h1></div><p className="mt-1 text-sm text-muted-foreground">Responsável: {responsible?.name??"Não informado"} · Painel individual da empresa</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/trabalho/tarefas">Todas as tarefas</Link></Button><Button asChild variant="outline"><Link href="/trabalho/campanhas">Todas as campanhas</Link></Button></div></div>
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
 {([{label:"Saldo da Meta",value:money(Number(company.current_ad_balance)),icon:Wallet},{label:"Tarefas pendentes",value:String(pending),icon:Clock},{label:"Campanhas cadastradas",value:String(campaigns.length),icon:CalendarDays},{label:"Investimento registrado",value:money(spent),icon:CheckCircle2}]).map(item=><Card key={item.label}><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><item.icon className="h-4 w-4"/>{item.label}</div><p className="mt-2 text-xl font-semibold">{item.value}</p></CardContent></Card>)}</div>
 <CompanyDetailBalance company={company}/>
 <CompanyDetailTasks companyId={id} tasks={tasks} companies={data.companies} occurrences={data.occurrences}/>
 <Card><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Campanhas da empresa</h2><Button asChild variant="outline" size="sm"><Link href="/trabalho/campanhas">Gerenciar campanhas</Link></Button></div>
 <p className="text-xs text-muted-foreground">Totais das campanhas cadastradas: {messages} mensagens · {sales} vendas. O investimento mostrado é a soma dos registros, não necessariamente apenas do mês atual.</p>
 {campaigns.length?campaigns.map(c=><div key={c.id} className="rounded-lg border p-3"><div className="font-medium">{c.name}</div><p className="mt-1 text-xs text-muted-foreground">{fmt(c.starts_on)} até {fmt(c.ends_on)}</p><div className="mt-2 flex flex-wrap gap-4 text-sm"><span>Investido: <b>{money(Number(c.spent_amount||0))}</b></span><span>Mensagens: <b>{c.messages}</b></span><span>Vendas: <b>{c.sales}</b></span><span>Visualizações: <b>{c.views}</b></span></div></div>):<p className="text-sm text-muted-foreground">Nenhuma campanha cadastrada para esta empresa.</p>}</CardContent></Card>
 <Card><CardContent className="space-y-3 p-4"><h2 className="font-semibold">Dados e contatos</h2><div className="grid gap-3 text-sm sm:grid-cols-2"><p><b>Responsável:</b> {responsible?.name??"Não informado"}</p><p><b>Instagram:</b> {company.instagram||"Não informado"}</p>{company.email&&<a href={"mailto:"+company.email} className="inline-flex items-center gap-2 hover:underline"><Mail className="h-4 w-4"/>{company.email}</a>}{company.company_phone&&<p className="flex items-center gap-2"><Phone className="h-4 w-4"/>{company.company_phone}</p>}{company.responsible_phone&&<p><b>Telefone do responsável:</b> {company.responsible_phone}</p>}{company.website&&<a href={company.website.startsWith("http")?company.website:"https://"+company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:underline"><ExternalLink className="h-4 w-4"/>Abrir site</a>}</div>{company.notes&&<p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{company.notes}</p>}</CardContent></Card>
 </div>;
}
