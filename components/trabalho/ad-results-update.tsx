"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moveCltAdResultUpdatePeriodAction, updateCltAdResultsAction } from "@/lib/supabase/clt-ad-results-actions";
import { AD_METRICS, currentTotals, isExtraMetric, monthReference, primaryMetrics, type AdMetricKey, type CountedRow, type Totals } from "@/lib/clt/ad-result-update";
import type { ResultType } from "@/lib/clt/history";
import { SECTION_TITLES, type MetricSection } from "@/lib/clt/result-metrics";
import { fmtRate, isRateKey, parseRate } from "@/lib/clt/video-rates";
import { CollapsibleSection } from "@/components/trabalho/company/collapsible-section";

export type AdResultUpdate = {
  id: string;
  creative_id: string;
  period_start: string;
  period_end: string;
  mode: "novo_periodo" | "ajuste";
  previous: Partial<Record<AdMetricKey, number | null>>;
  updated: Partial<Record<AdMetricKey, number>>;
  delta: Partial<Record<AdMetricKey, number>>;
  updated_by_name: string | null;
  created_at: string;
};

export type AdResultPeriodChange = { id: string; update_id: string; old_start: string; old_end: string; new_start: string; new_end: string; changed_by_name: string | null; created_at: string };

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dBR = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const monthName = (m: string) => { const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T12:00:00Z")); return s.charAt(0).toUpperCase() + s.slice(1); };
export const describeReference = (r: { start: string; end: string }) => (r.start === r.end ? dBR(r.start) : `${dBR(r.start)} a ${dBR(r.end)}`);

type RefMode = "date" | "range" | "month";
/**
 * "Período dos resultados" (quando os resultados aconteceram): data
 * específica, intervalo ou mês de referência. A data do REGISTRO é sempre
 * o momento do lançamento (fica no histórico).
 */
export function ReferencePeriodFields({ onChange, initial, idPrefix }: { onChange: (ref: { start: string; end: string } | null) => void; initial?: { start: string; end: string }; idPrefix: string }) {
  const today = todaySP();
  const initMonth = initial && initial.start.endsWith("-01") && initial.start.slice(0, 7) === initial.end.slice(0, 7) && monthReference(initial.start.slice(0, 7), today).end === initial.end;
  const [mode, setMode] = useState<RefMode>(initial ? (initMonth ? "month" : initial.start === initial.end ? "date" : "range") : "month");
  const [date, setDate] = useState(initial?.end ?? today);
  const [from, setFrom] = useState(initial?.start ?? today.slice(0, 7) + "-01");
  const [to, setTo] = useState(initial?.end ?? today);
  const [month, setMonth] = useState(initial ? initial.start.slice(0, 7) : today.slice(0, 7));
  const build = (m: RefMode, v: { date: string; from: string; to: string; month: string }) =>
    m === "date" ? (v.date ? { start: v.date, end: v.date } : null) : m === "range" ? (v.from && v.to ? { start: v.from, end: v.to } : null) : v.month ? monthReference(v.month, today) : null;
  const current = build(mode, { date, from, to, month });
  function set(p: Partial<{ mode: RefMode; date: string; from: string; to: string; month: string }>) {
    const next = { mode, date, from, to, month, ...p };
    if (p.mode) setMode(p.mode); if (p.date !== undefined) setDate(p.date); if (p.from !== undefined) setFrom(p.from); if (p.to !== undefined) setTo(p.to); if (p.month !== undefined) setMonth(p.month);
    onChange(build(next.mode, next));
  }
  const field = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
  const wrap = "flex min-w-0 flex-col gap-1 text-xs text-muted-foreground";
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Tipo de período dos resultados">
      {([["date", "Data"], ["range", "Intervalo"], ["month", "Mês"]] as const).map(([m, l]) => <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} aria-pressed={mode === m} className="h-9" onClick={() => set({ mode: m })}>{l}</Button>)}
    </div>
    {mode === "date" && <label className={wrap}>Data dos resultados<input id={`${idPrefix}-data`} className={field} type="date" max={today} value={date} onChange={(e) => set({ date: e.target.value })} /></label>}
    {mode === "range" && <div className="grid grid-cols-2 gap-2"><label className={wrap}>De<input className={field} type="date" max={to || today} value={from} onChange={(e) => set({ from: e.target.value })} /></label><label className={wrap}>Até<input className={field} type="date" min={from || undefined} max={today} value={to} onChange={(e) => set({ to: e.target.value })} /></label></div>}
    {mode === "month" && <label className={wrap}>Mês de referência<input className={field} type="month" max={today.slice(0, 7)} value={month} onChange={(e) => set({ month: e.target.value })} /></label>}
    {current && <p className="text-[11px] text-muted-foreground">Os resultados contam em: <b className="text-foreground">{mode === "month" ? monthName(month) : describeReference(current)}</b>{mode === "month" ? ` (${describeReference(current)})` : ""}.</p>}
  </div>;
}
const isMoney = (k: AdMetricKey) => k === "spend" || k === "revenue";
const show = (k: AdMetricKey, v: number | null | undefined) => (v === null || v === undefined ? "não informado" : isRateKey(k) ? fmtRate(v) : isMoney(k) ? money(v) : v.toLocaleString("pt-BR"));
/** Valor inicial do campo (pt-BR, sem símbolo). */
const toField = (k: AdMetricKey, v: number | null) => (v === null ? "" : isMoney(k) || isRateKey(k) ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : String(v));

/** "1.234,56" / "1234.56" / "150" → número; contagens aceitam "50.100"; taxas aceitam "35,75" ou "35,75%". Vazio = null (não informado). */
export function parseMetricInput(k: AdMetricKey, raw: string): number | null {
  if (isRateKey(k)) { const r = parseRate(raw); return r === undefined ? NaN : r; }
  const s = raw.trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  if (!isMoney(k)) { const t = s.replace(/\./g, ""); return /^\d+$/.test(t) ? Number(t) : NaN; }
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN;
}

/**
 * Botão + formulário "Atualizar resultados" de UM anúncio. A pessoa informa
 * os NOVOS TOTAIS acumulados (não a diferença); campo vazio = não informado.
 */
export function AdResultsUpdateButton({ adId, adName, rows, type, campaignStatus, extrasAvailable = true }: { adId: string; adName: string; rows: CountedRow[]; type: ResultType | "misto" | null; campaignStatus?: string | null; extrasAvailable?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}>Atualizar resultados</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <AdResultsForm key={adId} adId={adId} adName={adName} totals={currentTotals(rows)} type={type} campaignStatus={campaignStatus} extrasAvailable={extrasAvailable} close={() => setOpen(false)} />}
    </Dialog>
  </>;
}

const SECTIONS: MetricSection[] = ["principal", "engajamento", "video"];

/**
 * Campos do formulário em três seções recolhíveis: Resultados principais
 * (aberta), Engajamento e Vídeo (fechadas). Fechar uma seção não apaga nada
 * (o conteúdo continua montado). Todos os campos são opcionais.
 */
export function AdResultsFields({ adId, totals, type, fields, setField, pending = false, extrasAvailable = true }: { adId: string; totals: Totals; type: ResultType | "misto" | null; fields: Record<AdMetricKey, string>; setField: (k: AdMetricKey, v: string) => void; pending?: boolean; extrasAvailable?: boolean }) {
  // Dentro de "Resultados principais", os campos do tipo de resultado do conjunto vêm primeiro.
  const order = primaryMetrics(type);
  const rank = (k: AdMetricKey) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  const keysOf = (s: MetricSection) => {
    const keys = AD_METRICS.filter((m) => m.section === s).map((m) => m.key);
    return s === "principal" ? [...keys].sort((a, b) => rank(a) - rank(b)) : keys;
  };
  const parsedOf = (k: AdMetricKey) => parseMetricInput(k, fields[k]);
  const changedOf = (k: AdMetricKey) => { const p = parsedOf(k); return p !== null && !Number.isNaN(p) && p !== totals[k]; };
  const field = (k: AdMetricKey) => {
    const m = AD_METRICS.find((x) => x.key === k)!;
    const p = parsedOf(k);
    const locked = !extrasAvailable && isExtraMetric(k);
    return <div key={k} className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={`ad-${adId}-${k}`} className="text-xs">{m.label}</Label>
      <Input id={`ad-${adId}-${k}`} inputMode={isMoney(k) || isRateKey(k) ? "decimal" : "numeric"} placeholder={isRateKey(k) ? "Ex.: 35,75" : "Não informado"} value={fields[k]} disabled={pending || locked}
        aria-invalid={Number.isNaN(p) || undefined} onChange={(e) => setField(k, e.target.value)} />
      <p className={`text-[11px] ${Number.isNaN(p) ? "text-destructive" : changedOf(k) ? "text-primary" : "text-muted-foreground"}`}>
        {Number.isNaN(p) ? (isRateKey(k) ? "Percentual entre 0 e 100, até 2 casas (ex.: 35,75)" : "Número inválido") : changedOf(k) ? `Atual: ${show(k, totals[k])} → ${show(k, p)}` : `Atual: ${show(k, totals[k])}`}
      </p>
    </div>;
  };
  return <div className="flex min-w-0 flex-col gap-2">{SECTIONS.map((s) => {
    const keys = keysOf(s);
    const changed = keys.filter(changedOf).length;
    const invalid = keys.filter((k) => Number.isNaN(parsedOf(k))).length;
    const informed = keys.filter((k) => totals[k] !== null).length;
    const locked = !extrasAvailable && keys.some(isExtraMetric);
    const summary = invalid ? `${invalid} campo(s) com número inválido` : changed ? `${changed} campo(s) alterado(s)` : locked ? "Campos novos disponíveis após aplicar a migração 20261106100000" : `${keys.length} campos · ${informed} informado(s) · opcionais`;
    return <CollapsibleSection key={s} compact className="shadow-none" title={SECTION_TITLES[s]} defaultOpen={s === "principal"} summary={<span className={invalid ? "text-destructive" : changed ? "text-primary" : undefined}>{summary}</span>}>
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">{keys.map(field)}</div>
      {s === "engajamento" && <p className="mt-2 text-[11px] text-muted-foreground">Novos seguidores atribuídos aos anúncios (Meta Ads) — não é o total de seguidores do Instagram. Cliques no link não contam como conversas.</p>}
      {s === "video" && <p className="mt-2 text-[11px] text-muted-foreground">Taxa de Gancho e Taxa de Retenção: informe o percentual como aparece no Meta Ads (ex.: 35,75). Ele é salvo exatamente assim — nada é calculado, e o novo valor substitui o anterior (não soma).</p>}
    </CollapsibleSection>;
  })}</div>;
}

function AdResultsForm({ adId, adName, totals, type, campaignStatus, extrasAvailable, close }: { adId: string; adName: string; totals: Totals; type: ResultType | "misto" | null; campaignStatus?: string | null; extrasAvailable: boolean; close: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fields, setFields] = useState<Record<AdMetricKey, string>>(() => Object.fromEntries(AD_METRICS.map((m) => [m.key, toField(m.key, totals[m.key])])) as Record<AdMetricKey, string>);
  const [reference, setReference] = useState<{ start: string; end: string } | null>(() => monthReference(todaySP().slice(0, 7), todaySP()));

  const parsed = Object.fromEntries(AD_METRICS.map((m) => [m.key, parseMetricInput(m.key, fields[m.key])])) as Record<AdMetricKey, number | null>;
  const invalid = AD_METRICS.filter((m) => Number.isNaN(parsed[m.key]));
  const changes = AD_METRICS.filter((m) => parsed[m.key] !== null && !Number.isNaN(parsed[m.key]) && parsed[m.key] !== totals[m.key]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (invalid.length) { toast.error(`Confira: ${invalid.map((m) => m.label).join(", ")}.`); return; }
    if (!changes.length) { toast.error("Nenhum valor mudou."); return; }
    if (!reference) { toast.error("Escolha o período dos resultados."); return; }
    start(async () => {
      const values = Object.fromEntries(changes.map((m) => [m.key, parsed[m.key]]));
      const r = await updateCltAdResultsAction(adId, values, reference);
      if (r.error) toast.error(r.error);
      else { toast.success(r.success); close(); router.refresh(); }
    });
  }

  return <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-xl">
    <DialogHeader>
      <DialogTitle>Atualizar resultados</DialogTitle>
      <p className="text-sm text-muted-foreground break-words">{adName}{campaignStatus ? ` · campanha ${campaignStatus}` : ""}</p>
    </DialogHeader>
    <form onSubmit={save} className="flex min-w-0 flex-col gap-4">
      <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">Informe os <b className="text-foreground">totais acumulados atuais</b> do anúncio (como aparecem no Gerenciador). Eles substituem os anteriores — nada é somado em dobro. Deixe vazio o que não quiser informar.</p>
      <div className="rounded-md border border-border p-3">
        <p className="mb-2 text-sm font-medium">Período dos resultados</p>
        <ReferencePeriodFields idPrefix={`ad-${adId}-ref`} onChange={setReference} />
        <p className="mt-2 text-[11px] text-muted-foreground">Quando os resultados aconteceram — é o que vale nos filtros e relatórios. A data do registro (hoje) fica no histórico.</p>
      </div>
      <AdResultsFields adId={adId} totals={totals} type={type} fields={fields} setField={(k, v) => setFields((f) => ({ ...f, [k]: v }))} pending={pending} extrasAvailable={extrasAvailable} />
      {changes.length > 0 && <div className="rounded-md border border-primary/40 p-3 text-xs">
        <p className="mb-1 font-medium">Vai mudar</p>
        <ul className="space-y-0.5">{changes.map((m) => <li key={m.key} className="break-words">{m.label.replace(" (R$)", "")}: {show(m.key, totals[m.key])} → <b>{show(m.key, parsed[m.key])}</b></li>)}</ul>
      </div>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={close}>Cancelar</Button>
        <Button type="submit" disabled={pending || !changes.length || invalid.length > 0 || !reference}>{pending ? "Salvando…" : "Salvar resultados"}</Button>
      </DialogFooter>
    </form>
  </DialogContent>;
}

/**
 * Histórico de "Atualizar resultados" de um anúncio (mais recente primeiro):
 * data do REGISTRO, usuário, período de REFERÊNCIA, antes → depois, e as
 * correções de período ("Editar período").
 */
export function AdResultsHistory({ updates, available, changes = [], editable = true }: { updates: AdResultUpdate[]; available: boolean; changes?: AdResultPeriodChange[]; editable?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [ref, setRef] = useState<{ start: string; end: string } | null>(null);
  if (!available) return <p className="text-xs text-muted-foreground">Histórico de atualizações disponível após aplicar a migração 20261104110000_clt_ad_result_updates.sql.</p>;
  if (!updates.length) return <p className="text-sm text-muted-foreground">Nenhuma atualização de resultados ainda.</p>;
  const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  function save(u: AdResultUpdate) {
    if (!ref) { toast.error("Escolha o novo período."); return; }
    if (ref.start === u.period_start.slice(0, 10) && ref.end === u.period_end.slice(0, 10)) { toast.error("O novo período é igual ao atual."); return; }
    start(async () => {
      const r = await moveCltAdResultUpdatePeriodAction(u.id, ref);
      if (r.error) toast.error(r.error);
      else { toast.success(r.success); setEditing(null); router.refresh(); }
    });
  }
  return <ul className="space-y-2">{updates.map((u) => {
    const fixes = changes.filter((c) => c.update_id === u.id);
    const current = { start: u.period_start.slice(0, 10), end: u.period_end.slice(0, 10) };
    return <li key={u.id} className="min-w-0 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
          <p><span className="font-medium text-foreground">Período dos resultados: {describeReference(current)}</span>{u.mode === "ajuste" && <span className="ml-2 rounded bg-muted px-1.5">ajuste</span>}</p>
          <p>Registrado em {when(u.created_at)}{u.updated_by_name ? ` por ${u.updated_by_name}` : ""}</p>
        </div>
        {editable && editing !== u.id && <Button type="button" size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => { setEditing(u.id); setRef(current); }}>Editar período</Button>}
      </div>
      <ul className="mt-1 space-y-0.5">{AD_METRICS.filter((m) => u.updated[m.key] !== undefined).map((m) => {
        const d = u.delta[m.key] ?? 0;
        // Taxa: substituída (o histórico guarda o valor novo, não uma diferença).
        if (m.rate) return <li key={m.key} className="break-words">{m.label.replace(" (%)", "")}: {show(m.key, u.previous[m.key] ?? null)} → <b>{show(m.key, u.updated[m.key])}</b> <span className="text-muted-foreground">(informada)</span></li>;
        return <li key={m.key} className="break-words">{m.label.replace(" (R$)", "")}: {show(m.key, u.previous[m.key] ?? null)} → <b>{show(m.key, u.updated[m.key])}</b> <span className={d > 0 ? "text-success" : d < 0 ? "text-destructive" : "text-muted-foreground"}>({d > 0 ? "+" : d < 0 ? "−" : ""}{isMoney(m.key) ? money(Math.abs(d)) : Math.abs(d).toLocaleString("pt-BR")})</span></li>;
      })}</ul>
      {fixes.length > 0 && <ul className="mt-2 space-y-0.5 border-t pt-2 text-[11px] text-muted-foreground">{fixes.map((c) => <li key={c.id}>Período corrigido de {describeReference({ start: c.old_start, end: c.old_end })} para <b className="text-foreground">{describeReference({ start: c.new_start, end: c.new_end })}</b> em {when(c.created_at)}{c.changed_by_name ? ` por ${c.changed_by_name}` : ""}.</li>)}</ul>}
      {editing === u.id && <div className="mt-3 space-y-2 rounded-md border border-primary/40 p-3">
        <p className="text-xs font-medium">Novo período destes resultados</p>
        <ReferencePeriodFields idPrefix={`edit-${u.id}`} initial={current} onChange={setRef} />
        <p className="text-[11px] text-muted-foreground">Só muda QUANDO estes resultados contam. O total do anúncio continua o mesmo e nada é somado de novo.</p>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={pending || !ref} onClick={() => save(u)}>{pending ? "Salvando…" : "Salvar período"}</Button><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditing(null)}>Cancelar</Button></div>
      </div>}
    </li>;
  })}</ul>;
}
