"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ListChecks, Briefcase, Target, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { ChecklistItem } from "@/components/shared/checklist-item";
import { toggleActivityCompletionAction } from "@/lib/supabase/personal-actions";
import { getRealOccurrences } from "@/lib/routine-real";
import { monthCashSummary } from "@/lib/financial-calc";
import { formatDateShort, formatMonthYear, formatCurrency, weekdayLabel, toDateKey, currentMonthKeySaoPaulo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Activity, ActivityCompletion, FinancialCharge, FinancialPayment, Goal, Meeting, PersonalWorkTask, Task } from "@/types/database.types";

function useWeekRanges(count: number) {
  return useMemo(() => {
    const ranges: { start: Date; end: Date; offset: number }[] = [];
    for (let i = 0; i < count; i++) {
      const d = new Date();
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - i * 7);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setDate(end.getDate() + 6);
      ranges.push({ start: d, end, offset: -i });
    }
    return ranges;
  }, [count]);
}

type FeedItem = { id: string; icon: typeof CheckCircle2; label: string; title: string; date: string; href?: string };

export function HistoricoPageClient({
  activities,
  completions: initialCompletions,
  charges,
  payments,
  tasks,
  workTasks,
  goals,
  meetings,
}: {
  activities: Activity[];
  completions: ActivityCompletion[];
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  tasks: Task[];
  workTasks: PersonalWorkTask[];
  goals: Goal[];
  meetings: Meeting[];
}) {
  const [completions, setCompletions] = useState(initialCompletions);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const weeks = useWeekRanges(6);
  const currentMonth = currentMonthKeySaoPaulo();

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: formatMonthYear(d) };
  });

  async function toggle(activityId: string, dateKey: string) {
    const wasCompleted = completions.some((c) => c.activity_id === activityId && c.occurrence_date === dateKey);
    setCompletions((prev) =>
      wasCompleted
        ? prev.filter((c) => !(c.activity_id === activityId && c.occurrence_date === dateKey))
        : [...prev, { id: `optimistic-${activityId}-${dateKey}`, activity_id: activityId, user_id: "", occurrence_date: dateKey, completed_at: new Date().toISOString() }]
    );
    const result = await toggleActivityCompletionAction(activityId, dateKey, !wasCompleted);
    if (result.error) toast.error(result.error);
  }

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...tasks.map((t) => ({ id: `task-${t.id}`, icon: ListChecks, label: "Tarefa concluída", title: t.title, date: t.completed_at ?? t.updated_at, href: "/tarefas" })),
      ...workTasks.map((t) => ({ id: `wt-${t.id}`, icon: Briefcase, label: "Trabalho/CLT concluído", title: t.title, date: t.completed_at ?? t.updated_at, href: "/trabalho" })),
      ...goals.map((g) => ({ id: `goal-${g.id}`, icon: Target, label: "Meta concluída", title: g.title, date: g.updated_at, href: "/metas" })),
      ...meetings.map((m) => ({ id: `meeting-${m.id}`, icon: CalendarClock, label: "Reunião realizada", title: m.title, date: `${m.meeting_date}T${m.start_time}`, href: `/visionario/reunioes/${m.id}` })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }, [tasks, workTasks, goals, meetings]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Histórico" description="Suas semanas, meses e conclusões anteriores." />

      <Tabs defaultValue="rotina">
        <TabsList>
          <TabsTrigger value="rotina">Rotina</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="atividades">Conclusões</TabsTrigger>
        </TabsList>

        <TabsContent value="rotina">
          <div className="flex flex-col gap-2">
            {weeks.map((w) => {
              const occ = getRealOccurrences(activities, completions, w.start, w.end);
              const concluidas = occ.filter((o) => o.completed).length;
              const pct = occ.length ? Math.round((concluidas / occ.length) * 100) : 0;
              const isOpen = openWeek === w.offset;
              return (
                <Card key={w.offset} className="p-4">
                  <button
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() => { setOpenWeek(isOpen ? null : w.offset); setSelectedDay(null); }}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {w.offset === 0 ? "Semana atual" : `${formatDateShort(w.start)} – ${formatDateShort(w.end)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{concluidas}/{occ.length} atividades concluídas</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="w-24" />
                      <span className="w-10 text-right text-xs font-medium text-primary">{pct}%</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="mb-3 grid grid-cols-7 gap-1">
                        {Array.from({ length: 7 }, (_, i) => {
                          const d = new Date(w.start);
                          d.setDate(d.getDate() + i);
                          const dateKey = toDateKey(d);
                          const dayOcc = occ.filter((o) => o.date === dateKey);
                          const dayPct = dayOcc.length ? Math.round((dayOcc.filter((o) => o.completed).length / dayOcc.length) * 100) : null;
                          const isSelected = selectedDay === dateKey;
                          return (
                            <button
                              key={dateKey}
                              onClick={() => setSelectedDay(isSelected ? null : dateKey)}
                              className={cn(
                                "flex flex-col items-center gap-0.5 rounded-md border border-border px-1 py-1.5 text-center transition-colors",
                                isSelected ? "border-primary bg-primary/10" : "hover:bg-secondary/40"
                              )}
                            >
                              <span className="text-[10px] text-muted-foreground">{weekdayLabel(d.getDay()).slice(0, 3)}</span>
                              <span className="text-xs font-medium text-foreground">{dayPct === null ? "—" : `${dayPct}%`}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-col gap-2">
                        {(() => {
                          const visible = selectedDay ? occ.filter((o) => o.date === selectedDay) : occ;
                          if (visible.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma atividade neste dia.</p>;
                          return visible.map((o) => (
                            <ChecklistItem
                              key={`${o.activity.id}-${o.date}`}
                              title={o.activity.title}
                              done={o.completed}
                              time={o.activity.start_time.slice(0, 5)}
                              onToggle={() => toggle(o.activity.id, o.date)}
                            />
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="financeiro">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {months.map((m) => {
              // Caixa pela data real — mesmo critério de "Entrou/Saiu no mês" da Home e do Financeiro.
              const cash = monthCashSummary(charges, payments, m.key);
              const summary = { receita: cash.recebido, despesa: cash.pago, lucro: cash.recebido - cash.pago };
              return (
                <Card key={m.key} className="p-4">
                  <p className="text-sm font-medium text-foreground">
                    {m.label}
                    {m.key === currentMonth && <span className="ml-1.5 text-xs text-primary">(atual)</span>}
                  </p>
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entradas</span>
                      <span className="font-medium text-success">{formatCurrency(summary.receita)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Saídas</span>
                      <span className="font-medium text-destructive">{formatCurrency(summary.despesa)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1">
                      <span className="text-muted-foreground">Resultado</span>
                      <span className={`font-semibold ${summary.lucro > 0 ? "text-success" : summary.lucro < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(summary.lucro)}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="atividades">
          {feed.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nenhuma conclusão recente" />
          ) : (
            <div className="flex flex-col gap-2">
              {feed.map((item) => {
                const Icon = item.icon;
                const content = (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success/15 text-success">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">{item.label}</p>
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateShort(item.date)}</span>
                  </div>
                );
                return item.href ? (
                  <Link key={item.id} href={item.href} className="hover:opacity-80">{content}</Link>
                ) : (
                  <div key={item.id}>{content}</div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
