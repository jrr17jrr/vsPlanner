import { describe, expect, it } from "vitest";
import { campaignCardIndicators, type CardRow } from "./campaign-card";
import { makeTypeResolver } from "./history";

const resolver = (objective: string | null, sets: Array<{ id: string; result_type?: string | null }> = [{ id: "s1" }]) =>
  makeTypeResolver([{ id: "c", objective }], sets.map((s) => ({ campaign_id: "c", result_type: null, ...s })));
const row = (over: Partial<CardRow>): CardRow => ({ campaign_id: "c", ad_set_id: "s1", spent_amount: 0, ...over });
const labels = (r: ReturnType<typeof campaignCardIndicators>) => r.indicators.map((i) => `${i.label}=${i.value}`);
// Espaço do toLocaleString pode ser não separável.
const clean = (s: string[]) => s.map((x) => x.replace(/\s/g, " "));

describe("indicadores dinâmicos do card da campanha", () => {
  it("mensagens / WhatsApp", () => {
    const r = campaignCardIndicators("c", [row({ spent_amount: 100, messages: 20, thruplays: 500 })], resolver("Engajamento → WhatsApp"));
    expect(clean(labels(r))).toEqual(["Investimento=R$ 100,00", "Conversas=20", "Custo por conversa=R$ 5,00"]);
  });
  it("engajamento não vira mensagem", () => {
    const r = campaignCardIndicators("c", [row({ spent_amount: 50, engagements: 250, messages: 3 })], resolver("Engajamento"));
    expect(clean(labels(r))).toEqual(["Investimento=R$ 50,00", "Interações=250", "Custo por interação=R$ 0,20"]);
  });
  it("ThruPlay nunca é tratado como conversa", () => {
    const r = campaignCardIndicators("c", [row({ spent_amount: 30, thruplays: 1000, views: 4000, messages: 0 })], resolver("Visualizações do vídeo (ThruPlay)"));
    expect(clean(labels(r))).toEqual(["Investimento=R$ 30,00", "ThruPlays=1.000", "Custo por ThruPlay=R$ 0,03"]);
  });
  it("vídeo sem ThruPlay usa visualizações", () => {
    const r = campaignCardIndicators("c", [row({ spent_amount: 40, views: 2000 })], resolver("Visualizações"));
    expect(r.indicators[1].label).toBe("Visualizações");
  });
  it("vendas, leads", () => {
    expect(campaignCardIndicators("c", [row({ spent_amount: 300, sales: 3 })], resolver("Vendas")).indicators[2].value.replace(/\s/g, " ")).toBe("R$ 100,00");
    expect(campaignCardIndicators("c", [row({ spent_amount: 80, leads: 8 })], resolver("Leads")).indicators.map((i) => i.label)).toEqual(["Investimento", "Leads", "Custo por lead"]);
  });
  it("tráfego: CPC só com as linhas que informaram cliques", () => {
    const r = campaignCardIndicators("c", [row({ spent_amount: 40, link_clicks: 20 }), row({ spent_amount: 60 })], resolver("Tráfego"));
    expect(clean(labels(r))).toEqual(["Investimento=R$ 100,00", "Cliques no link=20", "CPC=R$ 2,00"]);
  });
  it("alcance: CPM só com impressões informadas; sem impressões = —", () => {
    expect(clean(labels(campaignCardIndicators("c", [row({ spent_amount: 10, reach: 900, impressions: 1000 })], resolver("Alcance"))))[2]).toBe("CPM=R$ 10,00");
    expect(campaignCardIndicators("c", [row({ spent_amount: 10, reach: 900 })], resolver("Alcance")).indicators[2].value).toBe("—");
  });
  it("misto: tipo de maior investimento e custo só dele", () => {
    const types = resolver(null, [{ id: "a", result_type: "mensagens" }, { id: "b", result_type: "visualizacoes" }]);
    const r = campaignCardIndicators("c", [row({ ad_set_id: "a", spent_amount: 100, messages: 10 }), row({ ad_set_id: "b", spent_amount: 50, thruplays: 500, messages: 0 })], types);
    expect(clean(labels(r))).toEqual(["Investimento=R$ 150,00", "Conversas=10", "Custo por conversa=R$ 10,00"]);
  });
  it("sem dados: — em vez de zero; sem tipo e sem conversas = Resultados", () => {
    expect(labels(campaignCardIndicators("c", [], resolver("Vendas")))).toEqual(["Investimento=—", "Vendas=—", "Custo por venda=—"]);
    expect(campaignCardIndicators("c", [row({ spent_amount: 10 })], resolver(null)).indicators.map((i) => i.label)).toEqual(["Investimento", "Resultados", "Custo por resultado"]);
  });
  it("sem tipo cadastrado mas com conversas (campanha antiga) continua como mensagens", () => {
    expect(campaignCardIndicators("c", [row({ spent_amount: 10, messages: 2 })], resolver(null)).indicators[1].label).toBe("Conversas");
  });
});
