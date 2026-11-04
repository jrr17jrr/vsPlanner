import type { Activity } from "@/types/database.types";

/**
 * Exclusão em lote da Minha Rotina — regra pura e testada
 * (lib/routine-delete.test.ts).
 *
 *   "dias"  → atividade recorrente: some SÓ nos dias selecionados
 *             (activities.skipped_dates, migration 20261107100000). A
 *             atividade, os outros dias e o histórico continuam.
 *   "toda"  → exclui a atividade inteira (todas as repetições). Para uma
 *             tarefa vinculada, só a tira da rotina (a tarefa continua).
 *
 * Atividade de um dia só (specific_date) é sempre excluída inteira — ela
 * só existe naquele dia. Nada que não foi selecionado é tocado.
 */
export type DeleteScope = "dias" | "toda";
export type DeleteRequest = { activityId: string; scope: DeleteScope; dates: string[] };
export type DeletePlan = { deleteIds: string[]; skips: { activityId: string; skipped_dates: string[] }[] };

export const SKIP_NEEDS_MIGRATION =
  "\"Excluir somente neste dia\" fica disponível depois de aplicar a migração 20261107100000_activity_skipped_dates.sql no Supabase. Nada foi excluído.";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isRecurringActivity = (a: Pick<Activity, "specific_date">) => !a.specific_date;

/** A coluna `skipped_dates` só vem no `select *` depois da migration. */
export const skipAvailable = (activities: Pick<Activity, "skipped_dates">[]) =>
  activities.length === 0 || activities.some((a) => a.skipped_dates !== undefined);

/** Agrupa as ocorrências selecionadas por atividade (datas únicas e ordenadas), na ordem em que aparecem. */
export function groupSelectedByActivity<T extends { activity: Activity; date: string }>(selected: T[]): { activity: Activity; dates: string[] }[] {
  const map = new Map<string, { activity: Activity; dates: Set<string> }>();
  for (const s of selected) {
    const g = map.get(s.activity.id) ?? map.set(s.activity.id, { activity: s.activity, dates: new Set() }).get(s.activity.id)!;
    g.dates.add(s.date);
  }
  return [...map.values()].map((g) => ({ activity: g.activity, dates: [...g.dates].sort() }));
}

export function planRoutineDeletion(owned: Activity[], requests: DeleteRequest[]): DeletePlan | { error: string } {
  if (!Array.isArray(requests) || requests.length === 0) return { error: "Nenhuma atividade selecionada." };
  if (requests.length > 500) return { error: "Selecione no máximo 500 atividades por vez." };
  const byId = new Map(owned.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const plan: DeletePlan = { deleteIds: [], skips: [] };
  for (const r of requests) {
    if (!r || typeof r.activityId !== "string" || (r.scope !== "dias" && r.scope !== "toda") || !Array.isArray(r.dates)) return { error: "Seleção inválida." };
    if (seen.has(r.activityId)) return { error: "Seleção inválida (atividade repetida)." };
    seen.add(r.activityId);
    const activity = byId.get(r.activityId);
    if (!activity) return { error: "Atividade não encontrada. Atualize a página e tente de novo." };
    if (r.scope === "toda" || !isRecurringActivity(activity)) {
      plan.deleteIds.push(activity.id);
      continue;
    }
    const dates = [...new Set(r.dates)];
    if (dates.length === 0 || dates.some((d) => typeof d !== "string" || !DATE_RE.test(d))) return { error: "Selecione o dia a excluir." };
    if (activity.skipped_dates === undefined) return { error: SKIP_NEEDS_MIGRATION };
    plan.skips.push({ activityId: activity.id, skipped_dates: [...new Set([...(activity.skipped_dates ?? []), ...dates])].sort() });
  }
  return plan;
}
