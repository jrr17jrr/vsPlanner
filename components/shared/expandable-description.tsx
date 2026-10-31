"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Descrição opcional de tarefa/subtarefa/checklist — recolhida por padrão.
 * O botão é independente do checkbox: clicar nele nunca conclui nem reabre
 * a tarefa (stopPropagation + type="button"). Sem texto, não renderiza nada.
 */
export function ExpandableDescription({
  text,
  className,
  label = "Descrição",
}: {
  text?: string | null;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const value = text?.trim();
  if (!value) return null;
  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        title={open ? "Recolher descrição" : "Ver descrição"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex min-h-7 items-center gap-1 rounded-md px-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <AlignLeft className="h-3 w-3" />
        {label}
      </button>
      {open && (
        <p
          id={panelId}
          className="mt-1 whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
        >
          {value}
        </p>
      )}
    </div>
  );
}
