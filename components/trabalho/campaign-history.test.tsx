import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CampaignHistory } from "./campaign-history";
import type { HistoryInput } from "@/lib/clt/history";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T12:00:00-03:00")); });
afterAll(() => vi.useRealTimers());

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

const input: HistoryInput = {
  campaigns: [{ id: "c1", company_id: "co", name: "WhatsApp Outubro", objective: "engajamento", starts_on: "2026-10-01", ends_on: "2026-10-31", campaign_status: "ativa" }],
  adSets: [
    { id: "tp", campaign_id: "c1", name: "ThruPlay", result_type: "visualizacoes" },
    { id: "msg", campaign_id: "c1", name: "WhatsApp", result_type: "mensagens" },
    { id: "eng", campaign_id: "c1", name: "Engajamento", result_type: null },
  ],
  campaignEntries: [],
  adLevelEntries: [],
  periodMetrics: [
    { campaign_id: "c1", ad_set_id: "tp", creative_id: "a1", period_start: "2026-10-01", period_end: "2026-10-31", spend: 72.81, conversations: null, sales: null, revenue: null, impressions: null },
    { campaign_id: "c1", ad_set_id: "msg", creative_id: "a2", period_start: "2026-10-01", period_end: "2026-10-31", spend: 195.17, conversations: 27, sales: null, revenue: null, impressions: null },
    { campaign_id: "c1", ad_set_id: "eng", creative_id: "a3", period_start: "2026-10-01", period_end: "2026-10-31", spend: 130.89, conversations: null, sales: null, revenue: null, impressions: null },
  ],
};

describe("Histórico mensal (renderização)", () => {
  it("abre no mês atual com investimento total e custo por mensagem elegível", () => {
    const html = text(renderToStaticMarkup(<CampaignHistory companies={[{ id: "co", name: "Empresa X" }]} input={input} />));
    expect(html).toContain("Histórico mensal e comparação de campanhas");
    expect(html).toContain("Investimento R$ 398,87");
    expect(html).toContain("Custo por mensagem R$ 7,23");
    expect(html).toContain("Elegível: R$ 195,17 de R$ 398,87");
    expect(html).toContain("WhatsApp Outubro");
    expect(html).not.toContain("R$ 14,77"); // 398,87 ÷ 27 nunca aparece
  });
  it("sem dados no mês mostra estado vazio, com traço no custo", () => {
    const html = text(renderToStaticMarkup(<CampaignHistory companies={[]} input={{ ...input, periodMetrics: [] }} />));
    expect(html).toContain("Nenhum resultado registrado em Outubro de 2026");
    expect(html).toContain("Custo por mensagem —");
  });
});
