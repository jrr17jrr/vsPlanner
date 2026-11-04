import { INFO_FIELDS, isNewInfoColumn, type InfoLevel } from "@/lib/clt/registered-info";
import type { ImportDetails } from "./types";
import type { ImportPreview, RowAction } from "./validate";

/**
 * Informações cadastradas da importação → o que muda em cada campanha,
 * conjunto e anúncio. Puro. Regras:
 *  - só entra o que veio no arquivo (campo omitido nunca apaga o salvo);
 *  - valor igual ao salvo não é regravado;
 *  - `details` é MESCLADO (chaves antigas ficam).
 */

export type InfoTarget = { level: InfoLevel; id: string | null; name: string; action: RowAction; values: Record<string, string | number>; details: ImportDetails };
export type InfoChange = {
  level: InfoLevel; id: string | null; name: string; action: RowAction;
  changes: Array<{ column: string; label: string; before: string | null; after: string }>;
  /** Informados e já iguais ao salvo (mostrados, não regravados). */
  same: Array<{ label: string; value: string }>;
};
export type InfoOp = { level: InfoLevel; id: string; name: string; update: Record<string, unknown> };

export const LEVEL_LABEL: Record<InfoLevel, string> = { campaign: "Campanha", adSet: "Conjunto", ad: "Anúncio" };
export const INFO_TABLE: Record<InfoLevel, string> = { campaign: "clt_campaigns", adSet: "clt_ad_sets", ad: "clt_ad_creatives" };

const EXTRA_LABEL: Record<InfoLevel, Record<string, string>> = {
  campaign: { meta_campaign_id: "ID da campanha na Meta" },
  adSet: { notes: "Observações", meta_adset_id: "ID do conjunto na Meta" },
  ad: { notes: "Observações", meta_ad_id: "ID do anúncio na Meta" },
};
const META_ID_COLUMNS = new Set(["meta_campaign_id", "meta_adset_id", "meta_ad_id"]);
export function infoLabel(level: InfoLevel, column: string) {
  if (column.startsWith("details.")) return `Outras informações · ${column.slice(8).replace(/_/g, " ")}`;
  return INFO_FIELDS[level].find((f) => f.column === column)?.label ?? EXTRA_LABEL[level][column] ?? column;
}

const put = (o: Record<string, string | number>, k: string, v: string | number | null | undefined) => { if (v !== null && v !== undefined && String(v).trim() !== "") o[k] = v; };

/** Tudo o que a importação informou de cadastro, por registro. */
export function collectInfoTargets(preview: ImportPreview): InfoTarget[] {
  const out: InfoTarget[] = [];
  const push = (t: InfoTarget) => { if (Object.keys(t.values).length || Object.keys(t.details).length) out.push(t); };
  for (const c of preview.campaigns) {
    const values: Record<string, string | number> = {};
    put(values, "meta_campaign_id", c.metaId);
    Object.assign(values, c.info ?? {});
    put(values, "description", c.notes);
    push({ level: "campaign", id: c.existingId, name: c.name, action: c.action, values, details: c.details ?? {} });
    for (const s of c.adSets) {
      // Conjunto não identificado (anúncio não encontrado): nada a gravar.
      if (s.autoIdentified && !s.existingId) continue;
      const sv: Record<string, string | number> = {};
      put(sv, "meta_adset_id", s.metaId);
      Object.assign(sv, s.info ?? {});
      put(sv, "placements", s.placements);
      put(sv, "notes", s.notes);
      push({ level: "adSet", id: s.existingId, name: s.name, action: s.action, values: sv, details: s.details ?? {} });
      for (const a of s.ads) {
        const av: Record<string, string | number> = {};
        put(av, "meta_ad_id", a.metaId);
        Object.assign(av, a.info ?? {});
        put(av, "post_id", a.postId);
        put(av, "notes", a.notes);
        push({ level: "ad", id: a.existingId, name: a.name, action: a.action, values: av, details: a.details ?? {} });
      }
    }
  }
  return out;
}

const shown = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.join(", ");
  const s = String(v).trim();
  return s ? s : null;
};
const same = (a: unknown, b: unknown) => {
  if (typeof a === "number" || typeof b === "number") return a !== null && a !== undefined && b !== null && b !== undefined && Number(a) === Number(b);
  return shown(a) === shown(b);
};

/**
 * Compara com o que está salvo (`current[id]`; registro novo = vazio) e monta
 * as mudanças (prévia) e as atualizações (só registros que já têm id).
 */
export function planInfoChanges(targets: InfoTarget[], current: Record<string, Record<string, unknown>>): { changes: InfoChange[]; ops: InfoOp[] } {
  const changes: InfoChange[] = [];
  const ops: InfoOp[] = [];
  for (const t of targets) {
    const row = (t.id && current[t.id]) || {};
    const change: InfoChange = { level: t.level, id: t.id, name: t.name, action: t.action, changes: [], same: [] };
    const update: Record<string, unknown> = {};
    for (const [col, after] of Object.entries(t.values)) {
      if (same(row[col], after)) { change.same.push({ label: infoLabel(t.level, col), value: String(after) }); continue; }
      // ID da Meta: só preenche quando o registro ainda não tem (nunca troca um ID já salvo).
      if (META_ID_COLUMNS.has(col) && shown(row[col])) continue;
      change.changes.push({ column: col, label: infoLabel(t.level, col), before: shown(row[col]), after: String(after) });
      update[col] = after;
    }
    const curDetails = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? (row.details as Record<string, unknown>) : {};
    const merged: Record<string, unknown> = { ...curDetails };
    let detailsChanged = false;
    for (const [k, after] of Object.entries(t.details)) {
      if (same(curDetails[k], after) && Array.isArray(after) === Array.isArray(curDetails[k])) { change.same.push({ label: infoLabel(t.level, `details.${k}`), value: shown(after) ?? "" }); continue; }
      change.changes.push({ column: `details.${k}`, label: infoLabel(t.level, `details.${k}`), before: shown(curDetails[k]), after: shown(after) ?? "" });
      merged[k] = after;
      detailsChanged = true;
    }
    if (detailsChanged) update.details = merged;
    if (change.changes.length || change.same.length) changes.push(change);
    if (t.id && Object.keys(update).length) ops.push({ level: t.level, id: t.id, name: t.name, update });
  }
  return { changes, ops };
}

/** Sem a migration 20261109100000: grava só as colunas antigas. */
export function withoutNewColumns(level: InfoLevel, update: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(update).filter(([k]) => !isNewInfoColumn(level, k)));
}

export const countInfoChanges = (changes: InfoChange[] | undefined) => (changes ?? []).reduce((n, c) => n + c.changes.length, 0);
