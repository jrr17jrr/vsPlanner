import { requirePersonalSpace } from "@/lib/supabase/dal";
import { listTasks, listTaskOccurrences } from "@/lib/supabase/repositories/personal.repository";
import { addDaysToKey, buildMyDayTasks, MY_DAY_LOOKBACK_DAYS, type MyDayTasks } from "@/lib/tasks";
import { todayKeySaoPaulo } from "@/lib/format";

/**
 * Fonte ÚNICA das tarefas do Meu Dia — o Dashboard ("Precisa da sua
 * atenção" / card "Meu dia") e a página /hoje chamam esta mesma função,
 * então nunca divergem sobre o que é "tarefa de hoje". A regra em si está
 * em `lib/tasks.ts`; aqui só busca os dados certos (recorrentes arquivadas
 * incluídas, para o histórico do dia continuar aparecendo).
 */
export async function loadMyDayTasks(lookbackDays = MY_DAY_LOOKBACK_DAYS): Promise<MyDayTasks> {
  const { profile, space } = await requirePersonalSpace();
  const todayKey = todayKeySaoPaulo();
  const [tasks, occurrences] = await Promise.all([
    listTasks(space.id, { includeArchived: true }),
    listTaskOccurrences(profile.id, addDaysToKey(todayKey, -lookbackDays), todayKey),
  ]);
  return buildMyDayTasks(tasks, occurrences, todayKey, lookbackDays);
}
