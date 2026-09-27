import { requirePersonalSpace } from "@/lib/supabase/dal";
import { getTodayMeetingsForHoje } from "@/lib/supabase/meetings-actions";
import { getTodayWorkItemsForHoje } from "@/lib/supabase/work-items-actions";
import { listActivities, listActivityCompletions, listPersonalWorkTasks } from "@/lib/supabase/repositories/personal.repository";
import { loadMyDayTasks } from "@/lib/supabase/my-day";
import { HojePageClient } from "@/components/hoje/hoje-page-client";
import { todayKeySaoPaulo } from "@/lib/format";

/**
 * Server Component — busca TUDO de hoje com a MESMA sessão que renderizou
 * a página (nunca fetch client-side separado). Qualquer erro propaga pro
 * `error.tsx` da rota; nenhum `.catch()` esconde falha real. Tarefas vêm
 * de `loadMyDayTasks` — a mesma fonte do Dashboard.
 */
export default async function HojePage() {
  const { profile, space } = await requirePersonalSpace();
  const todayKey = todayKeySaoPaulo();

  const [myDay, meetingsResult, workItemsResult, activities, completions, workTasks] = await Promise.all([
    loadMyDayTasks(),
    getTodayMeetingsForHoje(),
    getTodayWorkItemsForHoje(),
    listActivities(space.id),
    listActivityCompletions(profile.id, todayKey, todayKey),
    listPersonalWorkTasks(space.id),
  ]);

  return (
    <HojePageClient
      todayKey={todayKey}
      myDay={myDay}
      meetings={meetingsResult.meetings}
      meetingParticipantNames={meetingsResult.participantNamesByMeeting}
      workItems={workItemsResult.workItems}
      workItemAssigneeNames={workItemsResult.assigneeNamesByWorkItem}
      activities={activities}
      completions={completions}
      workTasks={workTasks.filter((t) => t.due_date === todayKey)}
    />
  );
}
