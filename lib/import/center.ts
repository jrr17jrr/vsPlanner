import type { ImportArea } from "./tasks";

/**
 * Áreas e tipos da Central de Importação. Só entra aqui o que tem gravação
 * real e segura (testado em lib/import/center.test.ts). Receitas, despesas,
 * clientes, serviços, reuniões e TikTok ficaram para uma rodada própria.
 */

export type ImportTypeId = "tarefas" | "rotinas" | "campanhas" | "publicos" | "resultados";

export const AREA_INFO: Record<ImportArea, { label: string; description: string }> = {
  pessoal: { label: "Pessoal", description: "Tarefas, subtarefas e rotina pessoais." },
  clt: { label: "Trabalho / CLT", description: "Empresas e campanhas do CLT." },
  mkt: { label: "Visionário Dev / MKT", description: "Empresas e campanhas do MKT." },
};

export const TYPE_INFO: Record<ImportTypeId, { label: string; description: string }> = {
  tarefas: { label: "Tarefas e subtarefas", description: "Execução, prazo final, prioridade, descrição, repetição e subtarefas." },
  rotinas: { label: "Rotinas", description: "Atividades semanais ou de um dia, com horário." },
  campanhas: { label: "Campanhas", description: "Campanhas, conjuntos e anúncios (cria ou atualiza)." },
  publicos: { label: "Públicos de anúncios", description: "Salvos, personalizados e semelhantes." },
  resultados: { label: "Resultados de campanhas", description: "Investimento, conversas, vendas e faturamento por período." },
};

export const TYPES_BY_AREA: Record<ImportArea, ImportTypeId[]> = {
  pessoal: ["tarefas", "rotinas"],
  clt: ["tarefas", "campanhas", "publicos", "resultados"],
  mkt: ["tarefas", "campanhas", "publicos", "resultados"],
};

export type ImportAccess = { clt: boolean; mkt: boolean };

export function availableAreas(access: ImportAccess): ImportArea[] {
  return (["pessoal", "clt", "mkt"] as const).filter((a) => a === "pessoal" || access[a]);
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** `?area=clt&tipo=campanhas` (links antigos e do menu) → seleção válida e autorizada. */
export function parseImportSelection(params: Record<string, string | string[] | undefined>, access: ImportAccess): { area: ImportArea | null; type: ImportTypeId | null } {
  const rawArea = one(params.area);
  const area = rawArea && (availableAreas(access) as string[]).includes(rawArea) ? (rawArea as ImportArea) : null;
  const rawType = one(params.tipo);
  const type = area && rawType && (TYPES_BY_AREA[area] as string[]).includes(rawType) ? (rawType as ImportTypeId) : null;
  return { area, type };
}
