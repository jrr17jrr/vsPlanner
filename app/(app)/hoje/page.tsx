import { requirePersonalSpace } from "@/lib/supabase/dal";
import { getTodayMeetingsForHoje } from "@/lib/supabase/meetings-actions";
import { getTodayWorkItemsForHoje } from "@/lib/supabase/work-items-actions";
import { listActivities, listActivityCompletions, listTasks, listPersonalWorkTasks } from "@/lib/supabase/repositories/personal.repository";
import { HojePageClient } from "@/components/hoje/hoje-page-client";
import { todayKeySaoPaulo } from "@/lib/format";

/**
 * Server Component — busca TUDO de hoje com a MESMA sessão que renderizou
 * a página (nunca fetch client-side separado). Qualquer erro propaga pro
 * `error.tsx` da rota; nenhum `.catch()` esconde falha real. Reuniões e
 * Trabalhos (Visionário Dev) + Rotina/Tarefas/Trabalho-CLT (Pessoal) —
 * tudo real agora (migration 008).
 */
export default async function HojePage() {
  const { profile, space } = await requirePersonalSpace();
  const todayKey = todayKeySaoPaulo();

  const [meetingsResult, workItemsResult, activities, completions, tasks, workTasks] = await Promise.all([
    getTodayMeetingsForHoje(),
    getTodayWorkItemsForHoje(),
    listActivities(space.id),
    listActivityCompletions(profile.id, todayKey, todayKey),
    listTasks(space.id),
    listPersonalWorkTasks(space.id),
  ]);

  return (
    <HojePageClient
      todayKey={todayKey}
      meetings={meetingsResult.meetings}
      meetingParticipantNames={meetingsResult.participantNamesByMeeting}
      workItems={workItemsResult.workItems}
      workItemAssigneeNames={workItemsResult.assigneeNamesByWorkItem}
      activities={activities}
      completions={completions}
      tasks={tasks.filter((t) => t.due_date === todayKey)}
      workTasks={workTasks.filter((t) => t.due_date === todayKey)}
    />
  );
}
