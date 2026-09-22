"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, CheckCircle2, Ban, Trash2, MapPin, Users, User, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { WhatsAppButton } from "@/components/visionario/reunioes/whatsapp-button";
import { MeetingLinkButton } from "@/components/visionario/reunioes/meeting-link-button";
import { MeetingFormDialog } from "@/components/visionario/reunioes/meeting-form-dialog";
import { ConcludeMeetingDialog } from "@/components/visionario/reunioes/conclude-meeting-dialog";
import { RescheduleMeetingDialog } from "@/components/visionario/reunioes/reschedule-meeting-dialog";
import { GeneratedWorkItemsCard } from "@/components/visionario/reunioes/generated-work-items-card";
import { cancelMeetingAction, deleteMeetingAction } from "@/lib/supabase/meetings-actions";
import { formatDateLong, todayKeySaoPaulo } from "@/lib/format";
import { isOpenMeeting, isOverdueMeeting } from "@/lib/meeting-status";
import type { Client, Meeting, SpaceMemberProfile, WorkItem } from "@/types/database.types";

export function MeetingDetailClient({
  meeting,
  participantUserIds,
  members,
  clients,
  linkedClient,
  generatedWorkItems,
  assigneeNamesByWorkItem,
  canCreateWorkItem,
  currentUserId,
  permissions,
}: {
  meeting: Meeting;
  participantUserIds: string[];
  members: SpaceMemberProfile[];
  clients: Client[];
  linkedClient: Client | null;
  generatedWorkItems: WorkItem[];
  assigneeNamesByWorkItem: Record<string, string[]>;
  canCreateWorkItem: boolean;
  currentUserId: string;
  permissions: { canEdit: boolean; canDelete: boolean; canConclude: boolean };
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const responsibleName = nameById.get(meeting.responsible_id) ?? "—";
  const otherParticipantNames = participantUserIds
    .filter((id) => id !== meeting.responsible_id)
    .map((id) => nameById.get(id))
    .filter((n): n is string => !!n);

  const open = isOpenMeeting(meeting);
  const overdue = isOverdueMeeting(meeting, todayKeySaoPaulo());
  const hasClientInfo = linkedClient || meeting.client_name || meeting.contact_name || meeting.contact_phone;
  const hasAgendaInfo = meeting.agenda || meeting.description;

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => router.push("/visionario/reunioes")}
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <PageHeader
        title={meeting.title}
        description={`${formatDateLong(meeting.meeting_date)} às ${meeting.start_time.slice(0, 5)}`}
        actions={<StatusBadge status={meeting.status} />}
      />

      {overdue && (
        <Card className="border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          A data desta reunião já passou e ela ainda está agendada. Conclua, remarque ou cancele para manter a
          agenda em dia.
        </Card>
      )}
      {meeting.status === "cancelada" && (
        <Card className="border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          Esta reunião foi cancelada. Ela continua no histórico, mas não conta mais na agenda.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reunião</p>
          {hasClientInfo ? (
            <div className="flex flex-col gap-2 text-sm">
              {linkedClient ? (
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <Link
                    href={`/visionario/clientes/${linkedClient.id}`}
                    className="text-primary hover:underline"
                  >
                    {linkedClient.name}
                  </Link>
                </div>
              ) : (
                meeting.client_name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="text-foreground">{meeting.client_name}</p>
                  </div>
                )
              )}
              {meeting.contact_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Contato</p>
                  <p className="text-foreground">{meeting.contact_name}</p>
                </div>
              )}
              {meeting.contact_phone && (
                <div>
                  <p className="text-xs text-muted-foreground">WhatsApp</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-foreground">{meeting.contact_phone}</p>
                    <WhatsAppButton phone={meeting.contact_phone} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem cliente ou contato vinculado.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data e horário
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Data</p>
              <p className="text-foreground">{formatDateLong(meeting.meeting_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Início</p>
              <p className="text-foreground">{meeting.start_time.slice(0, 5)}</p>
            </div>
            {meeting.end_time && (
              <div>
                <p className="text-xs text-muted-foreground">Fim</p>
                <p className="text-foreground">{meeting.end_time.slice(0, 5)}</p>
              </div>
            )}
            {meeting.location && (
              <div className="col-span-2 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="truncate text-foreground">{meeting.location}</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Participantes
          </p>
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-foreground">{responsibleName}</span>
            <span className="text-xs text-muted-foreground">(responsável)</span>
          </div>
          {otherParticipantNames.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-wrap gap-1.5">
                {otherParticipantNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link</p>
          {meeting.meeting_link ? (
            <div className="flex flex-col gap-2">
              <p className="truncate text-xs text-muted-foreground">{meeting.meeting_link}</p>
              <MeetingLinkButton link={meeting.meeting_link} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum link cadastrado.</p>
          )}
        </Card>
      </div>

      {hasAgendaInfo && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pauta</p>
          {meeting.agenda && (
            <p className="whitespace-pre-wrap text-sm text-foreground">{meeting.agenda}</p>
          )}
          {meeting.description && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{meeting.description}</p>
          )}
        </Card>
      )}

      {meeting.notes && (
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Observações
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{meeting.notes}</p>
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pós-reunião
        </p>
        {meeting.status === "realizada" ? (
          <div className="flex flex-col gap-3 text-sm">
            {meeting.summary && (
              <div>
                <p className="text-xs text-muted-foreground">Resumo</p>
                <p className="whitespace-pre-wrap text-foreground">{meeting.summary}</p>
              </div>
            )}
            {meeting.decisions && (
              <div>
                <p className="text-xs text-muted-foreground">Decisões tomadas</p>
                <p className="whitespace-pre-wrap text-foreground">{meeting.decisions}</p>
              </div>
            )}
            {meeting.final_notes && (
              <div>
                <p className="text-xs text-muted-foreground">Observações finais</p>
                <p className="whitespace-pre-wrap text-foreground">{meeting.final_notes}</p>
              </div>
            )}
            {!meeting.summary && !meeting.decisions && !meeting.final_notes && (
              <p className="text-sm text-muted-foreground">Reunião concluída sem resumo registrado.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não concluída.</p>
        )}
      </Card>

      <GeneratedWorkItemsCard
        meetingId={meeting.id}
        workItems={generatedWorkItems}
        members={members}
        assigneeNamesByWorkItem={assigneeNamesByWorkItem}
        canCreate={canCreateWorkItem}
      />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {permissions.canEdit && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        )}
        {permissions.canConclude && open && (
          <Button size="sm" onClick={() => setConcludeOpen(true)}>
            <CheckCircle2 className="h-4 w-4" /> Concluir reunião
          </Button>
        )}
        {permissions.canEdit && open && (
          <Button variant="outline" size="sm" onClick={() => setRescheduleOpen(true)}>
            <CalendarClock className="h-4 w-4" /> Adiar / remarcar
          </Button>
        )}
        {permissions.canEdit && open && (
          <ConfirmActionButton
            label={
              <>
                <Ban className="h-4 w-4" /> Cancelar
              </>
            }
            title="Cancelar esta reunião?"
            description="O status muda para cancelada. A reunião continua no histórico — não é apagada."
            confirmLabel="Cancelar reunião"
            onConfirm={() => cancelMeetingAction(meeting.id)}
          />
        )}
        {permissions.canDelete && (
          <ConfirmActionButton
            label={
              <>
                <Trash2 className="h-4 w-4" /> Excluir
              </>
            }
            title="Excluir esta reunião?"
            description="Isso remove a reunião e a lista de participantes permanentemente. Não pode ser desfeito."
            confirmLabel="Excluir"
            onConfirm={async () => {
              const result = await deleteMeetingAction(meeting.id);
              if (!result.error) router.push("/visionario/reunioes");
              return result;
            }}
          />
        )}
      </div>

      {permissions.canEdit && (
        <MeetingFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          meeting={meeting}
          currentParticipantIds={participantUserIds}
          members={members}
          clients={clients}
          currentUserId={currentUserId}
        />
      )}
      {permissions.canConclude && (
        <ConcludeMeetingDialog open={concludeOpen} onOpenChange={setConcludeOpen} meeting={meeting} />
      )}
      {permissions.canEdit && (
        <RescheduleMeetingDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen} meeting={meeting} />
      )}
    </div>
  );
}
