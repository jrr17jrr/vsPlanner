import { cn } from "@/lib/utils";

/**
 * Identidade visual comum de Tarefas e Meu Dia: cabeçalho de seção com
 * ponto colorido + contagem, separador discreto e 12px entre cards.
 */
export type SectionTone = "primary" | "danger" | "warning" | "success" | "muted";

const DOT: Record<SectionTone, string> = {
  primary: "bg-primary",
  danger: "bg-destructive",
  warning: "bg-amber-400",
  success: "bg-emerald-500",
  muted: "bg-muted-foreground/60",
};

/** Borda lateral de status dos cards (mesmas cores nas duas páginas). */
export const CARD_ACCENT = {
  danger: "border-l-destructive",
  warning: "border-l-amber-400",
  success: "border-l-emerald-500",
  primary: "border-l-primary/70",
  default: "border-l-border",
} as const;

export function TaskSection({
  id,
  title,
  count,
  tone = "muted",
  action,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  tone?: SectionTone;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2 border-b border-border/60 pb-1.5">
        <h2 id={id} className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-foreground/90">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[tone])} aria-hidden="true" />
          {title}
          {count !== undefined && <span className="rounded-full bg-secondary px-1.5 py-px text-[11px] font-medium normal-case tracking-normal text-muted-foreground tabular-nums">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Lista de cards com o espaçamento padrão entre tarefas diferentes. */
export function TaskList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3", className)}>{children}</div>;
}

export function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{children}</p>;
}
