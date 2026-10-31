"use client";

import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileJson, Info, PenLine, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmSmartImportAction, previewSmartImportAction } from "@/lib/supabase/clt-import-actions";
import type { ImportIssue, ImportPreview, PreviewAd, PreviewCampaign } from "@/lib/import/validate";
import { METRIC_KEYS, METRIC_LABEL, MONEY_METRICS, type Metrics } from "@/lib/import/types";

type Company = { id: string; name: string };
type Mode = "json" | "text";

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtMetric = (key: keyof Metrics, v: number | null) => v === null ? "—" : MONEY_METRICS.has(key) ? money(v) : v.toLocaleString("pt-BR");
const fmtDate = (d: string | null) => d ? d.slice(0, 10).split("-").reverse().join("/") : "—";

const TEXT_EXAMPLE = `Empresa: IG Predial
Período: 30/09/2026 a 29/10/2026

Campanha: IG Predial | WhatsApp | Cabo Frio
Objetivo: Mensagens no WhatsApp
Início: 15/10/2026
Fim: 01/11/2026
Conjunto: Cabo Frio | Público Amplo | WhatsApp
Público: Cabo Frio | + | 15/10/26
Orçamento diário: R$ 15,00
Anúncio: Imagem 01 | Cabo Frio
Investimento: R$ 206,22
Conversas: 21
Vendas: 37
Faturamento: R$ 9.360,00`;

const ACTION_LABEL = { create: "Novo", update: "Atualiza" } as const;
function ActionBadge({ action }: { action: "create" | "update" }) {
  return <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " + (action === "create" ? "bg-emerald-500/15 text-emerald-400" : "bg-sky-500/15 text-sky-300")}>{ACTION_LABEL[action]}</span>;
}

function IssueRow({ issue, checked, onCheck }: { issue: ImportIssue; checked?: boolean; onCheck?: (v: boolean) => void }) {
  const Icon = issue.level === "error" ? XCircle : issue.level === "warning" ? AlertTriangle : Info;
  const color = issue.level === "error" ? "text-destructive" : issue.level === "warning" ? "text-amber-400" : "text-muted-foreground";
  return (
    <li className="flex items-start gap-2 py-2 text-sm">
      <Icon className={"mt-0.5 h-4 w-4 shrink-0 " + color} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs text-muted-foreground">{issue.path}</p>
        <p className="break-words">{issue.message}</p>
        {issue.requiresConfirmation && onCheck && (
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 text-sm">
            <Checkbox checked={!!checked} onCheckedChange={v => onCheck(v === true)} />
            Revisei e confirmo
          </label>
        )}
      </div>
    </li>
  );
}

function MetricsLine({ ad }: { ad: PreviewAd }) {
  if (!ad.hasMetrics) return <p className="text-xs text-muted-foreground">Sem métricas informadas.</p>;
  return (
    <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs sm:grid-cols-4">
      {METRIC_KEYS.filter(k => ad.metrics[k] !== null || k === "spend" || k === "conversations").map(k => (
        <div key={k} className="flex justify-between gap-2 sm:block"><dt className="text-muted-foreground">{METRIC_LABEL[k]}</dt><dd className={ad.metrics[k] === null ? "text-muted-foreground" : "font-medium"}>{ad.metrics[k] === null ? "não informado" : fmtMetric(k, ad.metrics[k])}</dd></div>
      ))}
    </dl>
  );
}

function CampaignCard({ c }: { c: PreviewCampaign }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex min-h-12 w-full items-start gap-2 p-3 text-left" aria-expanded={open}>
        <ChevronDown className={"mt-0.5 h-4 w-4 shrink-0 transition-transform " + (open ? "rotate-180" : "")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{c.name}</span><ActionBadge action={c.action} /></div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fmtDate(c.startsOn)} até {fmtDate(c.endsOn)}{c.datesDerived ? " (derivado dos conjuntos)" : ""} · {c.status}
            {c.dailyBudget !== null ? ` · orçamento diário ${money(c.dailyBudget)}` : ""} · {c.adSets.length} conjunto(s)
          </p>
          <p className="mt-0.5 text-xs">Anúncios: {fmtMetric("spend", c.known.spend)} · {c.known.conversations ?? "—"} conversas · {c.known.sales ?? "—"} vendas · {fmtMetric("revenue", c.known.revenue)}</p>
          {c.difference && (c.difference.spend || c.difference.conversations) ? (
            <p className="mt-0.5 text-xs text-amber-400">Total informado {fmtMetric("spend", c.reported?.spend ?? null)} / {c.reported?.conversations ?? "—"} conversas · não atribuído aos anúncios: {fmtMetric("spend", c.difference.spend)} e {c.difference.conversations ?? "—"} conversa(s)</p>
          ) : null}
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          {c.metaId && <p className="text-xs text-muted-foreground">ID Meta da campanha: {c.metaId}</p>}
          {c.adSets.map((s, j) => (
            <div key={j} className="rounded-md border-l-2 border-primary/40 bg-secondary/30 p-2">
              <div className="flex flex-wrap items-center gap-2"><span className="break-words text-sm font-medium">Conjunto: {s.name}</span><ActionBadge action={s.action} /></div>
              <p className="text-xs text-muted-foreground">
                Público: {s.audience ? <>{s.audience.name} <span className="opacity-80">({s.audience.type ?? "?"} · {s.audience.inBundle ? "deste arquivo" : "já cadastrado"} · por {s.audience.via === "external_key" ? "chave" : "nome exato"})</span></> : "não vinculado"}
                {s.dailyBudget !== null ? ` · orçamento diário ${money(s.dailyBudget)}` : ""}
              </p>
              {s.ads.map((ad, k) => (
                <div key={k} className="mt-2 rounded border bg-background/60 p-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="break-words text-sm">Anúncio: {ad.name}</span><span className="text-[11px] text-muted-foreground">{ad.format}</span><ActionBadge action={ad.action} /></div>
                  <MetricsLine ad={ad} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type LegacyHandler = { detect: (content: string) => boolean; render: (content: string) => ReactNode };

/**
 * `fixedCompany`: usado dentro da página da empresa (sem seletor).
 * `legacy`: arquivos exatamente no formato antigo seguem no fluxo antigo,
 * que não depende da migration nova.
 */
export function SmartImporter({ companies = [], fixedCompany, title, legacy, onImported }: { companies?: Company[]; fixedCompany?: Company; title?: string; legacy?: LegacyHandler; onImported?: () => void }) {
  const [companyId, setCompanyId] = useState(fixedCompany?.id ?? "");
  const [schemaHint, setSchemaHint] = useState("");
  const uid = useId();
  const [mode, setMode] = useState<Mode>("json");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  const period = periodStart && periodEnd ? { start: periodStart, end: periodEnd } : null;
  const invalidate = () => { setPreview(null); setConfirmed(new Set()); setResult(""); setError(""); setSchemaHint(""); };
  const isLegacy = useMemo(() => { if (!legacy || !content.trim()) return false; try { return legacy.detect(content); } catch { return false; } }, [legacy, content]);
  const step = (n: number) => (fixedCompany ? n - 1 : n);

  const grouped = useMemo(() => {
    const issues = preview?.issues ?? [];
    return { error: issues.filter(i => i.level === "error"), warning: issues.filter(i => i.level === "warning"), info: issues.filter(i => i.level === "info") };
  }, [preview]);
  const pendingConfirmations = (preview?.confirmationIds ?? []).filter(id => !confirmed.has(id)).length;

  async function readFile(file?: File) {
    invalidate();
    if (!file) return;
    if (file.size > 1024 * 1024) { setError("Arquivo acima de 1 MB."); return; }
    setFileName(file.name);
    setContent(await file.text());
  }

  function validate() {
    if (!companyId) { setError("Selecione a empresa."); return; }
    if ((periodStart && !periodEnd) || (!periodStart && periodEnd)) { setError("Informe início e fim do período (ou deixe os dois em branco para usar o do arquivo)."); return; }
    setError(""); setResult("");
    start(async () => {
      const r = await previewSmartImportAction({ companyId, content, period });
      if (r.error || !r.preview) { setPreview(null); setError(r.error ?? "Falha ao validar."); return; }
      setPreview(r.preview);
      setSchemaHint(r.schemaReady === false ? r.migrationHint ?? "Migration pendente." : "");
      setConfirmed(new Set());
      if (r.preview.period && !period) { setPeriodStart(r.preview.period.start); setPeriodEnd(r.preview.period.end); }
    });
  }

  function confirmImport() {
    if (!preview) return;
    start(async () => {
      const r = await confirmSmartImportAction({ companyId, content, period: preview.period, confirmed: [...confirmed] });
      if (r.error) { setError(r.error); toast.error(r.error); return; }
      setResult(r.success ?? "Importação concluída.");
      toast.success("Importação concluída.");
      setPreview(null);
      onImported?.();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          {title && <h3 className="font-semibold">{title}</h3>}
          <div className="grid gap-3 sm:grid-cols-2">
            {fixedCompany ? <p className="text-sm sm:col-span-2">Empresa: <span className="font-medium">{fixedCompany.name}</span></p> : <div className="space-y-1.5">
              <Label htmlFor={uid + "company"}>1. Empresa</Label>
              <select id={uid + "company"} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={companyId} onChange={e => { setCompanyId(e.target.value); invalidate(); }}>
                <option value="">Selecione a empresa</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>}
            <div className={"space-y-1.5" + (fixedCompany ? " sm:col-span-2" : "")}>
              <span className="text-sm font-medium">{step(2)}. Formato</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formato da importação">
                <Button type="button" variant={mode === "json" ? "default" : "outline"} className="h-11" role="radio" aria-checked={mode === "json"} onClick={() => { setMode("json"); invalidate(); }}><FileJson className="h-4 w-4" />Arquivo JSON</Button>
                <Button type="button" variant={mode === "text" ? "default" : "outline"} className="h-11" role="radio" aria-checked={mode === "text"} onClick={() => { setMode("text"); invalidate(); }}><PenLine className="h-4 w-4" />Escrever ou colar texto</Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={uid + "content"}>{step(3)}. {mode === "json" ? "Envie o arquivo (o conteúdo aparece abaixo para correções)" : "Escreva ou cole o texto (ou um JSON)"}</Label>
            {mode === "json" && <Input type="file" accept=".json,application/json" className="h-11" onChange={e => readFile(e.target.files?.[0])} />}
            {mode === "json" && fileName && <p className="text-xs text-muted-foreground">Arquivo: {fileName} — selecionar um arquivo NÃO importa nada.</p>}
            <Textarea id={uid + "content"} value={content} onChange={e => { setContent(e.target.value); if (preview) invalidate(); }} rows={mode === "text" ? 14 : 8} spellCheck={false} placeholder={mode === "text" ? TEXT_EXAMPLE : "O conteúdo do JSON aparece aqui."} className="font-mono text-xs" />
            {mode === "text" && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer py-2">Campos reconhecidos</summary>
                <p>Empresa, Período · Público salvo / personalizado / semelhante, Tipo, Chave, Origem, Porcentagem, Retenção, Cidade, Raio, Idade, Interesses, Tamanho · Campanha, ID da campanha, Objetivo, Orçamento diário, Início, Fim, Status · Conjunto, ID do conjunto, Público, Chave do público · Anúncio, ID do anúncio, Formato · Investimento, Conversas, Vendas, Faturamento, Impressões, Alcance, Cliques, Leads · Observações. Use “---” para separar blocos. “—” ou vazio = não informado (não vira zero).</p>
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { setContent(TEXT_EXAMPLE); invalidate(); }}>Inserir exemplo</Button>
              </details>
            )}
          </div>

          {isLegacy && legacy ? legacy.render(content) : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor={uid + "ps"}>Período das métricas — início</Label><Input id={uid + "ps"} type="date" className="h-11" value={periodStart} onChange={e => { setPeriodStart(e.target.value); invalidate(); }} /></div>
            <div className="space-y-1.5"><Label htmlFor={uid + "pe"}>Período das métricas — fim</Label><Input id={uid + "pe"} type="date" className="h-11" value={periodEnd} onChange={e => { setPeriodEnd(e.target.value); invalidate(); }} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Opcional para arquivos só de públicos. Os resultados ficam registrados por anúncio para esse período. Reimportar o mesmo período atualiza os mesmos registros, sem duplicar.</p>

          {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
          <Button type="button" className="h-11 w-full sm:w-auto" disabled={busy || !companyId || !content.trim()} onClick={validate}>{busy && !preview ? "Validando…" : `${step(4)}. Validar dados`}</Button>
          </>}
        </CardContent>
      </Card>

      {result && (
        <Card><CardContent className="flex items-start gap-3 p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><div><p className="font-medium">Resumo da importação</p><p className="text-sm">{result}</p></div></CardContent></Card>
      )}

      {preview && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="font-semibold">{step(5)}. Prévia — {preview.companyName}</h2>
              <p className="text-xs text-muted-foreground">Formato: {preview.sourceFormat === "text" ? "texto" : "JSON"} · Período: {preview.period ? `${fmtDate(preview.period.start)} a ${fmtDate(preview.period.end)}` : "não informado"}</p>
            </div>

            {schemaHint && <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300" role="status">Prévia somente leitura: o banco ainda não tem a estrutura do importador novo, então a gravação está bloqueada. {schemaHint} Até lá, itens já cadastrados são reconhecidos só pelo nome exato.</p>}

            <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              {([
                ["Públicos", preview.counts.audiences],
                ["Campanhas", preview.counts.campaigns],
                ["Conjuntos", preview.counts.adSets],
                ["Anúncios", preview.counts.ads],
              ] as const).map(([label, c]) => (
                <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{c.create + c.update}</p><p className="text-xs text-muted-foreground">{c.create} novos · {c.update} existentes</p></div>
              ))}
            </div>

            {preview.campaigns.length > 0 && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">Soma das métricas conhecidas dos anúncios</p>
                <p className="mt-1">{fmtMetric("spend", preview.totals.known.spend)} · {preview.totals.known.conversations ?? "—"} conversas · {preview.totals.known.sales ?? "—"} vendas · {fmtMetric("revenue", preview.totals.known.revenue)}</p>
                {(preview.totals.unallocatedSpend > 0 || preview.totals.unallocatedConversations > 0) && (
                  <p className="mt-1 text-amber-400">Não atribuído a anúncios (reconciliação, não distribuído): {money(preview.totals.unallocatedSpend)} e {preview.totals.unallocatedConversations} conversa(s). Consolidado informado: {money(Math.round(((preview.totals.known.spend ?? 0) + preview.totals.unallocatedSpend) * 100) / 100)} · {(preview.totals.known.conversations ?? 0) + preview.totals.unallocatedConversations} conversas.</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Alcance não é somado entre anúncios (pessoas únicas).</p>
              </div>
            )}

            {grouped.error.length > 0 && (
              <section><h3 className="text-sm font-semibold text-destructive">Erros ({grouped.error.length}) — corrija o conteúdo acima e valide de novo</h3><ul className="divide-y">{grouped.error.map(i => <IssueRow key={i.id} issue={i} />)}</ul></section>
            )}
            {grouped.warning.length > 0 && (
              <section><h3 className="text-sm font-semibold text-amber-400">Alertas ({grouped.warning.length}){preview.confirmationIds.length ? ` · ${pendingConfirmations} aguardando confirmação` : ""}</h3>
                <ul className="divide-y">{grouped.warning.map(i => <IssueRow key={i.id} issue={i} checked={confirmed.has(i.id)} onCheck={v => setConfirmed(old => { const n = new Set(old); if (v) n.add(i.id); else n.delete(i.id); return n; })} />)}</ul>
              </section>
            )}
            {grouped.info.length > 0 && (
              <details><summary className="cursor-pointer py-2 text-sm font-semibold text-muted-foreground">Informações e dados ausentes ({grouped.info.length})</summary><ul className="divide-y">{grouped.info.map(i => <IssueRow key={i.id} issue={i} />)}</ul></details>
            )}

            {preview.audiences.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Públicos</h3>
                <ul className="divide-y rounded-lg border">
                  {preview.audiences.map(a => (
                    <li key={a.ref} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                      <span className="min-w-0 flex-1 break-words">{a.name}</span>
                      <span className="text-xs text-muted-foreground">{a.dbType ?? "tipo?"}{a.source ? ` · origem: ${a.source.name}` : ""}{a.externalKey ? ` · ${a.externalKey}` : ""}</span>
                      <ActionBadge action={a.action} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {preview.campaigns.length > 0 && (
              <section className="space-y-2"><h3 className="text-sm font-semibold">Campanhas, conjuntos e anúncios</h3>{preview.campaigns.map((c, i) => <CampaignCard key={i} c={c} />)}</section>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-11" onClick={invalidate} disabled={busy}>Cancelar</Button>
              <Button type="button" className="h-11" disabled={busy || !!schemaHint || !preview.canImport || pendingConfirmations > 0} onClick={confirmImport}>
                {busy ? "Importando…" : schemaHint ? "Aplique a migration para importar" : !preview.canImport ? "Corrija os erros para importar" : pendingConfirmations ? `Confirme ${pendingConfirmations} alerta(s)` : `${step(6)}. Confirmar importação`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
