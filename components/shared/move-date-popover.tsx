"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { relativeDay } from "@/lib/dates";

export function MoveDatePopover({
  onMove,
  children,
}: {
  onMove: (newDate: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  function apply(date: string) {
    onMove(date);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> Mover para
        </p>
        <div className="flex flex-col gap-1.5">
          <Button variant="outline" size="sm" className="justify-start" onClick={() => apply(relativeDay(0))}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => apply(relativeDay(1))}>
            Amanhã
          </Button>
          <div className="flex gap-1.5">
            <Input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8" />
            <Button size="sm" disabled={!custom} onClick={() => apply(custom)}>OK</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
