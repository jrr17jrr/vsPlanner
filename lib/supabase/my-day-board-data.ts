import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listActivityCompletions, listMyDayBoardSubtasks, listPersonalSubtasks, listTaskOccurrences, listTasks } from "@/lib/supabase/repositories/personal.repository";
import { addDaysToKey, mergeLinkedRoutineCompletions, MY_DAY_LOOKBACK_DAYS } from "@/lib/tasks";
import { UPCOMING_DAYS, buildMyDayBoard, type BoardInput, type MyDayBoard } from "@/lib/my-day-board";
import { isMissingColumnError, type Subtask } from "@/lib/task-schedule";
import type { Activity, CltTask, CltTaskOccurrence, PersonalWorkTask, Task, WorkItem } from "@/types/database.types";

export type MyDayBoardData = {
  board: MyDayBoard;
  /** Lista completa de subtarefas das tarefas pessoais exibidas (painel de detalhes e Rotina vinculada). */
  subtasksByTask: Record<string, Subtask[]>;
  /** Tarefas pessoais vinculadas à Rotina de hoje (o card da Rotina abre a tarefa). */
  linkedTasks: Task[];
};

type CltRow = { task: CltTask; module: "clt" | "mkt"; companyName: string | null };

/** Tarefas atuais do CLT e do MKT (clt_tasks), respeitando o acesso a cada módulo. */
async function loadCltTasks(userId: string, todayKey: string, access: { clt: boolean; mkt: boolean }): Promise<{ rows: CltRow[]; occurrences: CltTaskOccurrence[] }> {
  if (!access.clt && !access.mkt) return { rows: [], occurrences: [] };
  const db = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  const [tasks, companies, occ] = await Promise.all([
    db.from("clt_tasks").select("*").eq("user_id", userId).is("archived_at", null),
    db.from("clt_companies").select("id,name,module").eq("user_id", userId),
    db.from("clt_task_occurrences").select("*").eq("user_id", userId).eq("occurrence_date", todayKey),
  ]);
  if (tasks.error) throw tasks.error;
  let companyRows = companies.data as { id: string; name: string; module?: string | null }[] | null;
  if (companies.error) {
    // Antes da migration do MKT a coluna `module` não existe: tudo é CLT.
    if (!isMissingColumnError(companies.error)) throw companies.error;
    const legacy = await db.from("clt_companies").select("id,name").eq("user_id", userId);
    if (legacy.error) throw legacy.error;
    companyRows = legacy.data as { id: string; name: string }[];
  }
  if (occ.error) throw occ.error;
  const byId = new Map((companyRows ?? []).map((c) => [c.id, c]));
  const rows: CltRow[] = [];
  for (const task of (tasks.data ?? []) as CltTask[]) {
    const company = task.company_id ? byId.get(task.company_id) : undefined;
    if (task.company_id && !company) continue;
    const mod: "clt" | "mkt" = (task.module ?? (company?.module as "clt" | "mkt" | null | undefined) ?? "clt") === "mkt" ? "mkt" : "clt";
    if (!access[mod]) continue;
    rows.push({ task, module: mod, companyName: company?.name ?? null });
  }
  return { rows, occurrences: (occ.data ?? []) as CltTaskOccurrence[] };
}

/**
 * Dados das quatro seções do Meu Dia. Uma consulta por fonte (sem N+1); a
 * classificação é a função pura `buildMyDayBoard`.
 */
export async function loadMyDayBoard(input: {
  userId: string;
  spaceId: string;
  todayKey: string;
  activities: Activity[];
  workItems: WorkItem[];
  legacyWorkTasks: PersonalWorkTask[];
  access: { clt: boolean; mkt: boolean };
}): Promise<MyDayBoardData> {
  const { userId, spaceId, todayKey } = input;
  const horizon = addDaysToKey(todayKey, UPCOMING_DAYS);
  const from = addDaysToKey(todayKey, -MY_DAY_LOOKBACK_DAYS);
  const linkedActivities = input.activities.filter((a) => a.task_id);
  const [tasks, rawOccurrences, subtasks, clt, routineDone] = await Promise.all([
    listTasks(spaceId, { includeArchived: true }),
    listTaskOccurrences(userId, from, todayKey),
    listMyDayBoardSubtasks(userId, todayKey, horizon),
    loadCltTasks(userId, todayKey, input.access),
    linkedActivities.length ? listActivityCompletions(userId, from, todayKey) : Promise.resolve([]),
  ]);
  // Sessões da Rotina já feitas contam como execução da recorrente vinculada (lib/tasks.ts).
  const occurrences = mergeLinkedRoutineCompletions(tasks, rawOccurrences, linkedActivities, routineDone);
  const boardInput: BoardInput = {
    todayKey, tasks, occurrences, subtasks, activities: input.activities,
    cltTasks: clt.rows, cltOccurrences: clt.occurrences, workItems: input.workItems, legacyWorkTasks: input.legacyWorkTasks,
  };
  const board = buildMyDayBoard(boardInput);
  const shownTaskIds = new Set<string>(board.linkedTaskIds);
  for (const s of ["hoje", "atrasadas", "proximas", "concluidas"] as const) {
    for (const i of board[s]) {
      if (i.source === "task") shownTaskIds.add(i.task.id);
      if (i.source === "subtask") shownTaskIds.add(i.parent.id);
    }
  }
  const all = await listPersonalSubtasks([...shownTaskIds]);
  const subtasksByTask: Record<string, Subtask[]> = {};
  for (const s of all) (subtasksByTask[s.parent_id] ??= []).push(s);
  const linked = new Set(board.linkedTaskIds);
  return { board, subtasksByTask, linkedTasks: tasks.filter((t) => linked.has(t.id) && !t.archived_at) };
}
