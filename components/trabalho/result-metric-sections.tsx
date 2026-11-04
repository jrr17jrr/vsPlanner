"use client";

import { CollapsibleSection } from "@/components/trabalho/company/collapsible-section";
import { levelCards, type LevelCard, type LevelTotals } from "@/lib/clt/result-metrics";
import { fmtRate, RATE_KEYS, RATE_SHORT, type LatestRate, type RateKey } from "@/lib/clt/video-rates";

export type CardSection = { id: string; title: string; cards: LevelCard[]; defaultOpen?: boolean; note?: string };

/** Resumo do cabeçalho de uma seção fechada: os primeiros valores informados. */
function sectionSummary(cards: LevelCard[]) {
  const shown = cards.filter((c) => !c.muted && c.value !== "—");
  if (!shown.length) return "Sem dados informados";
  return shown.slice(0, 3).map((c) => `${c.label}: ${c.value}`).join(" · ") + (shown.length > 3 ? " · …" : "");
}

/**
 * Cards de métricas em seções recolhíveis (mesmo padrão do formulário
 * "Atualizar resultados"). Usado em anúncio, conjunto, campanha e empresa.
 */
export function MetricCardSections({ sections }: { sections: CardSection[] }) {
  return <div className="space-y-2">{sections.map((s) => (
    <CollapsibleSection key={s.id} compact className="shadow-none" title={s.title} defaultOpen={s.defaultOpen} summary={sectionSummary(s.cards)}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {s.cards.map((c) => <div key={c.key} className="min-w-0 rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{c.label}</p><p className={"mt-1 break-words font-semibold " + (c.muted ? "text-sm text-muted-foreground" : "text-lg")}>{c.value}</p></div>)}
      </div>
      {s.note && <p className="mt-2 text-[11px] text-muted-foreground">{s.note}</p>}
    </CollapsibleSection>
  ))}</div>;
}

export const ENGAGEMENT_NOTE = "Novos seguidores atribuídos aos anúncios (Meta Ads) — não é o total de seguidores do Instagram. Cliques no link não contam como conversas.";
export const COSTS_NOTE = "CPC = investimento ÷ cliques no link · CTR = cliques ÷ impressões · CPM = investimento ÷ impressões × 1000. Só entram registros que informaram os dois valores; sem base suficiente aparece “—”.";

export const RATES_NOTE = "Taxa de Gancho e Taxa de Retenção são informadas (Meta Ads), salvas exatamente como digitadas e nunca calculadas nem somadas. No anúncio, vale a do registro mais recente.";
export const RATES_AGG_NOTE = "Taxa de Gancho e Taxa de Retenção são informadas por anúncio e não são somadas nem viram média — veja cada anúncio.";

/** Cards das taxas informadas de UM anúncio (registro mais recente de cada uma). */
export function rateCards(rates: Record<RateKey, LatestRate>): LevelCard[] {
  return RATE_KEYS.map((k) => {
    const r = rates[k];
    const when = r ? ` (${r.start === r.end ? r.end.split("-").reverse().join("/") : `${r.start.split("-").reverse().join("/")} a ${r.end.split("-").reverse().join("/")}`})` : "";
    return { key: k, label: RATE_SHORT[k] + when, value: r ? fmtRate(r.value) : "não informado", muted: !r };
  });
}

/**
 * Totais de anúncio/conjunto/campanha em Principais (aberta), Engajamento, Vídeo e Custos e taxas.
 * `rates`: só na tela do ANÚNCIO (taxas informadas); nos agregados, só a observação.
 */
export function LevelMetricSections({ t, rates }: { t: LevelTotals; rates?: Record<RateKey, LatestRate> }) {
  const c = levelCards(t);
  return <MetricCardSections sections={[
    { id: "principal", title: "Resultados principais", cards: c.principal, defaultOpen: true },
    { id: "engajamento", title: "Engajamento", cards: c.engajamento, note: ENGAGEMENT_NOTE },
    { id: "video", title: "Vídeo", cards: rates ? [...c.video, ...rateCards(rates)] : c.video, note: rates ? RATES_NOTE : RATES_AGG_NOTE },
    { id: "custos", title: "Custos e taxas (CPC, CTR, CPM)", cards: c.custos, note: COSTS_NOTE },
  ]} />;
}
