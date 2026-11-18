"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, Bot, ChevronDown, ListOrdered, Plus, Search, Trash2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { addTikTokProjectEntry, deleteTikTokProjectEntry } from "@/lib/supabase/tiktok-project-actions";
import { formatCurrency, formatDate, todayKeySaoPaulo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { buildProjectView, PROJECTS, type ProjectEntry, type ProjectKey, type TypeFilter } from "@/lib/tiktok-projects";
import { cn } from "@/lib/utils";

const ICON: Record<ProjectKey, typeof Bot> = { sofia: Bot, maria: Users };
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * TikTok — Projetos (Sofia IA / TikTok Real — Maria): abas por perfil,
 * indicadores do perfil, filtros (tipo, mês, busca), histórico agrupado por
 * mês e "Nova movimentação" recolhível. Só dados reais registrados
 * (`tiktok_project_entries`); nenhuma métrica é inventada. Regras em
 * lib/tiktok-projects.ts (testadas).
 */
export function TikTokProjectsClient({ entries, initialProject = "sofia" }: { entries: ProjectEntry[]; initialProject?: ProjectKey }) {
  const [project, setProject] = useState<ProjectKey>(initialProject);
  const [type, setType] = useState<TypeFilter>("todos");
  const [month, setMonth] = useState("todos");
  const [query, setQuery] = useState("");
  const [share, setShare] = useState(50);
  const [formOpen, setFormOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const view = useMemo(() => buildProjectView(entries, { project, type, month, query }), [entries, project, type, month, query]);
  const info = PROJECTS[project];

  function choose(next: ProjectKey) {
    setProject(next);
    setMonth("todos");
    // Mantém o perfil no endereço (voltar/compartilhar abre o mesmo perfil).
    try { window.history.replaceState(null, "", `?projeto=${next}`); } catch { /* sem histórico: só o estado local */ }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="TikTok — Projetos" description="Ganhos e gastos de cada perfil, separados e com histórico próprio." />

      <div role="tablist" aria-label="Perfis do TikTok" className="grid grid-cols-2 gap-2">
        {(Object.keys(PROJECTS) as ProjectKey[]).map((k) => {
          const Icon = ICON[k];
          const selected = k === project;
          const balance = view.balances[k];
          return (
            <button key={k} type="button" role="tab" aria-selected={selected} onClick={() => choose(k)}
              className={cn("min-w-0 rounded-xl border p-3 text-left transition-colors sm:p-4", selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40")}>
              <span className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                <span className="truncate text-sm font-semibold">{PROJECTS[k].name}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{PROJECTS[k].subtitle}</span>
              <span className={cn("mt-2 block text-base font-semibold tabular-nums sm:text-lg", balance < 0 ? "text-destructive" : "")}>{formatCurrency(balance)}</span>
              <span className="block text-[11px] text-muted-foreground">Saldo acumulado</span>
            </button>
          );
        })}
      </div>

      <section aria-label={`Indicadores — ${info.name}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Receitas", value: formatCurrency(view.totals.income), icon: ArrowUpCircle, tone: "text-success" },
          { label: "Despesas", value: formatCurrency(view.totals.expenses), icon: ArrowDownCircle, tone: "text-destructive" },
          { label: "Lucro / saldo", value: formatCurrency(view.totals.balance), icon: Wallet, tone: view.totals.balance < 0 ? "text-destructive" : "" },
          { label: "Movimentações", value: String(view.totals.count), icon: ListOrdered, tone: "" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><c.icon className="h-3.5 w-3.5" />{c.label}</p>
            <p className={cn("mt-1 text-lg font-semibold tabular-nums", c.tone)}>{c.value}</p>
          </div>
        ))}
        <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-4">{view.filtered ? "Valores conforme os filtros abaixo." : "Todo o histórico do perfil."}{view.lastDate ? ` Última movimentação: ${formatDate(view.lastDate)}.` : ""}</p>
      </section>

      {project === "maria" && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Divisão do lucro</h2>
          <p className="mt-1 text-xs text-muted-foreground">Simulação sobre o lucro exibido acima; não realiza transferências nem registra retiradas.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Label htmlFor="share">Sua porcentagem (%)</Label>
            <Input id="share" type="number" min="0" max="100" className="h-10 w-24" value={share} onChange={(e) => setShare(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/40 p-2">Você<strong className="block tabular-nums">{formatCurrency(view.totals.balance * share / 100)}</strong></div>
            <div className="rounded-lg bg-muted/40 p-2">Sua irmã<strong className="block tabular-nums">{formatCurrency(view.totals.balance * (100 - share) / 100)}</strong></div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card">
        <button type="button" onClick={() => setFormOpen((v) => !v)} aria-expanded={formOpen} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-semibold">
          <Plus className="h-4 w-4 text-primary" /> Nova movimentação — {info.short}
          <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", formOpen && "rotate-180")} />
        </button>
        {formOpen && (
          <form className="border-t border-border p-4" action={(form) => start(async () => {
            form.set("project", project);
            const r = await addTikTokProjectEntry(form);
            if (r.error) toast.error(r.error);
            else { toast.success("Movimentação registrada"); setFormOpen(false); router.refresh(); }
          })}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div><Label htmlFor="tt-kind">Tipo</Label><select id="tt-kind" name="kind" className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="entrada">Receita</option><option value="saida">Despesa</option></select></div>
              <div className="sm:col-span-1"><Label htmlFor="tt-desc">Descrição</Label><Input id="tt-desc" name="description" required placeholder="Ex.: Comissão TikTok Shop" className="mt-1" /></div>
              <div><Label htmlFor="tt-amount">Valor (R$)</Label><Input id="tt-amount" name="amount" required inputMode="decimal" placeholder="100,00" className="mt-1" /></div>
              <div><Label htmlFor="tt-date">Data</Label><Input id="tt-date" name="entryDate" type="date" required defaultValue={todayKeySaoPaulo()} className="mt-1" /></div>
            </div>
            <Button className="mt-4 h-10 w-full sm:w-auto" disabled={pending}>{pending ? "Salvando…" : "Salvar movimentação"}</Button>
          </form>
        )}
      </section>

      <section className="space-y-3" aria-label={`Histórico — ${info.name}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">Histórico — {info.short}</h2>
          <div className="flex flex-wrap gap-2">
            <div role="radiogroup" aria-label="Tipo" className="flex rounded-md border border-border p-0.5">
              {([["todos", "Todos"], ["entrada", "Receitas"], ["saida", "Despesas"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={type === v} onClick={() => setType(v)} className={cn("min-h-9 rounded px-2.5 text-xs", type === v ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground")}>{l}</button>
              ))}
            </div>
            <select aria-label="Mês" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-md border border-border bg-background px-2 text-sm">
              <option value="todos">Todos os meses</option>
              {view.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <div className="relative min-w-0 flex-1 sm:w-48 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Buscar na descrição" placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 pl-8" />
            </div>
          </div>
        </div>

        {view.groups.length === 0 ? (
          <EmptyState title={view.totals.count === 0 && !view.filtered ? "Nenhuma movimentação neste perfil." : "Nada encontrado com esses filtros."} />
        ) : (
          view.groups.map((g) => (
            <div key={g.month} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-1">
                <h3 className="text-sm font-medium capitalize">{monthLabel(g.month)}</h3>
                <p className="text-xs tabular-nums text-muted-foreground">
                  <span className="text-success">+{formatCurrency(g.income)}</span> · <span className="text-destructive">−{formatCurrency(g.expenses)}</span> · <strong className="text-foreground">{formatCurrency(g.income - g.expenses)}</strong>
                </p>
              </div>
              <ul className="space-y-2">
                {g.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    {e.kind === "entrada" ? <ArrowUpCircle className="h-5 w-5 shrink-0 text-success" aria-label="Receita" /> : <ArrowDownCircle className="h-5 w-5 shrink-0 text-destructive" aria-label="Despesa" />}
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(e.entry_date)}</p>
                    </div>
                    <span className={cn("shrink-0 text-sm font-semibold tabular-nums", e.kind === "entrada" ? "text-success" : "text-destructive")}>{e.kind === "entrada" ? "+" : "−"}{formatCurrency(Number(e.amount))}</span>
                    <button type="button" aria-label={`Excluir movimentação: ${e.description}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-destructive" disabled={pending}
                      onClick={() => { if (!window.confirm("Excluir esta movimentação?")) return; start(async () => { const r = await deleteTikTokProjectEntry(e.id); if (r.error) toast.error(r.error); else { toast.success("Movimentação excluída"); router.refresh(); } }); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
