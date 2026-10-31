"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Seção recolhível (accordion) com animação de altura via grid-template-rows. */
export function CollapsibleSection({ title, icon, summary, children, defaultOpen = false }: { title: string; icon?: ReactNode; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(v => !v)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {summary && <span className="block truncate text-xs text-muted-foreground">{summary}</span>}
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180 text-primary")} aria-hidden="true" />
      </button>
      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={cn("border-t px-4 py-4 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}>{children}</div>
        </div>
      </div>
    </Card>
  );
}
