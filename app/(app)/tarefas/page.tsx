import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listActivities, listActivityCompletions, listPersonalSubtasks, listTasks, listTaskOccurrences } from "@/lib/supabase/repositories/personal.repository";
import { TarefasPageClient } from "@/components/tarefas/tarefas-page-client";
import { addDaysToKey, mergeLinkedRoutineCompletions, TASKS_PAGE_LOOKBACK_DAYS } from "@/lib/tasks";
import { todayKeySaoPaulo } from "@/lib/format";

export default async function TarefasPage() {
  const { profile, space } = await requirePersonalSpace();
  const todayKey = todayKeySaoPaulo();
  const from = addDaysToKey(todayKey, -TASKS_PAGE_LOOKBACK_DAYS);
  const [tasks, rawOccurrences, activities, completions] = await Promise.all([
    listTasks(space.id),
    listTaskOccurrences(profile.id, from, todayKey),
    listActivities(space.id),
    listActivityCompletions(profile.id, from, todayKey),
  ]);
  // Execução feita pela Rotina vinculada (antes da correção só gravava a sessão) conta como concluída.
  const occurrences = mergeLinkedRoutineCompletions(tasks, rawOccurrences, activities.filter((a) => a.task_id), completions);
  // Uma consulta para todas as subtarefas: os cabeçalhos já mostram "N hoje / N atrasadas" sem abrir cada tarefa.
  const subtasks = await listPersonalSubtasks(tasks.map((t) => t.id), todayKey);
  const subtasksByTask: Record<string, typeof subtasks> = {};
  for (const s of subtasks) (subtasksByTask[s.parent_id] ??= []).push(s);
  return <TarefasPageClient tasks={tasks} occurrences={occurrences} todayKey={todayKey} subtasksByTask={subtasksByTask} />;
}
