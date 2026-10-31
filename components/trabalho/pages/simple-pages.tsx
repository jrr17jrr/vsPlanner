import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CltDashboard } from "@/components/trabalho/clt-dashboard";
import { CompaniesClient } from "@/components/trabalho/companies-client";
import { NewCampaignButton } from "@/components/trabalho/new-campaign-button";
import { SmartImporter } from "@/components/trabalho/smart-importer";
import { CltAnalytics } from "@/components/trabalho/clt-analytics";
import { CampaignHistory } from "@/components/trabalho/campaign-history";
import { CltTasksPageClient } from "@/components/trabalho/clt-tasks-page-client";
import { NewCltTaskButton } from "@/components/trabalho/new-clt-task-button";
import { ModulePendingNotice } from "@/components/trabalho/pages/module-pending-notice";
import { getCltDashboardData } from "@/lib/supabase/repositories/clt.repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withImportedPeriodResults } from "@/lib/supabase/clt-period-results";
import { loadHistoryInput } from "@/lib/supabase/clt-history-data";
import { buildHistoryFacts, messagingPoints } from "@/lib/clt/history";
import { MODULES, type CltModule } from "@/lib/clt/module";
import type { CltCampaignResultEntry } from "@/types/database.types";

/**
 * Telas do Trabalho / CLT reaproveitadas pelo MKT. Cada uma recebe o módulo
 * e só lê dados dele (ver getCltDashboardData). Para o CLT, a marcação é a
 * mesma das páginas originais.
 */

async function resultsFor(campaignIds: string[]) {
  const s = await createSupabaseServerClient();
  const { data, error } = campaignIds.length ? await s.from("clt_campaign_result_entries").select("*").in("campaign_id", campaignIds) : { data: [], error: null };
  if (error) throw error;
  return { s, merged: await withImportedPeriodResults(s, campaignIds, (data || []) as CltCampaignResultEntry[]) };
}

export async function CltDashboardPage({ module }: { module: CltModule }) {
  const data = await getCltDashboardData(module);
  return <><ModulePendingNotice module={module} ready={data.moduleReady} /><CltDashboard data={data} /></>;
}

export async function CltCompaniesPage({ module, clients = [] }: { module: CltModule; clients?: { id: string; name: string }[] }) {
  const d = await getCltDashboardData(module);
  const { merged } = await resultsFor(d.campaigns.map(c => c.id));
  const description = module === "mkt" ? "Cadastre, edite e acompanhe as empresas do MKT: as suas e as dos clientes da Visionário Dev." : "Cadastre, edite e acompanhe as empresas do Trabalho / CLT.";
  return <div className="space-y-4"><PageHeader title="Empresas" description={description} /><ModulePendingNotice module={module} ready={d.moduleReady} /><CompaniesClient companies={d.companies} responsibles={d.responsibles} campaigns={d.campaigns} results={merged.results} clients={clients} /></div>;
}

export async function CltCampaignsPage({ module }: { module: CltModule }) {
  const d = await getCltDashboardData(module);
  return <div className="space-y-4"><PageHeader title="Campanhas" description="Períodos, gastos e resultados das campanhas." actions={<NewCampaignButton companies={d.companies} />} /><ModulePendingNotice module={module} ready={d.moduleReady} /><Card><CardContent className="p-4 space-y-2">{d.campaigns.length ? d.campaigns.map(c => <div key={c.id} className="rounded-lg border p-3"><b>{d.companies.find(x => x.id === c.company_id)?.name}</b> — {c.name}<div className="text-xs text-muted-foreground">{c.starts_on.split("-").reverse().join("/")} → {c.ends_on.split("-").reverse().join("/")}</div><div className="mt-1 flex flex-wrap gap-x-4 text-sm"><span>Investido: <b>{Number(c.spent_amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></span><span>Conversas: <b>{c.messages}</b></span><span>Vendas: <b>{c.sales}</b></span></div></div>) : <p className="text-sm text-muted-foreground">Nenhuma campanha cadastrada.</p>}</CardContent></Card></div>;
}

export async function CltImportPage({ module }: { module: CltModule }) {
  const d = await getCltDashboardData(module);
  return (
    <div className="space-y-4">
      <PageHeader title="Importador inteligente" description="Públicos, campanhas, conjuntos, anúncios e resultados — por arquivo JSON ou texto. Nada é gravado antes da sua confirmação." />
      <ModulePendingNotice module={module} ready={d.moduleReady} />
      <SmartImporter companies={d.companies.map(c => ({ id: c.id, name: c.name }))} />
    </div>
  );
}

export async function CltAnalysesPage({ module }: { module: CltModule }) {
  const d = await getCltDashboardData(module);
  const { s, merged } = await resultsFor(d.campaigns.map(c => c.id));
  // Histórico mensal/comparação: mesmas campanhas (mesmo módulo e empresas) já carregadas acima.
  const history = await loadHistoryInput(s, d.campaigns.map(c => ({ id: c.id, company_id: c.company_id, name: c.name, objective: c.objective, starts_on: c.starts_on, ends_on: c.ends_on, campaign_status: c.campaign_status ?? null })));
  const messaging = messagingPoints(buildHistoryFacts(history).facts);
  const basePath = MODULES[module].basePath;
  return <div className="space-y-6"><ModulePendingNotice module={module} ready={d.moduleReady} /><CltAnalytics companies={d.companies} campaigns={d.campaigns} results={merged.results} messaging={messaging} basePath={basePath} /><CampaignHistory companies={d.companies.map(c => ({ id: c.id, name: c.name }))} input={history} basePath={basePath} /></div>;
}

export async function CltTasksPage({ module }: { module: CltModule }) {
  const d = await getCltDashboardData(module);
  const title = module === "mkt" ? "Tarefas do MKT" : "Tarefas do CLT";
  const description = module === "mkt" ? "Tarefas do dia, prazos e repetições exclusivas do MKT." : "Tarefas do dia, prazos e repetições exclusivas do Trabalho / CLT.";
  return <div className="space-y-4"><PageHeader title={title} description={description} /><ModulePendingNotice module={module} ready={d.moduleReady} /><CltTasksPageClient tasks={d.tasks} companies={d.companies} occurrences={d.occurrences} /></div>;
}

const weekdayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export async function CltRoutinePage({ module }: { module: CltModule }) {
  const d = await getCltDashboardData(module);
  const general = MODULES[module].generalLabel;
  const recurring = d.tasks.filter(t => t.recurrence === "weekly" && !t.archived_at);
  const title = module === "mkt" ? "Rotina do MKT" : "Rotina do CLT";
  const description = module === "mkt" ? "Recorrências do MKT, separadas do Trabalho / CLT e da sua rotina pessoal." : "Recorrências do trabalho, totalmente separadas da sua rotina pessoal.";
  return <div className="space-y-4"><PageHeader title={title} description={description} actions={<NewCltTaskButton companies={d.companies} />} /><ModulePendingNotice module={module} ready={d.moduleReady} /><div className="grid gap-3 lg:grid-cols-2">{weekdayNames.map((name, day) => { const items = recurring.filter(t => t.weekdays.includes(day)).sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? "")); return <Card key={day}><CardContent className="p-4"><div className="mb-3 flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />{name}</div>{items.length ? items.map(t => <div key={t.id} className="mb-2 rounded-lg border p-3 text-sm"><span className="mr-2 text-muted-foreground">{t.scheduled_time?.slice(0, 5) || "--:--"}</span><b>{t.company_id ? d.companies.find(c => c.id === t.company_id)?.name : general}</b> — {t.title}</div>) : <p className="text-sm text-muted-foreground">Nenhuma recorrência.</p>}</CardContent></Card>; })}</div></div>;
}
