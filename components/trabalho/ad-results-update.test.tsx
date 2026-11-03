import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdResultsFields, AdResultsHistory, AdResultsUpdateButton, parseMetricInput } from "./ad-results-update";
import { AD_METRICS, type AdMetricKey, type Totals } from "@/lib/clt/ad-result-update";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/clt-ad-results-actions", () => ({ updateCltAdResultsAction: vi.fn() }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Atualizar resultados (tela)", () => {
  it("lê valores em formato brasileiro; vazio = não informado", () => {
    expect(parseMetricInput("spend", "1.234,56")).toBe(1234.56);
    expect(parseMetricInput("spend", "R$ 150")).toBe(150);
    expect(parseMetricInput("spend", "150.5")).toBe(150.5);
    expect(parseMetricInput("conversations", "50.100")).toBe(50100);
    expect(parseMetricInput("conversations", "")).toBeNull();
    expect(parseMetricInput("conversations", "1,5")).toBeNaN();
    expect(parseMetricInput("spend", "-3")).toBeNaN();
  });

  it("botão aparece no anúncio (ativo ou finalizado)", () => {
    const html = renderToStaticMarkup(<AdResultsUpdateButton adId="a1" adName="Vídeo 1" rows={[]} type="mensagens" campaignStatus="finalizada" />);
    expect(text(html)).toContain("Atualizar resultados");
  });

  it("histórico mostra data/hora, usuário, antes → depois e a diferença", () => {
    const html = renderToStaticMarkup(<AdResultsHistory available updates={[{
      id: "h1", creative_id: "a1", period_start: "2026-11-01", period_end: "2026-11-04", mode: "novo_periodo",
      previous: { spend: 100, conversations: 10, thruplays: null }, updated: { spend: 150, conversations: 15, thruplays: 300 }, delta: { spend: 50, conversations: 5, thruplays: 300 },
      updated_by_name: "Dono", created_at: "2026-11-04T13:23:00Z",
    }]} />);
    const t = text(html);
    expect(t).toContain("Período dos resultados: 01/11/2026 a 04/11/2026");
    expect(t).toContain("Registrado em 04/11/2026, 10:23 por Dono");
    expect(t).toContain("Editar período");
    expect(t).toMatch(/Investimento: R\$\s?100,00 → R\$\s?150,00 \(\+R\$\s?50,00\)/);
    expect(t).toContain("Conversas / mensagens: 10 → 15 (+5)");
    expect(t).toContain("ThruPlays: não informado → 300 (+300)");
  });

  it("histórico mostra as métricas novas", () => {
    const t = text(renderToStaticMarkup(<AdResultsHistory available updates={[{
      id: "h2", creative_id: "a1", period_start: "2026-11-01", period_end: "2026-11-04", mode: "novo_periodo",
      previous: { reactions: null, video_p75: 10 }, updated: { reactions: 30, video_p75: 25 }, delta: { reactions: 30, video_p75: 15 },
      updated_by_name: null, created_at: "2026-11-04T13:23:00Z",
    }]} />));
    expect(t).toContain("Reações à publicação: não informado → 30 (+30)");
    expect(t).toContain("Visualizações de 75%: 10 → 25 (+15)");
  });

  it("sem a migration: avisa em vez de quebrar", () => {
    expect(text(renderToStaticMarkup(<AdResultsHistory available={false} updates={[]} />))).toContain("20261104110000_clt_ad_result_updates.sql");
  });
});

describe("Atualizar resultados — seções recolhíveis", () => {
  const totals = Object.fromEntries(AD_METRICS.map((m) => [m.key, null])) as Totals;
  const fields = Object.fromEntries(AD_METRICS.map((m) => [m.key, ""])) as Record<AdMetricKey, string>;
  const html = renderToStaticMarkup(<AdResultsFields adId="a1" totals={{ ...totals, spend: 100 }} type="mensagens" fields={{ ...fields, spend: "150", reactions: "40", video_p100: "abc" }} setField={() => {}} />);
  const t = text(html);
  const headers = [...html.matchAll(/aria-expanded="(true|false)"[^>]*>[\s\S]*?<span class="block font-semibold[^"]*">([^<]+)<\/span>/g)].map((m) => [m[2], m[1]]);

  it("três seções: principais aberta; engajamento e vídeo fechadas, com seta", () => {
    expect(headers).toEqual([["Resultados principais", "true"], ["Engajamento", "false"], ["Vídeo", "false"]]);
    expect(html.match(/lucide-chevron-down/g)?.length).toBe(3);
  });
  it("campos de cada seção (cliques no link em Engajamento, ThruPlays em Vídeo)", () => {
    const eng = t.slice(t.indexOf("Engajamento"), t.indexOf("Vídeo"));
    for (const l of ["Reações à publicação", "Comentários", "Compartilhamentos", "Novos seguidores (anúncios)", "Cliques no link"]) expect(eng).toContain(l);
    const vid = t.slice(t.indexOf("Vídeo"));
    for (const l of ["Visualizações", "Reproduções de 3 segundos", "ThruPlays", "Visualizações de 75%", "Visualizações de 100%"]) expect(vid).toContain(l);
    const main = t.slice(0, t.indexOf("Engajamento"));
    for (const l of ["Investimento", "Conversas / mensagens", "Vendas", "Faturamento", "Alcance", "Impressões"]) expect(main).toContain(l);
    expect(main).not.toContain("Cliques no link");
  });
  it("seção fechada continua com os campos montados (valores não se perdem) e resume alterações/erros", () => {
    expect(html).toContain('value="40"'); // reações digitadas, seção fechada
    expect(html).toMatch(/inert=""/);
    expect(t).toContain("1 campo(s) alterado(s)");
    expect(t).toContain("1 campo(s) com número inválido");
  });
  it("sem a migration nova: campos de engajamento/vídeo desativados com aviso", () => {
    const locked = renderToStaticMarkup(<AdResultsFields adId="a1" totals={totals} type={null} fields={fields} setField={() => {}} extrasAvailable={false} />);
    expect(text(locked)).toContain("Campos novos disponíveis após aplicar a migração 20261106100000");
    expect(locked).toMatch(/id="ad-a1-reactions"[^>]*disabled=""|disabled=""[^>]*id="ad-a1-reactions"/);
    expect(locked).not.toMatch(/id="ad-a1-spend"[^>]*disabled=""|disabled=""[^>]*id="ad-a1-spend"/);
  });
});
