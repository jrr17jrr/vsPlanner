import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { ParticipantAvatars } from "@/components/visionario/reunioes/participant-avatars";
import { WhatsAppButton } from "@/components/visionario/reunioes/whatsapp-button";
import { MeetingLinkButton } from "@/components/visionario/reunioes/meeting-link-button";
import { formatDate } from "@/lib/format";
import type { Meeting } from "@/types/database.types";

export function MeetingCard({
  meeting,
  participantNames,
}: {
  meeting: Meeting;
  participantNames: string[];
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {formatDate(meeting.meeting_date)} · {meeting.start_time.slice(0, 5)}
            {meeting.end_time && ` – ${meeting.end_time.slice(0, 5)}`}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{meeting.title}</p>
          {(meeting.client_name || meeting.contact_name) && (
            <p className="truncate text-xs text-muted-foreground">
              {[meeting.client_name, meeting.contact_name].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <StatusBadge status={meeting.status} className="shrink-0" />
      </div>

      <ParticipantAvatars names={participantNames} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <WhatsAppButton phone={meeting.contact_phone} />
        <MeetingLinkButton link={meeting.meeting_link} />
        <Button size="sm" variant="ghost" asChild className="ml-auto">
          <Link href={`/visionario/reunioes/${meeting.id}`}>Abrir</Link>
        </Button>
      </div>
    </Card>
  );
}
