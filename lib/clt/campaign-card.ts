import type { FactType, ResultType } from "@/lib/clt/history";

/**
 * Os TRÊS indicadores do card de cada campanha (CLT e MKT), adaptados ao
 * tipo de resultado — puro e testado (lib/clt/campaign-card.test.ts).
 *
 *  - O tipo vem do MESMO resolvedor das telas e do histórico
 *    (`makeTypeResolver`: tipo do conjunto → objetivo da campanha). Nunca
 *    usa o nome da campanha.
 *  - Custo = investimento SÓ das linhas daquele tipo ÷ resultado dessas
 *    mesmas linhas. ThruPlay nunca vira conversa, interação nunca vira
 *    mensagem, custos de objetivos diferentes nunca se misturam.
 *  - Campanha com conjuntos de tipos diferentes ("misto"): o resultado
 *    principal é o do tipo com MAIOR investimento; o custo usa só ele.
 *  - Sem dados: "—" (nunca 0 inventado).
 */

export type CardRow = Record<string, unknown> & { spent_amount?: unknown; ad_set_id?: string | null; campaign_id: string };
export type CardResolver = {
  setType: (id: string) => { type: ResultType | null };
  campaignLevelType: (campaignId: string) => { type: FactType };
};
export type CampaignIndicator = { label: string; value: string };
export type CampaignCard = { type: ResultType | null; indicators: [CampaignIndicator, CampaignIndicator, CampaignIndicator] };

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

type Spec = { label: string; cost: string; value: (rows: CardRow[]) => number | null; costOf?: (rows: CardRow[], spend: number) => number | null };

const sum = (key: string) => (rows: CardRow[]) => (rows.length ? rows.reduce((a, r) => a + n(r[key]), 0) : null);
/** Investimento só das linhas que informaram a outra ponta (ex.: CPC só com cliques informados). */
const ratio = (key: string, factor = 1) => (rows: CardRow[]) => {
  const informed = rows.filter((r) => n(r[key]) > 0);
  const base = informed.reduce((a, r) => a + n(r[key]), 0);
  const spend = informed.reduce((a, r) => a + n(r.spent_amount), 0);
  return base > 0 && spend > 0 ? (spend / base) * factor : null;
};

function specFor(type: ResultType | null, rows: CardRow[]): Spec {
  switch (type) {
    case "mensagens": return { label: "Conversas", cost: "Custo por conversa", value: sum("messages") };
    case "engajamento": return { label: "Interações", cost: "Custo por interação", value: sum("engagements") };
    case "visualizacoes": {
      // ThruPlay é o resultado da campanha de vídeo quando informado; senão, visualizações.
      const thru = rows.some((r) => n(r.thruplays) > 0);
      return thru
        ? { label: "ThruPlays", cost: "Custo por ThruPlay", value: sum("thruplays") }
        : { label: "Visualizações", cost: "Custo por visualização", value: sum("views") };
    }
    case "vendas": return { label: "Vendas", cost: "Custo por venda", value: sum("sales") };
    case "leads": return { label: "Leads", cost: "Custo por lead", value: sum("leads") };
    case "trafego": return { label: "Cliques no link", cost: "CPC", value: sum("link_clicks"), costOf: (r) => ratio("link_clicks")(r) };
    case "alcance": return { label: "Alcance", cost: "CPM", value: sum("reach"), costOf: (r) => ratio("impressions", 1000)(r) };
    default: return { label: "Resultados", cost: "Custo por resultado", value: () => null };
  }
}

export function campaignCardIndicators(campaignId: string, rows: CardRow[], types: CardResolver): CampaignCard {
  const own = rows.filter((r) => r.campaign_id === campaignId);
  const spend = Math.round(own.reduce((a, r) => a + n(r.spent_amount), 0) * 100) / 100;
  const typeOf = (r: CardRow): ResultType | null => {
    if (r.ad_set_id) return types.setType(r.ad_set_id).type;
    const t = types.campaignLevelType(campaignId).type;
    return t === "misto" ? null : t;
  };
  const level = types.campaignLevelType(campaignId).type;
  let type: ResultType | null = level === "misto" ? null : level;
  if (level === "misto") {
    const byType = new Map<ResultType, number>();
    for (const r of own) { const t = typeOf(r); if (t) byType.set(t, (byType.get(t) ?? 0) + n(r.spent_amount)); }
    type = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  // Sem tipo cadastrado: campanhas antigas de mensagens continuam como antes (só se houver conversas registradas).
  if (!type && own.some((r) => n(r.messages) > 0)) type = "mensagens";
  if (type === "outro") type = null;

  const eligible = level === "misto" ? own.filter((r) => typeOf(r) === type) : own;
  const spec = specFor(type, eligible);
  const value = eligible.length ? spec.value(eligible) : null;
  const eligibleSpend = eligible.reduce((a, r) => a + n(r.spent_amount), 0);
  const cost = spec.costOf ? spec.costOf(eligible, eligibleSpend) : value && value > 0 && eligibleSpend > 0 ? eligibleSpend / value : null;
  return {
    type,
    indicators: [
      { label: "Investimento", value: own.length ? money(spend) : "—" },
      { label: spec.label, value: value === null ? "—" : int(value) },
      { label: spec.cost, value: cost === null ? "—" : money(cost) },
    ],
  };
}
