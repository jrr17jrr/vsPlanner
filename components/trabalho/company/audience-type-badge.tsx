import { Bookmark, Copy, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLE: Record<string, { label: string; className: string; icon: typeof Bookmark }> = {
  salvo: { label: "Salvo", className: "border-primary/40 bg-primary/10 text-primary", icon: Bookmark },
  personalizado: { label: "Personalizado", className: "border-violet-400/40 bg-violet-400/10 text-violet-300", icon: UserRound },
  semelhante: { label: "Semelhante", className: "border-amber-400/40 bg-amber-400/10 text-amber-300", icon: Copy },
};

/** Identificação visual dos tipos de público: salvo, personalizado e semelhante. */
export function AudienceTypeBadge({ type, className }: { type: string; className?: string }) {
  const s = STYLE[type] ?? { label: type, className: "border-border text-muted-foreground", icon: UserRound };
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", s.className, className)}>
      <s.icon className="h-3 w-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}
