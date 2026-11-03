"use client";

import { useState } from "react";
import { shiftMonth } from "@/lib/clt/history";
import { reportPeriodDates, reportPeriodLabel, validatePeriod, type ReportPeriod } from "@/lib/clt/report-period";

/**
 * Seletor de período ÚNICO (Relatórios, página Empresas e Visão Geral da
 * empresa — CLT e MKT). Devolve um `ReportPeriod`, o mesmo tipo usado pelos
 * cálculos de lib/clt/report-period.ts, então tela e PDF filtram igual.
 */
export type PeriodMode = "this_month" | "last_month" | "month" | "days" | "months" | "year" | "all";

const MODES: { id: PeriodMode; label: string }[] = [
  { id: "this_month", label: "Este mês" },
  { id: "last_month", label: "Mês passado" },
  { id: "month", label: "Mês específico" },
  { id: "days", label: "Intervalo de dias" },
  { id: "months", label: "Intervalo de meses" },
  { id: "year", label: "Ano completo" },
  { id: "all", label: "Todos os períodos" },
];

const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

type State = { mode: PeriodMode; month: string; dayFrom: string; dayTo: string; monthFrom: string; monthTo: string; year: number };

export function periodFromState(s: State, today = todaySP()): ReportPeriod {
  switch (s.mode) {
    case "this_month": return { kind: "month", month: today.slice(0, 7) };
    case "last_month": return { kind: "month", month: shiftMonth(today.slice(0, 7), -1) };
    case "month": return { kind: "month", month: s.month };
    case "days": return { kind: "days", from: s.dayFrom, to: s.dayTo };
    case "months": return { kind: "months", from: s.monthFrom, to: s.monthTo };
    case "year": return { kind: "year", year: s.year };
    case "all": return { kind: "all" };
  }
}

export function PeriodPicker({ onChange, initialMode = "this_month", allowAll = true, label = "Período", idPrefix = "periodo", className = "" }: {
  /** Chamado com o período válido (ou com o erro de preenchimento). */
  onChange: (period: ReportPeriod, error: string | null) => void;
  initialMode?: PeriodMode;
  allowAll?: boolean;
  label?: string;
  idPrefix?: string;
  className?: string;
}) {
  const today = todaySP();
  const thisMonth = today.slice(0, 7);
  const [s, setS] = useState<State>({ mode: initialMode, month: thisMonth, dayFrom: thisMonth + "-01", dayTo: today, monthFrom: shiftMonth(thisMonth, -2), monthTo: thisMonth, year: Number(today.slice(0, 4)) });
  const period = periodFromState(s, today);
  const error = validatePeriod(period);
  function patch(p: Partial<State>) {
    const next = { ...s, ...p };
    setS(next);
    const nextPeriod = periodFromState(next, today);
    onChange(nextPeriod, validatePeriod(nextPeriod));
  }
  const field = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
  const years = Array.from({ length: Number(today.slice(0, 4)) - 2023 }, (_, i) => 2024 + i).reverse();
  const wrap = "flex min-w-0 flex-col gap-1 text-xs text-muted-foreground";
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className={`${wrap} w-full sm:w-48`}>{label}
          <select id={`${idPrefix}-modo`} className={field} value={s.mode} onChange={(e) => patch({ mode: e.target.value as PeriodMode })}>
            {MODES.filter((m) => allowAll || m.id !== "all").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        {s.mode === "month" && <label className={`${wrap} w-full sm:w-44`}>Mês<input className={field} type="month" value={s.month} onChange={(e) => patch({ month: e.target.value })} /></label>}
        {s.mode === "days" && <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
          <label className={wrap}>De<input className={field} type="date" value={s.dayFrom} max={s.dayTo || undefined} onChange={(e) => patch({ dayFrom: e.target.value })} /></label>
          <label className={wrap}>Até<input className={field} type="date" value={s.dayTo} min={s.dayFrom || undefined} onChange={(e) => patch({ dayTo: e.target.value })} /></label>
        </div>}
        {s.mode === "months" && <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
          <label className={wrap}>Mês inicial<input className={field} type="month" value={s.monthFrom} max={s.monthTo || undefined} onChange={(e) => patch({ monthFrom: e.target.value })} /></label>
          <label className={wrap}>Mês final<input className={field} type="month" value={s.monthTo} min={s.monthFrom || undefined} onChange={(e) => patch({ monthTo: e.target.value })} /></label>
        </div>}
        {s.mode === "year" && <label className={`${wrap} w-full sm:w-32`}>Ano<select className={field} value={s.year} onChange={(e) => patch({ year: Number(e.target.value) })}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{reportPeriodLabel(period)}{period.kind !== "all" ? ` · ${reportPeriodDates(period)}` : ""}</p>}
    </div>
  );
}
