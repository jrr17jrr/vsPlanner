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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { concludeMeetingAction } from "@/lib/supabase/meetings-actions";
import type { Meeting } from "@/types/database.types";

export function ConcludeMeetingDialog({
  open,
  onOpenChange,
  meeting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
}) {
  const [summary, setSummary] = useState(meeting.summary ?? "");
  const [decisions, setDecisions] = useState(meeting.decisions ?? "");
  const [finalNotes, setFinalNotes] = useState(meeting.final_notes ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await concludeMeetingAction(meeting.id, { summary, decisions, finalNotes });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? "Reunião concluída.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir reunião</DialogTitle>
          <DialogDescription>
            O status muda para &quot;realizada&quot;. Você pode preencher agora ou deixar em branco e editar depois.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conclude-summary">Resumo da reunião</Label>
            <Textarea
              id="conclude-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={pending}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conclude-decisions">Decisões tomadas</Label>
            <Textarea
              id="conclude-decisions"
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
              disabled={pending}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conclude-notes">Observações finais</Label>
            <Textarea
              id="conclude-notes"
              value={finalNotes}
              onChange={(e) => setFinalNotes(e.target.value)}
              disabled={pending}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Concluindo…" : "Concluir reunião"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
