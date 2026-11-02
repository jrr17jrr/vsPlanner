"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Pencil, PieChart as PieIcon, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartCard } from "@/components/shared/chart-card";
import { EmptyState } from "@/components/shared/empty-state";
import { EditChargeDialog } from "@/components/visionario/financeiro/edit-charge-dialog";
import { createFinancialCategoryAction } from "@/lib/supabase/financial-actions";
import {
  monthRange,
  previousRange,
  shiftMonth,
  summarizeSpending,
  SUGGESTED_EXPENSE_CATEGORIES,
  UNCATEGORIZED,
  yearRange,
  type OriginTypeFilter,
  type PeriodMode,
  type SpendingBasis,
} from "@/lib/category-spending";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { CHART_COLORS } from "@/lib/chart-colors";
import { currentMonthKeySaoPaulo, formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialCategory, FinancialCharge, FinancialOrigin, FinancialPayment, FinancialPaymentMethod, FinancialReferenceType } from "@/types/database.types";

const OTHERS_COLOR = "var(--muted-foreground)";

function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const v = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function Change({ value, compareLabel }: { value: number | null; compareLabel: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">sem gastos em {compareLabel}</span>;
  if (value === 0) return <span className="text-xs text-muted-foreground">igual a {compareLabel}</span>;
  // Para gastos, subir é ruim (vermelho) e cair é bom (verde).
  const up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-destructive" : "text-success")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{value.toFixed(0)}% vs. {compareLabel}
    </span>
  );
}

/**
 * Gastos por categoria — só no Meu Dinheiro (scope "pessoal"); os dados já
 * chegam filtrados pelo space Pessoal (RLS + space_id), então nunca mistura
 * com Visionário Dev, TikTok ou CLT. Cálculo em lib/category-spending.ts.
 */
export function CategorySpendingPanel({
  charges,
  payments,
  categories,
  origins,
  referenceTypes,
  canEdit,
  canCreate,
}: {
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  categories: FinancialCategory[];
  origins: FinancialOrigin[];
  referenceTypes: FinancialReferenceType[];
  canEdit: boolean;
  canCreate: boolean;
}) {
  const curMonth = currentMonthKeySaoPaulo();
  const [mode, setMode] = useState<PeriodMode>("mes");
  const [month, setMonth] = useState(curMonth);
  const [compareMonth, setCompareMonth] = useState(shiftMonth(curMonth, -1));
  const [year, setYear] = useState(Number(curMonth.slice(0, 4)));
  const [from, setFrom] = useState(`${curMonth}-01`);
  const [to, setTo] = useState(monthRange(curMonth).to);
  const [categoryId, setCategoryId] = useState<string>("todas");
  const [originType, setOriginType] = useState<OriginTypeFilter>("todos");
  const [basis, setBasis] = useState<SpendingBasis>("competencia");
  const [detail, setDetail] = useState<string | null>(null);
  const [editing, setEditing] = useState<FinancialCharge | null>(null);
  const [seeding, startSeeding] = useTransition();

  const expenseCategories = categories.filter((c) => c.kind === "saida");
  const years = useMemo(() => {
    const set = new Set<number>([Number(curMonth.slice(0, 4))]);
    for (const c of charges) if (c.kind === "saida") set.add(Number((c.competency_date ?? c.due_date).slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [charges, curMonth]);

  const { range, compare, label, compareLabel } = useMemo(() => {
    if (mode === "mes") return { range: monthRange(month), compare: monthRange(compareMonth), label: monthLabel(month), compareLabel: monthLabel(compareMonth) };
    if (mode === "ano") return { range: yearRange(year), compare: yearRange(year - 1), label: String(year), compareLabel: String(year - 1) };
    const safeTo = to < from ? from : to;
    return { range: { from, to: safeTo }, compare: previousRange(from, safeTo), label: `${formatDate(from)} – ${formatDate(safeTo)}`, compareLabel: "período anterior" };
  }, [mode, month, compareMonth, year, from, to]);

  const filters = { ...range, basis, originType, categoryId: categoryId === "todas" ? null : categoryId };
  const summary = useMemo(
    () => summarizeSpending({ charges, payments, categories, origins }, filters, compare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [charges, payments, categories, origins, range.from, range.to, basis, originType, categoryId, compare.from, compare.to]
  );
  const visible = summary.categories.filter((c) => c.total > 0);
  const top = visible.slice(0, 5);
  const othersTotal = visible.slice(5).reduce((s, c) => s + c.total, 0);
  const pieData = [...top.map((c) => ({ name: c.name, value: c.total })), ...(othersTotal > 0 ? [{ name: "Outras", value: othersTotal }] : [])];
  const colorOf = (i: number) => (i < 5 ? CHART_COLORS[i] : OTHERS_COLOR);

  const detailKey = detail;
  const detailCategory = detailKey ? summary.categories.find((c) => (c.categoryId ?? UNCATEGORIZED) === detailKey) : null;
  const detailEntries = detailKey ? summary.entries.filter((e) => (e.charge.category_id ?? UNCATEGORIZED) === detailKey) : [];
  const paidCharges = useMemo(() => new Set(payments.map((p) => p.charge_id)), [payments]);
  const missingSuggestions = SUGGESTED_EXPENSE_CATEGORIES.filter((n) => !expenseCategories.some((c) => c.name.localeCompare(n, "pt-BR", { sensitivity: "base" }) === 0));

  function seedSuggestions() {
    startSeeding(async () => {
      for (const name of missingSuggestions) {
        const r = await createFinancialCategoryAction("pessoal", "saida", name);
        if (r.error && !r.error.includes("Já existe")) { toast.error(r.error); return; }
      }
      toast.success("Categorias sugeridas adicionadas.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-3">
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Período">
          {(["mes", "ano", "personalizado"] as PeriodMode[]).map((m) => (
            <Button key={m} type="button" size="sm" className="h-9" variant={mode === m ? "default" : "outline"} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "mes" ? "Mês" : m === "ano" ? "Ano" : "Personalizado"}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mode === "mes" && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cs-month" className="text-xs">Mês</Label>
                <Input id="cs-month" type="month" value={month} onChange={(e) => { if (e.target.value) { setMonth(e.target.value); setCompareMonth(shiftMonth(e.target.value, -1)); } }} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cs-compare" className="text-xs">Comparar com</Label>
                <Input id="cs-compare" type="month" value={compareMonth} onChange={(e) => e.target.value && setCompareMonth(e.target.value)} />
              </div>
            </>
          )}
          {mode === "ano" && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Ano</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-10 w-full" aria-label="Ano"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {mode === "personalizado" && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cs-from" className="text-xs">De</Label>
                <Input id="cs-from" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cs-to" className="text-xs">Até</Label>
                <Input id="cs-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Categoria</Label>
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setDetail(null); }}>
              <SelectTrigger className="h-10 w-full" aria-label="Categoria"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (inativa)"}</SelectItem>)}
                <SelectItem value={UNCATEGORIZED}>Sem categoria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Tipo de lançamento</Label>
            <Select value={originType} onValueChange={(v) => setOriginType(v as OriginTypeFilter)}>
              <SelectTrigger className="h-10 w-full" aria-label="Tipo de lançamento"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="unico">Únicos</SelectItem>
                <SelectItem value="parcelado">Parcelados</SelectItem>
                <SelectItem value="recorrente">Recorrentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Base do cálculo">
            <Button type="button" size="sm" className="h-9" variant={basis === "competencia" ? "default" : "outline"} aria-pressed={basis === "competencia"} onClick={() => setBasis("competencia")}>Todas as despesas</Button>
            <Button type="button" size="sm" className="h-9" variant={basis === "pago" ? "default" : "outline"} aria-pressed={basis === "pago"} onClick={() => setBasis("pago")}>Somente pagas</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {basis === "competencia" ? "Pela competência/vencimento de cada despesa (mesmo critério dos gráficos)." : "Pelo dia em que o pagamento saiu da conta."}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total gasto · {label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(summary.total)}</p>
          <Change value={summary.change} compareLabel={compareLabel} />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{compareLabel}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-muted-foreground">{formatCurrency(summary.previousTotal)}</p>
          <span className="text-xs text-muted-foreground">diferença {formatCurrency(summary.total - summary.previousTotal)}</span>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Maior categoria</p>
          <p className="mt-1 truncate text-lg font-semibold">{visible[0]?.name ?? "—"}</p>
          {visible[0] && <span className="text-xs text-muted-foreground">{formatCurrency(visible[0].total)} · {visible[0].pct.toFixed(0)}% do total</span>}
        </Card>
      </div>

      {summary.excludedTransfers > 0 && (
        <p className="text-[11px] text-muted-foreground">{formatCurrency(summary.excludedTransfers)} em transferências entre contas próprias não entraram no total.</p>
      )}

      {detailKey ? (
        <Card className="p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setDetail(null)}><ArrowLeft className="h-4 w-4" /> Todas as categorias</Button>
            <p className="text-sm font-semibold">{detailCategory?.name ?? "Categoria"} · {formatCurrency(detailCategory?.total ?? 0)}</p>
          </div>
          {detailEntries.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhum lançamento nesta categoria no período.</p>
          ) : (
            <ul className="divide-y divide-border">
              {detailEntries.map((e, i) => (
                <li key={`${e.charge.id}-${e.date}-${i}`} className="flex min-h-14 items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.charge.description}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(e.date)} · {detailCategory?.name}
                      {e.paymentMethods.length > 0 && ` · ${e.paymentMethods.map((m) => PAYMENT_METHOD_LABEL[m as FinancialPaymentMethod] ?? m).join(", ")}`}
                      {basis === "competencia" && !paidCharges.has(e.charge.id) && " · a pagar"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(e.amount)}</span>
                  {canEdit && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Editar ${e.charge.description}`} onClick={() => setEditing(e.charge)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : visible.length === 0 ? (
        <EmptyState icon={PieIcon} title="Nenhuma despesa no período" description="Cadastre despesas com categoria em “Nova movimentação” para ver os totais aqui." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Distribuição dos gastos" description={label}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="var(--card)">
                  {pieData.map((_, i) => <Cell key={i} fill={colorOf(i)} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card className="p-3">
            <p className="mb-2 text-sm font-medium">Gastos por categoria</p>
            <ul className="flex flex-col gap-1">
              {summary.categories.filter((c) => c.total > 0 || c.previousTotal > 0).map((c, i) => {
                const key = c.categoryId ?? UNCATEGORIZED;
                const color = c.total > 0 ? colorOf(visible.indexOf(c)) : OTHERS_COLOR;
                return (
                  <li key={key}>
                    <button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-secondary" onClick={() => setDetail(key)} aria-label={`Ver lançamentos de ${c.name}`}>
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{i < 3 && c.total > 0 && <Badge variant="secondary" className="mr-1 h-5 border-0 px-1.5 text-[10px]">{i + 1}º</Badge>}{c.name}</span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(c.total)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-secondary">
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, c.pct)}%`, background: color }} />
                        </span>
                        <span className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>{c.pct.toFixed(1)}% · {c.count} lançamento{c.count === 1 ? "" : "s"}</span>
                          <Change value={c.change} compareLabel={compareLabel} />
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {canCreate && missingSuggestions.length > 0 && (
        <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Sugestões ainda não cadastradas: {missingSuggestions.join(", ")}. Suas categorias atuais continuam como estão.</p>
          <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" disabled={seeding} onClick={seedSuggestions}>
            <Sparkles className="h-4 w-4" /> {seeding ? "Adicionando…" : "Adicionar sugestões"}
          </Button>
        </Card>
      )}

      {editing && (
        <EditChargeDialog
          scope="pessoal"
          charge={editing}
          categories={categories}
          referenceTypes={referenceTypes}
          hasPayment={paidCharges.has(editing.id)}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </div>
  );
}
