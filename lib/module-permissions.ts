import type { ModulePermissionAction, ModulePermissionModule, SpaceRole } from "@/types/database.types";

/**
 * Metadados dos módulos/ações pro Painel Dev renderizar os checkboxes.
 * As ações listadas aqui são só o que faz sentido mostrar por módulo
 * (ex: Sites & Domínios não tem "criar"/"concluir") — o banco aceita as 5
 * ações pra qualquer módulo (migration 003), a restrição é só de UI.
 */
export const MODULE_PERMISSION_GROUPS: {
  key: ModulePermissionModule;
  label: string;
  actions: ModulePermissionAction[];
}[] = [
  { key: "visao_geral", label: "Visão Geral", actions: ["view"] },
  { key: "clientes", label: "Clientes", actions: ["view", "create", "edit", "delete"] },
  { key: "servicos", label: "Serviços", actions: ["view", "create", "edit", "delete"] },
  {
    key: "trabalhos",
    label: "Trabalhos / Atividades",
    actions: ["view", "create", "edit", "conclude", "delete"],
  },
  { key: "reunioes", label: "Reuniões", actions: ["view", "create", "edit", "conclude", "delete"] },
  { key: "vendedores", label: "Vendedores", actions: ["view", "create", "edit", "delete"] },
  { key: "financeiro", label: "Financeiro", actions: ["view", "create", "edit", "delete"] },
  { key: "sites", label: "Sites & Domínios", actions: ["view", "edit"] },
];

export const MODULE_PERMISSION_ACTION_LABELS: Record<ModulePermissionAction, string> = {
  view: "Visualizar",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  conclude: "Concluir",
};

/**
 * Espelho em JS de `default_module_permission()` (migration 003) — usado
 * SÓ para pré-popular os checkboxes do Painel Dev com o valor "efetivo"
 * antes de qualquer override explícito. A autorização de verdade nunca
 * passa por aqui: é sempre `has_module_permission()` no Postgres, chamada
 * de novo em cada Server Action e em cada policy de RLS. Se este espelho
 * ficar desatualizado em relação ao SQL, o pior caso é a UI mostrar um
 * checkbox com o estado "errado" — nunca uma permissão indevida de
 * verdade, porque o banco decide por conta própria.
 */
export function defaultModulePermission(
  role: SpaceRole,
  moduleKey: ModulePermissionModule,
  action: ModulePermissionAction
): boolean {
  if (role === "owner" || role === "admin") return true;
  if (role === "member") {
    if (moduleKey === "financeiro") return false;
    if (action === "delete") return false;
    return true;
  }
  if (role === "viewer") {
    return action === "view" && moduleKey !== "financeiro";
  }
  return false;
}
