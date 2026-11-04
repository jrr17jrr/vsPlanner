import { AUDIENCE_DB_TYPE, METRIC_KEYS, NON_ADDITIVE_METRICS, emptyMetrics, hasExtraMetrics, type AudienceType, type ExistingSnapshot, type ImportAd, type ImportAudience, type ImportBundle, type Metrics, type ReportedTotals } from "./types";
import { normalizeKey, sameName } from "./values";

/**
 * Validação + prévia do Importador Inteligente. Puro: recebe o pacote
 * normalizado (JSON ou texto) e o que já existe na empresa, devolve o que
 * será criado/atualizado, todos os vínculos e os problemas encontrados.
 * O servidor roda isto DE NOVO antes de gravar (nunca confia na prévia do
 * navegador).
 */

export type IssueLevel = "error" | "warning" | "info";
export type ImportIssue = { id: string; level: IssueLevel; path: string; message: string; requiresConfirmation?: boolean };
export type RowAction = "create" | "update";

export type PreviewAudience = {
  ref: string;
  name: string;
  type: AudienceType | null;
  dbType: "salvo" | "personalizado" | "semelhante" | null;
  externalKey: string | null;
  action: RowAction;
  existingId: string | null;
  matchedBy: "external_key" | "name" | null;
  source: { ref: string | null; name: string | null; existingId: string | null; inBundle: boolean } | null;
  settings: Record<string, unknown>;
};

export type AudienceLink = { ref: string | null; name: string | null; type: string | null; existingId: string | null; inBundle: boolean; via: "external_key" | "name" | null };

export type PreviewAd = ImportAd & { action: RowAction; existingId: string | null; hasMetrics: boolean };
export type PreviewAdSet = {
  metaId: string | null; name: string; action: RowAction; existingId: string | null;
  /** Sem "Conjunto:" no arquivo: conjunto descoberto pelo anúncio já cadastrado. */
  autoIdentified?: boolean;
  audience: AudienceLink | null;
  dailyBudget: number | null; startAt: string | null; endAt: string | null; status: string | null; placements: string | null; notes: string | null;
  resultType?: string | null;
  ads: PreviewAd[];
};
export type PreviewCampaign = {
  metaId: string | null; name: string; action: RowAction; existingId: string | null; matchedBy: "meta_id" | "name" | null;
  objective: string | null; dailyBudget: number | null; budgetType: "daily" | "total";
  startsOn: string | null; endsOn: string | null; datesDerived: boolean; status: "planejada" | "ativa" | "pausada" | "finalizada"; statusExplicit: boolean; notes: string | null;
  adSets: PreviewAdSet[];
  known: Metrics;
  reported: ReportedTotals | null;
  difference: { spend: number | null; conversations: number | null } | null;
};

export type ImportPreview = {
  /**
   * `metrics_update`: só anúncios JÁ cadastrados, sem período — os valores são
   * os novos TOTAIS e só as métricas informadas mudam (mesma regra do
   * "Atualizar resultados"). Nada de campanha/conjunto/anúncio é criado ou editado.
   */
  mode: "import" | "metrics_update";
  companyId: string;
  companyName: string;
  sourceFormat: ImportBundle["sourceFormat"];
  period: { start: string; end: string } | null;
  audiences: PreviewAudience[];
  campaigns: PreviewCampaign[];
  issues: ImportIssue[];
  totals: { known: Metrics; reportedSpend: number | null; reportedConversations: number | null; unallocatedSpend: number; unallocatedConversations: number };
  counts: { audiences: Record<RowAction, number>; campaigns: Record<RowAction, number>; adSets: Record<RowAction, number>; ads: Record<RowAction, number>; adsWithMetrics: number };
  canImport: boolean;
  confirmationIds: string[];
  dataQualityNotes: string[];
  /** Só em `metrics_update`: o que muda em cada anúncio (calculado no servidor a partir do banco). */
  metricChanges?: MetricChange[];
};

export type MetricChange = {
  creativeId: string;
  campaign: string;
  adSet: string;
  adSetAutoIdentified: boolean;
  ad: string;
  /** Período em que a diferença passa a contar nos relatórios. */
  periodStart: string | null;
  periodEnd: string | null;
  changes: Array<{ key: string; label: string; before: number | null; after: number }>;
  unchanged: boolean;
};

export type ValidateOptions = {
  /** Período das métricas escolhido na tela (prevalece sobre o do arquivo). */
  period?: { start: string; end: string } | null;
  /** "Hoje" em São Paulo (yyyy-MM-dd), para derivar status. */
  today: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const OBJECTIVE_LABELS: Record<string, string> = {
  engagement_to_whatsapp: "Mensagens no WhatsApp",
  messages: "Mensagens",
  outcome_engagement: "Engajamento",
  outcome_leads: "Cadastros",
  outcome_sales: "Vendas",
  outcome_traffic: "Tráfego",
  outcome_awareness: "Reconhecimento",
};

function mapCampaignStatus(raw: string | null): PreviewCampaign["status"] | null {
  if (!raw) return null;
  const t = normalizeKey(raw);
  if (/planej/.test(t)) return "planejada";
  if (/ativ|active|em andamento|veiculando/.test(t) && !/desativ/.test(t)) return "ativa";
  if (/paus|desativ|inactive|paused/.test(t)) return "pausada";
  if (/final|conclu|encerr|ended|completed/.test(t)) return "finalizada";
  return null;
}

function audienceSettings(a: ImportAudience): Record<string, unknown> {
  const s: Record<string, unknown> = { ...a.extra, import_platform: a.extra.platform ?? undefined };
  if (a.externalKey) s.external_key = a.externalKey;
  if (a.location) s.targeting_location = a.location;
  if (a.ageMin !== null || a.ageMax !== null) s.age_range = [a.ageMin, a.ageMax];
  if (a.interests) s.interests = a.interests;
  if (a.estimatedSize) s.estimated_size = a.estimatedSize;
  if (a.retentionDays !== null) s.retention_days = a.retentionDays;
  if (a.percentage !== null) s.percentage = a.percentage;
  if (a.notes) s.notes = a.notes;
  // Remove chaves vazias: nunca sobrescrever um valor salvo com "ausente".
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== null));
}

function sumKnown(ads: ImportAd[]): Metrics {
  const out = emptyMetrics();
  for (const ad of ads) for (const k of METRIC_KEYS) {
    if (NON_ADDITIVE_METRICS.has(k)) continue;
    const v = ad.metrics[k];
    if (v !== null) out[k] = round2((out[k] ?? 0) + v);
  }
  return out;
}

const NAME_HINTS: Array<{ re: RegExp; type: AudienceType; label: string }> = [
  { re: /semelhante|lookalike|\blal\b|\d+\s*%/, type: "lookalike", label: "semelhante" },
  { re: /personalizad|engajamento|remarketing|retargeting|visitantes|seguidores/, type: "custom", label: "personalizado" },
];

export function validateImport(bundle: ImportBundle, existing: ExistingSnapshot, options: ValidateOptions): ImportPreview {
  const issues: ImportIssue[] = [];
  const add = (level: IssueLevel, code: string, path: string, message: string, requiresConfirmation = false) => {
    const id = `${code}:${path}`;
    if (!issues.some(i => i.id === id)) issues.push({ id, level, path, message, requiresConfirmation: requiresConfirmation || undefined });
  };

  for (const p of bundle.problems) add(p.level ?? "error", "parse", p.path, p.message);

  // ---------------------------------------------------------------- empresa
  if (bundle.company.name && !sameName(bundle.company.name, existing.company.name)) {
    add("warning", "company-mismatch", "company", `O arquivo é da empresa "${bundle.company.name}", mas a empresa selecionada é "${existing.company.name}". Confirme que é a empresa certa.`, true);
  }
  const period = options.period ?? bundle.metricsPeriod ?? null;
  if (period && period.end < period.start) add("error", "period", "period", "O fim do período é anterior ao início.");

  // --------------------------------------------------------------- públicos
  const audiences: PreviewAudience[] = [];
  const seenKeys = new Set<string>(), seenNames = new Set<string>();
  bundle.audiences.forEach((a, i) => {
    const path = `Público ${i + 1}${a.name ? ` (${a.name})` : ""}`;
    if (!a.name) add("error", "aud-name", path, "Público sem nome.");
    if (a.name.length > 180) add("error", "aud-name-long", path, "Nome do público acima de 180 caracteres.");
    if (!a.type) add("error", "aud-type", path, a.rawType ? `Tipo de público desconhecido: "${a.rawType}" (use salvo, personalizado ou semelhante).` : "Tipo do público não informado (salvo, personalizado ou semelhante).");
    if (a.externalKey) {
      if (seenKeys.has(a.externalKey)) add("error", "aud-dup-key", path, `Chave "${a.externalKey}" repetida no arquivo.`);
      seenKeys.add(a.externalKey);
    }
    const nk = normalizeKey(a.name);
    if (a.name && seenNames.has(nk)) add("error", "aud-dup-name", path, "Nome de público repetido no arquivo.");
    seenNames.add(nk);
    if (a.companyKey && bundle.company.externalKey && a.companyKey !== bundle.company.externalKey) {
      add("error", "aud-company", path, `Público pertence a outra empresa ("${a.companyKey}"). Registros de empresas diferentes não são misturados.`);
    }

    let match = a.externalKey ? existing.audiences.find(e => e.external_key === a.externalKey) : undefined;
    let matchedBy: PreviewAudience["matchedBy"] = match ? "external_key" : null;
    if (!match && a.name) {
      const byName = existing.audiences.find(e => sameName(e.name, a.name));
      if (byName && byName.external_key && a.externalKey && byName.external_key !== a.externalKey) {
        add("error", "aud-key-conflict", path, `Já existe um público com este nome e outra chave ("${byName.external_key}").`);
      } else if (byName) {
        match = byName; matchedBy = "name";
        add("info", "aud-name-match", path, `Atualiza o público existente com o mesmo nome${a.externalKey ? " (a chave será gravada nele)" : ""}.`);
      }
    }
    if (match && a.type && match.audience_type !== AUDIENCE_DB_TYPE[a.type]) {
      add("error", "aud-type-conflict", path, `Já existe como "${match.audience_type}", mas o arquivo diz "${AUDIENCE_DB_TYPE[a.type]}". O tipo não é alterado automaticamente.`);
    }

    // Retenção real × nome (ex.: "185D" no nome, 180 dias configurados).
    const named = /(\d{1,4})\s*d\b/i.exec(a.name);
    if (named && a.retentionDays !== null && Number(named[1]) !== a.retentionDays && a.type === "custom") {
      add("warning", "aud-retention", path, `O nome indica ${named[1]} dias, mas a retenção configurada é ${a.retentionDays} dias. Os dois dados serão preservados como informados.`);
    }
    if (a.type === "lookalike") {
      if (a.percentage === null) add("info", "aud-pct", path, "Porcentagem de semelhança não informada.");
      if (!a.estimatedSize) add("info", "aud-size", path, "Tamanho estimado não informado.");
    }
    if (a.notes) add("info", "aud-notes", path, `Observação: ${a.notes}`);

    audiences.push({
      ref: a.externalKey ?? `nome:${nk}`,
      name: a.name, type: a.type, dbType: a.type ? AUDIENCE_DB_TYPE[a.type] : null, externalKey: a.externalKey,
      action: match ? "update" : "create", existingId: match?.id ?? null, matchedBy,
      source: null, settings: audienceSettings(a),
    });
  });

  // Origem dos semelhantes (depois de conhecer todos os públicos do arquivo).
  bundle.audiences.forEach((a, i) => {
    const pa = audiences[i];
    if (a.type !== "lookalike") return;
    const path = `Público ${i + 1} (${a.name})`;
    if (!a.sourceAudienceKey && !a.sourceAudienceName) { add("error", "aud-source-missing", path, "Público semelhante sem público de origem."); return; }
    const inBundle = a.sourceAudienceKey ? audiences.find(x => x.externalKey === a.sourceAudienceKey) : audiences.find(x => sameName(x.name, a.sourceAudienceName));
    const inDb = !inBundle ? (a.sourceAudienceKey ? existing.audiences.find(e => e.external_key === a.sourceAudienceKey) : existing.audiences.find(e => sameName(e.name, a.sourceAudienceName))) : undefined;
    if (!inBundle && !inDb) { add("error", "aud-source-404", path, `Público de origem "${a.sourceAudienceKey ?? a.sourceAudienceName}" não encontrado nesta empresa.`); return; }
    const srcType = inBundle ? inBundle.dbType : inDb!.audience_type;
    if (srcType === "salvo") add("warning", "aud-source-saved", path, "A origem de um semelhante normalmente é um público personalizado, mas a origem informada é um público salvo.");
    pa.source = { ref: inBundle?.ref ?? inDb?.external_key ?? null, name: inBundle?.name ?? inDb!.name, existingId: inBundle?.existingId ?? inDb?.id ?? null, inBundle: !!inBundle };
  });

  const resolveAudience = (key: string | null, name: string | null): AudienceLink | null => {
    if (key) {
      const b = audiences.find(x => x.externalKey === key);
      if (b) return { ref: b.ref, name: b.name, type: b.dbType, existingId: b.existingId, inBundle: true, via: "external_key" };
      const e = existing.audiences.find(x => x.external_key === key);
      if (e) return { ref: key, name: e.name, type: e.audience_type, existingId: e.id, inBundle: false, via: "external_key" };
      return null;
    }
    if (name) {
      const b = audiences.find(x => sameName(x.name, name));
      if (b) return { ref: b.ref, name: b.name, type: b.dbType, existingId: b.existingId, inBundle: true, via: "name" };
      const e = existing.audiences.find(x => sameName(x.name, name));
      if (e) return { ref: e.external_key ?? `id:${e.id}`, name: e.name, type: e.audience_type, existingId: e.id, inBundle: false, via: "name" };
    }
    return null;
  };

  // -------------------------------------------------------------- campanhas
  const campaigns: PreviewCampaign[] = [];
  const seenCampaignIds = new Set<string>(), seenCampaignNames = new Set<string>();
  const seenSetIds = new Set<string>(), seenAdIds = new Set<string>();
  let anyMetrics = false;

  bundle.campaigns.forEach((c, i) => {
    const cpath = `Campanha ${i + 1}${c.name ? ` (${c.name})` : ""}`;
    if (!c.name) add("error", "cmp-name", cpath, "Campanha sem nome.");
    if (c.name.length > 160) add("error", "cmp-name-long", cpath, "Nome da campanha acima de 160 caracteres.");
    if (c.metaId) { if (seenCampaignIds.has(c.metaId)) add("error", "cmp-dup-id", cpath, `ID da campanha ${c.metaId} repetido no arquivo.`); seenCampaignIds.add(c.metaId); }
    const cnk = normalizeKey(c.name);
    if (c.name && seenCampaignNames.has(cnk) && !c.metaId) add("error", "cmp-dup-name", cpath, "Campanha repetida no arquivo.");
    seenCampaignNames.add(cnk);

    let match = c.metaId ? existing.campaigns.find(e => e.meta_campaign_id === c.metaId) : undefined;
    let matchedBy: PreviewCampaign["matchedBy"] = match ? "meta_id" : null;
    if (!match && c.name) {
      const sameNamed = existing.campaigns.filter(e => sameName(e.name, c.name) && (!c.metaId || !e.meta_campaign_id || e.meta_campaign_id === c.metaId));
      if (sameNamed.length > 1) add("error", "cmp-ambiguous", cpath, `Existem ${sameNamed.length} campanhas chamadas "${c.name}" nesta empresa. Informe "ID da campanha:" para indicar qual atualizar — nada foi alterado.`);
      const byName = sameNamed.length > 1 ? undefined : existing.campaigns.find(e => sameName(e.name, c.name));
      if (byName && byName.meta_campaign_id && c.metaId && byName.meta_campaign_id !== c.metaId) {
        add("warning", "cmp-name-other-id", cpath, "Já existe uma campanha com este nome, mas com outro ID do Meta — será criada uma nova campanha.", true);
      } else if (byName) {
        match = byName; matchedBy = "name";
        add("info", "cmp-name-match", cpath, `Atualiza a campanha existente com o mesmo nome${c.metaId ? " (o ID do Meta será gravado nela)" : ""}.`);
      }
    }
    if (match && existing.legacyResultCampaignIds.includes(match.id)) {
      add("warning", "cmp-legacy", cpath, "Esta campanha já tem resultados lançados no formato antigo (por campanha/data). Nos relatórios, os lançamentos antigos dentro do período importado deixam de ser somados para não contar duas vezes.", true);
    }
    if (!c.adSets.length && !c.reportedTotals) add("warning", "cmp-empty", cpath, "Campanha sem conjuntos nem anúncios.");
    if (c.notes) add("info", "cmp-notes", cpath, `Observação: ${c.notes}`);

    // Datas: informadas na campanha ou derivadas dos conjuntos.
    let startsOn = c.startsOn, endsOn = c.endsOn, derived = false;
    const setStarts = c.adSets.map(s => s.startAt?.slice(0, 10)).filter((d): d is string => !!d).sort();
    const setEnds = c.adSets.map(s => s.endAt?.slice(0, 10)).filter((d): d is string => !!d).sort();
    if (!startsOn && setStarts.length) { startsOn = setStarts[0]; derived = true; }
    if (!endsOn && setEnds.length) { endsOn = setEnds[setEnds.length - 1]; derived = true; if (setEnds.length < c.adSets.length) add("info", "cmp-end-partial", cpath, "Algum conjunto não tem data de término; o término foi derivado dos demais."); }
    if (derived) add("info", "cmp-dates-derived", cpath, `Datas da campanha derivadas dos conjuntos: ${startsOn ?? "?"} até ${endsOn ?? "?"}.`);
    if (!match) {
      if (!startsOn && period) { startsOn = period.start; add("warning", "cmp-start-period", cpath, `Data de início não informada: será usado o início do período (${period.start}).`, true); }
      if (!startsOn) add("error", "cmp-start", cpath, `Informe a data de início (ex.: "Início: 15/10/2026") ou o período das métricas.`);
      if (startsOn && !endsOn) {
        endsOn = period && period.end >= startsOn ? period.end : startsOn;
        add("warning", "cmp-end-fallback", cpath, `Data de término não informada: será usada ${endsOn}.`, true);
      }
    }
    if (startsOn && endsOn && endsOn < startsOn) add("error", "cmp-dates", cpath, "Término anterior ao início.");

    const explicitStatus = mapCampaignStatus(c.status);
    if (c.status && !explicitStatus) add("warning", "cmp-status", cpath, `Status "${c.status}" não reconhecido.`);
    const status = explicitStatus ?? (endsOn && endsOn < options.today ? "finalizada" : "ativa");
    if (!explicitStatus && !match) add("info", "cmp-status-derived", cpath, `Status não informado: "${status}" (pelas datas).`);

    const adSets: PreviewAdSet[] = [];
    const campaignSetIds = match ? new Set(existing.adSets.filter(e => e.campaign_id === match!.id).map(e => e.id)) : new Set<string>();
    const setName = (id: string) => existing.adSets.find(e => e.id === id)?.name ?? "?";

    /** Valida UM anúncio já posicionado num conjunto (existente ou novo). */
    const buildAd = (ad: ImportAd, apath: string, adMatch: ExistingSnapshot["ads"][number] | undefined): PreviewAd => {
      if (!ad.name) add("error", "ad-name", apath, "Anúncio sem nome.");
      for (const key of METRIC_KEYS) { const v = ad.metrics[key]; if (v !== null && v < 0) add("error", "ad-negative", `${apath}.${key}`, "Métrica negativa."); }
      for (const [key, v] of Object.entries(ad.extraMetrics ?? {})) if (v !== null && v !== undefined && v < 0) add("error", "ad-negative", `${apath}.${key}`, "Métrica negativa.");
      const hasMetrics = METRIC_KEYS.some(k => ad.metrics[k] !== null) || hasExtraMetrics(ad.extraMetrics);
      if (hasMetrics) anyMetrics = true;
      if (!hasMetrics) add("info", "ad-no-metrics", apath, "Sem métricas informadas (somente estrutura).");
      const m = ad.metrics;
      if (m.sales !== null && m.conversations !== null && m.sales > m.conversations) add("warning", "ad-sales-gt-conv", apath, `${m.sales} vendas para ${m.conversations} conversas — confira se as vendas são do mesmo período/anúncio.`);
      if (m.sales !== null && m.sales > 0 && m.revenue === null) add("info", "ad-no-revenue", apath, "Vendas informadas sem faturamento.");
      if (adMatch && period && existing.periodMetrics.some(p => p.creative_id === adMatch.id && !(p.period_start === period.start && p.period_end === period.end) && p.period_start <= period.end && p.period_end >= period.start)) {
        add("warning", "ad-period-overlap", apath, "Este anúncio já tem métricas de outro período que se sobrepõe a este. Os dois serão mantidos; confira os relatórios.", true);
      }
      if (ad.notes) add("info", "ad-notes", apath, `Observação: ${ad.notes}`);
      // Registro existente mantém o nome gravado (diferenças de caixa/acentos não reescrevem nada).
      return { ...ad, name: adMatch?.name ?? ad.name, action: adMatch ? "update" : "create", existingId: adMatch?.id ?? null, hasMetrics };
    };

    c.adSets.forEach((s, j) => {
      const spath = `${cpath} › Conjunto ${j + 1}${s.name ? ` (${s.name})` : ""}`;

      // Sem "Conjunto:" numa campanha JÁ cadastrada: cada anúncio é procurado
      // nos conjuntos dela. Nunca cria conjunto/anúncio com nome inventado.
      if (s.nameInferred && match) {
        const bySet = new Map<string, PreviewAd[]>();
        const unresolved: PreviewAd[] = [];
        s.ads.forEach((ad, k) => {
          const apath = `${cpath} › Anúncio ${k + 1}${ad.name ? ` (${ad.name})` : ""}`;
          if (ad.metaId) { if (seenAdIds.has(ad.metaId)) add("error", "ad-dup-id", apath, `ID do anúncio ${ad.metaId} repetido.`); seenAdIds.add(ad.metaId); }
          const candidates = ad.metaId
            ? existing.ads.filter(e => e.meta_ad_id === ad.metaId && campaignSetIds.has(e.ad_set_id))
            : existing.ads.filter(e => campaignSetIds.has(e.ad_set_id) && sameName(e.name, ad.name));
          if (candidates.length === 1) {
            const found = candidates[0];
            if (!bySet.has(found.ad_set_id)) bySet.set(found.ad_set_id, []);
            bySet.get(found.ad_set_id)!.push(buildAd(ad, apath, found));
            return;
          }
          if (candidates.length > 1) {
            add("error", "ad-ambiguous", apath, `Há ${candidates.length} anúncios chamados "${ad.name}" nesta campanha (conjuntos: ${candidates.map(x => `"${setName(x.ad_set_id)}"`).join(", ")}). Informe "Conjunto:" ou "ID do anúncio:" antes do anúncio para indicar qual atualizar — nada foi alterado.`);
          } else {
            add("error", "ad-404", apath, ad.metaId
              ? `Nenhum anúncio com ID ${ad.metaId} nesta campanha.`
              : `Anúncio "${ad.name}" não encontrado na campanha "${match!.name}". Nada será criado: confira o nome ou, para cadastrar um anúncio novo, informe "Conjunto:".`);
          }
          unresolved.push(buildAd(ad, apath, undefined));
        });
        for (const [setId, ads] of bySet) {
          adSets.push({ metaId: null, name: setName(setId), action: "update", existingId: setId, autoIdentified: true, audience: null, dailyBudget: s.dailyBudget, startAt: s.startAt, endAt: s.endAt, status: s.status, placements: s.placements, notes: s.notes, resultType: s.resultType ?? null, ads });
        }
        if (unresolved.length) adSets.push({ metaId: null, name: "Conjunto não identificado", action: "update", existingId: null, autoIdentified: true, audience: null, dailyBudget: null, startAt: null, endAt: null, status: null, placements: null, notes: null, ads: unresolved });
        if (s.audienceName || s.audienceKey) add("warning", "set-aud-ignored", cpath, `"Público:" sem "Conjunto:" é ignorado numa campanha existente (o público dos conjuntos não muda).`);
        return;
      }

      if (!s.name) add("error", "set-name", spath, "Conjunto sem nome.");
      if (s.nameInferred) add("warning", "set-inferred", spath, `Nome do conjunto não informado; será criado o conjunto "${s.name}" nesta campanha nova.`, true);
      if (s.metaId) { if (seenSetIds.has(s.metaId)) add("error", "set-dup-id", spath, `ID do conjunto ${s.metaId} repetido.`); seenSetIds.add(s.metaId); }
      let setMatch = s.metaId ? existing.adSets.find(e => e.meta_adset_id === s.metaId) : undefined;
      if (setMatch && match && setMatch.campaign_id !== match.id) { add("error", "set-other-campaign", spath, "Este ID de conjunto já pertence a outra campanha."); setMatch = undefined; }
      if (setMatch && !match) { add("error", "set-other-campaign", spath, "Este ID de conjunto já pertence a outra campanha."); setMatch = undefined; }
      if (!setMatch && match && s.name) {
        const byNames = existing.adSets.filter(e => e.campaign_id === match!.id && sameName(e.name, s.name) && (!e.meta_adset_id || !s.metaId || e.meta_adset_id === s.metaId));
        if (byNames.length > 1) add("error", "set-ambiguous", spath, `Há ${byNames.length} conjuntos chamados "${s.name}" nesta campanha. Informe "ID do conjunto:" — nada foi alterado.`);
        else if (byNames.length === 1) setMatch = byNames[0];
      }

      let audience: AudienceLink | null = null;
      if (s.audienceKey || s.audienceName) {
        audience = resolveAudience(s.audienceKey, s.audienceKey ? null : s.audienceName);
        if (!audience) add("error", "set-aud-404", spath, `Público "${s.audienceKey ?? s.audienceName}" não encontrado nesta empresa. Importe o público antes (ou no mesmo arquivo).`);
        else if (audience.via === "name") add("info", "set-aud-name", spath, `Público vinculado pelo nome exato "${audience.name}".`);
      } else if (!setMatch) add("warning", "set-aud-none", spath, "Conjunto sem público informado.");
      if (audience) {
        const setName = normalizeKey(s.name);
        for (const hint of NAME_HINTS) {
          if (hint.re.test(setName) && audience.type !== AUDIENCE_DB_TYPE[hint.type]) {
            add("warning", "set-aud-mismatch", spath, `O nome do conjunto sugere um público ${hint.label}, mas o público informado é "${audience.name}" (${audience.type ?? "tipo desconhecido"}). Confirme o vínculo.`, true);
            break;
          }
        }
        const bundleAudience = audience.inBundle ? bundle.audiences.find(a => (a.externalKey ?? `nome:${normalizeKey(a.name)}`) === audience!.ref) : undefined;
        const city = typeof bundleAudience?.location?.city === "string" ? bundleAudience.location.city : null;
        if (city && !setName.includes(normalizeKey(city))) add("warning", "set-aud-city", spath, `O público é de ${city}, mas o nome do conjunto não menciona essa cidade.`);
      }
      if (s.notes) add("info", "set-notes", spath, `Observação: ${s.notes}`);
      if (!s.ads.length) add("warning", "set-no-ads", spath, "Conjunto sem anúncios.");

      const ads: PreviewAd[] = s.ads.map((ad, k) => {
        const apath = `${spath} › Anúncio ${k + 1}${ad.name ? ` (${ad.name})` : ""}`;
        if (ad.metaId) { if (seenAdIds.has(ad.metaId)) add("error", "ad-dup-id", apath, `ID do anúncio ${ad.metaId} repetido.`); seenAdIds.add(ad.metaId); }
        let adMatch = ad.metaId ? existing.ads.find(e => e.meta_ad_id === ad.metaId) : undefined;
        if (adMatch && adMatch.ad_set_id !== setMatch?.id) { add("error", "ad-other-set", apath, "Este ID de anúncio já pertence a outro conjunto."); adMatch = undefined; }
        if (!adMatch && setMatch && ad.name) {
          const byNames = existing.ads.filter(e => e.ad_set_id === setMatch!.id && sameName(e.name, ad.name) && (!e.meta_ad_id || !ad.metaId || e.meta_ad_id === ad.metaId));
          if (byNames.length > 1) add("error", "ad-ambiguous", apath, `Há ${byNames.length} anúncios chamados "${ad.name}" neste conjunto. Informe "ID do anúncio:" — nada foi alterado.`);
          else adMatch = byNames[0];
        }
        return buildAd(ad, apath, adMatch);
      });

      adSets.push({
        metaId: s.metaId, name: setMatch?.name ?? s.name, action: setMatch ? "update" : "create", existingId: setMatch?.id ?? null, audience,
        dailyBudget: s.dailyBudget, startAt: s.startAt, endAt: s.endAt, status: s.status, placements: s.placements, notes: s.notes, resultType: s.resultType ?? null, ads,
      });
    });

    const known = sumKnown(c.adSets.flatMap(s => s.ads));
    let difference: PreviewCampaign["difference"] = null;
    if (c.reportedTotals) {
      const r = c.reportedTotals;
      const dSpend = r.spend !== null ? round2(r.spend - (known.spend ?? 0)) : null;
      const dConv = r.conversations !== null ? r.conversations - (known.conversations ?? 0) : null;
      difference = { spend: dSpend, conversations: dConv };
      if ((dSpend !== null && Math.abs(dSpend) >= 0.01) || (dConv !== null && dConv !== 0)) {
        add("warning", "cmp-reconcile", cpath, `Total informado da campanha difere da soma dos anúncios: ${dSpend !== null ? money(dSpend) : "—"} e ${dConv ?? "—"} conversa(s) sem anúncio. A diferença NÃO será distribuída; fica registrada para reconciliação.`);
      }
      if (r.unallocatedSpend !== null && dSpend !== null && Math.abs(r.unallocatedSpend - dSpend) >= 0.01) add("warning", "cmp-unalloc-spend", cpath, `"Não atribuído" informado (${money(r.unallocatedSpend)}) não bate com a diferença calculada (${money(dSpend)}).`);
      if (r.unallocatedConversations !== null && dConv !== null && r.unallocatedConversations !== dConv) add("warning", "cmp-unalloc-conv", cpath, `Conversas não atribuídas informadas (${r.unallocatedConversations}) não batem com a diferença calculada (${dConv}).`);
    }

    const objectiveRaw = c.objective;
    const dailyBudget = c.dailyBudget;
    campaigns.push({
      metaId: c.metaId, name: match?.name ?? c.name, action: match ? "update" : "create", existingId: match?.id ?? null, matchedBy,
      objective: objectiveRaw ? OBJECTIVE_LABELS[objectiveRaw.toLowerCase()] ?? objectiveRaw : null,
      dailyBudget, budgetType: dailyBudget !== null || c.adSets.some(s => s.dailyBudget !== null) ? "daily" : "total",
      startsOn, endsOn, datesDerived: derived, status, statusExplicit: !!explicitStatus, notes: c.notes, adSets, known, reported: c.reportedTotals, difference,
    });
  });

  // Atualização parcial: só anúncios já cadastrados, sem período → novos totais
  // das métricas informadas (regra do "Atualizar resultados"); nada mais muda.
  const everyAd = campaigns.flatMap(c => c.adSets.flatMap(s => s.ads));
  const metricsUpdate = !period && !audiences.length && campaigns.length > 0 && anyMetrics
    && campaigns.every(c => c.action === "update" && c.adSets.length > 0 && c.adSets.every(s => s.action === "update" && s.ads.every(a => a.action === "update" || (!!s.autoIdentified && !s.existingId))));
  if (metricsUpdate) {
    bundle.campaigns.forEach((c, i) => {
      const cpath = `Campanha ${i + 1} (${campaigns[i].name})`;
      const ignored = [c.objective && "objetivo", c.dailyBudget !== null && "orçamento", (c.startsOn || c.endsOn) && "datas", c.status && "status"].filter(Boolean);
      const setIgnored = c.adSets.some(s => s.dailyBudget !== null || s.startAt || s.endAt || s.status || s.placements || s.audienceName || s.audienceKey);
      if (ignored.length || setIgnored) add("warning", "partial-ignored", cpath, `Atualização só de métricas: ${[...ignored, setIgnored && "dados do conjunto"].filter(Boolean).join(", ")} informado(s) no texto NÃO serão alterados.`);
    });
    for (const ad of everyAd) if (!ad.hasMetrics && ad.existingId) add("info", "partial-no-metrics", ad.name, `"${ad.name}": nenhuma métrica informada — nada muda neste anúncio.`);
    add("info", "partial-mode", "atualização", "Atualização parcial: somente as métricas informadas mudam. Orçamento, investimento, alcance, impressões, datas, status e os demais anúncios ficam como estão (a menos que estejam no texto).");
  } else if (anyMetrics && !period) {
    add("error", "period-missing", "period", "Há métricas no arquivo, mas o período não foi informado. Informe o período das métricas (início e fim) — ou, para só atualizar anúncios já cadastrados, informe apenas campanha e anúncio existentes.");
  }
  for (const note of bundle.dataQualityNotes) add("info", "dq-note", `Nota do arquivo ${normalizeKey(note).slice(0, 24)}`, note);

  const totalsKnown = sumKnown(bundle.campaigns.flatMap(c => c.adSets.flatMap(s => s.ads)));
  const sumOrNull = (vals: Array<number | null>) => vals.some(v => v !== null) ? round2(vals.reduce<number>((a, v) => a + (v ?? 0), 0)) : null;
  const count = <T extends { action: RowAction }>(rows: T[]) => ({ create: rows.filter(r => r.action === "create").length, update: rows.filter(r => r.action === "update").length });
  const allSets = campaigns.flatMap(c => c.adSets), allAds = allSets.flatMap(s => s.ads);
  const preview: ImportPreview = {
    mode: metricsUpdate ? "metrics_update" : "import",
    companyId: existing.company.id,
    companyName: existing.company.name,
    sourceFormat: bundle.sourceFormat,
    period,
    audiences, campaigns, issues,
    totals: {
      known: totalsKnown,
      reportedSpend: sumOrNull(campaigns.map(c => c.reported?.spend ?? null)),
      reportedConversations: sumOrNull(campaigns.map(c => c.reported?.conversations ?? null)),
      unallocatedSpend: round2(campaigns.reduce((a, c) => a + Math.max(0, c.difference?.spend ?? 0), 0)),
      unallocatedConversations: campaigns.reduce((a, c) => a + Math.max(0, c.difference?.conversations ?? 0), 0),
    },
    counts: { audiences: count(audiences), campaigns: count(campaigns), adSets: count(allSets), ads: count(allAds), adsWithMetrics: allAds.filter(a => a.hasMetrics).length },
    canImport: false,
    confirmationIds: issues.filter(i => i.requiresConfirmation).map(i => i.id),
    dataQualityNotes: bundle.dataQualityNotes,
  };
  if (!audiences.length && !campaigns.length) add("error", "empty", "arquivo", "Nada para importar: nenhum público ou campanha reconhecido.");
  preview.canImport = !issues.some(i => i.level === "error");
  return preview;
}
