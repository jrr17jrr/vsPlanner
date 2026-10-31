import { describe, expect, it } from "vitest";
import { buildHistoryFacts, campaignEvolution, compareInsight, diff, filterFacts, messagingCost, messagingPoints, monthsWithData, normalizeObjective, shiftMonth, summarize, type HistoryInput } from "./history";

const C = (id: string, objective: string | null, company = "co1") => ({ id, company_id: company, name: "Campanha " + id, objective, starts_on: "2026-09-01", ends_on: "2026-10-31" });
const P = (campaign_id: string, ad_set_id: string, creative_id: string, period_start: string, period_end: string, spend: number | null, conversations: number | null, extra: Record<string, number | null> = {}) =>
  ({ campaign_id, ad_set_id, creative_id, period_start, period_end, spend, conversations, sales: null, revenue: null, impressions: null, ...extra });
const E = (campaign_id: string, entry_date: string, spent_amount: number, messages: number, extra: Record<string, number> = {}) =>
  ({ campaign_id, entry_date, spent_amount, messages, sales: 0, generated_revenue: 0, ...extra });
const empty: HistoryInput = { campaigns: [], adSets: [], campaignEntries: [], adLevelEntries: [], periodMetrics: [] };

describe("objetivo → tipo de resultado (campo estruturado, nunca o nome)", () => {
  it.each([
    ["mensagens", "mensagens"], ["engagement_to_whatsapp", "mensagens"], ["OUTCOME_ENGAGEMENT", "engajamento"], ["Engajamento", "engajamento"],
    ["visualizacoes", "visualizacoes"], ["ThruPlay", "visualizacoes"], ["VIDEO_VIEWS", "visualizacoes"], ["vendas", "vendas"], ["Conversão", "vendas"],
    ["OUTCOME_SALES", "vendas"], ["leads", "leads"], ["trafego", "trafego"], ["LINK_CLICKS", "trafego"], ["alcance", "alcance"], ["outro", "outro"],
  ])("%s → %s", (raw, expected) => expect(normalizeObjective(raw)).toBe(expected));
  it("vazio ou desconhecido → sem classificação", () => {
    expect(normalizeObjective(null)).toBeNull();
    expect(normalizeObjective("  ")).toBeNull();
    expect(normalizeObjective("xyz")).toBeNull();
  });
});

describe("custo por mensagem usa só o investimento elegível", () => {
  // Exemplo do pedido: ThruPlay R$72,81 + Mensagens R$195,17 + Engajamento R$130,89; 27 conversas.
  const input: HistoryInput = {
    ...empty,
    campaigns: [C("c1", "engajamento")],
    adSets: [
      { id: "s-tp", campaign_id: "c1", name: "ThruPlay", result_type: "visualizacoes" },
      { id: "s-msg", campaign_id: "c1", name: "WhatsApp", result_type: "mensagens" },
      { id: "s-eng", campaign_id: "c1", name: "Engajamento", result_type: null }, // herda "engajamento" da campanha
    ],
    periodMetrics: [
      P("c1", "s-tp", "a1", "2026-10-01", "2026-10-31", 72.81, null),
      P("c1", "s-msg", "a2", "2026-10-01", "2026-10-31", 195.17, 27),
      P("c1", "s-eng", "a3", "2026-10-01", "2026-10-31", 130.89, null),
    ],
  };
  const s = summarize(buildHistoryFacts(input).facts);
  it("investimento total continua R$398,87", () => expect(s.totals.spend).toBe(398.87));
  it("custo por mensagem = 195,17 ÷ 27 ≈ 7,23 (não 398,87 ÷ 27)", () => {
    expect(s.messagingSpend).toBe(195.17);
    expect(s.messagingMessages).toBe(27);
    expect(s.costPerMessage).toBeCloseTo(7.2285, 3);
    expect(s.costPerMessage).not.toBeCloseTo(398.87 / 27, 1);
  });
  it("separa o investimento por tipo e não soma métricas ausentes", () => {
    expect(s.spendByType).toEqual({ visualizacoes: 72.81, mensagens: 195.17, engajamento: 130.89 });
    expect(s.totals.thruplays).toBeNull(); // a importação não traz ThruPlays: "não informado", nunca 0
    expect(s.costPerSale).toBeNull(); // sem vendas → sem custo por venda
  });
  it("sem conversas → custo por mensagem vazio (traço), não zero", () => {
    const s2 = summarize(buildHistoryFacts({ ...input, periodMetrics: [P("c1", "s-msg", "a2", "2026-10-01", "2026-10-31", 50, 0)] }).facts);
    expect(s2.costPerMessage).toBeNull();
  });
  it("conversas de conjuntos não-mensagem ficam fora do custo e são informadas", () => {
    const s3 = summarize(buildHistoryFacts({ ...input, periodMetrics: [...input.periodMetrics, P("c1", "s-eng", "a4", "2026-10-01", "2026-10-31", 0, 3)] }).facts);
    expect(s3.messagingMessages).toBe(27);
    expect(s3.otherMessages).toBe(3);
  });
});

describe("sem duplicar níveis de importação", () => {
  const base: HistoryInput = {
    ...empty,
    campaigns: [C("c1", "mensagens")],
    adSets: [{ id: "s1", campaign_id: "c1", name: "Conj" }],
  };
  it("período importado prevalece sobre lançamentos manuais (campanha e anúncio) dentro dele", () => {
    const { facts } = buildHistoryFacts({
      ...base,
      periodMetrics: [P("c1", "s1", "a1", "2026-10-01", "2026-10-15", 100, 10)],
      campaignEntries: [E("c1", "2026-10-05", 80, 8), E("c1", "2026-10-20", 30, 3)],
      adLevelEntries: [{ ...E("c1", "2026-10-07", 50, 5), ad_set_id: "s1", creative_id: "a1" }],
    });
    const s = summarize(facts);
    expect(s.totals.spend).toBe(130); // 100 importado + 30 (dia 20, fora do período)
    expect(s.totals.messages).toBe(13);
  });
  it("detalhe por conjunto/anúncio substitui o total da campanha na mesma data", () => {
    const { facts } = buildHistoryFacts({
      ...base,
      campaignEntries: [E("c1", "2026-09-10", 90, 9)],
      adLevelEntries: [{ ...E("c1", "2026-09-10", 40, 4), ad_set_id: "s1", creative_id: null }, { ...E("c1", "2026-09-10", 50, 5), ad_set_id: "s1", creative_id: "a1" }],
    });
    expect(summarize(facts).totals.spend).toBe(50); // só a linha por anúncio
  });
  it("reimportar o mesmo período não duplica (chave anúncio+período no banco); sobreposição diferente gera aviso", () => {
    const { warnings } = buildHistoryFacts({
      ...base,
      periodMetrics: [P("c1", "s1", "a1", "2026-09-01", "2026-09-30", 100, 10), P("c1", "s1", "a1", "2026-09-01", "2026-09-15", 40, 4)],
    });
    expect(warnings.some(w => w.kind === "overlap")).toBe(true);
  });
});

describe("histórico mensal", () => {
  const input: HistoryInput = {
    ...empty,
    campaigns: [C("a", "mensagens"), C("b", "mensagens")],
    adSets: [{ id: "sa", campaign_id: "a", name: "A" }, { id: "sb", campaign_id: "b", name: "B" }],
    periodMetrics: [
      P("a", "sa", "x1", "2026-09-01", "2026-09-30", 300, 30),
      P("a", "sa", "x1", "2026-10-01", "2026-10-31", 200, 40),
      P("b", "sb", "x2", "2026-09-20", "2026-10-10", 100, 5), // atravessa meses → entra em outubro, sinalizado
    ],
    campaignEntries: [E("b", "2026-08-15", 50, 5)],
  };
  const { facts, warnings } = buildHistoryFacts(input);
  it("preserva meses anteriores e lista meses com dados", () => {
    expect(monthsWithData(facts)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(summarize(filterFacts(facts, { kind: "month", month: "2026-09" }).facts).totals.spend).toBe(300);
  });
  it("período que atravessa meses entra no mês final e é sinalizado", () => {
    const oct = summarize(filterFacts(facts, { kind: "month", month: "2026-10" }).facts);
    expect(oct.totals.spend).toBe(300);
    expect(oct.crossMonthFacts).toBe(1);
    expect(warnings.filter(w => w.kind === "cross_month")).toHaveLength(1);
  });
  it("intervalo personalizado não rateia períodos parciais", () => {
    const r = filterFacts(facts, { kind: "range", from: "2026-10-01", to: "2026-10-31" });
    expect(summarize(r.facts).totals.spend).toBe(200);
    expect(r.partial).toHaveLength(1);
  });
  it("evolução da mesma campanha por mês", () => {
    const ev = campaignEvolution(facts, "a");
    expect(ev.map(e => [e.month, e.summary.costPerMessage])).toEqual([["2026-09", 10], ["2026-10", 5]]);
  });
  it("navegação entre meses", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("pontos elegíveis alimentam os relatórios existentes", () => {
    const sept = messagingPoints(facts).filter(p => p.month === "2026-09");
    expect(messagingCost(sept)).toEqual({ spend: 300, messages: 30, cost: 10 });
  });
});

describe("campanha só com lançamento da campanha e conjuntos de objetivos diferentes", () => {
  it("fica 'misto' e não entra no custo por mensagem", () => {
    const { facts } = buildHistoryFacts({
      ...empty,
      campaigns: [C("m", "mensagens")],
      adSets: [{ id: "s1", campaign_id: "m", name: "x", result_type: "mensagens" }, { id: "s2", campaign_id: "m", name: "y", result_type: "visualizacoes" }],
      campaignEntries: [E("m", "2026-10-02", 100, 10)],
    });
    const s = summarize(facts);
    expect(facts[0].type).toBe("misto");
    expect(s.costPerMessage).toBeNull();
    expect(s.mixedSpend).toBe(100);
  });
  it("campanha sem objetivo fica sem classificação (não é inventada)", () => {
    const s = summarize(buildHistoryFacts({ ...empty, campaigns: [C("n", null)], campaignEntries: [E("n", "2026-10-02", 100, 10)] }).facts);
    expect(s.unclassifiedSpend).toBe(100);
    expect(s.costPerMessage).toBeNull();
  });
});

describe("comparação", () => {
  it("diferença absoluta e percentual", () => {
    expect(diff(10, 7.5)).toEqual({ abs: -2.5, pct: -25 });
    expect(diff(0, 5)).toEqual({ abs: 5, pct: null });
    expect(diff(null, 5)).toBeNull();
  });
  it("não declara melhor só por gastar menos: exige volume relevante", () => {
    const mk = (spend: number, conv: number) => summarize(buildHistoryFacts({ ...empty, campaigns: [C("x", "mensagens")], campaignEntries: [E("x", "2026-10-01", spend, conv)] }).facts);
    const set = [mk(400, 80), mk(20, 5), mk(300, 50)]; // custos: 5,00 · 4,00 (volume baixo) · 6,00
    const r = compareInsight(set, "mensagens", ["A", "B", "C"]);
    expect(r.lowVolume).toEqual([1]);
    expect(r.bestCost).toBe(0);
    expect(r.bestVolume).toBe(0);
  });
  it("sem resultados do objetivo, não aponta vencedor", () => {
    const s = summarize([]);
    expect(compareInsight([s, s], "vendas", ["A", "B"]).bestCost).toBeNull();
  });
});

describe("importador: tipo de resultado opcional por conjunto", () => {
  it("lê result_type/optimization_goal e mantém arquivos antigos sem ele", async () => {
    const { parseImportInput } = await import("@/lib/import/parse");
    const json = JSON.stringify({ schema_version: "1", import_type: "campaigns", campaigns: [{ name: "C", objective: "engagement_to_whatsapp", ad_sets: [
      { name: "Vídeo", optimization_goal: "THRUPLAY", ads: [{ name: "a", format: "video" }] },
      { name: "WhatsApp", result_type: "mensagens", ads: [{ name: "b", format: "video" }] },
      { name: "Antigo", ads: [{ name: "c", format: "video" }] },
    ] }] });
    const parsed = parseImportInput(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.campaigns[0].adSets.map(s => s.resultType)).toEqual(["visualizacoes", "mensagens", null]);
  });
});
