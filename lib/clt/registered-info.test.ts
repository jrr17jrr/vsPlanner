import { describe, expect, it } from "vitest";
import { adInfoRows, adSetInfoRows, campaignInfoRows, detailRows, infoSummary, normalizeInfoForm, normalizeMetaId, safeHref } from "./registered-info";

/** Informações cadastradas: exibidas como estão, "Não informado" quando vazias — nada inventado. */
const byKey = (rows: ReturnType<typeof adInfoRows>) => Object.fromEntries(rows.map((r) => [r.key, r]));

describe("safeHref", () => {
  it("abre só http/https; www. ganha https; esquemas perigosos são recusados", () => {
    expect(safeHref("https://www.instagram.com/p/ABC/")).toBe("https://www.instagram.com/p/ABC/");
    expect(safeHref("www.site.com.br/x")).toBe("https://www.site.com.br/x");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,oi")).toBeNull();
    expect(safeHref("pasta do drive")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe("anúncio", () => {
  const ad = { name: "Vídeo 01 | Oferta", meta_ad_id: "120212345678901234", format: "video", asset_url: "https://www.instagram.com/p/ABC/", post_id: null, primary_text: "Garanta sua vaga.", headline: null, description: "", call_to_action: "Enviar mensagem", destination: "WhatsApp", notes: null };
  it("ID visível com copiar; link com abrir e copiar; vazios = Não informado (null)", () => {
    const r = byKey(adInfoRows(ad));
    expect(r.meta_ad_id).toMatchObject({ value: "120212345678901234", copy: true });
    expect(r.asset_url).toMatchObject({ value: "https://www.instagram.com/p/ABC/", copy: true, href: "https://www.instagram.com/p/ABC/" });
    expect(r.format.value).toBe("Vídeo");
    expect(r.call_to_action.value).toBe("Enviar mensagem");
    expect(r.destination.value).toBe("WhatsApp");
    expect(r.headline.value).toBeNull();
    expect(r.description.value).toBeNull();
    expect(r.post_id.value).toBeNull();
  });
  it("formato padrão 'outro' do banco = não informado; link sem http não ganha botão Abrir", () => {
    const r = byKey(adInfoRows({ name: "A", format: "outro", asset_url: "pasta do drive" }));
    expect(r.format.value).toBeNull();
    expect(r.asset_url).toMatchObject({ value: "pasta do drive", href: null });
  });
  it("anúncio antigo (só nome e formato) aparece sem erro", () => {
    const rows = adInfoRows({ name: "Antigo", format: "imagem", asset_url: null, notes: null });
    expect(rows.filter((x) => x.value).map((x) => x.key)).toEqual(["name", "format"]);
    expect(infoSummary(rows)).toMatch(/^2 de \d+ campos informados$/);
  });
});

describe("conjunto", () => {
  const audience = { id: "aud-1", name: "Cabo Frio | Amplo", audience_type: "salvo", settings: { targeting_location: { city: "Cabo Frio", radius_km: 10 }, age_range: [25, 55] } };
  it("usa os campos do conjunto e, se vazios, mostra os do público vinculado (indicado)", () => {
    const r = byKey(adSetInfoRows({ name: "Conjunto A", meta_adset_id: "120200000000000002", languages: "Português", conversion_location: "WhatsApp", performance_goal: "Maximizar conversas", daily_budget: 15 }, { campaignName: "Campanha X", audience }));
    expect(r.meta_adset_id).toMatchObject({ value: "120200000000000002", copy: true });
    expect(r.campaign.value).toBe("Campanha X");
    expect(r.audience).toMatchObject({ value: "Cabo Frio | Amplo", link: { kind: "audience", id: "aud-1" } });
    expect(r.audience_type.value).toBe("Salvo");
    expect(r.location).toMatchObject({ value: "Cabo Frio +10 km", hint: "do público Cabo Frio | Amplo" });
    expect(r.age).toMatchObject({ value: "25 a 55 anos", hint: "do público Cabo Frio | Amplo" });
    expect(r.languages.value).toBe("Português");
    expect(r.conversion_location.value).toBe("WhatsApp");
    expect(r.daily_budget.value).toMatch(/15,00/);
    expect(r.gender.value).toBeNull();
  });
  it("valor do próprio conjunto prevalece sobre o do público", () => {
    const r = byKey(adSetInfoRows({ name: "B", location: "Búzios", age_min: 30, age_max: 65 }, { campaignName: null, audience }));
    expect(r.location).toMatchObject({ value: "Búzios" });
    expect(r.location.hint).toBeUndefined();
    expect(r.age.value).toBe("30 a 65+ anos");
  });
});

describe("campanha", () => {
  it("todos os campos cadastrados, com ID e link do gerenciador", () => {
    const r = byKey(campaignInfoRows({ name: "C", meta_campaign_id: "120200000000000001", objective: "mensagens", campaign_status: "ativa", budget_type: "daily", daily_budget: 20, planned_amount: 0, starts_on: "2026-11-05", ends_on: "2026-11-30", bid_strategy: "Volume mais alto", buying_type: "Leilão", created_in_meta: true, manager_url: "https://adsmanager.facebook.com/x", details: { special_ad_category: "Nenhuma" } }));
    expect(r.meta_campaign_id).toMatchObject({ value: "120200000000000001", copy: true });
    expect(r.campaign_status.value).toBe("Ativa");
    expect(r.budget_type.value).toBe("Diário");
    expect(r.planned_amount.value).toBeNull();
    expect(r.starts_on.value).toBe("05/11/2026");
    expect(r.bid_strategy.value).toBe("Volume mais alto");
    expect(r.manager_url.href).toBe("https://adsmanager.facebook.com/x");
    expect(r["details.special_ad_category"]).toMatchObject({ label: "Special ad category", value: "Nenhuma" });
  });
  it("details ignora vazios e mostra listas", () => {
    expect(detailRows({ a: "", b: null, c: ["x", "y"] }).map((x) => [x.key, x.value])).toEqual([["details.c", "x, y"]]);
  });
});

describe("IDs e formulário", () => {
  it("ID como texto: espaços removidos; notação científica recusada", () => {
    expect(normalizeMetaId(" 1202 1234 5678 9012 34 ")).toEqual({ value: "120212345678901234" });
    expect(normalizeMetaId("1.20212E+17").error).toMatch(/notação científica/);
    expect(normalizeMetaId("")).toEqual({ value: null });
  });
  it("salva só colunas de cadastro (métricas são ignoradas); vazio = null; valida idade", () => {
    const r = normalizeInfoForm("ad", { name: "Novo nome", meta_ad_id: "120212345678901234", asset_url: "https://x.com/p", headline: "", format: "Vídeo", spend: "999", impressions: "1" });
    expect(r).toEqual({ update: { name: "Novo nome", meta_ad_id: "120212345678901234", asset_url: "https://x.com/p", headline: null, format: "video" } });
    expect(normalizeInfoForm("adSet", { age_min: "40", age_max: "30" })).toEqual({ error: "Idade máxima menor que a mínima." });
    expect(normalizeInfoForm("adSet", { age_min: "8" })).toMatchObject({ error: expect.stringMatching(/13 e 100/) });
    expect(normalizeInfoForm("ad", { name: " " })).toEqual({ error: "O nome não pode ficar vazio." });
    expect(normalizeInfoForm("adSet", { radius_km: "12,5 km", placements: "Feed" })).toEqual({ update: { radius_km: 12.5, placements: "Feed" } });
  });
});
