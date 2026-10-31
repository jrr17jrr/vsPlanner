import type { CltModule } from "@/lib/clt/module";

/** Aviso (só no MKT) enquanto a migration do módulo não foi aplicada no banco. */
export function ModulePendingNotice({ module, ready }: { module: CltModule; ready: boolean }) {
  if (module !== "mkt" || ready) return null;
  return (
    <p className="rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
      O módulo MKT ainda não está ativo no banco de dados. Aplique a migração
      <code className="mx-1 rounded bg-muted px-1">20261031120000_mkt_module.sql</code>
      no Supabase para cadastrar empresas, campanhas e tarefas do MKT. Os dados do Trabalho / CLT não são afetados.
    </p>
  );
}
