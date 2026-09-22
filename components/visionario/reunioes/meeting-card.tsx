"use client";

import Link from "next/link";
import { MoreVertical, CheckCircle2, CalendarClock, Pencil, Ban, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { ParticipantAvatars } from "@/components/visionario/reunioes/participant-avatars";
import { WhatsAppButton } from "@/components/visionario/reunioes/whatsapp-button";
import { MeetingLinkButton } from "@/components/visionario/reunioes/meeting-link-button";
import { formatDate } from "@/lib/format";
import { isOpenMeeting } from "@/lib/meeting-status";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/types/database.types";

export type MeetingCardAction = "conclude" | "reschedule" | "edit" | "cancel";

export function MeetingCard({
  meeting,
  participantNames,
  overdue = false,
  permissions,
  onAction,
}: {
  meeting: Meeting;
  participantNames: string[];
  /** Ainda agendada, mas a data já passou — precisa ser concluída ou remarcada. */
  overdue?: boolean;
  permissions?: { canEdit: boolean; canConclude: boolean };
  onAction?: (action: MeetingCardAction, meeting: Meeting) => void;
}) {
  const open = isOpenMeeting(meeting);
  const canConclude = !!permissions?.canConclude && open;
  const canReschedule = !!permissions?.canEdit && open;
  const canCancel = !!permissions?.canEdit && open;
  const canEdit = !!permissions?.canEdit;
  const hasActions = !!onAction && (canConclude || canReschedule || canCancel || canEdit);
  const closed = meeting.status === "realizada" || meeting.status === "cancelada";

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 border-l-4 p-4",
        meeting.status === "realizada" && "border-l-success",
        meeting.status === "cancelada" && "border-l-destructive",
        open && (overdue ? "border-l-warning" : "border-l-primary")
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {formatDate(meeting.meeting_date)} · {meeting.start_time.slice(0, 5)}
            {meeting.end_time && ` – ${meeting.end_time.slice(0, 5)}`}
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-sm font-semibold text-foreground",
              meeting.status === "cancelada" && "text-muted-foreground line-through"
            )}
          >
            {meeting.title}
          </p>
          {(meeting.client_name || meeting.contact_name) && (
            <p className="truncate text-xs text-muted-foreground">
              {[meeting.client_name, meeting.contact_name].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={meeting.status} />
          {overdue && (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Atrasada
            </Badge>
          )}
        </div>
      </div>

      <ParticipantAvatars names={participantNames} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {!closed && <WhatsAppButton phone={meeting.contact_phone} />}
        {!closed && <MeetingLinkButton link={meeting.meeting_link} />}
        <div className="ml-auto flex items-center gap-1">
          {canConclude && (
            <Button size="sm" variant="outline" onClick={() => onAction?.("conclude", meeting)}>
              <CheckCircle2 className="h-4 w-4" /> Concluir
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/visionario/reunioes/${meeting.id}`}>Abrir</Link>
          </Button>
          {hasActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canConclude && (
                  <DropdownMenuItem onClick={() => onAction?.("conclude", meeting)}>
                    <CheckCircle2 className="h-4 w-4" /> Concluir reunião
                  </DropdownMenuItem>
                )}
                {canReschedule && (
                  <DropdownMenuItem onClick={() => onAction?.("reschedule", meeting)}>
                    <CalendarClock className="h-4 w-4" /> Adiar / remarcar
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={() => onAction?.("edit", meeting)}>
                    <Pencil className="h-4 w-4" /> Editar reunião
                  </DropdownMenuItem>
                )}
                {canCancel && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onAction?.("cancel", meeting)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban className="h-4 w-4" /> Cancelar reunião
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </Card>
  );
}
