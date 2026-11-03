import { findOrBootstrapSpace, requirePersonalSpace } from "@/lib/supabase/dal";
import { getTodayMeetingsForHoje } from "@/lib/supabase/meetings-actions";
import { getTodayWorkItemsForHoje } from "@/lib/supabase/work-items-actions";
import { listActivities, listActivityCompletions, listPersonalWorkTasks } from "@/lib/supabase/repositories/personal.repository";
import { loadMyDayBoard } from "@/lib/supabase/my-day-board-data";
import { loadSection } from "@/lib/supabase/section-result";
import { HojePageClient } from "@/components/hoje/hoje-page-client";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { todayKeySaoPaulo } from "@/lib/format";

/**
 * Server Component — busca tudo de hoje com a MESMA sessão que renderizou a
 * página. Cada fonte carrega de forma independente via `loadSection`: se uma
 * falhar, o erro real aparece no lugar e o resto continua. As quatro seções
 * (Hoje, Atrasadas, Próximas, Concluídas) vêm de `buildMyDayBoard`.
 */
export default async function HojePage() {
  const { profile, space } = await requirePersonalSpace();
  const todayKey = todayKeySaoPaulo();
  const canClt = profile.system_role === "super_admin" || profile.clt_access !== false;

  const [meetings, workItems, rotina, legacyWork, visionario] = await Promise.all([
    loadSection("meu-dia:compromissos", () => getTodayMeetingsForHoje()),
    loadSection("meu-dia:trabalhos", () => getTodayWorkItemsForHoje({ includeDoneToday: true })),
    loadSection("meu-dia:rotina", () => Promise.all([listActivities(space.id), listActivityCompletions(profile.id, todayKey, todayKey)])),
    loadSection("meu-dia:clt", () => listPersonalWorkTasks(space.id)),
    findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile).catch(() => undefined),
  ]);

  const activities = rotina.ok ? rotina.data[0] : [];
  const board = await loadSection("meu-dia:tarefas", () =>
    loadMyDayBoard({
      userId: profile.id,
      spaceId: space.id,
      todayKey,
      activities,
      workItems: workItems.ok ? workItems.data.workItems : [],
      legacyWorkTasks: legacyWork.ok ? legacyWork.data : [],
      access: { clt: canClt, mkt: !!visionario },
    })
  );

  return (
    <HojePageClient
      todayKey={todayKey}
      data={board.ok ? board.data : null}
      meetings={meetings.ok ? meetings.data.meetings : []}
      meetingParticipantNames={meetings.ok ? meetings.data.participantNamesByMeeting : {}}
      activities={activities}
      completions={rotina.ok ? rotina.data[1] : []}
      errors={{
        tarefas: board.ok ? undefined : board.error,
        compromissos: meetings.ok ? undefined : meetings.error,
        trabalhos: workItems.ok ? undefined : workItems.error,
        rotina: rotina.ok ? undefined : rotina.error,
        clt: legacyWork.ok ? undefined : legacyWork.error,
      }}
    />
  );
}
