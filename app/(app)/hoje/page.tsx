import { requirePersonalSpace } from "@/lib/supabase/dal";
import { getTodayMeetingsForHoje } from "@/lib/supabase/meetings-actions";
import { getTodayWorkItemsForHoje } from "@/lib/supabase/work-items-actions";
import { listActivities, listActivityCompletions, listPersonalWorkTasks } from "@/lib/supabase/repositories/personal.repository";
import { loadMyDayTasks } from "@/lib/supabase/my-day";
import { loadSection } from "@/lib/supabase/section-result";
import { HojePageClient } from "@/components/hoje/hoje-page-client";
import { todayKeySaoPaulo } from "@/lib/format";

/**
 * Server Component — busca TUDO de hoje com a MESMA sessão que renderizou
 * a página (nunca fetch client-side separado). Cada seção (Tarefas,
 * Rotina, Compromissos, Trabalhos, CLT) carrega de forma independente via
 * `loadSection`: se uma query falhar, o erro REAL (code/message/details/
 * hint) é logado no terminal e mostrado na própria seção, e as demais
 * continuam aparecendo. Falha de sessão/space ainda vai pro `error.tsx`.
 * Tarefas vêm de `loadMyDayTasks` — a mesma fonte do Dashboard.
 */
export default async function HojePage() {
  const { profile, space } = await requirePersonalSpace();
  const todayKey = todayKeySaoPaulo();

  const [myDay, meetings, workItems, rotina, workTasks] = await Promise.all([
    loadSection("meu-dia:tarefas", () => loadMyDayTasks()),
    loadSection("meu-dia:compromissos", () => getTodayMeetingsForHoje()),
    loadSection("meu-dia:trabalhos", () => getTodayWorkItemsForHoje()),
    loadSection("meu-dia:rotina", () =>
      Promise.all([listActivities(space.id), listActivityCompletions(profile.id, todayKey, todayKey)])
    ),
    loadSection("meu-dia:clt", () => listPersonalWorkTasks(space.id)),
  ]);

  return (
    <HojePageClient
      todayKey={todayKey}
      myDay={myDay.ok ? myDay.data : null}
      meetings={meetings.ok ? meetings.data.meetings : []}
      meetingParticipantNames={meetings.ok ? meetings.data.participantNamesByMeeting : {}}
      workItems={workItems.ok ? workItems.data.workItems : []}
      workItemAssigneeNames={workItems.ok ? workItems.data.assigneeNamesByWorkItem : {}}
      activities={rotina.ok ? rotina.data[0] : []}
      completions={rotina.ok ? rotina.data[1] : []}
      workTasks={workTasks.ok ? workTasks.data.filter((t) => t.due_date === todayKey) : []}
      errors={{
        tarefas: myDay.ok ? undefined : myDay.error,
        compromissos: meetings.ok ? undefined : meetings.error,
        trabalhos: workItems.ok ? undefined : workItems.error,
        rotina: rotina.ok ? undefined : rotina.error,
        clt: workTasks.ok ? undefined : workTasks.error,
      }}
    />
  );
}
