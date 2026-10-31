import type { SupabaseClient } from "@supabase/supabase-js";
import { PageHeader } from "@/components/shared/page-header";
import { CltReportClient } from "@/components/trabalho/clt-report-client";
import { ModulePendingNotice } from "@/components/trabalho/pages/module-pending-notice";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withImportedPeriodResults } from "@/lib/supabase/clt-period-results";
import { loadHistoryInput } from "@/lib/supabase/clt-history-data";
import { getModuleScope, inList } from "@/lib/supabase/clt-scope";
import { buildHistoryFacts, messagingPoints } from "@/lib/clt/history";
import type { CltModule } from "@/lib/clt/module";
import type { CltCampaignResultEntry } from "@/types/database.types";

/**
 * Relatórios (PDF) do módulo. Empresas, campanhas, resultados, movimentações
 * e comparativos vêm SÓ das empresas do módulo — relatório do MKT nunca
 * inclui dados do CLT e vice-versa.
 */
export async function CltReportsPage({ module }: { module: CltModule }) {
  const s = await createSupabaseServerClient();
  const db = s as unknown as SupabaseClient;
  const { data: { user } } = await s.auth.getUser();
  if (!user) return <p>Faça login.</p>;
  const scope = await getModuleScope(s, user.id, module);
  const ids = inList(scope.companyIds);
  const [campaigns, movements, comparisons] = await Promise.all([
    s.from("clt_campaigns").select("id,company_id,name,objective,starts_on,ends_on,planned_amount,campaign_status").eq("user_id", user.id).in("company_id", ids),
    db.from("clt_ad_account_movements").select("company_id,movement_date,kind,amount").eq("user_id", user.id).in("company_id", ids),
    db.from("clt_campaign_comparisons").select("company_id,old_campaign_ids,new_campaign_ids").eq("user_id", user.id).in("company_id", ids),
  ]);
  const campaignIds = (campaigns.data || []).map(c => c.id);
  const results = campaignIds.length
    ? await s.from("clt_campaign_result_entries").select("campaign_id,entry_date,spent_amount,generated_revenue,views,impressions,thruplays,messages,sales").eq("user_id", user.id).in("campaign_id", campaignIds)
    : { data: [], error: null };
  const movementError = movements.error?.message || "";
  // Resultados importados por anúncio/período entram no mês do FIM do período; lançamentos antigos da mesma campanha dentro do período não são somados de novo.
  const merged = await withImportedPeriodResults(s, campaignIds, (results.data || []) as CltCampaignResultEntry[]);
  // Custo por mensagem: só investimento elegível (conjuntos/campanhas de mensagens).
  const history = await loadHistoryInput(s, (campaigns.data || []).map(c => ({ id: c.id, company_id: c.company_id, name: c.name, objective: c.objective, starts_on: c.starts_on, ends_on: c.ends_on, campaign_status: c.campaign_status ?? null })));
  const messaging = messagingPoints(buildHistoryFacts(history).facts);
  const note = merged.crossMonthPeriods ? " Resultados importados por período aparecem no mês em que o período termina." : "";
  const companies = scope.companies.filter(c => c.is_active).map(c => ({ id: c.id, name: c.name, current_ad_balance: c.current_ad_balance }));
  const title = module === "mkt" ? "Relatórios MKT" : "Relatórios CLT";
  return <div className="space-y-5"><PageHeader title={title} description={"Selecione empresas e mês, registre movimentações e gere um PDF com resultados reais." + note} /><ModulePendingNotice module={module} ready={scope.ready} /><CltReportClient companies={companies} campaigns={campaigns.data || []} results={merged.results} movements={(movements.data || []) as { company_id: string; movement_date: string; kind: string; amount: number }[]} movementError={movementError} comparisons={(comparisons.data || []) as { company_id: string; old_campaign_ids: string[]; new_campaign_ids: string[] }[]} messaging={messaging} /></div>;
}
