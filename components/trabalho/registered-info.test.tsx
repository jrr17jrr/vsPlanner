import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { adInfoRows, adSetInfoRows, campaignInfoRows } from "@/lib/clt/registered-info";

/** Seções "Informações …": valores, "Não informado", copiar e abrir link (mesmo layout no celular: grade de 1 coluna). */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/lib/supabase/clt-info-actions", () => ({ updateCltRegisteredInfoAction: async () => ({}) }));
vi.mock("@/lib/supabase/clt-import-actions", () => ({ previewSmartImportAction: async () => ({}), confirmSmartImportAction: async () => ({}) }));
const { InfoSection, IdChip, AdLinkActions, AdInfoForm, AdSetInfoForm } = await import("./registered-info");
const { InfoChangesPanel } = await import("./smart-importer");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const ad = { id: "ad-1", user_id: "u", ad_set_id: "s", name: "Vídeo 01 | Oferta", format: "video", asset_url: "https://www.instagram.com/p/ABC/", notes: null, meta_ad_id: "120212345678901234", post_id: null, primary_text: "Garanta sua vaga.", headline: null, description: null, call_to_action: "Enviar mensagem", destination: "WhatsApp" };

describe("Informações do anúncio", () => {
  const html = renderToStaticMarkup(<InfoSection title="Informações do anúncio" rows={adInfoRows(ad)} onEdit={() => {}} />);
  it("mostra ID, link, textos, CTA e destino; vazios como 'Não informado'", () => {
    const t = text(html);
    expect(t).toContain("Informações do anúncio");
    expect(t).toContain("ID do anúncio na Meta 120212345678901234");
    expect(t).toContain("Link do anúncio ou da publicação https://www.instagram.com/p/ABC/");
    expect(t).toContain("Texto principal Garanta sua vaga.");
    expect(t).toContain("Botão de chamada para ação Enviar mensagem");
    expect(t).toContain("Destino do anúncio WhatsApp");
    expect(t).toContain("Título Não informado");
    expect(t).toContain("Editar informações");
  });
  it("botões: copiar ID e link; abrir link em nova aba com rel seguro", () => {
    expect(html).toContain('aria-label="Copiar ID do anúncio na Meta"');
    expect(html).toContain('aria-label="Copiar Link do anúncio ou da publicação"');
    expect(html).toMatch(/<a [^>]*href="https:\/\/www\.instagram\.com\/p\/ABC\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"|<a [^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*href="https:\/\/www\.instagram\.com\/p\/ABC\/"/);
  });
  it("cabeçalho: ID sempre visível com copiar; link com abrir e copiar", () => {
    const h = renderToStaticMarkup(<><IdChip label="ID do anúncio" value={ad.meta_ad_id} /><AdLinkActions url={ad.asset_url} /></>);
    expect(text(h)).toContain("ID do anúncio 120212345678901234");
    expect(h).toContain('aria-label="Copiar ID do anúncio"');
    expect(text(h)).toContain("Abrir anúncio");
    expect(text(renderToStaticMarkup(<IdChip label="ID do anúncio" value={null} />))).toContain("ID do anúncio: não informado");
    expect(renderToStaticMarkup(<AdLinkActions url={null} />)).toBe("");
  });
  it("link perigoso nunca vira botão de abrir", () => {
    const h = renderToStaticMarkup(<InfoSection title="x" rows={adInfoRows({ ...ad, asset_url: "javascript:alert(1)" })} />);
    expect(h).not.toContain('href="javascript');
  });
});

describe("Informações da campanha e do conjunto", () => {
  it("campanha: ID com copiar, estratégia de lances e tipo de compra (Não informado quando vazio)", () => {
    const t = text(renderToStaticMarkup(<InfoSection title="Informações da campanha" rows={campaignInfoRows({ name: "C", meta_campaign_id: "120210000000000001", objective: "mensagens", campaign_status: "ativa", bid_strategy: "Volume mais alto" })} />));
    expect(t).toContain("ID da campanha na Meta 120210000000000001");
    expect(t).toContain("Estratégia de lances Volume mais alto");
    expect(t).toContain("Tipo de compra Não informado");
  });
  it("conjunto: público com acesso aos detalhes e valores herdados do público indicados", () => {
    const h = renderToStaticMarkup(<InfoSection title="Informações do conjunto" rows={adSetInfoRows({ name: "S", meta_adset_id: "1202" }, { campaignName: "C", audience: { id: "aud", name: "Amplo", audience_type: "salvo", settings: { age_range: [25, 55] } } })} />);
    expect(text(h)).toContain("Ver público");
    expect(text(h)).toContain("Idade 25 a 55 anos (do público Amplo)");
    expect(text(h)).toContain("Campanha vinculada C");
  });
});

describe("formulários de edição", () => {
  it("anúncio: campos preenchidos com o que está salvo; nenhum campo de métrica", () => {
    const h = renderToStaticMarkup(<AdInfoForm ad={ad} onClose={() => {}} />);
    expect(h).toContain('value="120212345678901234"');
    expect(h).toContain('value="https://www.instagram.com/p/ABC/"');
    expect(text(h)).toContain("Métricas, resultados e histórico continuam como estão");
    expect(h).not.toMatch(/name="(spend|spent|messages|impressions)"/);
  });
  it("conjunto: público cadastrado selecionável e idade/raio", () => {
    const h = renderToStaticMarkup(<AdSetInfoForm set={{ id: "s", user_id: "u", campaign_id: "c", name: "S", audience: null, saved_audience_id: "aud", location: null, budget_amount: 0, notes: null, age_min: 25 }} audiences={[{ id: "aud", name: "Amplo", audience_type: "salvo" }]} onClose={() => {}} />);
    expect(h).toContain("Amplo (salvo)");
    expect(h).toContain('name="age_min"');
    expect(h).toContain('value="25"');
  });
});

describe("prévia da importação: informações cadastradas", () => {
  it("atual → novo, e os já iguais listados à parte", () => {
    const t = text(renderToStaticMarkup(<InfoChangesPanel changes={[{ level: "ad", id: "ad-1", name: "Vídeo 01", action: "update", changes: [{ column: "asset_url", label: "Link do anúncio ou da publicação", before: null, after: "https://x.com/p" }], same: [{ label: "Destino do anúncio", value: "WhatsApp" }] }]} />));
    expect(t).toContain("Informações cadastradas");
    expect(t).toContain("Anúncio: Vídeo 01");
    expect(t).toContain("Link do anúncio ou da publicação não informado https://x.com/p");
    expect(t).toContain("Informadas e já iguais (não mudam): Destino do anúncio");
    expect(renderToStaticMarkup(<InfoChangesPanel changes={[]} />)).toBe("");
  });
});
