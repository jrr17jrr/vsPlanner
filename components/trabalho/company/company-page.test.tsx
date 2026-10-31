import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CompanyTabs } from "./company-tabs";
import { CollapsibleSection } from "./collapsible-section";
import { OverviewAudiences, OverviewCampaigns, OverviewTasks } from "./overview-sections";
import { CompanyResultsSummary } from "@/components/trabalho/company-results-summary";
import { mergePeriodResults, periodResultsToEntries, type PeriodMetricRow } from "@/lib/clt/period-results";
import type { AudienceRecord } from "@/lib/supabase/clt-audience-actions";
import type { CltCampaign, CltTask } from "@/types/database.types";
import { buildHistoryFacts, messagingPoints } from "@/lib/clt/history";

/**
 * Renderiza a página da empresa no servidor (sem banco) e confere a
 * estrutura: cinco abas, só a aba ativa montada, accordions fechados por
 * padrão e os resultados da IG Predial (período 30/09–29/10/2026).
 */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T12:00:00-03:00")); });
afterAll(() => vi.useRealTimers());

describe("abas da empresa", () => {
  const panels = { "visao-geral": <p>painel-geral</p>, campanhas: <p>painel-campanhas</p>, publicos: <p>painel-publicos</p>, tarefas: <p>painel-tarefas</p>, financeiro: <p>painel-financeiro</p> };

  it("mostra as cinco abas e monta só a ativa (Visão Geral por padrão)", () => {
    const html = renderToStaticMarkup(<CompanyTabs initialTab="visao-geral" panels={panels} />);
    expect(html.match(/role="tab"/g)).toHaveLength(5);
    for (const l of ["Visão Geral", "Campanhas", "Públicos", "Tarefas", "Financeiro"]) expect(text(html)).toContain(l);
    expect(html).toMatch(/aria-selected="true"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Visão Geral/);
    expect(html).toContain("painel-geral");
    expect(html).not.toContain("painel-campanhas");
  });

  it("abre direto na aba da URL (?aba=financeiro)", () => {
    const html = renderToStaticMarkup(<CompanyTabs initialTab="financeiro" panels={panels} />);
    expect(html).toContain("painel-financeiro");
    expect(html).not.toContain("painel-geral");
  });
});

describe("seções recolhíveis", () => {
  it("começam fechadas (aria-expanded=false e conteúdo inerte)", () => {
    const html = renderToStaticMarkup(<CollapsibleSection title="Campanhas da empresa" summary="3 campanha(s)"><p>conteudo</p></CollapsibleSection>);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/inert=""/);
    expect(html).toContain("grid-template-rows:0fr");
  });

  it("prévias com contagem e botões para as abas", () => {
    const campaigns = [
      { id: "c1", name: "IG Predial | WhatsApp | Cabo Frio", campaign_status: "ativa", starts_on: "2026-10-15", ends_on: "2026-11-01", spent_amount: 206.22, messages: 21, sales: 37, views: 0 },
      { id: "c2", name: "Antiga", campaign_status: "finalizada", starts_on: "2026-09-01", ends_on: "2026-09-30", spent_amount: 0, messages: 0, sales: 0, views: 0 },
    ] as unknown as CltCampaign[];
    const c = text(renderToStaticMarkup(<OverviewCampaigns campaigns={campaigns} />));
    expect(c).toContain("2 campanha(s) · 1 ativa(s)");
    expect(c).toMatch(/Investido: R\$ 206,22/);
    expect(c).toContain("Ver todas as campanhas");

    const audiences = [
      { id: "a1", name: "Cabo Frio | + | 15/10/26", audience_type: "salvo", settings: { targeting_location: { city: "Cabo Frio", radius_km: 15 }, age_range: [20, 65] }, source_audience_id: null, included_audience_ids: [], excluded_audience_ids: [] },
      { id: "a2", name: "Semelhante (1%)", audience_type: "semelhante", settings: { percentage: 1 }, source_audience_id: null, included_audience_ids: [], excluded_audience_ids: [] },
    ] as AudienceRecord[];
    const a = text(renderToStaticMarkup(<OverviewAudiences audiences={audiences} linkedSetCount={{ a1: 1 }} />));
    expect(a).toContain("2 público(s) · 1 salvo(s) · 0 personalizado(s) · 1 semelhante(s)");
    expect(a).toContain("Localização: Cabo Frio +15 km · Idade: 20 a 65+ anos");
    expect(a).toContain("Usado em 1 conjunto(s)");
    expect(a).toContain("Gerenciar públicos");

    const tasks = [{ id: "t1", title: "Revisar campanhas", status: "pendente", recurrence: "none", weekdays: [], due_date: "2026-11-02", priority: "importante" }] as unknown as CltTask[];
    const t = text(renderToStaticMarkup(<OverviewTasks tasks={tasks} occurrences={[]} pending={1} />));
    expect(t).toContain("1 pendente(s) · 1 no total");
    expect(t).toContain("Pendente · 02/11/2026 · Importante");
    expect(t).toContain("Ver todas as tarefas");
  });
});

describe("resultados da empresa — referência IG Predial 30/09 a 29/10/2026", () => {
  // Linhas por anúncio lidas do arquivo real (9 anúncios, incluindo a estimativa do conjunto excluído).
  type Ad = { metrics?: Record<string, number | null> };
  const file = JSON.parse(readFileSync("dados-importacao/ig-predial/ig_predial_campanhas_atualizado_conjunto_excluido.json", "utf8")) as { campaigns: { objective: string; ad_sets: { ads?: Ad[] }[] }[] };
  const rows: PeriodMetricRow[] = file.campaigns.flatMap((c, i) => c.ad_sets.flatMap(s => (s.ads ?? []).map(ad => ({
    campaign_id: "c" + i, period_start: "2026-09-30", period_end: "2026-10-29",
    spend: ad.metrics?.spend_brl ?? null, conversations: ad.metrics?.whatsapp_conversations ?? null, sales: ad.metrics?.sales ?? null,
    revenue: ad.metrics?.revenue_brl ?? null, impressions: ad.metrics?.impressions ?? null,
  }))));

  it("este mês mostra 80 mensagens, 38 vendas, R$ 9.610,00, R$ 843,17 e 48.283 impressões (sem duplicar)", () => {
    expect(rows).toHaveLength(9);
    // Um lançamento antigo dentro do período NÃO pode somar de novo.
    const legacy = [{ campaign_id: "c0", entry_date: "2026-10-20" }];
    const merged = mergePeriodResults(legacy, rows);
    expect(merged.excludedLegacy).toBe(1);
    // Objetivo real do arquivo (engagement_to_whatsapp) → todo o investimento é elegível para mensagens.
    const history = buildHistoryFacts({
      campaigns: file.campaigns.map((c, i) => ({ id: "c" + i, company_id: "ig", name: "c" + i, objective: c.objective, starts_on: "2026-09-30", ends_on: "2026-10-29" })),
      adSets: rows.map((r, i) => ({ id: "s" + i, campaign_id: r.campaign_id, name: "s" + i })),
      campaignEntries: [], adLevelEntries: [],
      periodMetrics: rows.map((r, i) => ({ ...r, ad_set_id: "s" + i, creative_id: "a" + i })),
    });
    const html = text(renderToStaticMarkup(<CompanyResultsSummary results={periodResultsToEntries(merged.imported)} messaging={messagingPoints(history.facts)} />));
    expect(html).toMatch(/Gasto em anúncios R\$ 843,17/);
    expect(html).toMatch(/Faturamento bruto R\$ 9\.610,00/);
    expect(html).toMatch(/Mensagens 80 /);
    expect(html).toMatch(/Vendas 38 /);
    expect(html).toMatch(/Impressões 48\.283 /);
    expect(html).toMatch(/Resultado após anúncios R\$ 8\.766,83/);
    expect(html).toMatch(/Custo por mensagem R\$ 10,54/);
  });
});
