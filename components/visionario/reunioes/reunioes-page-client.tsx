"use client";

import { useMemo, useState } from "react";
import { Plus, CalendarClock, CalendarDays, CalendarCheck2, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { MeetingFormDialog } from "@/components/visionario/reunioes/meeting-form-dialog";
import { MeetingCard } from "@/components/visionario/reunioes/meeting-card";
import { toDateKey, formatDateShort } from "@/lib/format";
import { startOfWeekMonday, addDays } from "@/lib/dates";
import type { Meeting, MeetingParticipant, SpaceMemberProfile } from "@/types/database.types";

type FilterKey = "proximas" | "hoje" | "realizadas" | "canceladas" | "todas";

const FILTER_EMPTY_LABEL: Record<FilterKey, string> = {
  proximas: "Nenhuma reunião agendada.",
  hoje: "Nenhuma reunião hoje.",
  realizadas: "Nenhuma reunião realizada ainda.",
  canceladas: "Nenhuma reunião cancelada.",
  todas: "Nenhuma reunião cadastrada.",
};

export function ReunioesPageClient({
  meetings,
  participants,
  members,
  currentUserId,
  permissions,
}: {
  meetings: Meeting[];
  participants: MeetingParticipant[];
  members: SpaceMemberProfile[];
  currentUserId: string;
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean; canConclude: boolean };
}) {
  const [filter, setFilter] = useState<FilterKey>("proximas");
  const [formOpen, setFormOpen] = useState(false);

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const participantsByMeeting = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of participants) {
      const name = nameById.get(p.user_id);
      if (!name) continue;
      const list = map.get(p.meeting_id) ?? [];
      list.push(name);
      map.set(p.meeting_id, list);
    }
    return map;
  }, [participants, nameById]);

  const todayKey = toDateKey(new Date());
  const weekStartKey = toDateKey(startOfWeekMonday(new Date()));
  const weekEndKey = toDateKey(addDays(startOfWeekMonday(new Date()), 6));

  const sortAsc = (a: Meeting, b: Meeting) =>
    (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time);
  const sortDesc = (a: Meeting, b: Meeting) =>
    (b.meeting_date + b.start_time).localeCompare(a.meeting_date + a.start_time);

  const upcoming = useMemo(
    () =>
      meetings
        .filter((m) => (m.status === "agendada" || m.status === "em_andamento") && m.meeting_date >= todayKey)
        .sort(sortAsc),
    [meetings, todayKey]
  );

  const todayMeetings = useMemo(
    () => meetings.filter((m) => m.meeting_date === todayKey).sort(sortAsc),
    [meetings, todayKey]
  );

  const weekMeetings = useMemo(
    () => meetings.filter((m) => m.meeting_date >= weekStartKey && m.meeting_date <= weekEndKey),
    [meetings, weekStartKey, weekEndKey]
  );

  const nextMeeting = upcoming[0];

  const filtered = useMemo(() => {
    switch (filter) {
      case "proximas":
        return upcoming;
      case "hoje":
        return todayMeetings;
      case "realizadas":
        return meetings.filter((m) => m.status === "realizada").sort(sortDesc);
      case "canceladas":
        return meetings.filter((m) => m.status === "cancelada").sort(sortDesc);
      default:
        return [...meetings].sort(sortDesc);
    }
  }, [filter, meetings, upcoming, todayMeetings]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reuniões"
        description="Reuniões do Visionário Dev — a mesma agenda para todo mundo autorizado."
        actions={
          permissions.canCreate ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Nova reunião
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Próxima reunião"
          value={nextMeeting ? `${formatDateShort(nextMeeting.meeting_date)} · ${nextMeeting.start_time.slice(0, 5)}` : "Nenhuma"}
          icon={CalendarClock}
        />
        <MetricCard label="Hoje" value={todayMeetings.length} icon={CalendarDays} />
        <MetricCard label="Esta semana" value={weekMeetings.length} icon={CalendarCheck2} />
        <MetricCard label="Agendadas" value={upcoming.length} icon={ListTodo} />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="proximas">Próximas</TabsTrigger>
          <TabsTrigger value="hoje">Hoje</TabsTrigger>
          <TabsTrigger value="realizadas">Realizadas</TabsTrigger>
          <TabsTrigger value="canceladas">Canceladas</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={FILTER_EMPTY_LABEL[filter]}
          description={permissions.canCreate ? "Marque uma nova reunião para começar." : undefined}
          action={
            permissions.canCreate ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Nova reunião
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              participantNames={participantsByMeeting.get(meeting.id) ?? []}
            />
          ))}
        </div>
      )}

      {permissions.canCreate && (
        <MeetingFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          members={members}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
