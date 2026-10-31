/** Limite da descrição opcional (igual ao check da migration 20261031100000). */
export const SUBTASK_DESCRIPTION_MAX = 10000;

export const MISSING_DESCRIPTION_WARNING =
  "Subtarefa salva, mas a descrição não foi gravada: a atualização do banco (task_subtasks.description) ainda não foi aplicada.";

/** Coluna ainda não criada no banco (migration pendente): 42703 (Postgres) / PGRST204 (cache do PostgREST). */
export function isMissingDescriptionColumn(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return (error.code === "42703" || error.code === "PGRST204") && /description/i.test(error.message ?? "");
}

/** undefined = não mexer; null/"" = limpar; texto = gravar (aparado). */
export function normalizeSubtaskDescription(value: string | null | undefined): { value?: string | null; error?: string } {
  if (value === undefined) return {};
  const trimmed = (value ?? "").trim();
  if (trimmed.length > SUBTASK_DESCRIPTION_MAX) return { error: "A descrição pode ter até 10.000 caracteres." };
  return { value: trimmed || null };
}

/** Aceita `description` ou `descricao` (JSON de planejamento), sem quebrar arquivos antigos. */
export function pickImportedDescription(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const v = r.description ?? r.descricao;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, SUBTASK_DESCRIPTION_MAX) : undefined;
}
