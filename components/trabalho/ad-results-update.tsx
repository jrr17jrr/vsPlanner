"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCltAdResultsAction } from "@/lib/supabase/clt-ad-results-actions";
import { AD_METRICS, currentTotals, primaryMetrics, type AdMetricKey, type CountedRow, type Totals } from "@/lib/clt/ad-result-update";
import type { ResultType } from "@/lib/clt/history";

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

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const isMoney = (k: AdMetricKey) => k === "spend" || k === "revenue";
const show = (k: AdMetricKey, v: number | null | undefined) => (v === null || v === undefined ? "não informado" : isMoney(k) ? money(v) : v.toLocaleString("pt-BR"));
/** Valor inicial do campo (pt-BR, sem símbolo). */
const toField = (k: AdMetricKey, v: number | null) => (v === null ? "" : isMoney(k) ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : String(v));

/** "1.234,56" / "1234.56" / "150" → número; contagens aceitam "50.100". Vazio = null (não informado). */
export function parseMetricInput(k: AdMetricKey, raw: string): number | null {
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
export function AdResultsUpdateButton({ adId, adName, rows, type, campaignStatus }: { adId: string; adName: string; rows: CountedRow[]; type: ResultType | "misto" | null; campaignStatus?: string | null }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}>Atualizar resultados</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <AdResultsForm key={adId} adId={adId} adName={adName} totals={currentTotals(rows)} type={type} campaignStatus={campaignStatus} close={() => setOpen(false)} />}
    </Dialog>
  </>;
}

function AdResultsForm({ adId, adName, totals, type, campaignStatus, close }: { adId: string; adName: string; totals: Totals; type: ResultType | "misto" | null; campaignStatus?: string | null; close: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const primary = primaryMetrics(type);
  const secondary = AD_METRICS.map((m) => m.key).filter((k) => !primary.includes(k));
  const [showAll, setShowAll] = useState(secondary.some((k) => totals[k] !== null));
  const [fields, setFields] = useState<Record<AdMetricKey, string>>(() => Object.fromEntries(AD_METRICS.map((m) => [m.key, toField(m.key, totals[m.key])])) as Record<AdMetricKey, string>);

  const parsed = Object.fromEntries(AD_METRICS.map((m) => [m.key, parseMetricInput(m.key, fields[m.key])])) as Record<AdMetricKey, number | null>;
  const invalid = AD_METRICS.filter((m) => Number.isNaN(parsed[m.key]));
  const changes = AD_METRICS.filter((m) => parsed[m.key] !== null && !Number.isNaN(parsed[m.key]) && parsed[m.key] !== totals[m.key]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (invalid.length) { toast.error(`Confira: ${invalid.map((m) => m.label).join(", ")}.`); return; }
    if (!changes.length) { toast.error("Nenhum valor mudou."); return; }
    start(async () => {
      const values = Object.fromEntries(changes.map((m) => [m.key, parsed[m.key]]));
      const r = await updateCltAdResultsAction(adId, values);
      if (r.error) toast.error(r.error);
      else { toast.success(r.success); close(); router.refresh(); }
    });
  }

  const field = (k: AdMetricKey) => {
    const m = AD_METRICS.find((x) => x.key === k)!;
    const changed = changes.some((c) => c.key === k);
    return <div key={k} className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={`ad-${adId}-${k}`} className="text-xs">{m.label}</Label>
      <Input id={`ad-${adId}-${k}`} inputMode={isMoney(k) ? "decimal" : "numeric"} placeholder="Não informado" value={fields[k]} disabled={pending}
        aria-invalid={Number.isNaN(parsed[k]) || undefined} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} />
      <p className={`text-[11px] ${Number.isNaN(parsed[k]) ? "text-destructive" : changed ? "text-primary" : "text-muted-foreground"}`}>
        {Number.isNaN(parsed[k]) ? "Número inválido" : changed ? `Atual: ${show(k, totals[k])} → ${show(k, parsed[k])}` : `Atual: ${show(k, totals[k])}`}
      </p>
    </div>;
  };

  return <DialogContent className="sm:max-w-xl">
    <DialogHeader>
      <DialogTitle>Atualizar resultados</DialogTitle>
      <p className="text-sm text-muted-foreground break-words">{adName}{campaignStatus ? ` · campanha ${campaignStatus}` : ""}</p>
    </DialogHeader>
    <form onSubmit={save} className="flex min-w-0 flex-col gap-4">
      <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">Informe os <b className="text-foreground">totais acumulados atuais</b> do anúncio (como aparecem no Gerenciador). Eles substituem os anteriores — nada é somado em dobro. Deixe vazio o que não quiser informar.</p>
      <div className="grid grid-cols-2 gap-3">{primary.map(field)}</div>
      <button type="button" className="self-start text-xs text-primary" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Menos indicadores" : "Mais indicadores"}</button>
      {showAll && <div className="grid grid-cols-2 gap-3">{secondary.map(field)}</div>}
      {changes.length > 0 && <div className="rounded-md border border-primary/40 p-3 text-xs">
        <p className="mb-1 font-medium">Vai mudar</p>
        <ul className="space-y-0.5">{changes.map((m) => <li key={m.key} className="break-words">{m.label.replace(" (R$)", "")}: {show(m.key, totals[m.key])} → <b>{show(m.key, parsed[m.key])}</b></li>)}</ul>
      </div>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={close}>Cancelar</Button>
        <Button type="submit" disabled={pending || !changes.length || invalid.length > 0}>{pending ? "Salvando…" : "Salvar resultados"}</Button>
      </DialogFooter>
    </form>
  </DialogContent>;
}

/** Histórico de "Atualizar resultados" de um anúncio (mais recente primeiro). */
export function AdResultsHistory({ updates, available }: { updates: AdResultUpdate[]; available: boolean }) {
  if (!available) return <p className="text-xs text-muted-foreground">Histórico de atualizações disponível após aplicar a migração 20261104110000_clt_ad_result_updates.sql.</p>;
  if (!updates.length) return <p className="text-sm text-muted-foreground">Nenhuma atualização de resultados ainda.</p>;
  const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const br = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
  return <ul className="space-y-2">{updates.map((u) => <li key={u.id} className="rounded-lg border p-3 text-sm">
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{when(u.created_at)}</span>{u.updated_by_name && <span>· {u.updated_by_name}</span>}<span>· período {br(u.period_start)} a {br(u.period_end)}</span>{u.mode === "ajuste" && <span className="rounded bg-muted px-1.5">ajuste</span>}</p>
    <ul className="mt-1 space-y-0.5">{AD_METRICS.filter((m) => u.updated[m.key] !== undefined).map((m) => {
      const d = u.delta[m.key] ?? 0;
      return <li key={m.key} className="break-words">{m.label.replace(" (R$)", "")}: {show(m.key, u.previous[m.key] ?? null)} → <b>{show(m.key, u.updated[m.key])}</b> <span className={d > 0 ? "text-success" : d < 0 ? "text-destructive" : "text-muted-foreground"}>({d > 0 ? "+" : d < 0 ? "−" : ""}{isMoney(m.key) ? money(Math.abs(d)) : Math.abs(d).toLocaleString("pt-BR")})</span></li>;
    })}</ul>
  </li>)}</ul>;
}
