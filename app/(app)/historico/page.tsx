import { requirePersonalSpace, findOrBootstrapSpace } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  listActivities,
  listActivityCompletions,
  listTasks,
  listPersonalWorkTasks,
  listGoals,
} from "@/lib/supabase/repositories/personal.repository";
import { listFinancialCharges, listFinancialPayments } from "@/lib/supabase/repositories/financial.repository";
import { listMeetings } from "@/lib/supabase/repositories/meetings.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { toDateKey } from "@/lib/format";
import { HistoricoPageClient } from "@/components/historico/historico-page-client";

/**
 * Histórico não tem tabela própria — é sempre derivado das tabelas reais
 * (rotina/conclusões, financeiro pessoal, tarefas/trabalho/metas
 * concluídas, reuniões realizadas). Busca uma janela limitada (6
 * semanas/6 meses) em vez de tudo, igual às outras telas.
 */
export default async function HistoricoPage() {
  const { profile, space } = await requirePersonalSpace();

  const from = new Date();
  from.setDate(from.getDate() - 42);

  const [activities, completions, charges, payments, tasks, workTasks, goals] = await Promise.all([
    listActivities(space.id),
    listActivityCompletions(profile.id, toDateKey(from), toDateKey(new Date())),
    listFinancialCharges(space.id),
    listFinancialPayments(space.id),
    listTasks(space.id),
    listPersonalWorkTasks(space.id),
    listGoals(space.id),
  ]);

  const visionarioSpace = await findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile);
  const meetings =
    visionarioSpace && (await hasModulePermission(visionarioSpace.id, "reunioes", "view"))
      ? (await listMeetings(visionarioSpace.id)).filter((m) => m.status === "realizada")
      : [];

  return (
    <HistoricoPageClient
      activities={activities}
      completions={completions}
      charges={charges}
      payments={payments}
      tasks={tasks.filter((t) => t.status === "concluida")}
      workTasks={workTasks.filter((t) => t.status === "concluida")}
      goals={goals.filter((g) => g.status === "concluida")}
      meetings={meetings}
    />
  );
}
