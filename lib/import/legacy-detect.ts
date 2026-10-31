/**
 * Arquivos EXATAMENTE no formato antigo da página da empresa continuam no
 * fluxo antigo (que não depende da migration do importador novo):
 *  - públicos: `{ "publicos": [{ "nome", "tipo", "origem", "incluidos" }] }`
 *  - campanhas: `{ "campanhas": [{ "nome", "investimento", "conjuntos" }] }`
 * Qualquer outra coisa (formato v1 com `audiences`/`campaigns`, arquivos
 * mistos, texto) vai para o importador inteligente.
 */
type Obj = Record<string, unknown>;

function parseObject(content: string): Obj | null {
  const t = content.trim();
  if (!t.startsWith("{")) return null;
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
  } catch {
    return null;
  }
}

const isNewFormat = (o: Obj) => "schema_version" in o || "audiences" in o || "campaigns" in o;

export function isLegacyAudienceFile(content: string): boolean {
  const o = parseObject(content);
  return !!o && !isNewFormat(o) && !("campanhas" in o) && Array.isArray(o.publicos) && o.publicos.length > 0;
}

export function isLegacyCampaignFile(content: string): boolean {
  const o = parseObject(content);
  return !!o && !isNewFormat(o) && Array.isArray(o.campanhas) && o.campanhas.length > 0;
}
