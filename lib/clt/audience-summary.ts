/**
 * Configurações do público (`clt_audiences.settings`) em linhas legíveis.
 * Aceita as chaves do importador novo (`targeting_location`, `age_range`,
 * `estimated_size`...) e as do cadastro antigo (`localizacao`,
 * `idade_minima`...). Só mostra o que existe — nada é inventado.
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const intBR = (v: unknown) => (typeof v === "number" ? v.toLocaleString("pt-BR") : String(v));
const has = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);

/** Chaves internas ou já exibidas de outra forma. */
const HIDDEN = new Set(["external_key", "import_platform", "platform", "company_key"]);
const HANDLED = new Set([
  "targeting_location", "localizacao", "age_range", "idade_minima", "idade_maxima", "genero", "gender",
  "interests", "interesses", "estimated_size", "tamanho_estimado", "retention_days", "retencao_dias",
  "percentage", "percentual", "porcentagem", "language", "idioma", "created_at_local", "notes", "observacoes", "source",
]);
const LABELS: Record<string, string> = { advantage_plus: "Advantage+", placements: "Posicionamentos" };

function location(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (!isObj(v)) return null;
  const place = [v.city ?? v.cidade, v.region ?? v.estado, v.country ?? v.pais].filter(has).join(", ");
  const radius = v.radius_km ?? v.raio_km;
  const text = [place || (has(v.descricao) ? String(v.descricao) : ""), has(radius) ? `+${radius} km` : ""].filter(Boolean).join(" ");
  return text || null;
}

function age(s: Obj): string | null {
  const r = s.age_range;
  const [min, max] = Array.isArray(r) ? r : [s.idade_minima, s.idade_maxima];
  if (!has(min) && !has(max)) return null;
  const top = max === 65 || max === "65+" ? "65+" : max;
  return `${has(min) ? min : "?"} a ${has(top) ? top : "?"} anos`;
}

function localDateTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}` : v;
}

function plain(v: unknown): string {
  if (Array.isArray(v)) return v.map(plain).join(", ");
  if (isObj(v)) return Object.entries(v).filter(([, x]) => has(x)).map(([k, x]) => `${k}: ${plain(x)}`).join(" · ");
  if (typeof v === "boolean") return v ? "sim" : "não";
  return intBR(v);
}

export function describeAudienceSettings(settings: unknown): Array<[string, string]> {
  if (!isObj(settings)) return [];
  const s = settings;
  const out: Array<[string, string]> = [];
  const push = (label: string, value: string | null) => { if (value) out.push([label, value]); };
  push("Localização", location(s.targeting_location ?? s.localizacao));
  push("Idade", age(s));
  push("Gênero", has(s.genero ?? s.gender) ? String(s.genero ?? s.gender) : null);
  const interests = s.interests ?? s.interesses;
  push("Interesses", Array.isArray(interests) ? (interests.length ? interests.join(", ") : "nenhum") : has(interests) ? String(interests) : null);
  const size = s.estimated_size ?? s.tamanho_estimado;
  push("Tamanho estimado", Array.isArray(size) && size.length === 2 ? `${intBR(size[0])} a ${intBR(size[1])} pessoas` : has(size) ? plain(size) : null);
  const retention = s.retention_days ?? s.retencao_dias;
  push("Retenção", has(retention) ? `${retention} dias` : null);
  const pct = s.percentage ?? s.percentual ?? s.porcentagem;
  push("Porcentagem", has(pct) ? `${pct}%` : null);
  push("Idioma", has(s.language ?? s.idioma) ? String(s.language ?? s.idioma) : null);
  push("Criado em", localDateTime(s.created_at_local));
  if (isObj(s.source)) {
    // Retenção/porcentagem já aparecem acima; a chave do público de origem é interna.
    const rest = Object.fromEntries(Object.entries(s.source).filter(([k]) => !["audience_external_key", "audience_name", "retention_days", "percentage"].includes(k)));
    push("Fonte", plain(rest) || null);
  }
  for (const [k, v] of Object.entries(s)) {
    if (HIDDEN.has(k) || HANDLED.has(k) || !has(v)) continue;
    push(LABELS[k] ?? k.replace(/_/g, " "), plain(v));
  }
  push("Observações", has(s.notes ?? s.observacoes) ? String(s.notes ?? s.observacoes) : null);
  return out;
}
