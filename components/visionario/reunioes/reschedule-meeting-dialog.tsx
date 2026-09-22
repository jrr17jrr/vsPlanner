"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rescheduleMeetingAction } from "@/lib/supabase/meetings-actions";
import { formatDate } from "@/lib/format";
import type { Meeting } from "@/types/database.types";

export function RescheduleMeetingDialog({
  open,
  onOpenChange,
  meeting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <RescheduleForm key={meeting.id} meeting={meeting} onOpenChange={onOpenChange} />}
    </Dialog>
  );
}

function RescheduleForm({
  meeting,
  onOpenChange,
}: {
  meeting: Meeting;
  onOpenChange: (open: boolean) => void;
}) {
  const [meetingDate, setMeetingDate] = useState(meeting.meeting_date);
  const [startTime, setStartTime] = useState(meeting.start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(meeting.end_time?.slice(0, 5) ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await rescheduleMeetingAction(meeting.id, {
        meetingDate,
        startTime,
        endTime: endTime || undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? "Reunião remarcada.");
      onOpenChange(false);
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Adiar / remarcar</DialogTitle>
        <DialogDescription>
          Atualmente marcada para {formatDate(meeting.meeting_date)} às {meeting.start_time.slice(0, 5)}. A reunião
          continua agendada com a nova data e horário.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reschedule-date">Nova data *</Label>
          <Input
            id="reschedule-date"
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            disabled={pending}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reschedule-start">Início *</Label>
            <Input
              id="reschedule-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={pending}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reschedule-end">Fim</Label>
            <Input
              id="reschedule-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Voltar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar nova data"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
