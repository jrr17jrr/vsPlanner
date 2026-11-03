"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, FileJson, PenLine, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayKeySaoPaulo } from "@/lib/format";
import {
  parseTaskImport,
  ROUTINE_JSON_EXAMPLE,
  ROUTINE_TEXT_EXAMPLE,
  taskJsonExample,
  taskTextExample,
  validateDrafts,
  type ImportArea,
  type TaskDraft,
  type TaskImportType,
} from "@/lib/import/tasks";
import { confirmTaskImportAction, taskImportContextAction, type TaskImportContext, type TaskImportResult } from "@/lib/supabase/import-center-actions";
import { cn } from "@/lib/utils";

type Format = "text" | "json";

const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fmt = (d?: string) => (d ? d.split("-").reverse().join("/") : "—");
const KIND_LABEL = { tarefa: "Tarefa", rotina: "Rotina", campanha: "Campanha planejada" } as const;

function exampleFor(area: ImportArea, type: TaskImportType, format: Format) {
  if (type === "rotinas") return format === "text" ? ROUTINE_TEXT_EXAMPLE : ROUTINE_JSON_EXAMPLE;
  return format === "text" ? taskTextExample(area) : taskJsonExample(area);
}

function DraftCard({
  index,
  draft,
  issues,
  duplicate,
  valid,
  selected,
  companies,
  showCompany,
  onSelect,
  onChange,
}: {
  index: number;
  draft: TaskDraft;
  issues: { level: "error" | "warning"; message: string }[];
  duplicate: boolean;
  valid: boolean;
  selected: boolean;
  companies: { id: string; name: string }[];
  showCompany: boolean;
  onSelect: (v: boolean) => void;
  onChange: (patch: Partial<TaskDraft>) => void;
}) {
  const [open, setOpen] = useState(!valid);
  const uid = useId();
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return (
    <li className={cn("rounded-lg border", !valid ? "border-destructive/50" : duplicate ? "border-amber-500/40" : "border-border")}>
      <div className="flex items-start gap-3 p-3">
        <Checkbox className="mt-1" checked={selected} disabled={!valid} onCheckedChange={(v) => onSelect(v === true)} aria-label={`Importar ${draft.title || `item ${index + 1}`}`} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="break-words font-medium">{draft.title || <em className="text-muted-foreground">sem título</em>}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{KIND_LABEL[draft.kind]}</span>
            {draft.priority === "importante" && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">Importante</span>}
            {duplicate && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">Possível duplicado</span>}
            {!valid && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">{errors.length} erro(s)</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {draft.companyName ? `${draft.companyName} · ` : ""}
            {draft.kind === "rotina"
              ? `${draft.weekdays.length ? draft.weekdays.map((d) => WEEKDAY[d]).join(", ") : `em ${fmt(draft.executionDate)}`} · ${draft.time ?? "--:--"}${draft.endTime ? `–${draft.endTime}` : ""}`
              : draft.weekdays.length
                ? `Toda ${draft.weekdays.map((d) => WEEKDAY[d]).join(", ")}${draft.time ? ` · ${draft.time}` : ""}`
                : `Execução: ${fmt(draft.executionDate)}${draft.time ? ` ${draft.time}` : ""} · Prazo final: ${fmt(draft.deadlineDate)}`}
            {draft.subtasks.length ? ` · ${draft.subtasks.length} subtarefa(s)` : ""}
          </p>
        </button>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>
      {open && (
        <div className="space-y-3 border-t p-3">
          {draft.recognized.length > 0 && (
            <p className="text-xs text-muted-foreground">Campos reconhecidos: {draft.recognized.join(" · ")}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={uid + "t"}>Título</Label>
              <Input id={uid + "t"} className="h-11" value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
            </div>
            {showCompany && (
              <div className="space-y-1">
                <Label htmlFor={uid + "c"}>Empresa</Label>
                <select id={uid + "c"} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={companies.find((c) => c.name.toLowerCase() === (draft.companyName ?? "").toLowerCase())?.name ?? (draft.companyName ? "__unknown" : "")} onChange={(e) => onChange({ companyName: e.target.value || undefined })}>
                  <option value="">{draft.kind === "campanha" ? "Selecione a empresa" : "Sem empresa (tarefa geral)"}</option>
                  {draft.companyName && !companies.some((c) => c.name.toLowerCase() === draft.companyName!.toLowerCase()) && <option value="__unknown" disabled>{draft.companyName} (não encontrada)</option>}
                  {companies.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            )}
            {draft.kind !== "rotina" && (
              <div className="space-y-1">
                <Label htmlFor={uid + "p"}>Prioridade</Label>
                <select id={uid + "p"} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={draft.priority} onChange={(e) => onChange({ priority: e.target.value === "importante" ? "importante" : "normal" })}>
                  <option value="normal">Normal</option>
                  <option value="importante">Importante</option>
                </select>
              </div>
            )}
            {!draft.weekdays.length && (
              <div className="space-y-1">
                <Label htmlFor={uid + "e"}>{draft.kind === "rotina" ? "Data" : draft.kind === "campanha" ? "Início" : "Data de execução"}</Label>
                <Input id={uid + "e"} type="date" className="h-11" value={draft.executionDate ?? ""} onChange={(e) => onChange({ executionDate: e.target.value || undefined })} />
              </div>
            )}
            {draft.kind === "tarefa" && !draft.weekdays.length && (
              <div className="space-y-1">
                <Label htmlFor={uid + "d"}>Prazo final</Label>
                <Input id={uid + "d"} type="date" className="h-11" value={draft.deadlineDate ?? ""} onChange={(e) => onChange({ deadlineDate: e.target.value || undefined })} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor={uid + "h"}>{draft.kind === "rotina" ? "Início" : "Horário"}</Label>
              <Input id={uid + "h"} type="time" className="h-11" value={draft.time ?? ""} onChange={(e) => onChange({ time: e.target.value || undefined })} />
            </div>
          </div>
          {draft.description && <p className="whitespace-pre-wrap rounded-md bg-secondary/40 p-2 text-xs">{draft.description}</p>}
          {draft.subtasks.length > 0 && (
            <ul className="space-y-1 text-sm">
              {draft.subtasks.map((s, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">☐</span> {s.title}{s.dueDate ? <span className="text-xs text-muted-foreground"> · prazo {fmt(s.dueDate)}</span> : null}
                  {s.children.length > 0 && <ul className="ml-5 text-xs text-muted-foreground">{s.children.map((c, j) => <li key={j}>☐ {c.title}</li>)}</ul>}
                </li>
              ))}
            </ul>
          )}
          {(errors.length > 0 || warnings.length > 0) && (
            <ul className="space-y-1">
              {errors.map((i, k) => <li key={`e${k}`} className="flex items-start gap-2 text-sm text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</li>)}
              {warnings.map((i, k) => <li key={`w${k}`} className="flex items-start gap-2 text-sm text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Importação de tarefas/subtarefas e rotinas na Central. Prévia
 * instantânea no navegador; ao confirmar, o servidor refaz tudo
 * (lib/supabase/import-center-actions.ts).
 */
export function TaskImporter({ area, type, areaLabel }: { area: ImportArea; type: TaskImportType; areaLabel: string }) {
  const router = useRouter();
  const uid = useId();
  const [format, setFormat] = useState<Format>("text");
  const [content, setContent] = useState(() => exampleFor(area, type, "text"));
  const [fileName, setFileName] = useState("");
  const [drafts, setDrafts] = useState<TaskDraft[] | null>(null);
  const [context, setContext] = useState<TaskImportContext | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [result, setResult] = useState<TaskImportResult | null>(null);
  const [busy, start] = useTransition();
  const showCompany = area !== "pessoal";

  const validated = useMemo(
    () => (drafts && context ? validateDrafts(drafts, { area, type, companies: context.companies, existing: context.existing }) : []),
    [drafts, context, area, type]
  );
  const stats = useMemo(() => ({
    total: validated.length,
    valid: validated.filter((v) => v.valid).length,
    errors: validated.filter((v) => !v.valid).length,
    duplicates: validated.filter((v) => v.duplicate).length,
    selected: validated.filter((v, i) => v.valid && selected.has(i)).length,
    companies: [...new Set(validated.map((v) => v.draft.companyName).filter(Boolean))] as string[],
  }), [validated, selected]);

  function reset() { setDrafts(null); setResult(null); setError(""); }

  function switchFormat(next: Format) {
    if (next === format) return;
    // Troca o exemplo só se o campo ainda tiver o exemplo do outro formato (ou estiver vazio).
    const untouched = !content.trim() || content === exampleFor(area, type, format);
    setFormat(next);
    if (untouched) setContent(next === "json" ? "" : exampleFor(area, type, "text"));
    setFileName("");
    reset();
  }

  async function readFile(file?: File) {
    reset();
    if (!file) return;
    if (file.size > 1024 * 1024) { setError("Arquivo acima de 1 MB."); return; }
    setFileName(file.name);
    setContent(await file.text());
  }

  function preview() {
    setError(""); setResult(null);
    const parsed = parseTaskImport(content, type, todayKeySaoPaulo());
    if (!parsed.ok) { setDrafts(null); setError(parsed.error); return; }
    start(async () => {
      const r = await taskImportContextAction({ area, type });
      if (r.error || !r.context) { setError(r.error ?? "Falha ao montar a prévia."); return; }
      const v = validateDrafts(parsed.drafts, { area, type, ...r.context });
      setContext(r.context);
      setDrafts(parsed.drafts);
      // Começa com os válidos e não duplicados marcados.
      setSelected(new Set(v.map((x, i) => (x.valid && !x.duplicate ? i : -1)).filter((i) => i >= 0)));
    });
  }

  function update(i: number, patch: Partial<TaskDraft>) {
    setDrafts((prev) => prev && prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  function confirm() {
    if (!drafts) return;
    const chosen = [...selected].filter((i) => validated[i]?.valid);
    if (!chosen.length) { setError("Selecione pelo menos um item válido."); return; }
    start(async () => {
      const r = await confirmTaskImportAction({ area, type, drafts, selected: chosen });
      if (r.error) { setError(r.error); toast.error(r.error); return; }
      setResult(r);
      setDrafts(null);
      if (r.failed.length) toast.error(`Importação interrompida: ${r.failed[0].message}`);
      else toast.success(`${r.created} registro(s) criado(s).`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Formato</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formato">
              <Button type="button" variant={format === "text" ? "default" : "outline"} className="h-11" role="radio" aria-checked={format === "text"} onClick={() => switchFormat("text")}><PenLine className="h-4 w-4" />Texto</Button>
              <Button type="button" variant={format === "json" ? "default" : "outline"} className="h-11" role="radio" aria-checked={format === "json"} onClick={() => switchFormat("json")}><FileJson className="h-4 w-4" />JSON</Button>
            </div>
          </div>

          {format === "json" && (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="file" accept=".json,application/json" className="h-11 max-w-full sm:max-w-xs" onChange={(e) => readFile(e.target.files?.[0])} aria-label="Enviar arquivo JSON" />
              <Button type="button" variant="outline" className="h-11" onClick={() => { setContent(exampleFor(area, type, "json")); setFileName(""); reset(); }}>
                <Copy className="h-4 w-4" /> Ver exemplo válido
              </Button>
              {fileName && <p className="w-full text-xs text-muted-foreground">Arquivo: {fileName} — nada é gravado antes da confirmação.</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={uid + "content"}>{format === "text" ? "Escreva ou cole (o exemplo pode ser substituído)" : "Cole o JSON ou envie o arquivo"}</Label>
            <Textarea
              id={uid + "content"}
              value={content}
              onChange={(e) => { setContent(e.target.value); if (drafts) reset(); }}
              rows={format === "text" ? 16 : 12}
              spellCheck={false}
              placeholder={format === "json" ? exampleFor(area, type, "json") : undefined}
              className="min-h-[14rem] font-mono text-xs sm:text-sm"
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer py-2">Formatos aceitos</summary>
              {type === "rotinas" ? (
                <p>Texto: Atividade, Dias (seg, qua, sex · todos os dias · dias úteis) ou Data (dd/mm/aaaa), Início, Fim, Observações. Separe registros com “---”. JSON: lista ou {"{ \"rotinas\": [...] }"} com atividade, dias, data, inicio, fim, observacoes.</p>
              ) : (
                <p>Texto: {area !== "pessoal" && "Empresa, "}Título, Descrição, Prioridade (Normal/Importante), Data de execução, Horário, Prazo final, Dias (repetição semanal), Observações e Subtarefas (linhas com “-”; recuo = checklist; “| prazo: dd/mm/aaaa” opcional). Separe registros com “---”. JSON: lista, {"{ \"tarefas\": [...] }"} ou o antigo {"{ \"items\": [...] }"} do Planejamento{area !== "pessoal" && " (itens com orçamento/objetivo viram campanhas planejadas)"}.</p>
              )}
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { setContent(exampleFor(area, type, format)); reset(); }}>Restaurar exemplo</Button>
            </details>
          </div>

          {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
          <Button type="button" className="h-11 w-full sm:w-auto" disabled={busy || !content.trim()} onClick={preview}>{busy && !drafts ? "Lendo…" : "Ver prévia"}</Button>
        </CardContent>
      </Card>

      {drafts && context && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <h3 className="font-semibold">Prévia — nada foi gravado ainda</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-md border p-2"><dt className="text-xs text-muted-foreground">Destino</dt><dd className="font-medium">{areaLabel}</dd></div>
                <div className="rounded-md border p-2"><dt className="text-xs text-muted-foreground">Tipo</dt><dd className="font-medium">{type === "rotinas" ? "Rotinas" : "Tarefas e subtarefas"}</dd></div>
                <div className="rounded-md border p-2"><dt className="text-xs text-muted-foreground">Itens</dt><dd className="font-medium">{stats.total} · {stats.valid} válidos</dd></div>
                <div className="rounded-md border p-2"><dt className="text-xs text-muted-foreground">Erros / duplicados</dt><dd className="font-medium">{stats.errors} / {stats.duplicates}</dd></div>
              </dl>
              {showCompany && <p className="mt-2 text-xs text-muted-foreground">Empresa(s): {stats.companies.length ? stats.companies.join(", ") : "nenhuma (tarefas gerais)"}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setSelected(new Set(validated.map((v, i) => (v.valid ? i : -1)).filter((i) => i >= 0)))}>Marcar todos os válidos</Button>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setSelected(new Set())}>Desmarcar todos</Button>
            </div>
            <ul className="space-y-2">
              {validated.map((v, i) => (
                <DraftCard
                  key={i}
                  index={i}
                  draft={v.draft}
                  issues={v.issues}
                  duplicate={v.duplicate}
                  valid={v.valid}
                  selected={v.valid && selected.has(i)}
                  companies={context.companies}
                  showCompany={showCompany}
                  onSelect={(on) => setSelected((prev) => { const n = new Set(prev); if (on) n.add(i); else n.delete(i); return n; })}
                  onChange={(patch) => update(i, patch)}
                />
              ))}
            </ul>
            <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">{stats.selected} de {stats.total} selecionado(s){stats.errors ? ` · ${stats.errors} com erro não serão importados` : ""}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" onClick={reset}>Cancelar</Button>
                <Button type="button" className="h-11 flex-1 sm:flex-none" disabled={busy || stats.selected === 0} onClick={confirm}>{busy ? "Importando…" : `Confirmar importação (${stats.selected})`}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              {result.failed.length ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />}
              <div>
                <p className="font-medium">Resumo da importação</p>
                <p className="text-sm text-muted-foreground">Criados: {result.created} · Atualizados: {result.updated} · Ignorados: {result.ignored.length} · Com erro: {result.failed.length}{result.notProcessed.length ? ` · Não processados: ${result.notProcessed.length}` : ""}</p>
              </div>
            </div>
            {result.warnings.map((w, i) => <p key={i} className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-200">{w}</p>)}
            {result.failed.map((f, i) => <p key={i} className="text-sm text-destructive">Erro em “{f.title}”: {f.message}</p>)}
            {result.notProcessed.length > 0 && <p className="text-sm text-muted-foreground">Não processados (nada gravado neles): {result.notProcessed.join(", ")}</p>}
            {result.ignored.length > 0 && (
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Ignorados ({result.ignored.length})</summary><ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{result.ignored.map((g, i) => <li key={i}>{g.title} — {g.reason}</li>)}</ul></details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
