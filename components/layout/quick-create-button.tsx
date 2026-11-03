"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, Handshake, Layers, ListChecks, Megaphone, Plus, TrendingDown, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavAccess } from "@/components/layout/use-nav-access";
import { quickCreateOptions, suggestDestination, type QuickCreateKind, type QuickDestination, type QuickOption } from "@/lib/quick-create";
import { cn } from "@/lib/utils";

const ICON: Record<QuickCreateKind, LucideIcon> = {
  tarefa: ListChecks,
  atividade: CalendarClock,
  campanha: Megaphone,
  cliente: Users,
  receita: TrendingUp,
  despesa: TrendingDown,
  reuniao: Handshake,
  servico: Layers,
};

/**
 * "+ Novo": escolhe o que criar e o destino (sugerido pela área atual) e
 * abre o formulário que já existe na página do destino.
 */
export function QuickCreateButton({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [option, setOption] = useState<QuickOption | null>(null);
  const [destination, setDestination] = useState<QuickDestination | null>(null);
  const access = useNavAccess();
  const pathname = usePathname();
  const router = useRouter();
  const options = useMemo(() => quickCreateOptions(access), [access]);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) { setOption(null); setDestination(null); }
  }

  function go(dest: QuickDestination) {
    reset(false);
    onNavigate?.();
    router.push(dest.href);
  }

  function choose(o: QuickOption) {
    if (o.destinations.length === 1) return go(o.destinations[0]);
    setOption(o);
    setDestination(suggestDestination(o, pathname));
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => reset(true)}
        aria-label="Criar novo"
        title={compact ? "Novo" : undefined}
        className={cn("h-11 shrink-0 gap-1.5 rounded-xl font-semibold lg:h-9 lg:rounded-md", compact ? "w-11 px-0 lg:w-9" : "px-3")}
      >
        <Plus className="h-5 w-5 lg:h-4 lg:w-4" />
        {!compact && <span>Novo</span>}
      </Button>

      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="max-h-[85dvh] gap-3 overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{option ? option.label : "Criar novo"}</DialogTitle>
            <DialogDescription>
              {option ? "Escolha onde criar. O destino já vem da área em que você está." : "Abre o formulário da própria página, com as mesmas regras."}
            </DialogDescription>
          </DialogHeader>

          {!option && (
            <ul className="grid gap-1.5" aria-label="O que criar">
              {options.map((o) => {
                const Icon = ICON[o.kind];
                const suggestion = suggestDestination(o, pathname);
                return (
                  <li key={o.kind}>
                    <button
                      type="button"
                      onClick={() => choose(o)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{o.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{o.destinations.length > 1 ? `Sugestão: ${suggestion.label}` : o.destinations[0].label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {options.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">Nenhuma criação disponível para o seu acesso.</li>}
            </ul>
          )}

          {option && (
            <div className="space-y-3">
              <div role="radiogroup" aria-label="Destino" className="grid gap-1.5">
                {option.destinations.map((d) => {
                  const selected = destination?.href === d.href;
                  return (
                    <button
                      key={d.href}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDestination(d)}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-lg border px-3 text-left text-sm transition-colors",
                        selected ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-secondary/60"
                      )}
                    >
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-muted-foreground/50")}>
                        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => { setOption(null); setDestination(null); }}>
                  <ChevronLeft className="h-4 w-4" /> Voltar
                </Button>
                <Button type="button" className="h-11 flex-1" disabled={!destination} onClick={() => destination && go(destination)}>
                  Abrir formulário
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
