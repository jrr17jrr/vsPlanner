import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionError as SectionErrorData } from "@/lib/supabase/section-result";

/**
 * Falha de UMA seção — mostra o erro real do Supabase (code, message,
 * details, hint) no lugar do conteúdo, sem derrubar o resto da página.
 */
export function SectionError({ title, error, className }: { title: string; error: SectionErrorData; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3", className)} role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="break-words font-mono text-[11px] text-muted-foreground">
          {error.code && <span className="font-semibold text-destructive">{error.code} · </span>}
          {error.message}
        </p>
        {error.details && <p className="break-words font-mono text-[11px] text-muted-foreground">details: {error.details}</p>}
        {error.hint && <p className="break-words font-mono text-[11px] text-muted-foreground">hint: {error.hint}</p>}
      </div>
    </div>
  );
}
