"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, CalendarClock, CalendarDays, CalendarCheck2, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { MeetingFormDialog } from "@/components/visionario/reunioes/meeting-form-dialog";
import { MeetingCard, type MeetingCardAction } from "@/components/visionario/reunioes/meeting-card";
import { ConcludeMeetingDialog } from "@/components/visionario/reunioes/conclude-meeting-dialog";
import { RescheduleMeetingDialog } from "@/components/visionario/reunioes/reschedule-meeting-dialog";
import { cancelMeetingAction } from "@/lib/supabase/meetings-actions";
import { toDateKey, formatDateShort, todayKeySaoPaulo } from "@/lib/format";
import { startOfWeekMonday, addDays } from "@/lib/dates";
import { isOpenMeeting, isOverdueMeeting } from "@/lib/meeting-status";
import type { Client, Meeting, MeetingParticipant, SpaceMemberProfile } from "@/types/database.types";

type FilterKey = "proximas" | "hoje" | "realizadas" | "canceladas" | "todas";

const FILTER_EMPTY_LABEL: Record<FilterKey, string> = {
  proximas: "Nenhuma reunião agendada.",
  hoje: "Nenhuma reunião agendada para hoje.",
  realizadas: "Nenhuma reunião realizada ainda.",
  canceladas: "Nenhuma reunião cancelada.",
  todas: "Nenhuma reunião cadastrada.",
};

const sortAsc = (a: Meeting, b: Meeting) =>
  (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time);
const sortDesc = (a: Meeting, b: Meeting) =>
  (b.meeting_date + b.start_time).localeCompare(a.meeting_date + a.start_time);

export function ReunioesPageClient({
  meetings,
  participants,
  members,
  clients,
  currentUserId,
  permissions,
}: {
  meetings: Meeting[];
  participants: MeetingParticipant[];
  members: SpaceMemberProfile[];
  clients: Client[];
  currentUserId: string;
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean; canConclude: boolean };
}) {
  const [filter, setFilter] = useState<FilterKey>("proximas");
  const [formOpen, setFormOpen] = useState(false);
  // Uma instância de cada diálogo para a página toda, apontando pra
  // reunião escolhida no card (em vez de um diálogo montado por card).
  const [active, setActive] = useState<{ action: MeetingCardAction; meeting: Meeting } | null>(null);
  const [cancelPending, startCancelTransition] = useTransition();

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const participantIdsByMeeting = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of participants) {
      const list = map.get(p.meeting_id) ?? [];
      list.push(p.user_id);
      map.set(p.meeting_id, list);
    }
    return map;
  }, [participants]);

  // Mesmo "hoje" (fuso de São Paulo) usado no servidor por `/hoje` — evita
  // divergência entre SSR e navegador e entre as duas telas.
  const todayKey = todayKeySaoPaulo();
  const weekStart = startOfWeekMonday(new Date(`${todayKey}T12:00:00`));
  const weekStartKey = toDateKey(weekStart);
  const weekEndKey = toDateKey(addDays(weekStart, 6));

  // Só reuniões abertas (agendada/em andamento) alimentam Próximas, Hoje e
  // os cards de cima: concluir, cancelar ou remarcar muda status/data no
  // Supabase, a Server Action revalida a rota e estes cálculos refazem sozinhos.
  const openMeetings = useMemo(() => meetings.filter(isOpenMeeting).sort(sortAsc), [meetings]);

  const todayMeetings = useMemo(
    () => openMeetings.filter((m) => m.meeting_date === todayKey),
    [openMeetings, todayKey]
  );

  const weekMeetings = useMemo(
    () => openMeetings.filter((m) => m.meeting_date >= weekStartKey && m.meeting_date <= weekEndKey),
    [openMeetings, weekStartKey, weekEndKey]
  );

  const nextMeeting = useMemo(
    () => openMeetings.find((m) => m.status === "agendada" && m.meeting_date >= todayKey),
    [openMeetings, todayKey]
  );

  const overdueCount = useMemo(
    () => openMeetings.filter((m) => isOverdueMeeting(m, todayKey)).length,
    [openMeetings, todayKey]
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "proximas":
        // Inclui as atrasadas (ainda agendadas com data passada) no topo,
        // marcadas no card — senão sumiriam de tudo menos de "Todas".
        return openMeetings;
      case "hoje":
        return todayMeetings;
      case "realizadas":
        return meetings.filter((m) => m.status === "realizada").sort(sortDesc);
      case "canceladas":
        return meetings.filter((m) => m.status === "cancelada").sort(sortDesc);
      default:
        return [...meetings].sort(sortDesc);
    }
  }, [filter, meetings, openMeetings, todayMeetings]);

  function closeActive(open: boolean) {
    if (!open) setActive(null);
  }

  function confirmCancel() {
    if (!active) return;
    const meetingId = active.meeting.id;
    startCancelTransition(async () => {
      const result = await cancelMeetingAction(meetingId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? "Reunião cancelada.");
      setActive(null);
    });
  }

  const overdueLabel = overdueCount === 1 ? "1 atrasada" : `${overdueCount} atrasadas`;

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
        <MetricCard
          label={overdueCount > 0 ? `Agendadas · ${overdueLabel}` : "Agendadas"}
          value={openMeetings.length}
          icon={ListTodo}
          tone={overdueCount > 0 ? "warning" : "default"}
        />
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
              participantNames={(participantIdsByMeeting.get(meeting.id) ?? [])
                .map((id) => nameById.get(id))
                .filter((n): n is string => !!n)}
              overdue={isOverdueMeeting(meeting, todayKey)}
              permissions={permissions}
              onAction={(action, m) => setActive({ action, meeting: m })}
            />
          ))}
        </div>
      )}

      {permissions.canCreate && (
        <MeetingFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          members={members}
          clients={clients}
          currentUserId={currentUserId}
        />
      )}

      {permissions.canEdit && active && (
        <MeetingFormDialog
          open={active.action === "edit"}
          onOpenChange={closeActive}
          meeting={active.meeting}
          currentParticipantIds={participantIdsByMeeting.get(active.meeting.id) ?? []}
          members={members}
          clients={clients}
          currentUserId={currentUserId}
        />
      )}

      {permissions.canConclude && active && (
        <ConcludeMeetingDialog
          key={active.meeting.id}
          open={active.action === "conclude"}
          onOpenChange={closeActive}
          meeting={active.meeting}
        />
      )}

      {permissions.canEdit && active && (
        <RescheduleMeetingDialog
          open={active.action === "reschedule"}
          onOpenChange={closeActive}
          meeting={active.meeting}
        />
      )}

      <AlertDialog
        open={active?.action === "cancel"}
        onOpenChange={(open) => {
          if (!cancelPending) closeActive(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              {active ? `"${active.meeting.title}" ` : ""}passa para a aba Canceladas. A reunião continua no
              histórico — não é apagada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelPending}>Voltar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelPending}>
              {cancelPending ? "Aguarde…" : "Cancelar reunião"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
