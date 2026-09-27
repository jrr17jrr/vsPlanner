import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listTasks, listTaskOccurrences } from "@/lib/supabase/repositories/personal.repository";
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
  return <TarefasPageClient tasks={tasks} occurrences={occurrences} todayKey={todayKey} />;
}
