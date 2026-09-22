import type { Meeting } from "@/types/database.types";

/**
 * Regras de status de reunião compartilhadas pela listagem, pelos cards e
 * pelo detalhe — um lugar só pra "aberta", "atrasada" etc. não divergirem
 * entre telas. Espelham o filtro por status das Server Actions
 * (`lib/supabase/meetings-actions.ts`).
 */

/** Ainda pode ser concluída, remarcada ou cancelada. */
export function isOpenMeeting(meeting: Pick<Meeting, "status">): boolean {
  return meeting.status === "agendada" || meeting.status === "em_andamento";
}

/** Aberta, mas com data anterior a hoje — ficou pendente de conclusão/remarcação. */
export function isOverdueMeeting(meeting: Pick<Meeting, "status" | "meeting_date">, todayKey: string): boolean {
  return isOpenMeeting(meeting) && meeting.meeting_date < todayKey;
}
