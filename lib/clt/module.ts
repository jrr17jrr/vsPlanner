/**
 * Módulos que compartilham o sistema de tráfego/tarefas do Trabalho / CLT.
 * Os dados ficam nas mesmas tabelas (clt_*), isolados pela coluna `module`
 * da empresa (e da tarefa sem empresa). Cada tela recebe o módulo e só lê/
 * grava registros dele.
 */
export type CltModule = "clt" | "mkt";

export type CltModuleConfig = {
  id: CltModule;
  /** Prefixo das rotas do módulo. */
  basePath: string;
  /** Nome exibido em títulos e descrições. */
  label: string;
  /** Rótulo das tarefas sem empresa ("CLT geral"). */
  generalLabel: string;
  planningPath: string;
};

export const MODULES: Record<CltModule, CltModuleConfig> = {
  clt: { id: "clt", basePath: "/trabalho", label: "Trabalho / CLT", generalLabel: "CLT", planningPath: "/planejamento?area=clt" },
  mkt: { id: "mkt", basePath: "/visionario/mkt", label: "MKT", generalLabel: "MKT", planningPath: "/visionario/mkt/planejamento" },
};

/** MKT: identificação exibida onde o CLT mostra o responsável. Empresa própria nunca recebe cliente inventado. */
export function mktOwnerLabel(c: { company_kind?: string | null; client_name?: string | null }): string {
  return c.company_kind === "cliente" ? (c.client_name?.trim() || "Cliente não informado") : "Empresa própria";
}

export const isCltModule = (v: unknown): v is CltModule => v === "clt" || v === "mkt";
