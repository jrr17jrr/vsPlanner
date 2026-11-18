import { INFO_FIELDS, type InfoKind, type InfoLevel } from "@/lib/clt/registered-info";
import { ALIASES as INFO_ALIASES } from "./info-fields";
import { EXTRA_ALIASES, METRIC_ALIASES } from "./parse-json";
import { EXTRA_IMPORT_KEYS, EXTRA_IMPORT_LABEL, METRIC_KEYS, METRIC_LABEL, RATE_IMPORT_KEYS } from "./types";
import type { ImportArea } from "./tasks";

/**
 * Modelos da Central de Importação ("Ver modelo", "Copiar modelo",
 * "Inserir modelo") gerados de UMA definição de campos.
 *
 * Campanhas, conjuntos, anúncios e resultados: os campos vêm das MESMAS
 * tabelas usadas pela leitura, validação e gravação —
 *   - informações cadastradas: `INFO_FIELDS` (lib/clt/registered-info.ts,
 *     colunas e tipos) + apelidos de `info-fields.ts`;
 *   - métricas: `METRIC_KEYS`/`EXTRA_IMPORT_KEYS` (lib/import/types.ts) +
 *     apelidos do leitor de JSON.
 * Um campo novo nessas tabelas aparece sozinho no modelo. O teste
 * lib/import/templates.test.ts lê CADA modelo de volta e exige que todos os
 * campos sejam reconhecidos e cheguem ao lugar certo (nenhum campo do modelo
 * é ignorado ao importar) e que nenhum campo aceito fique fora do modelo.
 */

export type FieldType = "texto" | "texto longo" | "data" | "data e hora" | "horário" | "número" | "inteiro" | "dinheiro" | "percentual" | "segundos" | "link" | "ID do Meta" | "opção" | "lista";
export type TemplateField = {
  /** Bloco do modelo (Campanha, Conjunto, Anúncio, Métricas…). */
  group: string;
  /** Chave no formato texto ("Campo: valor"). `null` = só no JSON. */
  text: string | null;
  /** Chave no JSON. `null` = só no texto. */
  json: string | null;
  type: FieldType;
  example: string;
  jsonExample?: unknown;
  /** Onde é gravado. */
  saves: string;
  note?: string;
  /** Coluna/métrica de origem (usada pelos testes de cobertura). */
  source?: string;
};

export type TemplateId = "tarefas_pessoais" | "tarefas_clt" | "subtarefas" | "checklists" | "campanhas" | "conjuntos" | "anuncios" | "publicos" | "resultados";
export type ImportTemplate = { id: TemplateId; label: string; description: string; fields: TemplateField[]; text: string; json: string };

// ---------------------------------------------------------------------------
// Campanhas, conjuntos, anúncios e resultados
// ---------------------------------------------------------------------------

const TYPE_OF_KIND: Record<InfoKind, FieldType> = { text: "texto", long: "texto longo", id: "ID do Meta", url: "link", money: "dinheiro", number: "número", integer: "inteiro", format: "opção" };
const TABLE: Record<InfoLevel, string> = { campaign: "clt_campaigns", adSet: "clt_ad_sets", ad: "clt_ad_creatives" };
const GROUP: Record<InfoLevel, string> = { campaign: "Campanha", adSet: "Conjunto", ad: "Anúncio" };

/** Chave do texto (com acentos) por coluna; sem entrada, vale o rótulo do campo. */
const INFO_TEXT_KEY: Record<string, string> = {
  "ad.asset_url": "Link", "ad.post_id": "ID da publicação", "ad.call_to_action": "Chamada para ação", "ad.destination": "Destino",
  "ad.headline": "Título", "ad.destination_url": "URL de destino", "campaign.planned_amount": "Orçamento total previsto", "campaign.manager_url": "Link do Gerenciador",
};
const INFO_EXAMPLE: Record<string, string> = {
  "campaign.bid_strategy": "Volume mais alto", "campaign.buying_type": "Leilão", "campaign.planned_amount": "R$ 600,00", "campaign.manager_url": "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123",
  "adSet.location": "Cabo Frio, RJ", "adSet.radius_km": "10", "adSet.gender": "Todos", "adSet.languages": "Português", "adSet.placements": "Feed e Stories do Instagram",
  "adSet.conversion_location": "WhatsApp", "adSet.performance_goal": "Maximizar o número de conversas",
  "ad.format": "Vídeo", "ad.asset_url": "https://www.instagram.com/p/EXEMPLO1/", "ad.instagram_url": "https://www.instagram.com/p/EXEMPLO1/",
  "ad.reels_url": "https://www.instagram.com/reel/EXEMPLO2/", "ad.facebook_url": "https://www.facebook.com/sgiv/posts/123", "ad.destination_url": "https://wa.me/5522999999999",
  "ad.post_id": "123456789_987654321", "ad.primary_text": "Garanta sua vaga com condição especial de novembro! 🎉", "ad.headline": "Oferta de novembro",
  "ad.description": "Matrículas abertas", "ad.call_to_action": "Enviar mensagem", "ad.destination": "WhatsApp",
};
/** Campos que o modelo descreve de outro jeito (idade mínima/máxima = "Idade"; observações da campanha = "Observações"). */
const INFO_SKIP = new Set(["campaign.description", "adSet.age_min", "adSet.age_max"]);

const jsonKeyFor = (level: InfoLevel, column: string) => (INFO_ALIASES[level][column] ?? []).find((a) => /^[a-z_]+$/.test(a)) ?? column;
const jsonValue = (type: FieldType, example: string): unknown => (type === "dinheiro" || type === "número" ? Number(example.replace(/^R\$\s*/, "").replace(/\./g, "").replace(",", ".")) : example);

function infoFields(level: InfoLevel): TemplateField[] {
  return INFO_FIELDS[level].filter((f) => !INFO_SKIP.has(`${level}.${f.column}`)).map((f) => {
    const type = TYPE_OF_KIND[f.kind];
    const example = INFO_EXAMPLE[`${level}.${f.column}`] ?? (type === "link" ? "https://exemplo.com" : "Exemplo");
    return { group: GROUP[level], text: INFO_TEXT_KEY[`${level}.${f.column}`] ?? f.label, json: jsonKeyFor(level, f.column), type, example, jsonExample: jsonValue(type, example), saves: `${TABLE[level]}.${f.column}`, source: `info:${level}.${f.column}` };
  });
}

const CAMPAIGN_BASE: TemplateField[] = [
  { group: "Campanha", text: "Campanha", json: "name", type: "texto", example: "SGIV | WhatsApp | Novembro", saves: "clt_campaigns.name", note: "Obrigatório. Abre o bloco da campanha." },
  { group: "Campanha", text: "ID da campanha", json: "meta_campaign_id", type: "ID do Meta", example: "120210000000000001", saves: "clt_campaigns.meta_campaign_id", note: "Copie como texto (sem notação científica)." },
  { group: "Campanha", text: "Objetivo", json: "objective", type: "texto", example: "Mensagens no WhatsApp", saves: "clt_campaigns.objective", note: "Define o tipo de resultado (mensagens, vídeo, vendas, leads, tráfego, alcance, engajamento)." },
  { group: "Campanha", text: "Orçamento diário", json: "daily_budget_brl", type: "dinheiro", example: "R$ 20,00", jsonExample: 20, saves: "clt_campaigns.daily_budget" },
  { group: "Campanha", text: "Início", json: "start_date", type: "data", example: "05/11/2026", jsonExample: "2026-11-05", saves: "clt_campaigns.starts_on" },
  { group: "Campanha", text: "Fim", json: "end_date", type: "data", example: "30/11/2026", jsonExample: "2026-11-30", saves: "clt_campaigns.ends_on" },
  { group: "Campanha", text: "Status", json: "status", type: "opção", example: "Ativa", saves: "clt_campaigns.campaign_status", note: "Planejada, Ativa, Pausada ou Finalizada." },
  { group: "Campanha", text: "Observações", json: "notes", type: "texto longo", example: "Campanha de matrículas.", saves: "clt_campaigns.description" },
];
const AD_SET_BASE: TemplateField[] = [
  { group: "Conjunto", text: "Conjunto", json: "name", type: "texto", example: "Engajados 365D | WhatsApp", saves: "clt_ad_sets.name", note: "Abre o bloco do conjunto dentro da campanha." },
  { group: "Conjunto", text: "ID do conjunto", json: "meta_adset_id", type: "ID do Meta", example: "120210000000000002", saves: "clt_ad_sets.meta_adset_id" },
  { group: "Conjunto", text: "Público", json: "audience_name", type: "texto", example: "Engajados 365D", saves: "clt_ad_sets.saved_audience_id (público cadastrado com o mesmo nome)" },
  { group: "Conjunto", text: "Idade", json: "age_range", type: "lista", example: "25-55", jsonExample: [25, 55], saves: "clt_ad_sets.age_min / age_max", source: "info:adSet.age_min" },
  { group: "Conjunto", text: null, json: "result_type", type: "opção", example: "mensagens", saves: "clt_ad_sets.result_type", note: "Só no JSON: mensagens, visualizacoes, engajamento, vendas, leads, trafego, alcance." },
];
const AD_BASE: TemplateField[] = [
  { group: "Anúncio", text: "Anúncio", json: "name", type: "texto", example: "Vídeo 01 | Oferta", saves: "clt_ad_creatives.name", note: "Abre o bloco do anúncio dentro do conjunto." },
  { group: "Anúncio", text: "ID do anúncio", json: "meta_ad_id", type: "ID do Meta", example: "120210000000000003", saves: "clt_ad_creatives.meta_ad_id" },
];

export const CAMPAIGN_FIELDS = [...CAMPAIGN_BASE, ...infoFields("campaign")];
export const AD_SET_FIELDS = [...AD_SET_BASE, ...infoFields("adSet")];
export const AD_FIELDS = [...AD_BASE, ...infoFields("ad")];

const METRIC_EXAMPLE: Record<string, string> = {
  spend: "R$ 140,00", conversations: "18", sales: "3", revenue: "R$ 2.400,00", impressions: "15.300", reach: "9.800", linkClicks: "210", leads: "4",
  engagements: "1.250", reactions: "320", comments: "41", shares: "27", new_followers: "35", views: "12.400", video_plays_3s: "8.900", thruplays: "2.300",
  video_p25: "4.100", video_p50: "2.800", video_p75: "1.700", video_p95: "980", video_p100: "760", hook_rate: "35,75%", hold_rate: "12,40%", saves: "58", avg_watch_time: "6,5",
};
const METRIC_COLUMN: Record<string, string> = { spend: "spend", conversations: "conversations", sales: "sales", revenue: "revenue", impressions: "impressions", reach: "reach", linkClicks: "link_clicks", leads: "leads" };
const metricJson = (key: string, example: string): unknown => {
  if (RATE_IMPORT_KEYS.has(key)) return Number(example.replace("%", "").replace(",", "."));
  return Number(example.replace(/^R\$\s*/, "").replace(/\./g, "").replace(",", "."));
};
export const RESULT_FIELDS: TemplateField[] = [
  { group: "Período", text: "Período", json: "metrics_period", type: "data", example: "01/11/2026 a 07/11/2026", jsonExample: { start: "2026-11-01", end: "2026-11-07" }, saves: "clt_ad_period_metrics.period_start / period_end", note: "Os resultados valem para este período. Sem período, a importação soma a diferença dos totais (\"Atualizar resultados\")." },
  ...METRIC_KEYS.map((k): TemplateField => ({ group: "Métricas do anúncio", text: METRIC_LABEL[k], json: METRIC_ALIASES[k][0], type: k === "spend" || k === "revenue" ? "dinheiro" : "inteiro", example: METRIC_EXAMPLE[k], jsonExample: metricJson(k, METRIC_EXAMPLE[k]), saves: `clt_ad_period_metrics.${METRIC_COLUMN[k]}`, source: `metric:${k}` })),
  ...EXTRA_IMPORT_KEYS.map((k): TemplateField => ({
    group: RATE_IMPORT_KEYS.has(k) ? "Taxas e tempo médio (informados, nunca somados)" : ["views", "video_plays_3s", "thruplays"].includes(k) || k.startsWith("video_p") ? "Vídeo" : "Engajamento",
    text: EXTRA_IMPORT_LABEL[k], json: EXTRA_ALIASES[k][0], type: k === "avg_watch_time" ? "segundos" : RATE_IMPORT_KEYS.has(k) ? "percentual" : "inteiro",
    example: METRIC_EXAMPLE[k], jsonExample: metricJson(k, METRIC_EXAMPLE[k]), saves: `clt_ad_period_metrics.${k}`, source: `metric:${k}`,
    note: k === "new_followers" ? "Novos seguidores atribuídos aos anúncios (não é o total do Instagram)." : k === "avg_watch_time" ? "Segundos (ex.: 6,5 ou 0:07)." : undefined,
  })),
];

const line = (f: TemplateField) => (f.text ? `${f.text}: ${f.example}` : null);
const lines = (fs: TemplateField[]) => fs.map(line).filter(Boolean).join("\n");
const jsonOf = (fs: TemplateField[], skip: string[] = []) => Object.fromEntries(fs.filter((f) => f.json && !skip.includes(f.json)).map((f) => [f.json!, f.jsonExample ?? f.example]));

const CAMPAIGN_TEXT = (withSets: boolean, withAds: boolean) => [
  "Empresa: SGIV", "",
  lines(CAMPAIGN_FIELDS), "",
  withSets ? lines(AD_SET_FIELDS) : "Conjunto: Engajados 365D | WhatsApp", "",
  withAds ? lines(AD_FIELDS) : "Anúncio: Vídeo 01 | Oferta",
].join("\n");
const CAMPAIGN_JSON = (withSets: boolean, withAds: boolean) => JSON.stringify({
  schema_version: "1.0",
  campaigns: [{
    ...jsonOf(CAMPAIGN_FIELDS),
    ad_sets: [{
      ...(withSets ? jsonOf(AD_SET_FIELDS) : { name: "Engajados 365D | WhatsApp" }),
      ads: [withAds ? jsonOf(AD_FIELDS) : { name: "Vídeo 01 | Oferta" }],
    }],
  }],
}, null, 2);

const RESULTS_TEXT = ["Empresa: SGIV", `Período: ${RESULT_FIELDS[0].example}`, "", "Campanha: SGIV | WhatsApp | Novembro", "Conjunto: Engajados 365D | WhatsApp", "Anúncio: Vídeo 01 | Oferta", lines(RESULT_FIELDS.slice(1))].join("\n");
const RESULTS_JSON = JSON.stringify({
  schema_version: "1.0",
  metrics_period: RESULT_FIELDS[0].jsonExample,
  campaigns: [{ name: "SGIV | WhatsApp | Novembro", ad_sets: [{ name: "Engajados 365D | WhatsApp", ads: [{ name: "Vídeo 01 | Oferta", metrics: jsonOf(RESULT_FIELDS.slice(1)) }] }] }],
}, null, 2);

export const AUDIENCE_FIELDS: TemplateField[] = [
  { group: "Público", text: "Público personalizado", json: "name (type: custom)", type: "texto", example: "Engajados 365D", saves: "clt_audiences.name / audience_type", note: "Também: “Público salvo:” e “Público semelhante:”." },
  { group: "Público", text: "Origem", json: "source", type: "texto", example: "Instagram", saves: "clt_audiences.settings" },
  { group: "Público", text: "Retenção", json: "retention_days", type: "inteiro", example: "365", saves: "clt_audiences.settings", note: "Dias." },
  { group: "Público", text: "Porcentagem", json: "source.percentage", type: "percentual", example: "1%", saves: "clt_audiences.settings", note: "Semelhantes." },
  { group: "Público", text: "Cidade", json: "targeting_location", type: "texto", example: "Cabo Frio", saves: "clt_audiences.settings" },
  { group: "Público", text: "Raio", json: "targeting_location.radius_km", type: "número", example: "10", saves: "clt_audiences.settings" },
  { group: "Público", text: "Idade", json: "age_range", type: "lista", example: "25-55", saves: "clt_audiences.settings" },
  { group: "Público", text: "Interesses", json: "interests", type: "lista", example: "Educação, Cursos", saves: "clt_audiences.settings" },
  { group: "Público", text: "Tamanho", json: "estimated_size", type: "lista", example: "246.600 - 290.100", saves: "clt_audiences.settings" },
  { group: "Público", text: "Observações", json: "notes", type: "texto longo", example: "Engajou com o Instagram", saves: "clt_audiences.notes" },
];
const AUDIENCE_TEXT = `Empresa: SGIV

Público personalizado: Engajados 365D
Origem: Instagram
Retenção: 365
Observações: Engajou com o Instagram

---

Público semelhante: Semelhante 1% Engajados
Origem: Engajados 365D
Porcentagem: 1%

---

Público salvo: Cabo Frio | Amplo
Cidade: Cabo Frio
Raio: 10
Idade: 25-55
Interesses: Educação, Cursos
Tamanho: 246.600 - 290.100`;
const AUDIENCE_JSON = JSON.stringify({
  schema_version: "1.0",
  audiences: [
    { external_key: "sgiv_engajados_365", name: "Engajados 365D", type: "custom", retention_days: 365, notes: "Engajou com o Instagram" },
    { external_key: "sgiv_lal_1", name: "Semelhante 1% Engajados", type: "lookalike", source: { audience_external_key: "sgiv_engajados_365", percentage: 1 } },
    { external_key: "sgiv_cf_amplo", name: "Cabo Frio | Amplo", type: "saved", targeting_location: { cidade: "Cabo Frio", radius_km: 10 }, age_range: [25, 55], interests: ["Educação", "Cursos"] },
  ],
}, null, 2);

// ---------------------------------------------------------------------------
// Tarefas, subtarefas e checklists
// ---------------------------------------------------------------------------

export const TASK_FIELDS: TemplateField[] = [
  { group: "Tarefa", text: "Empresa", json: "empresa", type: "texto", example: "SGIV", saves: "clt_tasks.company_id", note: "Só no CLT/MKT (nome igual ao cadastrado). Vazio = tarefa geral." },
  { group: "Tarefa", text: "Título", json: "titulo", type: "texto", example: "Fazer posts da Semear", saves: "tasks.title / clt_tasks.title", note: "Obrigatório. Abre um novo registro." },
  { group: "Tarefa", text: "Descrição", json: "descricao", type: "texto longo", example: "Posts de novembro.", saves: "description" },
  { group: "Tarefa", text: "Prioridade", json: "prioridade", type: "opção", example: "Importante", saves: "priority", note: "Normal ou Importante." },
  { group: "Tarefa", text: "Data de execução", json: "data_execucao", type: "data", example: "17/11/2026", saves: "due_date (fazer no dia)" },
  { group: "Tarefa", text: "Horário", json: "horario", type: "horário", example: "09:00", saves: "scheduled_time" },
  { group: "Tarefa", text: "Prazo final", json: "prazo_final", type: "data", example: "20/11/2026", saves: "deadline_date (Pessoal) · observações (CLT/MKT, quando também há execução)" },
  { group: "Tarefa", text: "Dias", json: "dias", type: "lista", example: "seg, qua, sex", saves: "recurrence = semanal + weekdays", note: "Repetição semanal (“todos os dias”, “dias úteis”)." },
  { group: "Tarefa", text: "Observações", json: "observacoes", type: "texto longo", example: "Usar as fotos novas.", saves: "notes" },
  { group: "Subtarefas", text: "Subtarefas", json: "subtarefas", type: "lista", example: "(linhas com “-” abaixo)", saves: "task_subtasks", note: "Uma por linha com “-”. Opções na mesma linha: “| fazer: dd/mm/aaaa”, “| prazo: dd/mm/aaaa”, “| importante”, texto livre = descrição." },
  { group: "Checklist", text: null, json: "subtarefas[].checklist", type: "lista", example: "(recuo de 2 espaços)", saves: "task_subtasks (item do checklist)", note: "Linhas recuadas abaixo da subtarefa. Itens também aceitam “| importante”. Níveis mais fundos viram itens do mesmo checklist (com aviso)." },
];

function taskText(area: ImportArea, focus: "full" | "subtasks" | "checklists"): string {
  const company = area === "pessoal" ? "" : "Empresa: SGIV\n";
  if (focus === "subtasks") return `${company}Título: Fazer posts da Semear
Prazo final: 20/11/2026

Subtarefas:
- Editar post | fazer: 17/11/2026 | importante
- Aprovar com o cliente | fazer: 18/11/2026
- Publicar | prazo: 20/11/2026 | Postar às 18h`;
  if (focus === "checklists") return `${company}Título: Fazer posts da Semear

Subtarefas:
- Editar post | fazer: 17/11/2026
  - Revisar legenda | importante
  - Exportar em 1080x1920
  - Conferir áudio
- Publicar
  - Agendar no Meta Business Suite`;
  return `${company}Título: Fazer posts da Semear
Prioridade: Importante
Data de execução: 17/11/2026
Horário: 09:00
Prazo final: 20/11/2026
Descrição: Posts de novembro.
Observações: Usar as fotos novas.

Subtarefas:
- Editar post | fazer: 17/11/2026 | importante
  - Revisar legenda | importante
  - Exportar vídeo
- Publicar | prazo: 20/11/2026

---

${company}Título: Revisar relatório semanal
Dias: seg, qua, sex
Horário: 09:00`;
}

function taskJson(area: ImportArea, focus: "full" | "subtasks" | "checklists"): string {
  const company = area === "pessoal" ? {} : { empresa: "SGIV" };
  const subtarefas = focus === "subtasks"
    ? [{ titulo: "Editar post", fazer_no_dia: "17/11/2026", prioridade: "importante" }, { titulo: "Aprovar com o cliente", fazer_no_dia: "18/11/2026" }, { titulo: "Publicar", prazo: "20/11/2026", descricao: "Postar às 18h" }]
    : [{ titulo: "Editar post", fazer_no_dia: "17/11/2026", prioridade: "importante", checklist: [{ titulo: "Revisar legenda", prioridade: "importante" }, "Exportar vídeo"] }, { titulo: "Publicar", prazo: "20/11/2026" }];
  const main = focus === "full"
    ? { ...company, titulo: "Fazer posts da Semear", prioridade: "importante", data_execucao: "17/11/2026", horario: "09:00", prazo_final: "20/11/2026", descricao: "Posts de novembro.", observacoes: "Usar as fotos novas.", subtarefas }
    : { ...company, titulo: "Fazer posts da Semear", prazo_final: "20/11/2026", subtarefas };
  const tarefas = focus === "full" ? [main, { ...company, titulo: "Revisar relatório semanal", dias: ["seg", "qua", "sex"], horario: "09:00" }] : [main];
  return JSON.stringify({ tarefas }, null, 2);
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export function importTemplates(area: ImportArea, type: "tarefas" | "rotinas" | "campanhas" | "publicos" | "resultados"): ImportTemplate[] {
  if (type === "rotinas") return [];
  if (type === "tarefas") {
    const taskFields = area === "pessoal" ? TASK_FIELDS.filter((f) => f.text !== "Empresa") : TASK_FIELDS;
    return [
      { id: area === "pessoal" ? "tarefas_pessoais" : "tarefas_clt", label: area === "pessoal" ? "Tarefas pessoais" : "Tarefas CLT/MKT", description: "Tarefa completa: execução, prazo, prioridade, repetição, subtarefas e checklist.", fields: taskFields, text: taskText(area, "full"), json: taskJson(area, "full") },
      { id: "subtarefas", label: "Subtarefas", description: "Subtarefas com “fazer no dia”, prazo e prioridade próprios (aparecem no Meu Dia pela própria data).", fields: taskFields.filter((f) => ["Título", "Prazo final", "Subtarefas", "Empresa"].includes(f.text ?? "")), text: taskText(area, "subtasks"), json: taskJson(area, "subtasks") },
      { id: "checklists", label: "Checklists", description: "Itens do checklist dentro de cada subtarefa (recuo), com prioridade por item.", fields: taskFields.filter((f) => ["Título", "Subtarefas", "Empresa"].includes(f.text ?? "") || f.group === "Checklist"), text: taskText(area, "checklists"), json: taskJson(area, "checklists") },
    ];
  }
  if (type === "publicos") return [{ id: "publicos", label: "Públicos", description: "Públicos salvos, personalizados e semelhantes.", fields: AUDIENCE_FIELDS, text: AUDIENCE_TEXT, json: AUDIENCE_JSON }];
  if (type === "resultados") return [{ id: "resultados", label: "Resultados de campanhas", description: "Métricas por anúncio e período (principais, engajamento, vídeo, taxas e tempo médio).", fields: RESULT_FIELDS, text: RESULTS_TEXT, json: RESULTS_JSON }];
  return [
    { id: "campanhas", label: "Campanhas", description: "Campanha completa com um conjunto e um anúncio.", fields: CAMPAIGN_FIELDS, text: CAMPAIGN_TEXT(false, false), json: CAMPAIGN_JSON(false, false) },
    { id: "conjuntos", label: "Conjuntos de anúncios", description: "Todas as informações do conjunto (público, localização, idade, posicionamentos…).", fields: AD_SET_FIELDS, text: CAMPAIGN_TEXT(true, false), json: CAMPAIGN_JSON(true, false) },
    { id: "anuncios", label: "Anúncios", description: "Textos, links das publicações (Instagram, Reels, Facebook) e URL de destino.", fields: AD_FIELDS, text: CAMPAIGN_TEXT(false, true), json: CAMPAIGN_JSON(false, true) },
  ];
}
