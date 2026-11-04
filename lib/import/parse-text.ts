import { mapAudienceType, inferAdFormat } from "./parse-json";
import { parseRate } from "@/lib/clt/video-rates";
import { EXTRA_IMPORT_KEYS, RATE_IMPORT_KEYS, emptyMetrics, type ExtraImportKey, type ImportAd, type ImportAdSet, type ImportAudience, type ImportBundle, type ImportCampaign, type MetricKey, type ParseProblem } from "./types";
import { normalizeKey, parseBrDate, parseBrDateTime, parseBrInteger, parseBrNumber, parseBrPeriod } from "./values";

/**
 * Texto estruturado em pt-BR ("Chave: valor", uma informação por linha) →
 * mesmo modelo do JSON. Determinístico, sem IA: o que não reconhece vira
 * aviso, nada é inventado.
 *
 * Hierarquia: `Campanha:` abre uma campanha; `Conjunto:` abre um conjunto
 * dentro dela; `Anúncio:` abre um anúncio no conjunto atual. Métricas
 * pertencem ao anúncio atual. `Público:` DENTRO de uma campanha é o público
 * do conjunto; FORA de campanha (ou `Público salvo:`/`Público
 * personalizado:`/`Público semelhante:`/`Novo público:`) cadastra um
 * público. `---` encerra o bloco atual.
 */

type Field =
  | "company" | "period" | "audienceDef" | "audience" | "audienceType" | "externalKey" | "audienceKey" | "source"
  | "percentage" | "retention" | "location" | "radius" | "age" | "interests" | "size" | "notes"
  | "campaign" | "campaignId" | "objective" | "dailyBudget" | "start" | "end" | "status"
  | "adSet" | "adSetId" | "ad" | "adId" | "format" | "postId" | "placements" | "savedPosts" | MetricKey | ExtraImportKey;

const FIELD_ALIASES: Array<[Field, string[]]> = [
  ["company", ["empresa", "cliente"]],
  ["period", ["periodo", "periodo das metricas", "periodo dos resultados"]],
  ["audienceDef", ["novo publico", "publico salvo", "publico personalizado", "publico semelhante", "publico lookalike", "cadastrar publico"]],
  ["audience", ["publico", "publico do conjunto", "audiencia"]],
  ["audienceType", ["tipo", "tipo do publico", "tipo de publico"]],
  ["audienceKey", ["chave do publico", "audience_external_key", "id do publico no planner"]],
  ["externalKey", ["chave", "chave externa", "external_key", "identificador"]],
  ["source", ["origem", "publico de origem", "fonte"]],
  ["percentage", ["porcentagem", "percentual", "semelhanca"]],
  ["retention", ["retencao", "retencao (dias)", "dias de retencao"]],
  ["location", ["localizacao", "local", "cidade", "regiao", "estado"]],
  ["radius", ["raio", "raio (km)"]],
  ["age", ["idade", "faixa etaria"]],
  ["interests", ["interesses"]],
  ["size", ["tamanho", "tamanho estimado", "tamanho do publico"]],
  ["notes", ["observacao", "observacoes", "obs", "notas", "nota"]],
  ["campaign", ["campanha", "nome da campanha"]],
  ["campaignId", ["id da campanha", "meta_campaign_id", "id campanha"]],
  ["objective", ["objetivo"]],
  ["dailyBudget", ["orcamento diario", "orcamento", "orcamento por dia"]],
  ["start", ["inicio", "data de inicio", "data inicio", "comeco"]],
  ["end", ["fim", "termino", "data de fim", "data fim", "data de termino", "encerramento"]],
  ["status", ["status", "situacao"]],
  ["adSet", ["conjunto", "conjunto de anuncios", "ad set"]],
  ["adSetId", ["id do conjunto", "meta_adset_id", "id conjunto"]],
  ["ad", ["anuncio", "criativo"]],
  ["adId", ["id do anuncio", "meta_ad_id", "id anuncio"]],
  ["format", ["formato"]],
  ["postId", ["post_id", "id do post", "publicacao"]],
  ["placements", ["posicionamentos", "posicionamento"]],
  ["spend", ["investimento", "gasto", "valor gasto", "valor usado", "investido", "valor investido"]],
  ["conversations", ["conversas", "mensagens", "conversas iniciadas", "conversas no whatsapp"]],
  ["sales", ["vendas"]],
  ["revenue", ["faturamento", "receita", "valor vendido"]],
  ["impressions", ["impressoes"]],
  ["reach", ["alcance"]],
  ["linkClicks", ["cliques", "cliques no link", "clique no link", "cliques em links", "link clicks"]],
  ["leads", ["leads", "cadastros"]],
  // Engajamento e vídeo — mesmos campos do formulário "Atualizar resultados".
  ["engagements", ["interacoes", "interacoes com a publicacao", "engajamento", "engajamentos", "engajamento com a publicacao", "post engagement"]],
  ["reactions", ["reacoes", "reacoes a publicacao", "reacoes na publicacao", "reacoes da publicacao", "reacoes ao post", "post reactions"]],
  ["comments", ["comentarios", "comentarios na publicacao", "comentarios da publicacao", "comentarios no post"]],
  ["shares", ["compartilhamentos", "compartilhamentos da publicacao", "compartilhamentos na publicacao", "compartilhamentos do post"]],
  ["new_followers", ["novos seguidores", "seguidores novos", "seguidores ganhos", "novos seguidores (anuncios)", "seguidores do anuncio"]],
  ["views", ["visualizacoes", "visualizacoes do video", "views"]],
  ["video_plays_3s", ["reproducoes de 3 segundos", "visualizacoes de 3 segundos", "reproducoes de video de 3 segundos", "reproducoes de 3s", "visualizacoes de 3s"]],
  ["thruplays", ["thruplays", "thruplay", "thru plays", "thru play"]],
  ["video_p75", ["visualizacoes de 75%", "visualizacoes 75%", "reproducoes de 75%", "reproducoes do video ate 75%", "video assistido ate 75%", "visualizacoes de 75% do video", "75%"]],
  ["video_p100", ["visualizacoes de 100%", "visualizacoes 100%", "reproducoes de 100%", "reproducoes do video ate 100%", "video assistido ate 100%", "visualizacoes de 100% do video", "100%"]],
  // Sem apelidos curtos: "Retenção:" sozinho é a retenção (dias) dos públicos.
  ["hook_rate", ["taxa de gancho", "taxa de gancho (%)", "taxa gancho", "hook rate", "hook rate (%)"]],
  ["hold_rate", ["taxa de retencao", "taxa de retencao (%)", "taxa retencao", "hold rate", "hold rate (%)"]],
  ["savedPosts", ["publicacoes guardadas", "publicacoes salvas", "salvamentos", "salvamentos da publicacao", "posts salvos"]],
];
const FIELD_BY_ALIAS = new Map<string, Field>();
for (const [field, aliases] of FIELD_ALIASES) for (const a of aliases) FIELD_BY_ALIAS.set(a, field);
const EXTRA_FIELDS = new Set<Field>(EXTRA_IMPORT_KEYS);
const METRIC_FIELDS = new Set<Field>(["spend", "conversations", "sales", "revenue", "impressions", "reach", "linkClicks", "leads"]);
const INTEGER_FIELDS = new Set<Field>(["conversations", "sales", "impressions", "reach", "linkClicks", "leads"]);

function newAudience(name: string, typeHint: string | null): ImportAudience {
  return {
    externalKey: null, name, type: mapAudienceType(typeHint), rawType: typeHint, companyKey: null,
    sourceAudienceKey: null, sourceAudienceName: null, percentage: null, retentionDays: null, location: null,
    ageMin: null, ageMax: null, interests: null, estimatedSize: null, notes: null, extra: {},
  };
}
function newCampaign(name: string): ImportCampaign {
  return { metaId: null, name, objective: null, dailyBudget: null, startsOn: null, endsOn: null, status: null, notes: null, reportedTotals: null, adSets: [] };
}
function newAdSet(name: string, inferred = false): ImportAdSet {
  return { metaId: null, name, nameInferred: inferred || undefined, audienceKey: null, audienceName: null, dailyBudget: null, startAt: null, endAt: null, status: null, placements: null, notes: null, ads: [] };
}
function newAd(name: string): ImportAd {
  return { metaId: null, name, format: inferAdFormat(null, name), postId: null, notes: null, metrics: emptyMetrics(), extraMetrics: {}, extra: {} };
}

export function parseStructuredText(text: string): ImportBundle {
  const problems: ParseProblem[] = [];
  const bundle: ImportBundle = {
    sourceFormat: "text", company: { name: null, externalKey: null }, metricsPeriod: null, timezone: "America/Sao_Paulo",
    audiences: [], campaigns: [], dataQualityNotes: [], problems,
  };
  let audience: ImportAudience | null = null;
  let campaign: ImportCampaign | null = null;
  let adSet: ImportAdSet | null = null;
  let ad: ImportAd | null = null;
  let pendingAudienceName: string | null = null;

  const ensureAdSet = (lineNo: number) => {
    if (!campaign) return null;
    if (!adSet) {
      adSet = newAdSet(pendingAudienceName ?? campaign.name, true);
      adSet.audienceName = pendingAudienceName;
      campaign.adSets.push(adSet);
      // Sem "Conjunto:": a validação procura o anúncio nos conjuntos da campanha
      // existente; só numa campanha NOVA o nome provisório vira conjunto (com confirmação).
      void lineNo;
    }
    return adSet;
  };

  // `Público:` numa campanha sem `Conjunto:`/`Anúncio:` vira um conjunto (nome a revisar).
  const flushPending = (lineNo: number) => {
    if (campaign && !campaign.adSets.length && pendingAudienceName) ensureAdSet(lineNo);
  };

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.replace(/^\s*[-*•]\s+/, "").trim();
    if (!line) return;
    if (/^(-{3,}|={3,}|_{3,})$/.test(line)) { flushPending(lineNo); audience = null; campaign = null; adSet = null; ad = null; pendingAudienceName = null; return; }
    const m = /^([^:=]{1,60})\s*[:=]\s*(.*)$/.exec(line);
    if (!m) { problems.push({ path: `linha ${lineNo}`, level: "warning", message: `Linha não reconhecida (use "Campo: valor"): ${line.slice(0, 80)}` }); return; }
    const keyText = normalizeKey(m[1]);
    const value = m[2].trim();
    const field = FIELD_BY_ALIAS.get(keyText);
    if (!field) { problems.push({ path: `linha ${lineNo}`, level: "warning", message: `Campo desconhecido "${m[1].trim()}" — ignorado.` }); return; }
    const where = `linha ${lineNo}`;
    const num = (integer: boolean) => {
      const v = integer ? parseBrInteger(value) : parseBrNumber(value);
      if (v === undefined) problems.push({ path: where, message: `Valor inválido para "${m[1].trim()}": ${value}` });
      return v ?? null;
    };

    if (field === "savedPosts") {
      // Sem coluna no banco (nem no formulário manual): reconhecido, mas não gravado.
      problems.push({ path: where, level: "warning", message: `"${m[1].trim()}" ainda não é registrado pelo VS Planner (não existe esse campo nos resultados) — ignorado.` });
      return;
    }
    if (EXTRA_FIELDS.has(field)) {
      const key = field as ExtraImportKey;
      let v: number | null;
      if (RATE_IMPORT_KEYS.has(key)) {
        // Percentual informado (ex.: "35,75%"): salvo exatamente como veio.
        const r = parseRate(value);
        if (r === undefined) problems.push({ path: where, message: `"${m[1].trim()}": informe um percentual entre 0 e 100, com até 2 casas decimais (ex.: 35,75%). Recebido: ${value}` });
        v = r ?? null;
      } else v = num(true);
      if (ad) { (ad.extraMetrics ??= {})[key] = v; return; }
      problems.push({ path: where, ...(campaign ? { level: "warning" as const, message: `"${m[1].trim()}" informado fora de um anúncio — ignorado. Informe depois de "Anúncio:".` } : { message: `"${m[1].trim()}" precisa vir depois de um "Anúncio:".` }) });
      return;
    }
    if (METRIC_FIELDS.has(field)) {
      const key = field as MetricKey;
      const v = num(INTEGER_FIELDS.has(field));
      if (ad) { ad.metrics[key] = v; return; }
      if (campaign && !adSet) {
        // Totais da campanha (sem anúncio): só para reconciliação.
        campaign.reportedTotals ??= { spend: null, conversations: null, impressions: null, unallocatedSpend: null, unallocatedConversations: null };
        if (key === "spend" || key === "conversations" || key === "impressions") campaign.reportedTotals[key] = v;
        else problems.push({ path: where, level: "warning", message: `"${m[1].trim()}" informado na campanha sem anúncio — ignorado. Informe em "Anúncio:".` });
        return;
      }
      problems.push({ path: where, message: `"${m[1].trim()}" precisa vir depois de um "Anúncio:".` });
      return;
    }

    switch (field) {
      case "company": bundle.company.name = value || null; return;
      case "period": {
        const p = parseBrPeriod(value);
        if (!p) problems.push({ path: where, message: `Período inválido (use "30/09/2026 a 29/10/2026"): ${value}` }); else bundle.metricsPeriod = p;
        return;
      }
      case "audienceDef":
      case "audience": {
        if (!value) { problems.push({ path: where, message: "Nome do público vazio." }); return; }
        if (field === "audience" && campaign) {
          if (adSet) adSet.audienceName = value; else pendingAudienceName = value;
          return;
        }
        const hint = keyText.includes("salvo") ? "salvo" : keyText.includes("personalizado") ? "personalizado" : /semelhante|lookalike/.test(keyText) ? "semelhante" : null;
        flushPending(lineNo);
        audience = newAudience(value, hint);
        bundle.audiences.push(audience);
        campaign = null; adSet = null; ad = null; pendingAudienceName = null;
        return;
      }
      case "campaign":
        if (!value) { problems.push({ path: where, message: "Nome da campanha vazio." }); return; }
        flushPending(lineNo);
        campaign = newCampaign(value); bundle.campaigns.push(campaign);
        audience = null; adSet = null; ad = null; pendingAudienceName = null;
        return;
      case "adSet":
        if (!campaign) { problems.push({ path: where, message: `"Conjunto:" precisa vir depois de "Campanha:".` }); return; }
        adSet = newAdSet(value); adSet.audienceName = pendingAudienceName; pendingAudienceName = null; campaign.adSets.push(adSet); ad = null;
        return;
      case "ad": {
        if (!campaign) { problems.push({ path: where, message: `"Anúncio:" precisa vir depois de "Campanha:".` }); return; }
        const set = ensureAdSet(lineNo)!;
        ad = newAd(value); set.ads.push(ad);
        return;
      }
    }

    // Campos que dependem do bloco atual (mais interno primeiro).
    if (audience && !campaign) {
      switch (field) {
        case "audienceType": audience.rawType = value; audience.type = mapAudienceType(value); if (!audience.type) problems.push({ path: where, message: `Tipo de público desconhecido: ${value}` }); return;
        case "externalKey": audience.externalKey = value || null; return;
        case "source": audience.sourceAudienceName = value || null; return;
        case "audienceKey": audience.sourceAudienceKey = value || null; return;
        case "percentage": audience.percentage = num(false); return;
        case "retention": { const r = parseBrInteger(value.replace(/\s*dias?$/i, "")); if (r === undefined) problems.push({ path: where, message: `Retenção inválida: ${value}` }); else audience.retentionDays = r; return; }
        case "location": audience.location = { ...(audience.location ?? {}), descricao: value }; return;
        case "radius": { const r = parseBrNumber(value.replace(/\s*km$/i, "")); if (r === undefined) problems.push({ path: where, message: `Raio inválido: ${value}` }); else audience.location = { ...(audience.location ?? {}), radius_km: r }; return; }
        case "age": { const a = /^(\d{2})\s*(?:-|a|até)\s*(\d{2})\+?$/.exec(value); if (!a) problems.push({ path: where, message: `Idade inválida (use "20-65"): ${value}` }); else { audience.ageMin = Number(a[1]); audience.ageMax = Number(a[2]); } return; }
        case "interests": audience.interests = value ? value.split(/[,;]/).map(s => s.trim()).filter(Boolean) : []; return;
        case "size": {
          const parts = value.split(/\s*(?:-|a|até|–)\s*/).map(p => parseBrInteger(p));
          if (parts.length === 2 && typeof parts[0] === "number" && typeof parts[1] === "number") audience.estimatedSize = [parts[0], parts[1]];
          else problems.push({ path: where, message: `Tamanho inválido (use "246.600 - 290.100"): ${value}` });
          return;
        }
        case "notes": audience.notes = value || null; return;
      }
    }
    if (ad) {
      switch (field) {
        case "adId": ad.metaId = value || null; return;
        case "format": ad.format = inferAdFormat(value, ad.name); return;
        case "postId": ad.postId = value || null; return;
        case "notes": ad.notes = value || null; return;
      }
    }
    if (adSet) {
      switch (field) {
        case "adSetId": adSet.metaId = value || null; return;
        case "audienceKey": adSet.audienceKey = value || null; return;
        case "dailyBudget": adSet.dailyBudget = num(false); return;
        case "start": { const d = parseBrDateTime(value); if (d === undefined) problems.push({ path: where, message: `Data inválida: ${value}` }); else adSet.startAt = d; return; }
        case "end": { const d = parseBrDateTime(value); if (d === undefined) problems.push({ path: where, message: `Data inválida: ${value}` }); else adSet.endAt = d; return; }
        case "status": adSet.status = value || null; return;
        case "placements": adSet.placements = value || null; return;
        case "notes": adSet.notes = value || null; return;
      }
    }
    if (campaign) {
      switch (field) {
        case "campaignId": campaign.metaId = value || null; return;
        case "objective": campaign.objective = value || null; return;
        case "dailyBudget": campaign.dailyBudget = num(false); return;
        case "audienceKey": pendingAudienceName = null; ensureAdSet(lineNo)!.audienceKey = value || null; return;
        case "start": { const d = parseBrDate(value); if (d === undefined) problems.push({ path: where, message: `Data inválida: ${value}` }); else campaign.startsOn = d; return; }
        case "end": { const d = parseBrDate(value); if (d === undefined) problems.push({ path: where, message: `Data inválida: ${value}` }); else campaign.endsOn = d; return; }
        case "status": campaign.status = value || null; return;
        case "notes": campaign.notes = value || null; return;
      }
    }
    problems.push({ path: where, level: "warning", message: `"${m[1].trim()}" fora de contexto — ignorado.` });
  });

  flushPending(lines.length);
  return bundle;
}
