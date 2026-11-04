import type { ImportAd } from "./types";
import { BASE_TO_AD_KEY, EXTRA_IMPORT_KEYS, EXTRA_IMPORT_LABEL, METRIC_KEYS, METRIC_LABEL } from "./types";

/**
 * Atualização de métricas COM período num anúncio já cadastrado — puro.
 *
 * Os valores do texto são os resultados DAQUELE período (não totais
 * acumulados). Regras:
 *  1. Registro com o MESMO período → atualiza só as colunas informadas
 *     (sobrescreve, nunca soma; as demais ficam como estão).
 *  2. Nenhum registro sobreposto → cria o registro do período (só com as
 *     colunas informadas).
 *  3. Períodos sobrepostos mas diferentes → NADA é criado: a pessoa escolhe
 *     qual registro atualizar ou corrige o período. Sem escolha válida,
 *     bloqueia.
 *  4. Registros de "Atualizar resultados" (`manual_update`) guardam
 *     DIFERENÇAS, não totais do período — nunca são sobrescritos aqui.
 */
export type PeriodRow = { id: string; period_start: string; period_end: string; source: string | null } & Record<string, unknown>;

export type PeriodOption = { id: string; start: string; end: string; source: string | null; selectable: boolean; reason: string | null };

export type PeriodTarget =
  | { kind: "update_row"; rowId: string; start: string; end: string; chosen: boolean; options: PeriodOption[] }
  | { kind: "insert_row"; start: string; end: string; options: PeriodOption[] }
  | { kind: "choose"; message: string; options: PeriodOption[] }
  | { kind: "blocked"; message: string; options: PeriodOption[] };

const br = (d: string) => d.split("-").reverse().join("/");
const overlaps = (r: { period_start: string; period_end: string }, p: { start: string; end: string }) => r.period_start <= p.end && r.period_end >= p.start;
const isManual = (r: PeriodRow) => r.source === "manual_update";

export function resolvePeriodTarget(input: { rows: PeriodRow[]; period: { start: string; end: string }; chosenId?: string | null }): PeriodTarget {
  const rows = input.rows.map((r) => ({ ...r, period_start: String(r.period_start).slice(0, 10), period_end: String(r.period_end).slice(0, 10) }));
  const p = input.period;
  const overlapping = rows.filter((r) => overlaps(r, p)).sort((a, b) => a.period_start.localeCompare(b.period_start) || a.period_end.localeCompare(b.period_end));
  const options: PeriodOption[] = overlapping.map((r) => ({
    id: r.id, start: r.period_start, end: r.period_end, source: r.source,
    selectable: !isManual(r),
    reason: isManual(r) ? "Registro do “Atualizar resultados” (guarda diferenças, não o total do período) — não pode ser sobrescrito pela importação." : null,
  }));

  const same = overlapping.filter((r) => r.period_start === p.start && r.period_end === p.end);
  const sameImport = same.filter((r) => !isManual(r));
  if (sameImport.length === 1) return { kind: "update_row", rowId: sameImport[0].id, start: p.start, end: p.end, chosen: false, options };
  if (sameImport.length > 1) return { kind: "blocked", message: `Há ${sameImport.length} registros com o período ${br(p.start)} a ${br(p.end)} neste anúncio — não dá para saber qual atualizar com segurança. Nada foi alterado.`, options };

  if (input.chosenId) {
    const chosen = options.find((o) => o.id === input.chosenId);
    if (chosen?.selectable) return { kind: "update_row", rowId: chosen.id, start: chosen.start, end: chosen.end, chosen: true, options };
    if (chosen) return { kind: "blocked", message: chosen.reason!, options };
    // Escolha antiga que não se aplica mais (período mudou): ignora e decide de novo.
  }

  if (!overlapping.length) return { kind: "insert_row", start: p.start, end: p.end, options };

  const selectable = options.filter((o) => o.selectable);
  if (!selectable.length) {
    return { kind: "blocked", message: `O período ${br(p.start)} a ${br(p.end)} se sobrepõe só a registros do “Atualizar resultados” (${options.map((o) => `${br(o.start)} a ${br(o.end)}`).join("; ")}). Para não duplicar resultados, nada será criado: use o “Atualizar resultados” do anúncio ou informe um período que não se sobreponha.`, options };
  }
  return {
    kind: "choose",
    message: `Este anúncio já tem resultados em ${options.map((o) => `${br(o.start)} a ${br(o.end)}`).join("; ")}, que se sobrepõem a ${br(p.start)} a ${br(p.end)}. Para não duplicar investimento, alcance, impressões ou outras métricas, nenhum registro novo é criado: escolha qual registro atualizar ou corrija o período.`,
    options,
  };
}

/** Colunas informadas no texto (nome da coluna em clt_ad_period_metrics → valor). */
export function informedColumns(ad: Pick<ImportAd, "metrics" | "extraMetrics">): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of METRIC_KEYS) if (ad.metrics[k] !== null) out[BASE_TO_AD_KEY[k]] = ad.metrics[k]!;
  for (const k of EXTRA_IMPORT_KEYS) { const v = ad.extraMetrics?.[k]; if (v !== null && v !== undefined) out[k] = v; }
  return out;
}

const COLUMN_LABEL: Record<string, string> = {
  ...Object.fromEntries(METRIC_KEYS.map((k) => [BASE_TO_AD_KEY[k], METRIC_LABEL[k]])),
  ...EXTRA_IMPORT_LABEL,
};
export const columnLabel = (col: string) => COLUMN_LABEL[col] ?? col;

/**
 * O que muda no registro: só colunas informadas e com valor diferente.
 * `update` é exatamente o que vai para o banco (nenhuma outra coluna).
 */
export function planRowChanges(row: Record<string, unknown> | null, informed: Record<string, number>) {
  const changes: Array<{ key: string; label: string; before: number | null; after: number }> = [];
  /** Informadas mas já iguais no registro (aparecem na prévia, não são gravadas). */
  const same: Array<{ key: string; label: string; value: number }> = [];
  const update: Record<string, number> = {};
  for (const [col, after] of Object.entries(informed)) {
    const raw = row?.[col];
    const before = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    if (before === after) { same.push({ key: col, label: columnLabel(col), value: after }); continue; }
    changes.push({ key: col, label: columnLabel(col), before, after });
    update[col] = after;
  }
  return { changes, same, update };
}
