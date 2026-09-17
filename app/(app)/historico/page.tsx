"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RoutineItem } from "@/components/shared/routine-item";
import { getOccurrences } from "@/lib/routine";
import { personalFinanceSummary, currentMonthKey } from "@/lib/selectors";
import { formatDateShort, formatMonthYear, formatCurrency, weekdayLabel, toDateKey } from "@/lib/format";
import { cn } from "@/lib/utils";

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

export default function HistoricoPage() {
  const { profile, personalSpace } = useAuth();
  const activities = useDbStore((s) => s.activities);
  const transactions = useDbStore((s) => s.transactions);
  const update = useDbStore((s) => s.update);

  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const weeks = useWeekRanges(6);

  if (!profile || !personalSpace) return null;

  const myActivities = activities.filter((a) => a.userId === profile.id);

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: formatMonthYear(d) };
  });

  function toggle(activityId: string, dateKey: string) {
    const activity = myActivities.find((a) => a.id === activityId);
    if (!activity) return;
    const has = activity.completedDates.includes(dateKey);
    update("activities", activity.id, {
      completedDates: has
        ? activity.completedDates.filter((d) => d !== dateKey)
        : [...activity.completedDates, dateKey],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Histórico"
        description="Suas semanas e meses anteriores continuam disponíveis para consulta."
      />

      <Tabs defaultValue="rotina">
        <TabsList>
          <TabsTrigger value="rotina">Rotina</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
        </TabsList>

        <TabsContent value="rotina">
          <div className="flex flex-col gap-2">
            {weeks.map((w) => {
              const occ = getOccurrences(myActivities, w.start, w.end);
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
                      <p className="text-xs text-muted-foreground">
                        {concluidas}/{occ.length} atividades concluídas
                      </p>
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
                          const dayPct = dayOcc.length
                            ? Math.round((dayOcc.filter((o) => o.completed).length / dayOcc.length) * 100)
                            : null;
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
                              <span className="text-[10px] text-muted-foreground">
                                {weekdayLabel(d.getDay()).slice(0, 3)}
                              </span>
                              <span className="text-xs font-medium text-foreground">
                                {dayPct === null ? "—" : `${dayPct}%`}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-col gap-2">
                        {(() => {
                          const visible = selectedDay ? occ.filter((o) => o.date === selectedDay) : occ;
                          if (visible.length === 0) {
                            return <p className="text-xs text-muted-foreground">Nenhuma atividade neste dia.</p>;
                          }
                          const planejadas = visible.filter((o) => !o.completed);
                          const concluidasDia = visible.filter((o) => o.completed);
                          return (
                            <>
                              {selectedDay && concluidasDia.length > 0 && (
                                <p className="text-[11px] font-medium uppercase tracking-wide text-success">
                                  Concluído ({concluidasDia.length})
                                </p>
                              )}
                              {(selectedDay ? concluidasDia : visible.filter((o) => o.completed)).map((o) => (
                                <RoutineItem
                                  key={`${o.activity.id}-${o.date}`}
                                  activity={o.activity}
                                  completed={o.completed}
                                  onToggle={() => toggle(o.activity.id, o.date)}
                                  onEdit={() => {}}
                                  onDelete={() => {}}
                                />
                              ))}
                              {selectedDay && planejadas.length > 0 && (
                                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Não concluído ({planejadas.length})
                                </p>
                              )}
                              {(selectedDay ? planejadas : visible.filter((o) => !o.completed)).map((o) => (
                                <RoutineItem
                                  key={`${o.activity.id}-${o.date}`}
                                  activity={o.activity}
                                  completed={o.completed}
                                  onToggle={() => toggle(o.activity.id, o.date)}
                                  onEdit={() => {}}
                                  onDelete={() => {}}
                                />
                              ))}
                            </>
                          );
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
              const summary = personalFinanceSummary(
                { transactions },
                personalSpace.id,
                m.key
              );
              return (
                <Card key={m.key} className="p-4">
                  <p className="text-sm font-medium text-foreground">
                    {m.label}
                    {m.key === currentMonthKey() && (
                      <span className="ml-1.5 text-xs text-primary">(atual)</span>
                    )}
                  </p>
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entradas</span>
                      <span className="font-medium text-success">
                        {formatCurrency(summary.entradasMes)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Saídas</span>
                      <span className="font-medium text-destructive">
                        {formatCurrency(summary.saidasMes)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1">
                      <span className="text-muted-foreground">Resultado</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(summary.entradasMes - summary.saidasMes)}
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
