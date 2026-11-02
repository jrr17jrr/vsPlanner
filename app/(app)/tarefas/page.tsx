import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listPersonalSubtasks, listTasks, listTaskOccurrences } from "@/lib/supabase/repositories/personal.repository";
import { TarefasPageClient } from "@/components/tarefas/tarefas-page-client";
import { addDaysToKey, TASKS_PAGE_LOOKBACK_DAYS } from "@/lib/tasks";
import { todayKeySaoPaulo } from "@/lib/format";

export default async function TarefasPage() {
  const { profile, space } = await requirePersonalSpace();
  const todayKey = todayKeySaoPaulo();
  const [tasks, occurrences] = await Promise.all([
    listTasks(space.id),
    listTaskOccurrences(profile.id, addDaysToKey(todayKey, -TASKS_PAGE_LOOKBACK_DAYS), todayKey),
  ]);
  // Uma consulta para todas as subtarefas: os cabeçalhos já mostram "N hoje / N atrasadas" sem abrir cada tarefa.
  const subtasks = await listPersonalSubtasks(tasks.map((t) => t.id));
  const subtasksByTask: Record<string, typeof subtasks> = {};
  for (const s of subtasks) (subtasksByTask[s.parent_id] ??= []).push(s);
  return <TarefasPageClient tasks={tasks} occurrences={occurrences} todayKey={todayKey} subtasksByTask={subtasksByTask} />;
}
