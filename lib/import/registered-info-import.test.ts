import { describe, expect, it } from "vitest";
import { parseImportInput, protectBigIntegers } from "./parse";
import { validateImport } from "./validate";
import { collectInfoTargets, planInfoChanges } from "./info-plan";
import { SMART_EXAMPLES } from "./examples";
import type { ExistingSnapshot } from "./types";

/** Informações cadastradas na Central de Importação: lidas, vinculadas ao registro certo e sem apagar o que foi omitido. */
const parse = (content: string) => { const r = parseImportInput(content); if (!r.ok) throw new Error(r.error); return r.bundle; };
const empty = (): ExistingSnapshot => ({ company: { id: "co", name: "SGIV" }, audiences: [], campaigns: [], adSets: [], ads: [], legacyResultCampaignIds: [], periodMetrics: [] });
const existing = (): ExistingSnapshot => ({
  ...empty(),
  campaigns: [{ id: "cmp-1", name: "SGIV | WhatsApp", meta_campaign_id: null }],
  adSets: [{ id: "set-1", campaign_id: "cmp-1", name: "Conjunto A", meta_adset_id: null }],
  ads: [{ id: "ad-1", ad_set_id: "set-1", name: "Vídeo 01", meta_ad_id: null }, { id: "ad-2", ad_set_id: "set-1", name: "Imagem 02", meta_ad_id: "999" }],
});

describe("IDs do Meta sem perda de precisão", () => {
  it("número JSON com 18 dígitos vira texto antes da leitura (o ID fica idêntico)", () => {
    expect(protectBigIntegers('{"a": 120212345678901234, "b": 15.5, "c": "120212345678901234", "d": -3}')).toBe('{"a": "120212345678901234", "b": 15.5, "c": "120212345678901234", "d": -3}');
    const b = parse('{"campaigns":[{"name":"C","meta_campaign_id":120212345678901234,"ad_sets":[{"name":"S","meta_adset_id":120212345678901235,"ads":[{"name":"A","meta_ad_id":120212345678901236}]}]}]}');
    expect(b.campaigns[0].metaId).toBe("120212345678901234");
    expect(b.campaigns[0].adSets[0].metaId).toBe("120212345678901235");
    expect(b.campaigns[0].adSets[0].ads[0].metaId).toBe("120212345678901236");
  });
  it("texto: ID com espaços é limpo; notação científica é erro", () => {
    const b = parse("Campanha: C\nConjunto: S\nAnúncio: A\nID do anúncio: 1202 1234 5678 9012 34");
    expect(b.campaigns[0].adSets[0].ads[0].metaId).toBe("120212345678901234");
    const bad = parse("Campanha: C\nID da campanha: 1,20212E+17");
    expect(bad.problems.some((p) => /notação científica/.test(p.message))).toBe(true);
  });
});

describe("texto: campanha, conjunto e anúncio", () => {
  const b = parse(SMART_EXAMPLES.campanhas.text);
  const c = b.campaigns[0], s = c.adSets[0], ad = s.ads[0];
  it("campanha: lances, tipo de compra e ID", () => {
    expect(c.metaId).toBe("120210000000000001");
    expect(c.info).toMatchObject({ bid_strategy: "Volume mais alto", buying_type: "Leilão" });
  });
  it("conjunto: localização, raio, idade, idioma, posicionamentos, local da conversão, objetivo de desempenho", () => {
    expect(s.metaId).toBe("120210000000000002");
    expect(s.info).toMatchObject({ location: "Cabo Frio, RJ", radius_km: 10, age_min: 25, age_max: 55, languages: "Português", conversion_location: "WhatsApp", performance_goal: "Maximizar o número de conversas" });
    expect(s.placements).toBe("Feed e Stories do Instagram");
  });
  it("anúncio: ID, formato, link, texto principal, título, CTA e destino", () => {
    expect(ad.metaId).toBe("120210000000000003");
    expect(ad.info).toMatchObject({ format: "video", asset_url: "https://www.instagram.com/p/EXEMPLO1/", primary_text: "Garanta sua vaga com condição especial de novembro.", headline: "Oferta de novembro", call_to_action: "Enviar mensagem", destination: "WhatsApp" });
    expect(s.ads[1].info).toEqual({ format: "imagem" });
  });
  it("nenhum aviso de campo desconhecido/fora de contexto no exemplo", () => {
    expect(b.problems).toEqual([]);
  });
  it("dados do conjunto antes de 'Anúncio:' (sem 'Conjunto:') vão para o conjunto; link inválido não é gravado", () => {
    const t = parse("Campanha: Nova\nInício: 01/11/2026\nPúblico: Amplo\nLocalização: Búzios\nIdade: 18+\nAnúncio: A\nLink: não tenho");
    expect(t.campaigns[0].adSets[0].info).toMatchObject({ location: "Búzios", age_min: 18, age_max: 65 });
    expect(t.campaigns[0].adSets[0].ads[0].info?.asset_url).toBeUndefined();
    expect(t.problems.find((p) => /link inválido/.test(p.message))).toMatchObject({ level: "warning" });
  });
});

describe("JSON", () => {
  it("lê as informações e guarda as demais configurações em details (só valores simples)", () => {
    const b = parse(JSON.stringify({ campaigns: [{ name: "C", bid_strategy: "Custo por resultado", special_ad_category: "Nenhuma", investimento: 10, ad_sets: [{ name: "S", targeting_location: { city: "Cabo Frio", region: "RJ", radius_km: 12 }, age_range: "25-55", gender: "Todos", placements: ["Feed", "Reels"], ads: [{ name: "A", permalink: "https://fb.com/p/1", body: "Olá", cta: "Saiba mais", destino: "Site", utm: "abc", nested: { x: 1 } }] }] }] }));
    const c = b.campaigns[0], s = c.adSets[0], ad = s.ads[0];
    expect(c.info).toEqual({ bid_strategy: "Custo por resultado" });
    expect(c.details).toEqual({ special_ad_category: "Nenhuma" }); // métrica (investimento) nunca vira detalhe
    expect(s.info).toMatchObject({ location: "Cabo Frio, RJ", radius_km: 12, age_min: 25, age_max: 55, gender: "Todos", placements: "Feed, Reels" });
    expect(s.placements).toBe("Feed, Reels");
    expect(ad.info).toMatchObject({ asset_url: "https://fb.com/p/1", primary_text: "Olá", call_to_action: "Saiba mais", destination: "Site" });
    expect(ad.details).toEqual({ utm: "abc" });
  });
  it("exemplo JSON da Central passa sem erro e traz as informações", () => {
    const b = parse(SMART_EXAMPLES.campanhas.json);
    expect(b.problems).toEqual([]);
    expect(b.campaigns[0].adSets[0].ads[0].info).toMatchObject({ asset_url: "https://www.instagram.com/p/EXEMPLO1/", call_to_action: "Enviar mensagem" });
  });
});

describe("vínculo com o registro certo e preservação do que foi omitido", () => {
  it("anúncio existente: só os campos informados mudam; omitidos não aparecem; iguais não são regravados", () => {
    const b = parse("Campanha: SGIV | WhatsApp\nConjunto: Conjunto A\nAnúncio: Vídeo 01\nID do anúncio: 120212345678901234\nLink: https://instagram.com/p/X\nDestino: WhatsApp");
    const p = validateImport(b, existing(), { today: "2026-11-04" });
    expect(p.issues.filter((i) => i.level === "error")).toEqual([]);
    const targets = collectInfoTargets(p);
    const adTarget = targets.find((t) => t.level === "ad")!;
    expect(adTarget).toMatchObject({ id: "ad-1", values: { meta_ad_id: "120212345678901234", asset_url: "https://instagram.com/p/X", destination: "WhatsApp" } });
    const { changes, ops } = planInfoChanges(targets, { "ad-1": { id: "ad-1", name: "Vídeo 01", meta_ad_id: null, asset_url: null, destination: "WhatsApp", headline: "Título antigo", primary_text: "Texto antigo", details: { utm: "x" } } });
    expect(ops).toEqual([{ level: "ad", id: "ad-1", name: "Vídeo 01", update: { meta_ad_id: "120212345678901234", asset_url: "https://instagram.com/p/X" } }]);
    const ad = changes.find((c) => c.level === "ad")!;
    expect(ad.changes.map((c) => [c.label, c.before, c.after])).toEqual([["ID do anúncio na Meta", null, "120212345678901234"], ["Link do anúncio ou da publicação", null, "https://instagram.com/p/X"]]);
    expect(ad.same.map((s) => s.label)).toEqual(["Destino do anúncio"]);
  });
  it("ID da Meta já salvo nunca é trocado; details é mesclado", () => {
    const { ops } = planInfoChanges([{ level: "ad", id: "ad-2", name: "Imagem 02", action: "update", values: { meta_ad_id: "111" }, details: { utm: "novo" } }], { "ad-2": { meta_ad_id: "999", details: { origem: "manual", utm: "velho" } } });
    expect(ops).toEqual([{ level: "ad", id: "ad-2", name: "Imagem 02", update: { details: { origem: "manual", utm: "novo" } } }]);
  });
  it("anúncio sem 'Conjunto:' com ID novo é identificado pelo nome (não cria nada)", () => {
    const b = parse("Campanha: SGIV | WhatsApp\nAnúncio: Vídeo 01\nID do anúncio: 120212345678901234\nTexto principal: Novo texto");
    const p = validateImport(b, existing(), { today: "2026-11-04" });
    expect(p.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(p.counts.ads).toEqual({ create: 0, update: 1 });
    expect(collectInfoTargets(p).find((t) => t.level === "ad")).toMatchObject({ id: "ad-1", values: { primary_text: "Novo texto" } });
  });
  it("com métricas e sem período (atualização parcial), as informações também entram", () => {
    const b = parse("Campanha: SGIV | WhatsApp\nAnúncio: Vídeo 01\nInterações: 10\nChamada para ação: Enviar mensagem");
    const p = validateImport(b, existing(), { today: "2026-11-04" });
    expect(p.mode).toBe("metrics_update");
    expect(collectInfoTargets(p).find((t) => t.level === "ad")!.values).toEqual({ call_to_action: "Enviar mensagem" });
  });
});
