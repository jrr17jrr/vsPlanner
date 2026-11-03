import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdResultsHistory, AdResultsUpdateButton, parseMetricInput } from "./ad-results-update";

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
    expect(t).toContain("04/11/2026, 10:23");
    expect(t).toContain("Dono");
    expect(t).toContain("período 01/11/2026 a 04/11/2026");
    expect(t).toMatch(/Investimento: R\$\s?100,00 → R\$\s?150,00 \(\+R\$\s?50,00\)/);
    expect(t).toContain("Conversas / mensagens: 10 → 15 (+5)");
    expect(t).toContain("ThruPlays: não informado → 300 (+300)");
  });

  it("sem a migration: avisa em vez de quebrar", () => {
    expect(text(renderToStaticMarkup(<AdResultsHistory available={false} updates={[]} />))).toContain("20261104110000_clt_ad_result_updates.sql");
  });
});
