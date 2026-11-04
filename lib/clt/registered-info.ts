import { describeAudienceSettings } from "@/lib/clt/audience-summary";

/**
 * Informações CADASTRADAS de campanhas, conjuntos e anúncios (não são
 * métricas). Um único lugar para: quais colunas existem, como aparecem na
 * tela ("Não informado" quando vazio — nada é inventado) e quais colunas
 * dependem da migration 20261109100000.
 */

export const INFO_MIGRATION = "Aplique no Supabase a migration supabase/migrations/20261109100000_clt_registered_info.sql para salvar estas informações.";

/** Colunas criadas pela migration 20261109100000 (as demais já existiam). */
export const NEW_INFO_COLUMNS = {
  campaign: ["bid_strategy", "buying_type", "details"],
  adSet: ["radius_km", "age_min", "age_max", "gender", "languages", "conversion_location", "performance_goal", "details"],
  ad: ["primary_text", "headline", "description", "call_to_action", "destination", "details"],
} as const;
export type InfoLevel = keyof typeof NEW_INFO_COLUMNS;
export const isNewInfoColumn = (level: InfoLevel, col: string) => (NEW_INFO_COLUMNS[level] as readonly string[]).includes(col);

export type InfoKind = "text" | "long" | "id" | "url" | "money" | "number" | "integer" | "format";
export type InfoField = { column: string; label: string; kind: InfoKind };

/**
 * Campos editáveis/importáveis de cada nível (coluna = nome no banco).
 * IDs do Meta e nomes ficam fora: são tratados pela importação/estrutura.
 */
export const INFO_FIELDS: Record<InfoLevel, InfoField[]> = {
  campaign: [
    { column: "bid_strategy", label: "Estratégia de lances", kind: "text" },
    { column: "buying_type", label: "Tipo de compra", kind: "text" },
    { column: "planned_amount", label: "Orçamento total previsto", kind: "money" },
    { column: "manager_url", label: "Link do Gerenciador", kind: "url" },
    { column: "description", label: "Observações", kind: "long" },
  ],
  adSet: [
    { column: "location", label: "Localização", kind: "text" },
    { column: "radius_km", label: "Raio (km)", kind: "number" },
    { column: "age_min", label: "Idade mínima", kind: "integer" },
    { column: "age_max", label: "Idade máxima", kind: "integer" },
    { column: "gender", label: "Gênero", kind: "text" },
    { column: "languages", label: "Idioma", kind: "text" },
    { column: "placements", label: "Posicionamentos", kind: "text" },
    { column: "conversion_location", label: "Local da conversão", kind: "text" },
    { column: "performance_goal", label: "Objetivo de desempenho", kind: "text" },
  ],
  ad: [
    { column: "format", label: "Formato", kind: "format" },
    { column: "asset_url", label: "Link do anúncio ou da publicação", kind: "url" },
    { column: "post_id", label: "ID da publicação", kind: "id" },
    { column: "primary_text", label: "Texto principal", kind: "long" },
    { column: "headline", label: "Título", kind: "text" },
    { column: "description", label: "Descrição", kind: "long" },
    { column: "call_to_action", label: "Botão de chamada para ação", kind: "text" },
    { column: "destination", label: "Destino do anúncio", kind: "text" },
  ],
};

export const FORMAT_LABEL: Record<string, string> = { imagem: "Imagem", video: "Vídeo", carrossel: "Carrossel", outro: "Outro" };
const STATUS_LABEL: Record<string, string> = { planejada: "Planejada", ativa: "Ativa", pausada: "Pausada", finalizada: "Finalizada" };
const AUDIENCE_TYPE_LABEL: Record<string, string> = { salvo: "Salvo", personalizado: "Personalizado", semelhante: "Semelhante" };

const has = (v: unknown) => v !== undefined && v !== null && !(typeof v === "string" && !v.trim());
const text = (v: unknown) => (has(v) ? String(v).trim() : null);
const money = (v: unknown) => (has(v) && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null);
const dateBR = (v: unknown) => {
  const s = text(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] && !(m[4] === "00" && m[5] === "00") ? ` ${m[4]}:${m[5]}` : ""}` : s;
};

/**
 * Link seguro para abrir: só http(s). "www.site.com" vira "https://www.site.com";
 * qualquer outro esquema (javascript:, data:…) é recusado.
 */
export function safeHref(raw: unknown): string | null {
  const s = text(raw);
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : /^[\w-]+(\.[\w-]+)+(\/|$|\?|#|:)/.test(s) ? `https://${s}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

/** Linha exibida na seção "Informações …". `value=null` → "Não informado". */
export type InfoRow = { key: string; label: string; value: string | null; copy?: boolean; href?: string | null; long?: boolean; hint?: string; link?: { kind: "audience"; id: string } };

const row = (key: string, label: string, value: string | null, extra: Partial<InfoRow> = {}): InfoRow => ({ key, label, value, ...extra });

/** Rótulo legível de uma chave de `details` ("bid_amount" → "Bid amount"). */
const detailLabel = (k: string) => { const s = k.replace(/[_-]+/g, " ").trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
function plain(v: unknown): string | null {
  if (!has(v)) return null;
  if (Array.isArray(v)) { const parts = v.map(plain).filter(Boolean); return parts.length ? parts.join(", ") : null; }
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") { const parts = Object.entries(v as Record<string, unknown>).map(([k, x]) => { const p = plain(x); return p ? `${detailLabel(k)}: ${p}` : null; }).filter(Boolean); return parts.length ? parts.join(" · ") : null; }
  return String(v).trim();
}
/** "Outras informações" (`details`): só o que tem valor, na ordem gravada. */
export function detailRows(details: unknown): InfoRow[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  return Object.entries(details as Record<string, unknown>).flatMap(([k, v]) => {
    const value = plain(v);
    if (!value) return [];
    const href = typeof v === "string" ? safeHref(v) : null;
    return [row(`details.${k}`, detailLabel(k), value, { copy: /(^|_)(id|link|url)$/i.test(k) || !!href, href: href && /^https?:/i.test(String(v)) ? href : null, long: value.length > 80 })];
  });
}

type CampaignLike = {
  name: string; meta_campaign_id?: string | null; objective?: string | null; campaign_status?: string | null;
  budget_type?: string | null; daily_budget?: number | null; planned_amount?: number | null; starts_on?: string | null; ends_on?: string | null;
  bid_strategy?: string | null; buying_type?: string | null; created_in_meta?: boolean | null; manager_url?: string | null; description?: string | null;
  details?: unknown;
};
export function campaignInfoRows(c: CampaignLike): InfoRow[] {
  const id = text(c.meta_campaign_id);
  const url = text(c.manager_url);
  return [
    row("name", "Nome da campanha", text(c.name), { copy: true }),
    row("meta_campaign_id", "ID da campanha na Meta", id, { copy: true }),
    row("objective", "Objetivo", text(c.objective)),
    row("campaign_status", "Status", c.campaign_status ? STATUS_LABEL[c.campaign_status] ?? c.campaign_status : null),
    row("budget_type", "Tipo de orçamento", c.budget_type === "daily" ? "Diário" : c.budget_type === "total" ? "Total" : null),
    row("daily_budget", "Orçamento diário", money(c.daily_budget)),
    row("planned_amount", "Orçamento total previsto", money(c.planned_amount)),
    row("starts_on", "Data de início", dateBR(c.starts_on)),
    row("ends_on", "Data de término", dateBR(c.ends_on)),
    row("bid_strategy", "Estratégia de lances", text(c.bid_strategy)),
    row("buying_type", "Tipo de compra", text(c.buying_type)),
    row("created_in_meta", "Criada no Meta Ads", c.created_in_meta === true ? "Sim" : c.created_in_meta === false ? "Não" : null),
    row("manager_url", "Link do Gerenciador", url, { copy: true, href: safeHref(url) }),
    row("description", "Observações", text(c.description), { long: true }),
    ...detailRows(c.details),
  ];
}

type AudienceLike = { id: string; name: string; audience_type?: string | null; settings?: unknown } | null;
type AdSetLike = {
  name: string; meta_adset_id?: string | null; audience?: string | null; location?: string | null; radius_km?: number | null;
  age_min?: number | null; age_max?: number | null; gender?: string | null; languages?: string | null; placements?: string | null;
  conversion_location?: string | null; performance_goal?: string | null; daily_budget?: number | null; budget_amount?: number | null;
  starts_at_local?: string | null; ends_at_local?: string | null; reported_status?: string | null; notes?: string | null; details?: unknown;
};
/**
 * Conjunto: os campos do próprio conjunto; quando vazios e houver público
 * vinculado, mostra o valor do público (indicado como "do público").
 */
export function adSetInfoRows(s: AdSetLike, ctx: { campaignName: string | null; audience: AudienceLike }): InfoRow[] {
  const aud = ctx.audience;
  const fromAudience = new Map(aud ? describeAudienceSettings(aud.settings) : []);
  const hint = aud ? `do público ${aud.name}` : undefined;
  const fallback = (own: string | null, label: string) => (own ? { value: own } : fromAudience.get(label) ? { value: fromAudience.get(label)!, hint } : { value: null });
  const age = has(s.age_min) || has(s.age_max) ? `${has(s.age_min) ? s.age_min : "?"} a ${has(s.age_max) ? (Number(s.age_max) >= 65 ? "65+" : s.age_max) : "?"} anos` : null;
  const loc = fallback(text(s.location), "Localização");
  const ownBudget = money(s.daily_budget) ?? money(s.budget_amount);
  return [
    row("name", "Nome do conjunto", text(s.name), { copy: true }),
    row("meta_adset_id", "ID do conjunto na Meta", text(s.meta_adset_id), { copy: true }),
    row("campaign", "Campanha vinculada", ctx.campaignName),
    row("audience", "Público utilizado", aud?.name ?? text(s.audience), aud ? { link: { kind: "audience", id: aud.id } } : {}),
    row("audience_type", "Tipo do público", aud?.audience_type ? AUDIENCE_TYPE_LABEL[aud.audience_type] ?? aud.audience_type : null),
    row("location", "Localização", loc.value, { hint: loc.hint }),
    row("radius_km", "Raio", has(s.radius_km) ? `${Number(s.radius_km).toLocaleString("pt-BR")} km` : null),
    { ...row("age", "Idade", null), ...fallback(age, "Idade") },
    { ...row("gender", "Gênero", null), ...fallback(text(s.gender), "Gênero") },
    { ...row("languages", "Idioma", null), ...fallback(text(s.languages), "Idioma") },
    row("placements", "Posicionamentos", text(s.placements), { long: true }),
    row("conversion_location", "Local da conversão", text(s.conversion_location)),
    row("performance_goal", "Objetivo de desempenho", text(s.performance_goal)),
    row("daily_budget", has(s.daily_budget) ? "Orçamento diário" : "Orçamento do conjunto", ownBudget),
    row("starts_at_local", "Início", dateBR(s.starts_at_local)),
    row("ends_at_local", "Término programado", dateBR(s.ends_at_local)),
    row("reported_status", "Status informado", text(s.reported_status)),
    row("notes", "Observações", text(s.notes), { long: true }),
    ...detailRows(s.details),
  ];
}

type AdLike = {
  name: string; meta_ad_id?: string | null; format?: string | null; asset_url?: string | null; post_id?: string | null;
  primary_text?: string | null; headline?: string | null; description?: string | null; call_to_action?: string | null;
  destination?: string | null; notes?: string | null; details?: unknown;
};
export function adInfoRows(ad: AdLike): InfoRow[] {
  const url = text(ad.asset_url);
  return [
    row("name", "Nome do anúncio", text(ad.name), { copy: true }),
    row("meta_ad_id", "ID do anúncio na Meta", text(ad.meta_ad_id), { copy: true }),
    // "outro" é o valor padrão do banco quando o formato não foi informado.
    row("format", "Formato", ad.format && ad.format !== "outro" ? FORMAT_LABEL[ad.format] ?? ad.format : null),
    row("asset_url", "Link do anúncio ou da publicação", url, { copy: true, href: safeHref(url) }),
    row("post_id", "ID da publicação", text(ad.post_id), { copy: true }),
    row("primary_text", "Texto principal", text(ad.primary_text), { long: true, copy: true }),
    row("headline", "Título", text(ad.headline), { copy: true }),
    row("description", "Descrição", text(ad.description), { long: true }),
    row("call_to_action", "Botão de chamada para ação", text(ad.call_to_action)),
    row("destination", "Destino do anúncio", text(ad.destination)),
    row("notes", "Observações", text(ad.notes), { long: true }),
    ...detailRows(ad.details),
  ];
}

/** Resumo do cabeçalho da seção fechada: quantos campos estão preenchidos. */
export function infoSummary(rows: InfoRow[]) {
  const filled = rows.filter((r) => r.value).length;
  const id = rows.find((r) => /meta_.*_id$/.test(r.key) && r.value);
  return `${filled} de ${rows.length} campos informados${id ? ` · ID ${id.value}` : ""}`;
}

/**
 * Normaliza o valor digitado/importado para a coluna (vazio → null).
 * `undefined` = inválido (o chamador mostra o erro).
 */
export function normalizeInfoValue(field: InfoField, raw: unknown): string | number | null | undefined {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  switch (field.kind) {
    case "url": return s.length <= 2000 && safeHref(s) ? s : undefined;
    case "money": case "number": {
      const n = Number(s.replace(/^R\$\s*/i, "").replace(/\s|km$/gi, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
    }
    case "integer": { const n = Number(s); return Number.isInteger(n) && n >= 13 && n <= 100 ? n : undefined; }
    case "format": { const f = normalizeFormat(s); return f ?? undefined; }
    case "id": return /^\S{1,120}$/.test(s) ? s : undefined;
    case "long": return s.slice(0, 5000);
    default: return s.slice(0, 500);
  }
}
export function normalizeFormat(raw: string): "imagem" | "video" | "carrossel" | "outro" | null {
  const t = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/carrossel|carousel/.test(t)) return "carrossel";
  if (/video|reels?\b/.test(t)) return "video";
  if (/imagem|image|foto|photo|estatico/.test(t)) return "imagem";
  if (/^outro|^other/.test(t)) return "outro";
  return null;
}

/** ID do Meta como texto: só dígitos (espaços removidos); notação científica é recusada. */
export function normalizeMetaId(raw: unknown): { value: string | null; error?: string } {
  if (raw === null || raw === undefined) return { value: null };
  const s = String(raw).trim().replace(/\s+/g, "");
  if (!s) return { value: null };
  if (/^\d+([.,]\d+)?e\+?\d+$/i.test(s)) return { value: null, error: `ID em notação científica (${s}) perdeu dígitos. Copie o ID completo, como texto.` };
  return { value: s };
}

/** Campos de estrutura editáveis em "Editar informações" (nome, IDs, público, observações). */
export const STRUCT_FIELDS: Record<"adSet" | "ad", InfoField[]> = {
  adSet: [
    { column: "name", label: "Nome do conjunto", kind: "text" },
    { column: "meta_adset_id", label: "ID do conjunto na Meta", kind: "id" },
    { column: "audience", label: "Público (manual)", kind: "text" },
    { column: "saved_audience_id", label: "Público cadastrado", kind: "id" },
    { column: "notes", label: "Observações", kind: "long" },
  ],
  ad: [
    { column: "name", label: "Nome do anúncio", kind: "text" },
    { column: "meta_ad_id", label: "ID do anúncio na Meta", kind: "id" },
    { column: "notes", label: "Observações", kind: "long" },
  ],
};

/** Valores do formulário → colunas (vazio = null). Erro de validação → mensagem. */
export function normalizeInfoForm(level: "adSet" | "ad", values: Record<string, unknown>): { update: Record<string, unknown> } | { error: string } {
  const fields = [...STRUCT_FIELDS[level], ...INFO_FIELDS[level]];
  const update: Record<string, unknown> = {};
  for (const [col, raw] of Object.entries(values)) {
    const f = fields.find((x) => x.column === col);
    if (!f) continue; // coluna fora da lista: ignorada (nunca métricas)
    if (col === "meta_adset_id" || col === "meta_ad_id") {
      const r = normalizeMetaId(raw);
      if (r.error) return { error: r.error };
      if (r.value && r.value.length > 80) return { error: `${f.label}: ID longo demais.` };
      update[col] = r.value;
      continue;
    }
    if (col === "saved_audience_id") { const s = String(raw ?? "").trim(); update[col] = s || null; continue; }
    let v = normalizeInfoValue(f, raw);
    // Link digitado à mão: salvo como está (a tela só oferece "Abrir" para http/https).
    if (v === undefined && f.kind === "url") v = String(raw).trim().slice(0, 2000);
    if (v === undefined) {
      const why = f.kind === "url" ? "informe um link http/https válido" : f.kind === "integer" ? "informe uma idade entre 13 e 100" : f.kind === "format" ? "escolha Vídeo, Imagem, Carrossel ou Outro" : "valor inválido";
      return { error: `${f.label}: ${why}.` };
    }
    update[col] = v;
  }
  if ("name" in update && !update.name) return { error: "O nome não pode ficar vazio." };
  if (level === "ad" && "format" in update && !update.format) update.format = "outro";
  if (level === "adSet" && typeof update.age_min === "number" && typeof update.age_max === "number" && update.age_max < update.age_min) return { error: "Idade máxima menor que a mínima." };
  return { update };
}
