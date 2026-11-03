"use client";

import { CollapsibleSection } from "@/components/trabalho/company/collapsible-section";
import { levelCards, type LevelCard, type LevelTotals } from "@/lib/clt/result-metrics";

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

/** Totais de anúncio/conjunto/campanha em Principais (aberta), Engajamento, Vídeo e Custos e taxas. */
export function LevelMetricSections({ t }: { t: LevelTotals }) {
  const c = levelCards(t);
  return <MetricCardSections sections={[
    { id: "principal", title: "Resultados principais", cards: c.principal, defaultOpen: true },
    { id: "engajamento", title: "Engajamento", cards: c.engajamento, note: ENGAGEMENT_NOTE },
    { id: "video", title: "Vídeo", cards: c.video },
    { id: "custos", title: "Custos e taxas (CPC, CTR, CPM)", cards: c.custos, note: COSTS_NOTE },
  ]} />;
}
