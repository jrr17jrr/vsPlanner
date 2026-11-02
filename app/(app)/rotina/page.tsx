import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listActivities, listActivityCompletions, listPersonalSubtasks, listTasks } from "@/lib/supabase/repositories/personal.repository";
import { RotinaPageClient } from "@/components/rotina/rotina-page-client";
import { toDateKey, todayKeySaoPaulo } from "@/lib/format";

/**
 * Busca conclusões num intervalo largo (-90/+90 dias) de uma vez, pra
 * navegação de semana no client não precisar de round-trip a cada clique
 * — evita N+1 sem perder a interatividade instantânea que a tela já tinha.
 *
 * Atividades vinculadas a tarefas (activities.task_id) usam a tarefa e as
 * subtarefas ORIGINAIS — carregadas aqui de uma vez, nunca copiadas.
 */
export default async function RotinaPage() {
  const { profile, space } = await requirePersonalSpace();

  const from = new Date();
  from.setDate(from.getDate() - 90);
  const to = new Date();
  to.setDate(to.getDate() + 90);

  const [activities, completions, tasks] = await Promise.all([
    listActivities(space.id),
    listActivityCompletions(profile.id, toDateKey(from), toDateKey(to)),
    listTasks(space.id),
  ]);
  const linkedIds = [...new Set(activities.map((a) => a.task_id).filter((id): id is string => !!id))];
  const subtasks = await listPersonalSubtasks(linkedIds);

  return <RotinaPageClient activities={activities} completions={completions} tasks={tasks} subtasks={subtasks} todayKey={todayKeySaoPaulo()} />;
}
