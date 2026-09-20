"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toDateKey } from "@/lib/format";
import { createMeetingAction, updateMeetingAction, type MeetingFormInput } from "@/lib/supabase/meetings-actions";
import type { Meeting, SpaceMemberProfile } from "@/types/database.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: Meeting;
  currentParticipantIds?: string[];
  members: SpaceMemberProfile[];
  currentUserId: string;
  onSaved?: (meetingId: string) => void;
}

export function MeetingFormDialog({
  open,
  onOpenChange,
  meeting,
  currentParticipantIds,
  members,
  currentUserId,
  onSaved,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <MeetingForm
          key={meeting?.id ?? "new"}
          onOpenChange={onOpenChange}
          meeting={meeting}
          currentParticipantIds={currentParticipantIds ?? []}
          members={members}
          currentUserId={currentUserId}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function MeetingForm({
  onOpenChange,
  meeting,
  currentParticipantIds,
  members,
  currentUserId,
  onSaved,
}: Omit<Props, "open" | "currentParticipantIds"> & { currentParticipantIds: string[] }) {
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [clientName, setClientName] = useState(meeting?.client_name ?? "");
  const [contactName, setContactName] = useState(meeting?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(meeting?.contact_phone ?? "");
  const [meetingDate, setMeetingDate] = useState(meeting?.meeting_date ?? toDateKey(new Date()));
  const [startTime, setStartTime] = useState(meeting?.start_time?.slice(0, 5) ?? "09:00");
  const [endTime, setEndTime] = useState(meeting?.end_time?.slice(0, 5) ?? "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [meetingLink, setMeetingLink] = useState(meeting?.meeting_link ?? "");
  const [responsibleId, setResponsibleId] = useState(meeting?.responsible_id ?? currentUserId);
  const [participantIds, setParticipantIds] = useState<string[]>(
    currentParticipantIds.length > 0 ? currentParticipantIds : [currentUserId]
  );
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "");
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [pending, startTransition] = useTransition();

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Dê um título para a reunião.");
      return;
    }
    if (!meetingDate) {
      toast.error("Escolha a data da reunião.");
      return;
    }
    if (!startTime) {
      toast.error("Escolha o horário inicial.");
      return;
    }

    const input: MeetingFormInput = {
      title,
      description: description || undefined,
      agenda: agenda || undefined,
      notes: notes || undefined,
      clientName: clientName || undefined,
      contactName: contactName || undefined,
      contactPhone: contactPhone || undefined,
      meetingDate,
      startTime,
      endTime: endTime || undefined,
      location: location || undefined,
      meetingLink: meetingLink || undefined,
      responsibleId,
      participantIds,
    };

    startTransition(async () => {
      const result = meeting
        ? await updateMeetingAction(meeting.id, input)
        : await createMeetingAction(input);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? (meeting ? "Reunião atualizada." : "Reunião criada."));
      onOpenChange(false);
      if (result.meetingId) onSaved?.(result.meetingId);
    });
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{meeting ? "Editar reunião" : "Nova reunião"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meeting-title">Título *</Label>
          <Input
            id="meeting-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-client">Cliente / nome do cliente</Label>
            <Input
              id="meeting-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={pending}
              placeholder="Opcional"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-contact">Nome do contato</Label>
            <Input
              id="meeting-contact"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={pending}
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meeting-phone">WhatsApp / telefone</Label>
          <Input
            id="meeting-phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            disabled={pending}
            placeholder="(11) 99999-9999"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-date">Data *</Label>
            <Input
              id="meeting-date"
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-start">Início *</Label>
            <Input
              id="meeting-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-end">Fim</Label>
            <Input
              id="meeting-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Responsável principal</Label>
          <Select value={responsibleId} onValueChange={setResponsibleId} disabled={pending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Participantes</Label>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs"
              >
                <Checkbox
                  checked={participantIds.includes(m.id)}
                  onCheckedChange={() => toggleParticipant(m.id)}
                  disabled={pending}
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-location">Local</Label>
            <Input
              id="meeting-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={pending}
              placeholder="Opcional"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-link">Link da reunião</Label>
            <Input
              id="meeting-link"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              disabled={pending}
              placeholder="Meet, Zoom, Teams…"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meeting-agenda">Pauta</Label>
          <Textarea
            id="meeting-agenda"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            disabled={pending}
            rows={2}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meeting-desc">Descrição</Label>
          <Textarea
            id="meeting-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={2}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meeting-notes">Observações</Label>
          <Textarea
            id="meeting-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={pending}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : meeting ? "Salvar alterações" : "Criar reunião"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
