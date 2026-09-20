"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/types/database.types";

/**
 * Linha de reunião na linha do tempo do "Hoje" — mesmo visual de
 * `RoutineItem`/`ChecklistItem`, mas abre os detalhes em vez de marcar
 * feito (reunião não é algo que se "risca", se conclui pela tela dela).
 */
export function TodayMeetingItem({
  meeting,
  participantNames,
}: {
  meeting: Meeting;
  participantNames: string[];
}) {
  return (
    <Link
      href={`/visionario/reunioes/${meeting.id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/50",
        meeting.status === "realizada" && "opacity-60"
      )}
    >
      <div className="w-14 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {meeting.start_time.slice(0, 5)}
        {meeting.end_time && <span className="block text-[10px]">{meeting.end_time.slice(0, 5)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{meeting.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge className="border-0 bg-violet-500/15 text-violet-400">Reunião</Badge>
          {(meeting.client_name || meeting.contact_name) && (
            <span className="text-[11px] text-muted-foreground">
              {meeting.client_name || meeting.contact_name}
            </span>
          )}
          {participantNames.length > 1 && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" /> {participantNames.length}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
