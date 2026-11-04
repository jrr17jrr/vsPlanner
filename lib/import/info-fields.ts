import { INFO_FIELDS, normalizeInfoValue, type InfoLevel } from "@/lib/clt/registered-info";
import { isEmptyMarker, normalizeKey } from "./values";
import type { ImportDetails, ImportInfo, ParseProblem } from "./types";

/**
 * Informações cadastradas na importação (JSON e texto): apelidos aceitos →
 * coluna do banco (lib/clt/registered-info.ts). O que não tem coluna própria
 * vai para `details` (JSON); nada é inventado e campo omitido não entra.
 */

/** Apelidos (normalizados: minúsculas, sem acento, "_" ou espaço) → coluna. */
const ALIASES: Record<InfoLevel, Record<string, string[]>> = {
  campaign: {
    bid_strategy: ["bid_strategy", "estrategia de lances", "estrategia de lance", "estrategia lances", "estrategia de licitacao", "estrategia"],
    buying_type: ["buying_type", "tipo de compra", "tipo compra"],
    planned_amount: ["orcamento total", "orcamento total previsto", "investimento total previsto", "investimento previsto", "lifetime_budget", "lifetime_budget_brl", "total_budget", "total_budget_brl"],
    manager_url: ["manager_url", "link do gerenciador", "link gerenciador", "link da campanha", "ads_manager_url"],
  },
  adSet: {
    location: ["localizacao", "local", "cidade", "regiao", "location", "city"],
    radius_km: ["raio", "raio (km)", "raio km", "radius_km", "radius"],
    age_min: ["idade minima", "age_min"],
    age_max: ["idade maxima", "age_max"],
    gender: ["genero", "sexo", "gender"],
    languages: ["idioma", "idiomas", "language", "languages"],
    placements: ["posicionamentos", "posicionamento", "placements"],
    conversion_location: ["local da conversao", "local de conversao", "conversion_location", "destination_type"],
    performance_goal: ["objetivo de desempenho", "meta de desempenho", "performance_goal", "optimization_goal", "otimizacao"],
  },
  ad: {
    asset_url: ["link", "link do anuncio", "link da publicacao", "link do post", "url", "url do anuncio", "ad_link", "post_url", "permalink", "permalink_url", "preview_url", "asset_url", "link do criativo"],
    post_id: ["post_id", "id do post", "id da publicacao", "publicacao"],
    primary_text: ["texto principal", "texto", "texto do anuncio", "legenda", "primary_text", "body", "message"],
    headline: ["titulo", "title", "headline"],
    description: ["descricao", "description"],
    call_to_action: ["chamada para acao", "botao", "botao de chamada para acao", "cta", "call_to_action", "call_to_action_type"],
    destination: ["destino", "destino do anuncio", "destination"],
    format: ["formato", "format", "tipo de criativo"],
  },
};

const norm = (k: string) => normalizeKey(k.replace(/[_-]+/g, " ")).replace(/\s*\(\s*/g, " (").trim();
const BY_ALIAS: Record<InfoLevel, Map<string, string>> = { campaign: new Map(), adSet: new Map(), ad: new Map() };
for (const level of Object.keys(ALIASES) as InfoLevel[]) for (const [col, list] of Object.entries(ALIASES[level])) for (const a of list) BY_ALIAS[level].set(norm(a), col);

/** Coluna de informação para a chave (texto ou JSON) no nível, ou null. */
export function infoColumnFor(level: InfoLevel, key: string): string | null {
  return BY_ALIAS[level].get(norm(key)) ?? null;
}

const fieldOf = (level: InfoLevel, column: string) => INFO_FIELDS[level].find((f) => f.column === column)!;

/**
 * Grava `raw` em `info[column]` já normalizado. Vazio ("—", "") = não
 * informado (não entra). Inválido → problema com a mensagem do campo.
 */
export function putInfo(info: ImportInfo, level: InfoLevel, column: string, raw: unknown, path: string, problems: ParseProblem[]) {
  if (isEmptyMarker(raw)) return;
  const field = fieldOf(level, column);
  const value = Array.isArray(raw) ? raw.map(String).join(", ") : typeof raw === "object" ? null : raw;
  if (value === null) { problems.push({ path, level: "warning", message: `"${field.label}": formato não reconhecido — ignorado.` }); return; }
  const v = normalizeInfoValue(field, value);
  if (v === undefined) {
    const why = field.kind === "url" ? "link inválido (use um endereço http/https)" : field.kind === "integer" ? "idade entre 13 e 100" : field.kind === "format" ? "use Vídeo, Imagem ou Carrossel" : "valor inválido";
    // Formato desconhecido não bloqueia (o anúncio fica como "Outro", como antes).
    problems.push({ path, ...(field.kind === "format" || field.kind === "url" ? { level: "warning" as const } : {}), message: `"${field.label}": ${why}. Recebido: ${String(value).slice(0, 80)}${field.kind === "url" ? " — não foi gravado." : ""}` });
    return;
  }
  if (v !== null) info[column] = v;
}

/** "25-55", "25 a 55", "18+", [25, 55] → idade mínima/máxima. */
export function putAgeRange(info: ImportInfo, raw: unknown, path: string, problems: ParseProblem[]) {
  if (isEmptyMarker(raw)) return;
  let min: unknown, max: unknown;
  if (Array.isArray(raw) && raw.length === 2) [min, max] = raw;
  else {
    const m = /^(\d{2,3})\s*(?:-|a|até|ate|–)\s*(\d{2,3})\+?$|^(\d{2,3})\+$/i.exec(String(raw).trim().replace(/\s*anos$/i, ""));
    if (!m) { problems.push({ path, message: `Idade inválida (use "25-55"): ${String(raw).slice(0, 40)}` }); return; }
    [min, max] = m[3] ? [m[3], 65] : [m[1], m[2]];
  }
  const before = problems.length;
  putInfo(info, "adSet", "age_min", min, path, problems);
  putInfo(info, "adSet", "age_max", max, path, problems);
  if (problems.length === before && typeof info.age_min === "number" && typeof info.age_max === "number" && info.age_max < info.age_min) {
    problems.push({ path, message: "Idade máxima menor que a mínima." });
    delete info.age_min; delete info.age_max;
  }
}

/** Localização em objeto (JSON do Meta: city/region/radius_km) → texto + raio. */
export function putLocation(info: ImportInfo, raw: unknown, path: string, problems: ParseProblem[]) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const place = [o.city ?? o.cidade, o.region ?? o.estado, o.country ?? o.pais].filter((v) => typeof v === "string" && v.trim()).join(", ") || (typeof o.descricao === "string" ? o.descricao : "");
    if (place) putInfo(info, "adSet", "location", place, path, problems);
    const radius = o.radius_km ?? o.raio_km ?? o.raio;
    if (radius !== undefined) putInfo(info, "adSet", "radius_km", radius, path, problems);
    return;
  }
  putInfo(info, "adSet", "location", raw, path, problems);
}

/**
 * JSON: lê as informações do objeto (campanha/conjunto/anúncio). Chaves
 * estruturais (`known`) são puladas; as demais sem coluna, se forem valores
 * simples, vão para `details`.
 */
export function readJsonInfo(level: InfoLevel, obj: Record<string, unknown>, known: Set<string>, path: string, problems: ParseProblem[]): { info: ImportInfo; details: ImportDetails } {
  const info: ImportInfo = {};
  const details: ImportDetails = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const nk = norm(k);
    if (level === "adSet" && ["age range", "idade", "faixa etaria"].includes(nk)) { putAgeRange(info, v, `${path}.${k}`, problems); continue; }
    if (level === "adSet" && ["targeting location", "localizacao", "location"].includes(nk) && typeof v === "object") { putLocation(info, v, `${path}.${k}`, problems); continue; }
    const col = infoColumnFor(level, k);
    if (col) { putInfo(info, level, col, v, `${path}.${k}`, problems); continue; }
    if (known.has(k) || known.has(nk)) continue;
    const scalar = (x: unknown) => typeof x === "string" || typeof x === "number" || typeof x === "boolean";
    if (scalar(v) && !(typeof v === "string" && !v.trim())) details[k.slice(0, 60)] = typeof v === "string" ? v.slice(0, 1000) : (v as number | boolean);
    else if (Array.isArray(v) && v.length && v.length <= 50 && v.every((x) => typeof x === "string" || typeof x === "number")) details[k.slice(0, 60)] = v as Array<string | number>;
  }
  return { info, details };
}

export const hasInfo = (x: { info?: ImportInfo; details?: ImportDetails }) => !!x.info && Object.keys(x.info).length > 0 || !!x.details && Object.keys(x.details).length > 0;
