"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findOrBootstrapSpace, requirePersonalSpace } from "@/lib/supabase/dal";
import { getModuleScope } from "@/lib/supabase/clt-scope";
import { insertNestedSubtasks } from "@/lib/supabase/import-subtasks";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { todayKeySaoPaulo } from "@/lib/format";
import { isMissingColumnError, stripScheduleColumns, TASK_SCHEDULE_COLUMNS, ACTIVITY_LINK_COLUMNS } from "@/lib/task-schedule";
import { MAX_DRAFTS, sanitizeDraft, validateDrafts, type ImportArea, type TaskDraft, type TaskImportType, type ValidationContext } from "@/lib/import/tasks";

/**
 * Central de Importação — tarefas/subtarefas, rotinas e campanhas
 * planejadas. Campanhas completas, públicos e resultados continuam no
 * importador inteligente (clt-import-actions.ts), que já grava numa única
 * transação.
 *
 * Fluxo: `preview` (só lê: empresas do módulo + duplicados) → pessoa revisa,
 * corrige e escolhe → `confirm` refaz TUDO no servidor (acesso, formato,
 * empresas do módulo, duplicados) e só começa a gravar se todos os itens
 * escolhidos forem válidos.
 */

type Db = SupabaseClient;

const fmt = (d: string) => d.split("-").reverse().join("/");

/** Contexto para a prévia no navegador: empresas do módulo e títulos já existentes (para apontar duplicados). */
export type TaskImportContext = Pick<ValidationContext, "companies" | "existing">;

export type TaskImportResult = {
  error?: string;
  created: number;
  updated: number;
  ignored: { title: string; reason: string }[];
  failed: { title: string; message: string }[];
  /** Não processados por causa de uma falha anterior (nada foi gravado neles). */
  notProcessed: string[];
  warnings: string[];
};

async function loadContext(area: ImportArea, type: TaskImportType) {
  const { profile, space } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const db = supabase as unknown as Db;

  if (area === "clt" && !(profile.system_role === "super_admin" || profile.clt_access !== false)) throw new Error("Sem acesso ao Trabalho / CLT.");
  if (area === "mkt" && !(await findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile))) throw new Error("Sem acesso à Visionário Dev / MKT.");
  if (area !== "pessoal" && type === "rotinas") throw new Error("Rotinas só podem ser importadas na área Pessoal.");

  let companies: { id: string; name: string }[] = [];
  let existing: ValidationContext["existing"] = [];
  if (area === "pessoal") {
    if (type === "rotinas") {
      const { data, error } = await db.from("activities").select("title,weekdays").eq("user_id", profile.id).eq("space_id", space.id).eq("is_active", true);
      if (error) throw new Error(error.message);
      existing = (data ?? []).map((a: { title: string; weekdays: number[] | null }) => ({ title: a.title, companyId: null, kind: "rotina" as const, weekdays: a.weekdays ?? [] }));
    } else {
      const { data, error } = await db.from("tasks").select("title").eq("user_id", profile.id).eq("space_id", space.id).is("archived_at", null);
      if (error) throw new Error(error.message);
      existing = (data ?? []).map((t: { title: string }) => ({ title: t.title, companyId: null, kind: "tarefa" as const }));
    }
  } else {
    const scope = await getModuleScope(supabase, profile.id, area);
    if (area === "mkt" && !scope.ready) throw new Error("O módulo MKT ainda não está ativo no banco (migração pendente).");
    companies = scope.companies.map((c) => ({ id: c.id, name: c.name }));
    const ids = scope.companyIds;
    const tasksQuery = area === "mkt"
      ? db.from("clt_tasks").select("title,company_id").eq("user_id", profile.id).eq("module", "mkt")
      : db.from("clt_tasks").select("title,company_id").eq("user_id", profile.id);
    const [tasks, campaigns] = await Promise.all([
      tasksQuery,
      ids.length ? db.from("clt_campaigns").select("name,company_id").eq("user_id", profile.id).in("company_id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    if (tasks.error && !isMissingColumnError(tasks.error)) throw new Error(tasks.error.message);
    if (campaigns.error) throw new Error(campaigns.error.message);
    const own = new Set(ids);
    existing = [
      // CLT: tarefas gerais (sem empresa) ou de empresas do CLT; MKT: só as do MKT.
      ...((tasks.data ?? []) as { title: string; company_id: string | null }[])
        .filter((t) => (t.company_id ? own.has(t.company_id) : true))
        .map((t) => ({ title: t.title, companyId: t.company_id, kind: "tarefa" as const })),
      ...((campaigns.data ?? []) as { name: string; company_id: string }[]).map((c) => ({ title: c.name, companyId: c.company_id, kind: "campanha" as const })),
    ];
  }
  return { profile, space, db, ctx: { area, type, companies, existing } satisfies ValidationContext };
}

function checkInput(area: unknown, type: unknown, drafts: unknown): { area: ImportArea; type: TaskImportType; drafts: TaskDraft[] } {
  if (area !== "pessoal" && area !== "clt" && area !== "mkt") throw new Error("Área inválida.");
  if (type !== "tarefas" && type !== "rotinas") throw new Error("Tipo inválido.");
  if (!Array.isArray(drafts) || drafts.length === 0) throw new Error("Nada para importar.");
  if (drafts.length > MAX_DRAFTS) throw new Error(`Máximo de ${MAX_DRAFTS} registros por importação.`);
  return { area, type, drafts: drafts.map(sanitizeDraft) };
}

/** Prévia: só lê (empresas do módulo + registros existentes). A validação roda no navegador e de novo no servidor ao confirmar. */
export async function taskImportContextAction(input: { area: ImportArea; type: TaskImportType }): Promise<{ error?: string; context?: TaskImportContext }> {
  try {
    if (input.area !== "pessoal" && input.area !== "clt" && input.area !== "mkt") throw new Error("Área inválida.");
    if (input.type !== "tarefas" && input.type !== "rotinas") throw new Error("Tipo inválido.");
    const { ctx } = await loadContext(input.area, input.type);
    return { context: { companies: ctx.companies, existing: ctx.existing } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível montar a prévia." };
  }
}

function subtasksOf(d: TaskDraft) {
  return d.subtasks.map((s) => ({ title: s.title, dueDate: s.dueDate, description: s.description, subtasks: s.children }));
}

/**
 * Grava os itens escolhidos. `selected` = índices dos rascunhos. Se algum
 * escolhido tiver erro, nada é gravado. Duplicados só entram se a pessoa os
 * marcou na prévia.
 */
export async function confirmTaskImportAction(input: { area: ImportArea; type: TaskImportType; drafts: TaskDraft[]; selected: number[] }): Promise<TaskImportResult> {
  const result: TaskImportResult = { created: 0, updated: 0, ignored: [], failed: [], notProcessed: [], warnings: [] };
  try {
    const { area, type, drafts } = checkInput(input.area, input.type, input.drafts);
    const selected = new Set((Array.isArray(input.selected) ? input.selected : []).filter((i) => Number.isInteger(i) && i >= 0 && i < drafts.length));
    if (!selected.size) return { ...result, error: "Selecione pelo menos um item." };

    const { profile, space, db, ctx } = await loadContext(area, type);
    const validated = validateDrafts(drafts, ctx);
    const chosen = validated.map((v, i) => ({ v, i })).filter(({ i }) => selected.has(i));
    const invalid = chosen.filter(({ v }) => !v.valid);
    if (invalid.length) {
      return { ...result, error: `Nada foi gravado: ${invalid.length} item(ns) escolhido(s) com erro (${invalid.slice(0, 3).map(({ v }) => `"${v.draft.title || "sem título"}"`).join(", ")}). Corrija ou desmarque.` };
    }
    validated.forEach((v, i) => { if (!selected.has(i)) result.ignored.push({ title: v.draft.title || "(sem título)", reason: v.valid ? (v.duplicate ? "duplicado (desmarcado)" : "desmarcado") : "com erro (desmarcado)" }); });

    const today = todayKeySaoPaulo();
    let stopped = false;
    let lostSchedule = false;
    for (const { v } of chosen) {
      const d = v.draft;
      if (stopped) { result.notProcessed.push(d.title); continue; }
      const fail = (message: string) => { result.failed.push({ title: d.title, message }); stopped = true; };
      const weekly = d.weekdays.length > 0;

      if (d.kind === "rotina") {
        const row: Record<string, unknown> = {
          user_id: profile.id, space_id: space.id, title: d.title, start_time: d.time, end_time: d.endTime ?? null,
          weekdays: d.executionDate && !weekly ? [] : d.weekdays, specific_date: !weekly ? d.executionDate ?? null : null, notes: d.notes ?? null, is_active: true,
        };
        let { error } = await db.from("activities").insert(row);
        if (error && isMissingColumnError(error)) {
          if (row.specific_date) { fail("Rotina de um dia só precisa da migração 20261102100000 aplicada no Supabase."); continue; }
          ({ error } = await db.from("activities").insert(stripScheduleColumns(row, ACTIVITY_LINK_COLUMNS).values));
        }
        if (error) { fail(error.message); continue; }
        result.created++;
        continue;
      }

      if (d.kind === "campanha") {
        // Campanha planejada (antigo Planejamento): registro no VSPlanner, não publica no Meta.
        const { error } = await db.from("clt_campaigns").insert({
          user_id: profile.id, company_id: v.companyId, name: d.title, objective: d.objective || "Engajamento", description: d.notes ?? d.description ?? null,
          starts_on: d.executionDate, ends_on: d.endsOn || d.executionDate, budget_type: "daily", daily_budget: d.dailyBudget ?? 0, planned_amount: d.plannedAmount ?? 0,
          campaign_status: "planejada", spent_amount: 0, messages: 0, sales: 0, views: 0,
        });
        if (error) { fail(error.message); continue; }
        result.created++;
        continue;
      }

      if (area === "pessoal") {
        // Mesma regra do formulário: 'dia' = execução (+ prazo em deadline_date); 'prazo' = só prazo.
        const kind = weekly || d.executionDate ? "dia" : "prazo";
        const row: Record<string, unknown> = {
          user_id: profile.id, space_id: space.id, title: d.title, description: d.description ?? null, notes: d.notes ?? null, priority: d.priority, kind,
          due_date: weekly ? null : kind === "dia" ? d.executionDate : d.deadlineDate ?? null,
          scheduled_time: d.time ?? null,
          deadline_date: !weekly && kind === "dia" ? d.deadlineDate ?? null : null,
          recurrence: weekly ? "weekly" : "none", weekdays: weekly ? d.weekdays : [], recurrence_start: weekly ? today : null, recurrence_until: null,
        };
        let res = await db.from("tasks").insert(row).select("id").single();
        if (res.error && isMissingColumnError(res.error)) {
          // Banco sem a migration de agenda: o prazo final vai nas observações (nada se perde).
          const stripped = stripScheduleColumns(row, TASK_SCHEDULE_COLUMNS);
          const values = { ...stripped.values } as Record<string, unknown>;
          if (row.deadline_date) { values.notes = [d.notes, `Prazo final: ${fmt(String(row.deadline_date))}`].filter(Boolean).join("\n"); lostSchedule = true; }
          res = await db.from("tasks").insert(values).select("id").single();
        }
        if (res.error || !res.data) { fail(res.error?.message ?? "Falha ao criar tarefa."); continue; }
        if (d.subtasks.length) {
          const subErr = await insertNestedSubtasks(db, profile.id, "pessoal", (res.data as { id: string }).id, subtasksOf(d));
          if (subErr) { result.created++; fail(subErr); continue; }
        }
        result.created++;
        continue;
      }

      // CLT / MKT: clt_tasks guarda uma data (execução, ou o prazo se não houver execução).
      const kind = weekly || d.executionDate ? "dia" : "prazo";
      const notes = [d.notes, d.executionDate && d.deadlineDate ? `Prazo final: ${fmt(d.deadlineDate)}` : null].filter(Boolean).join("\n") || null;
      const row: Record<string, unknown> = {
        user_id: profile.id, company_id: v.companyId, title: d.title, description: d.description ?? null, kind,
        due_date: weekly ? null : d.executionDate ?? d.deadlineDate ?? null, scheduled_time: d.time ?? null, priority: d.priority, notes,
        recurrence: weekly ? "weekly" : "none", weekdays: weekly ? d.weekdays : [], recurrence_start: weekly ? today : null, recurrence_until: null,
      };
      // Tarefa geral (sem empresa) do MKT guarda o módulo; com empresa, o banco usa o da empresa.
      if (area === "mkt" && !v.companyId) row.module = "mkt";
      const res = await db.from("clt_tasks").insert(row).select("id").single();
      if (res.error || !res.data) { fail(res.error?.message ?? "Falha ao criar tarefa."); continue; }
      if (d.subtasks.length) {
        const subErr = await insertNestedSubtasks(db, profile.id, "clt", (res.data as { id: string }).id, subtasksOf(d));
        if (subErr) { result.created++; fail(subErr); continue; }
      }
      result.created++;
    }
    if (lostSchedule) result.warnings.push("O banco ainda não tem a coluna de prazo final separado (migração 20261102100000 pendente): o prazo foi salvo nas observações.");

    ["/tarefas", "/hoje", "/rotina", "/", "/trabalho", "/trabalho/tarefas", "/trabalho/campanhas", "/trabalho/rotina", "/importar"].forEach((p) => revalidatePath(p));
    revalidatePath("/visionario/mkt", "layout");
    return result;
  } catch (e) {
    return { ...result, error: e instanceof Error ? e.message : "Erro ao importar." };
  }
}
