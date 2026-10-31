"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, LineChart as LineIcon, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CHART_COLORS } from "@/lib/chart-colors";
import {
  buildHistoryFacts, campaignEvolution, compareInsight, diff, filterFacts, LOWER_IS_BETTER, monthLabel, monthsWithData, normalizeObjective,
  periodLabel, RESULT_TYPES, resultMetricLabel, resultTypeLabel, shiftMonth, summarize,
  type HistoryInput, type HistorySummary, type PeriodFilter, type ResultType,
} from "@/lib/clt/history";
import { setCltAdSetResultTypeAction } from "@/lib/supabase/clt-history-actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (n: number) => n.toLocaleString("pt-BR");
const dash = "—";
const money = (n: number | null) => (n === null ? dash : brl(n));
const count = (n: number | null) => (n === null ? dash : int(n));
const select = "h-10 w-full rounded-md border bg-background px-2 text-sm";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

type Company = { id: string; name: string };

/** Custo por resultado do tipo principal (o de maior investimento classificado). */
function costPerResult(s: HistorySummary, type?: ResultType | null): number | null {
  const t = type ?? s.primaryType;
  return t ? s.resultsByType[t]?.cost ?? null : null;
}

type MetricRow = { key: string; label: string; value: (s: HistorySummary, objective: ResultType) => number | null; kind: "money" | "count" | "ratio" };
const METRIC_ROWS: MetricRow[] = [
  { key: "spend", label: "Investimento", value: s => s.totals.spend, kind: "money" },
  { key: "messages", label: "Conversas (mensagens)", value: s => s.messagingMessages, kind: "count" },
  { key: "messagingSpend", label: "Investimento elegível p/ mensagens", value: s => s.messagingSpend, kind: "money" },
  { key: "costPerMessage", label: "Custo por mensagem", value: s => s.costPerMessage, kind: "money" },
  { key: "impressions", label: "Impressões", value: s => s.totals.impressions, kind: "count" },
  { key: "reach", label: "Alcance", value: s => s.totals.reach, kind: "count" },
  { key: "views", label: "Visualizações", value: s => s.totals.views, kind: "count" },
  { key: "thruplays", label: "ThruPlays", value: s => s.totals.thruplays, kind: "count" },
  { key: "sales", label: "Vendas", value: s => s.totals.sales, kind: "count" },
  { key: "revenue", label: "Faturamento", value: s => s.totals.revenue, kind: "money" },
  { key: "costPerSale", label: "Custo por venda", value: s => s.costPerSale, kind: "money" },
  { key: "costPerResult", label: "Custo por resultado (objetivo)", value: (s, o) => costPerResult(s, o), kind: "money" },
  { key: "results", label: "Resultados do objetivo", value: (s, o) => s.resultsByType[o]?.results ?? null, kind: "count" },
];
const fmtKind = (kind: MetricRow["kind"], n: number | null) => (kind === "money" ? money(n) : count(n));

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p>{hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}</CardContent></Card>;
}

function Notes({ summary, partial = 0 }: { summary: HistorySummary; partial?: number }) {
  const notes: string[] = [];
  if (summary.unclassifiedSpend > 0) notes.push(`${brl(summary.unclassifiedSpend)} sem classificação de objetivo — não entram no custo por mensagem. Classifique os conjuntos na aba "Classificação".`);
  if (summary.mixedSpend > 0) notes.push(`${brl(summary.mixedSpend)} lançados no total da campanha, que tem conjuntos com objetivos diferentes — não dá para separar e não entram no custo por mensagem.`);
  if (summary.otherMessages > 0) notes.push(`${int(summary.otherMessages)} conversa(s) vieram de conjuntos que não são de mensagens e não entram no custo por mensagem.`);
  if (summary.crossMonthFacts > 0) notes.push(`${summary.crossMonthFacts} registro(s) importado(s) atravessam meses e foram contados no mês em que o período termina (sem dados diários, não há rateio).`);
  if (summary.reachNotSummable) notes.push("Alcance não é somável entre anúncios/períodos — exibido só quando há um único registro.");
  if (partial > 0) notes.push(`${partial} período(s) importado(s) ficam parcialmente fora do intervalo e não foram incluídos (sem rateio).`);
  if (!notes.length) return null;
  return <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">{notes.map(n => <p key={n} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />{n}</p>)}</div>;
}

export function CampaignHistory({ companies, input, basePath = "/trabalho" }: { companies: Company[]; input: HistoryInput; basePath?: string }) {
  const [tab, setTab] = useState<"mensal" | "comparar" | "classificacao">("mensal");
  const { facts, warnings } = useMemo(() => buildHistoryFacts(input), [input]);
  const campaignsById = useMemo(() => new Map(input.campaigns.map(c => [c.id, c])), [input.campaigns]);
  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? "";
  const overlaps = warnings.filter(w => w.kind === "overlap");

  return <Card><CardContent className="space-y-4 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Histórico mensal e comparação de campanhas</h2><p className="text-xs text-muted-foreground">Resultados reais registrados e importados, preservados mês a mês — inclusive de campanhas finalizadas.</p></div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Histórico">{([["mensal", "Histórico mensal"], ["comparar", "Comparar campanhas"], ["classificacao", "Classificação"]] as const).map(([v, l]) => <Button key={v} role="tab" aria-selected={tab === v} size="sm" variant={tab === v ? "default" : "outline"} onClick={() => setTab(v)}>{l}</Button>)}</div>
    </div>
    {overlaps.length > 0 && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground"><AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-destructive" />{overlaps.length} anúncio(s) têm métricas importadas em períodos sobrepostos ({overlaps.map(o => campaignsById.get(o.campaign_id)?.name).filter(Boolean).slice(0, 3).join(", ")}). Os dois períodos estão gravados e somam no histórico — confira para evitar contagem em dobro.</p>}
    {tab === "mensal" && <Monthly facts={facts} companies={companies} campaignsById={campaignsById} companyName={companyName} basePath={basePath} />}
    {tab === "comparar" && <Compare facts={facts} companies={companies} campaigns={input.campaigns} companyName={companyName} />}
    {tab === "classificacao" && <Classification input={input} companyName={companyName} />}
  </CardContent></Card>;
}

// ---------------------------------------------------------------- mensal

function Monthly({ facts, companies, campaignsById, companyName, basePath }: { facts: ReturnType<typeof buildHistoryFacts>["facts"]; companies: Company[]; campaignsById: Map<string, HistoryInput["campaigns"][number]>; companyName: (id: string) => string; basePath: string }) {
  const [company, setCompany] = useState("todas");
  const scoped = useMemo(() => facts.filter(f => company === "todas" || f.company_id === company), [facts, company]);
  const available = monthsWithData(scoped);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [focus, setFocus] = useState<string | null>(null);
  const monthFacts = scoped.filter(f => f.month === month);
  const total = summarize(monthFacts);
  const campaignIds = [...new Set(monthFacts.map(f => f.campaign_id))];
  const rows = campaignIds.map(id => ({ id, c: campaignsById.get(id)!, s: summarize(monthFacts.filter(f => f.campaign_id === id)) })).sort((a, b) => (b.s.totals.spend ?? 0) - (a.s.totals.spend ?? 0));
  const evolution = focus ? campaignEvolution(scoped, focus) : [];
  const companyEvolution = useMemo(() => monthsWithData(scoped).slice(0, 12).reverse().map(m => { const s = summarize(scoped.filter(f => f.month === m)); return { mes: monthLabel(m).replace(/ de /, "/").slice(0, 8), investimento: s.totals.spend ?? 0, custo: s.costPerMessage === null ? null : Math.round(s.costPerMessage * 100) / 100 }; }), [scoped]);

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <label className="space-y-1 text-sm">Empresa<select className={select} value={company} onChange={e => { setCompany(e.target.value); setFocus(null); }}><option value="todas">Todas as empresas</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="space-y-1 text-sm"><span>Mês</span><div className="flex items-center gap-1">
        <Button type="button" size="icon" variant="outline" aria-label="Mês anterior" onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="month" aria-label="Mês e ano" className="w-40" value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
        <Button type="button" size="icon" variant="outline" aria-label="Próximo mês" onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div></div>
    </div>
    {available.length > 0 && <div className="flex flex-wrap gap-1.5 text-xs"><span className="py-1 text-muted-foreground">Meses com dados:</span>{available.slice(0, 12).map(m => <button key={m} type="button" onClick={() => setMonth(m)} className={"rounded-full border px-2 py-1 " + (m === month ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>{monthLabel(m)}</button>)}</div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Investimento" value={money(total.totals.spend ?? 0)} />
      <Stat label="Conversas (mensagens)" value={int(total.messagingMessages)} />
      <Stat label="Custo por mensagem" value={money(total.costPerMessage)} hint={total.messagingSpend > 0 ? `Elegível: ${brl(total.messagingSpend)} de ${brl(total.totals.spend ?? 0)}` : undefined} />
      <Stat label="Vendas · Faturamento" value={`${count(total.totals.sales)} · ${money(total.totals.revenue)}`} hint={total.costPerSale !== null ? `Custo por venda: ${brl(total.costPerSale)}` : undefined} />
    </div>
    <Notes summary={total} />

    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead><tr className="border-b text-xs text-muted-foreground">{["Campanha", "Objetivo", "Investimento", "Conversas", "Custo/msg", "Impressões", "Alcance", "Visualiz.", "ThruPlays", "Vendas", "Faturamento", "Custo/venda", "Custo/result.", ""].map(h => <th key={h} className="py-2 pr-2 text-right first:text-left [&:nth-child(2)]:text-left">{h}</th>)}</tr></thead>
        <tbody>{rows.map(({ id, c, s }) => <tr key={id} className="border-b align-top">
          <td className="py-2 pr-2"><Link href={`${basePath}/empresas/${c.company_id}?aba=campanhas`} className="font-medium hover:underline">{c.name}</Link><div className="text-[11px] text-muted-foreground">{companyName(c.company_id)}{c.campaign_status ? " · " + c.campaign_status : ""}</div></td>
          <td className="py-2 pr-2 text-xs">{s.primaryType ? resultTypeLabel(s.primaryType) : resultTypeLabel(null)}</td>
          <td className="py-2 pr-2 text-right">{money(s.totals.spend)}</td>
          <td className="py-2 pr-2 text-right">{int(s.messagingMessages)}</td>
          <td className="py-2 pr-2 text-right font-semibold">{money(s.costPerMessage)}</td>
          <td className="py-2 pr-2 text-right">{count(s.totals.impressions)}</td>
          <td className="py-2 pr-2 text-right">{count(s.totals.reach)}</td>
          <td className="py-2 pr-2 text-right">{count(s.totals.views)}</td>
          <td className="py-2 pr-2 text-right">{count(s.totals.thruplays)}</td>
          <td className="py-2 pr-2 text-right">{count(s.totals.sales)}</td>
          <td className="py-2 pr-2 text-right">{money(s.totals.revenue)}</td>
          <td className="py-2 pr-2 text-right">{money(s.costPerSale)}</td>
          <td className="py-2 pr-2 text-right">{money(costPerResult(s))}</td>
          <td className="py-2 text-right"><Button size="sm" variant={focus === id ? "default" : "ghost"} onClick={() => setFocus(focus === id ? null : id)}><LineIcon className="h-4 w-4" />Evolução</Button></td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="py-4 text-sm text-muted-foreground">Nenhum resultado registrado em {monthLabel(month)}{company !== "todas" ? " para " + companyName(company) : ""}.</p>}
    </div>

    {focus && <Card className="border-primary/30"><CardContent className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Evolução · {campaignsById.get(focus)?.name}</h3><Button size="sm" variant="ghost" onClick={() => setFocus(null)}>Fechar</Button></div>
      <EvolutionChart data={evolution.map(e => ({ mes: monthLabel(e.month), investimento: e.summary.totals.spend ?? 0, custo: e.summary.costPerMessage === null ? null : Math.round(e.summary.costPerMessage * 100) / 100 }))} />
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-left">Mês</th><th className="text-right">Investimento</th><th className="text-right">Conversas</th><th className="text-right">Custo/msg</th><th className="text-right">Variação custo</th><th className="text-right">Vendas</th><th className="text-right">Faturamento</th></tr></thead>
        <tbody>{evolution.map((e, i) => { const d = i ? diff(evolution[i - 1].summary.costPerMessage, e.summary.costPerMessage) : null; return <tr key={e.month} className="border-b"><td className="py-2">{monthLabel(e.month)}</td><td className="text-right">{money(e.summary.totals.spend)}</td><td className="text-right">{int(e.summary.messagingMessages)}</td><td className="text-right font-semibold">{money(e.summary.costPerMessage)}</td><td className={"text-right " + (d?.pct == null ? "" : d.pct <= 0 ? "text-success" : "text-destructive")}>{d?.pct == null ? dash : (d.pct > 0 ? "+" : "") + d.pct.toFixed(1).replace(".", ",") + "%"}</td><td className="text-right">{count(e.summary.totals.sales)}</td><td className="text-right">{money(e.summary.totals.revenue)}</td></tr>; })}</tbody></table></div>
    </CardContent></Card>}

    {companyEvolution.length > 1 && <div><h3 className="mb-2 text-sm font-semibold">Evolução {company === "todas" ? "geral" : "de " + companyName(company)} (últimos meses com dados)</h3><EvolutionChart data={companyEvolution} /></div>}
  </div>;
}

function EvolutionChart({ data }: { data: { mes: string; investimento: number; custo: number | null }[] }) {
  if (!data.length) return null;
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
    <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={60} tickFormatter={v => "R$" + Number(v).toLocaleString("pt-BR")} />
    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={52} tickFormatter={v => "R$" + Number(v).toLocaleString("pt-BR")} />
    <Tooltip formatter={(v, n) => [v === null || v === undefined ? dash : brl(Number(v)), n === "custo" ? "Custo por mensagem" : "Investimento"]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
    <Legend formatter={v => (v === "custo" ? "Custo por mensagem" : "Investimento")} wrapperStyle={{ fontSize: 12 }} />
    <Bar yAxisId="l" dataKey="investimento" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
    <Line yAxisId="r" dataKey="custo" stroke={CHART_COLORS[2]} strokeWidth={2} connectNulls={false} dot />
  </ComposedChart></ResponsiveContainer></div>;
}

// ------------------------------------------------------------ comparar

type Selection = { id: string; campaignId: string; period: PeriodFilter };

function Compare({ facts, companies, campaigns, companyName }: { facts: ReturnType<typeof buildHistoryFacts>["facts"]; companies: Company[]; campaigns: HistoryInput["campaigns"]; companyName: (id: string) => string }) {
  const [company, setCompany] = useState("todas");
  const [items, setItems] = useState<Selection[]>([]);
  const [draftCampaign, setDraftCampaign] = useState("");
  const [draftKind, setDraftKind] = useState<"month" | "all" | "range">("month");
  const [draftMonth, setDraftMonth] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [objectiveChoice, setObjectiveChoice] = useState<ResultType | "auto">("auto");
  const [chartMetric, setChartMetric] = useState("costPerResult");
  const withData = new Set(facts.map(f => f.campaign_id));
  const options = campaigns.filter(c => withData.has(c.id) && (company === "todas" || c.company_id === company)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const draftMonths = monthsWithData(facts.filter(f => f.campaign_id === draftCampaign));
  const name = (id: string) => campaigns.find(c => c.id === id)?.name ?? "";
  const labels = items.map(i => `${name(i.campaignId)} — ${periodLabel(i.period)}`);
  const results = items.map(i => filterFacts(facts.filter(f => f.campaign_id === i.campaignId), i.period));
  const summaries = results.map(r => summarize(r.facts));
  const auto = (summaries.find(s => s.primaryType)?.primaryType ?? normalizeObjective(campaigns.find(c => c.id === items[0]?.campaignId)?.objective) ?? "mensagens") as ResultType;
  const objective = objectiveChoice === "auto" ? auto : objectiveChoice;
  const insight = items.length >= 2 ? compareInsight(summaries, objective, labels) : null;
  const chartRow = METRIC_ROWS.find(r => r.key === chartMetric) ?? METRIC_ROWS[0];

  function add() {
    if (!draftCampaign) return toast.error("Escolha uma campanha.");
    let period: PeriodFilter;
    if (draftKind === "all") period = { kind: "all" };
    else if (draftKind === "month") { const m = draftMonth || draftMonths[0]; if (!m) return toast.error("Esta campanha não tem meses com resultados."); period = { kind: "month", month: m }; }
    else { if (!draftFrom || !draftTo || draftTo < draftFrom) return toast.error("Informe um intervalo válido."); period = { kind: "range", from: draftFrom, to: draftTo }; }
    if (items.length >= 6) return toast.error("Compare até 6 seleções por vez.");
    setItems(v => [...v, { id: crypto.randomUUID(), campaignId: draftCampaign, period }]);
  }

  return <div className="space-y-4">
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="space-y-1 text-sm">Empresa<select className={select} value={company} onChange={e => { setCompany(e.target.value); setDraftCampaign(""); }}><option value="todas">Todas</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="space-y-1 text-sm lg:col-span-2">Campanha<select className={select} value={draftCampaign} onChange={e => { setDraftCampaign(e.target.value); setDraftMonth(""); }}><option value="">Selecione…</option>{options.map(c => <option key={c.id} value={c.id}>{c.name}{company === "todas" ? " · " + companyName(c.company_id) : ""}</option>)}</select></label>
      <label className="space-y-1 text-sm">Período<select className={select} value={draftKind} onChange={e => setDraftKind(e.target.value as typeof draftKind)}><option value="month">Mês</option><option value="all">Todo o período</option><option value="range">Personalizado</option></select></label>
      {draftKind === "month" && <label className="space-y-1 text-sm">Mês<select className={select} value={draftMonth || draftMonths[0] || ""} onChange={e => setDraftMonth(e.target.value)}>{draftMonths.length ? draftMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>) : <option value="">—</option>}</select></label>}
      {draftKind === "range" && <div className="grid grid-cols-2 gap-2 text-sm"><label className="space-y-1">De<Input type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)} /></label><label className="space-y-1">Até<Input type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)} /></label></div>}
      {draftKind === "all" && <div />}
      <div className="flex items-end lg:col-span-5"><Button type="button" onClick={add}><Plus className="h-4 w-4" />Adicionar à comparação</Button><span className="ml-3 text-xs text-muted-foreground">Compare campanhas diferentes, meses diferentes ou a mesma campanha em períodos diferentes.</span></div>
    </div>

    {items.length > 0 && <div className="flex flex-wrap gap-2">{items.map((it, i) => <Badge key={it.id} variant={i === 0 ? "default" : "secondary"} className="gap-1 py-1">{i === 0 ? "Base: " : ""}{labels[i]}<button type="button" aria-label="Remover" onClick={() => setItems(v => v.filter(x => x.id !== it.id))}><Trash2 className="h-3 w-3" /></button></Badge>)}</div>}

    {items.length > 0 && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Objetivo da comparação<select className={select} value={objectiveChoice} onChange={e => setObjectiveChoice(e.target.value as typeof objectiveChoice)}><option value="auto">Automático ({resultTypeLabel(auto)})</option>{RESULT_TYPES.filter(t => t.value !== "outro" && t.value !== "alcance").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label className="space-y-1 text-sm">Indicador do gráfico<select className={select} value={chartMetric} onChange={e => setChartMetric(e.target.value)}>{METRIC_ROWS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-left">Indicador</th>{labels.map((l, i) => <th key={items[i].id} className="max-w-48 py-2 pl-3 text-right font-medium">{l}</th>)}</tr></thead>
        <tbody>{METRIC_ROWS.map(row => { const base = row.value(summaries[0], objective); return <tr key={row.key} className="border-b">
          <td className="py-2 text-muted-foreground">{row.label}{row.key === "results" ? ` (${resultMetricLabel[objective] ?? "resultados"})` : ""}</td>
          {summaries.map((s, i) => { const v = row.value(s, objective); const d = i ? diff(base, v) : null; const good = d && d.abs !== 0 ? (LOWER_IS_BETTER.has(row.key) ? d.abs < 0 : d.abs > 0) : null; return <td key={items[i].id} className="py-2 pl-3 text-right"><span className="font-medium">{fmtKind(row.kind, v)}</span>{d && <span className={"block text-[11px] " + (good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}>{(d.abs > 0 ? "+" : "") + fmtKind(row.kind, d.abs)}{d.pct !== null ? ` (${d.pct > 0 ? "+" : ""}${d.pct.toFixed(1).replace(".", ",")}%)` : ""}</span>}</td>; })}
        </tr>; })}</tbody>
      </table><p className="mt-2 text-[11px] text-muted-foreground">Diferenças em relação à primeira seleção (base). Verde = melhor para o indicador (custo menor ou volume maior); vermelho = pior. Custo por mensagem usa só o investimento dos conjuntos de mensagens.</p></div>
      <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={summaries.map((s, i) => ({ nome: labels[i].length > 28 ? labels[i].slice(0, 27) + "…" : labels[i], valor: chartRow.value(s, objective) }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={0} />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={64} />
        <Tooltip formatter={v => [v === null || v === undefined ? dash : fmtKind(chartRow.kind, Number(v)), chartRow.label]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
        <Bar dataKey="valor" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart></ResponsiveContainer></div>
      {insight && <div className="space-y-1 rounded-lg border p-3 text-sm"><p className="font-medium">Leitura da comparação · objetivo: {resultTypeLabel(objective)}</p>{insight.notes.map(n => <p key={n} className="text-muted-foreground">• {n}</p>)}<p className="text-[11px] text-muted-foreground">Nenhuma campanha é considerada melhor só por ter gastado menos: o custo só é comparado entre seleções com volume relevante de resultados do objetivo.</p></div>}
      {summaries.map((s, i) => (s.unclassifiedSpend || s.mixedSpend || results[i].partial.length) ? <div key={items[i].id}><p className="mb-1 text-xs font-medium">{labels[i]}</p><Notes summary={s} partial={results[i].partial.length} /></div> : null)}
    </>}
    {!items.length && <p className="text-sm text-muted-foreground">Adicione duas ou mais seleções para comparar.</p>}
  </div>;
}

// -------------------------------------------------------- classificação

function Classification({ input, companyName }: { input: HistoryInput; companyName: (id: string) => string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<Record<string, string | null>>({});
  const byCampaign = input.campaigns.map(c => ({ c, sets: input.adSets.filter(s => s.campaign_id === c.id) })).filter(x => x.sets.length);
  function save(setId: string, value: string) {
    const v = value || null;
    const before = local[setId];
    setLocal(m => ({ ...m, [setId]: v }));
    start(async () => {
      const r = await setCltAdSetResultTypeAction(setId, v);
      if (r.error) { toast.error(r.error); setLocal(m => ({ ...m, [setId]: before ?? null })); }
      else { toast.success(r.success); router.refresh(); }
    });
  }
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Informe o objetivo/otimização de cada conjunto quando ele for diferente do objetivo da campanha (ex.: um conjunto de ThruPlay dentro de uma campanha de mensagens). O custo por mensagem usa só o investimento dos conjuntos de <b>Mensagens</b>. Nada é calculado pelo nome da campanha.</p>
    {byCampaign.length ? byCampaign.map(({ c, sets }) => { const ct = normalizeObjective(c.objective); return <div key={c.id} className="rounded-lg border p-3">
      <p className="text-sm font-medium">{c.name} <span className="text-xs font-normal text-muted-foreground">· {companyName(c.company_id)} · objetivo da campanha: {c.objective ? `${c.objective} (${resultTypeLabel(ct)})` : "não informado"}</span></p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{sets.map(s => { const value = s.id in local ? local[s.id] : s.result_type ?? null; return <label key={s.id} className="flex flex-col gap-1 text-xs"><span className="truncate font-medium">{s.name}</span><select disabled={pending} className={select} value={value ?? ""} onChange={e => save(s.id, e.target.value)}><option value="">Igual à campanha ({resultTypeLabel(ct)})</option>{RESULT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>; })}</div>
    </div>; }) : <p className="text-sm text-muted-foreground">Nenhum conjunto de anúncios cadastrado.</p>}
  </div>;
}
