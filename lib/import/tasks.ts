import { normalizeKey, parseBrDate, parseBrNumber, sameName } from "./values";

/**
 * Central de Importação — tarefas, subtarefas, rotinas e campanhas
 * planejadas (o antigo JSON `items` do Planejamento). Puro e determinístico
 * (sem IA): o que não reconhece vira aviso, nada é inventado. Usado no
 * navegador (prévia instantânea) E de novo no servidor (confirmação), com as
 * mesmas regras. Testado em lib/import/tasks.test.ts.
 */

export type ImportArea = "pessoal" | "clt" | "mkt";
export type TaskImportType = "tarefas" | "rotinas";

export type DraftSubtask = { title: string; dueDate?: string; description?: string; children: { title: string; dueDate?: string; description?: string }[] };

export type DraftKind = "tarefa" | "rotina" | "campanha";

export type TaskDraft = {
  kind: DraftKind;
  title: string;
  companyName?: string;
  description?: string;
  notes?: string;
  priority: "normal" | "importante";
  /** Fazer no dia (yyyy-MM-dd). */
  executionDate?: string;
  /** Prazo final (yyyy-MM-dd). */
  deadlineDate?: string;
  /** Horário de execução / início da rotina (HH:mm). */
  time?: string;
  /** Fim da rotina (HH:mm). */
  endTime?: string;
  /** Repetição semanal (0=domingo). */
  weekdays: number[];
  subtasks: DraftSubtask[];
  /** Campanha planejada (formato antigo `items`). */
  objective?: string;
  endsOn?: string;
  dailyBudget?: number;
  plannedAmount?: number;
  /** Campos reconhecidos (para a prévia). */
  recognized: string[];
  /** Problemas de leitura (linha/campo desconhecido, data inválida...). */
  problems: string[];
};

export type ParsedDrafts = { ok: true; drafts: TaskDraft[]; detected: "json" | "text" } | { ok: false; error: string };

export const MAX_DRAFTS = 150;
export const MAX_SUBTASKS = 50;
const TIME_RE = /^([01]?\d|2[0-3])[:h]([0-5]\d)$/i;

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

/** "05/11/2026", "2026-11-05", "05/11" (ano de hoje). */
export function parseLooseDate(raw: unknown, todayKey: string): string | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const full = parseBrDate(s);
  if (full) return full;
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) {
    const year = todayKey.slice(0, 4);
    const candidate = parseBrDate(`${m[1]}/${m[2]}/${year}`);
    return candidate ?? undefined;
  }
  return undefined;
}

export function parseTime(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = TIME_RE.exec(raw.trim());
  if (!m) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function parsePriority(raw: unknown): "normal" | "importante" | undefined {
  if (typeof raw !== "string") return undefined;
  const k = normalizeKey(raw);
  if (["importante", "alta", "urgente", "high", "important"].includes(k)) return "importante";
  if (["normal", "media", "baixa", "low", "medium", "comum"].includes(k)) return "normal";
  return undefined;
}

const WEEKDAY_WORDS: Array<[number, string[]]> = [
  [0, ["dom", "domingo", "sun", "sunday"]],
  [1, ["seg", "segunda", "segunda-feira", "mon", "monday"]],
  [2, ["ter", "terca", "terca-feira", "tue", "tuesday"]],
  [3, ["qua", "quarta", "quarta-feira", "wed", "wednesday"]],
  [4, ["qui", "quinta", "quinta-feira", "thu", "thursday"]],
  [5, ["sex", "sexta", "sexta-feira", "fri", "friday"]],
  [6, ["sab", "sabado", "sat", "saturday"]],
];

/** "seg, qua e sex", "todos os dias", "dias úteis", [1,3,5]. undefined = inválido. */
export function parseWeekdays(raw: unknown): number[] | undefined {
  if (Array.isArray(raw)) {
    const nums = raw.map((v) => (typeof v === "number" ? v : parseWeekdays(String(v))?.[0]));
    if (nums.some((n) => n === undefined || !Number.isInteger(n) || n < 0 || n > 6)) return undefined;
    return [...new Set(nums as number[])].sort((a, b) => a - b);
  }
  if (typeof raw !== "string") return undefined;
  const k = normalizeKey(raw);
  if (!k) return [];
  if (["todos os dias", "todo dia", "diariamente", "diario", "todos"].includes(k)) return [0, 1, 2, 3, 4, 5, 6];
  if (["dias uteis", "dia util", "seg a sex", "segunda a sexta"].includes(k)) return [1, 2, 3, 4, 5];
  if (["fim de semana", "fins de semana", "sab e dom"].includes(k)) return [0, 6];
  const parts = k.split(/\s*(?:,|;|\/|\be\b|\s)\s*/).filter(Boolean);
  const out = new Set<number>();
  for (const p of parts) {
    const clean = p.replace(/\.$/, "");
    if (/^[0-6]$/.test(clean)) { out.add(Number(clean)); continue; }
    const hit = WEEKDAY_WORDS.find(([, words]) => words.includes(clean));
    if (!hit) return undefined;
    out.add(hit[0]);
  }
  return [...out].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

type TextField =
  | "company" | "title" | "activity" | "description" | "priority" | "execution" | "deadline" | "time" | "endTime"
  | "weekdays" | "notes" | "subtasks" | "objective" | "endsOn" | "dailyBudget" | "plannedAmount";

const TEXT_ALIASES: Array<[TextField, string[]]> = [
  ["company", ["empresa", "cliente"]],
  ["title", ["titulo", "tarefa", "nome", "title"]],
  ["activity", ["atividade", "rotina", "atividade da rotina"]],
  ["description", ["descricao", "detalhes", "description"]],
  ["priority", ["prioridade", "priority"]],
  ["execution", ["data de execucao", "execucao", "fazer no dia", "data", "dia", "data programada", "programada para", "quando"]],
  ["deadline", ["prazo final", "prazo", "data limite", "entrega", "vencimento", "deadline"]],
  ["time", ["horario", "hora", "horario de execucao", "inicio", "horario de inicio", "comeca"]],
  ["endTime", ["fim", "termino", "horario de fim", "ate"]],
  ["weekdays", ["dias", "dias da semana", "repetir", "repeticao", "semanal"]],
  ["notes", ["observacoes", "observacao", "obs", "notas", "nota"]],
  ["subtasks", ["subtarefas", "subtarefa", "etapas", "checklist", "passos"]],
  ["objective", ["objetivo"]],
  ["endsOn", ["termina em", "data final", "fim da campanha"]],
  ["dailyBudget", ["orcamento diario"]],
  ["plannedAmount", ["orcamento", "investimento previsto", "valor previsto"]],
];
const FIELD_BY_KEY = new Map<string, TextField>(TEXT_ALIASES.flatMap(([f, keys]) => keys.map((k) => [k, f] as [string, TextField])));

const FIELD_LABEL: Record<TextField, string> = {
  company: "Empresa", title: "Título", activity: "Atividade", description: "Descrição", priority: "Prioridade",
  execution: "Execução", deadline: "Prazo final", time: "Horário", endTime: "Fim", weekdays: "Dias da semana",
  notes: "Observações", subtasks: "Subtarefas", objective: "Objetivo", endsOn: "Termina em", dailyBudget: "Orçamento diário", plannedAmount: "Orçamento",
};

const BULLET = /^(\s*)(?:[-*•–]|\[\s?\]|\d+[.)])\s+(.*)$/;

function emptyDraft(kind: DraftKind): TaskDraft {
  return { kind, title: "", priority: "normal", weekdays: [], subtasks: [], recognized: [], problems: [] };
}

/** "Título | prazo: 07/11/2026 | descrição" */
function parseSubtaskLine(text: string, todayKey: string, problems: string[]): { title: string; dueDate?: string; description?: string } {
  const [head, ...rest] = text.split("|").map((p) => p.trim());
  const out: { title: string; dueDate?: string; description?: string } = { title: head };
  for (const part of rest) {
    const m = /^([^:\d]+?)\s*:?\s*(\d.*)$/.exec(part);
    const key = m ? normalizeKey(m[1]) : "";
    if (m && ["prazo", "prazo final", "ate", "data", "vencimento"].includes(key)) {
      const d = parseLooseDate(m[2], todayKey);
      if (d) out.dueDate = d;
      else problems.push(`Subtarefa "${head}": data inválida "${m[2]}".`);
    } else if (part) {
      out.description = out.description ? `${out.description} ${part}` : part;
    }
  }
  return out;
}

/**
 * Texto em blocos "Campo: valor". Blocos separados por `---` ou por um novo
 * `Título:`/`Atividade:`. Subtarefas: linhas com "-" (recuo = checklist da
 * subtarefa acima).
 */
export function parseTaskText(text: string, type: TaskImportType, todayKey: string): TaskDraft[] {
  const drafts: TaskDraft[] = [];
  const kind: DraftKind = type === "rotinas" ? "rotina" : "tarefa";
  let cur: TaskDraft | null = null;
  let inSubtasks = false;
  let lastField: TextField | null = null;

  const flush = () => {
    if (cur && (cur.title || cur.recognized.length)) drafts.push(cur);
    cur = null;
    inSubtasks = false;
    lastField = null;
  };
  const ensure = () => (cur ??= emptyDraft(kind));
  // Empresa escrita antes do primeiro título vale para os blocos seguintes (até mudar).
  let carriedCompany: string | undefined;

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (/^\s*-{3,}\s*$/.test(line)) { flush(); continue; }

    const bullet = BULLET.exec(line);
    if (bullet && inSubtasks) {
      const d = ensure();
      const indent = bullet[1].replace(/\t/g, "  ").length;
      const parsed = parseSubtaskLine(bullet[2].trim(), todayKey, d.problems);
      if (!parsed.title) continue;
      if (indent >= 2 && d.subtasks.length) d.subtasks[d.subtasks.length - 1].children.push(parsed);
      else d.subtasks.push({ ...parsed, children: [] });
      if (!d.recognized.includes("Subtarefas")) d.recognized.push("Subtarefas");
      continue;
    }

    const kv = /^\s*([^:]{1,40}):\s*(.*)$/.exec(line);
    const field = kv ? FIELD_BY_KEY.get(normalizeKey(kv[1])) : undefined;
    if (!kv || !field) {
      // Continuação de descrição/observações em várias linhas.
      if (cur && (lastField === "description" || lastField === "notes") && !inSubtasks) {
        const d = cur as TaskDraft;
        if (lastField === "description") d.description = `${d.description ?? ""}\n${line.trim()}`.trim();
        else d.notes = `${d.notes ?? ""}\n${line.trim()}`.trim();
        continue;
      }
      ensure().problems.push(`Linha não reconhecida: "${line.trim().slice(0, 80)}"`);
      continue;
    }
    const value = kv[2].trim();
    inSubtasks = false;

    if ((field === "title" || field === "activity") && cur && (cur as TaskDraft).title) flush();
    if (field === "company" && cur && (cur as TaskDraft).title) {
      // "Empresa:" depois de um título completo abre um novo bloco.
      flush();
    }
    const d = ensure();
    lastField = field;
    const mark = () => { if (!d.recognized.includes(FIELD_LABEL[field])) d.recognized.push(FIELD_LABEL[field]); };

    switch (field) {
      case "company":
        if (value) { d.companyName = value; carriedCompany = value; mark(); }
        break;
      case "title":
      case "activity":
        d.title = value;
        if (field === "activity") d.kind = "rotina";
        if (!d.companyName && carriedCompany) d.companyName = carriedCompany;
        mark();
        break;
      case "description":
        d.description = value || undefined; mark(); break;
      case "notes":
        d.notes = value || undefined; mark(); break;
      case "priority": {
        const p = parsePriority(value);
        if (p) { d.priority = p; mark(); } else if (value) d.problems.push(`Prioridade não reconhecida: "${value}" (use Normal ou Importante).`);
        break;
      }
      case "execution":
      case "deadline":
      case "endsOn": {
        if (!value) break;
        const date = parseLooseDate(value, todayKey);
        if (!date) { d.problems.push(`${FIELD_LABEL[field]}: data inválida "${value}" (use dd/mm/aaaa).`); break; }
        if (field === "execution") d.executionDate = date;
        else if (field === "deadline") d.deadlineDate = date;
        else d.endsOn = date;
        mark();
        break;
      }
      case "time":
      case "endTime": {
        if (!value) break;
        const t = parseTime(value);
        if (!t) { d.problems.push(`${FIELD_LABEL[field]}: horário inválido "${value}" (use HH:mm).`); break; }
        if (field === "time") d.time = t; else d.endTime = t;
        mark();
        break;
      }
      case "weekdays": {
        const days = parseWeekdays(value);
        if (!days) d.problems.push(`Dias da semana não reconhecidos: "${value}" (ex.: seg, qua, sex).`);
        else { d.weekdays = days; mark(); }
        break;
      }
      case "subtasks":
        inSubtasks = true;
        if (value) {
          d.subtasks.push({ ...parseSubtaskLine(value, todayKey, d.problems), children: [] });
        }
        mark();
        break;
      case "objective":
        d.objective = value || undefined; mark(); break;
      case "dailyBudget":
      case "plannedAmount": {
        const n = parseBrNumber(value.replace(/^R\$\s*/i, ""));
        if (n === undefined || (n !== null && n < 0)) { d.problems.push(`${FIELD_LABEL[field]}: valor inválido "${value}".`); break; }
        if (n !== null) { if (field === "dailyBudget") d.dailyBudget = n; else d.plannedAmount = n; mark(); }
        break;
      }
    }
  }
  flush();
  return drafts;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
}
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : undefined);

function jsonSubtask(raw: unknown, todayKey: string, problems: string[]): { title: string; dueDate?: string; description?: string } | null {
  if (typeof raw === "string") return raw.trim() ? { title: raw.trim() } : null;
  if (!isObj(raw)) return null;
  const title = str(pick(raw, ["title", "titulo", "nome"]));
  if (!title) return null;
  const dueRaw = pick(raw, ["dueDate", "due_date", "prazo", "prazo_final", "deadline"]);
  const dueDate = dueRaw === undefined ? undefined : parseLooseDate(dueRaw, todayKey);
  if (dueRaw !== undefined && !dueDate) problems.push(`Subtarefa "${title}": data inválida "${String(dueRaw)}".`);
  const description = str(pick(raw, ["description", "descricao"]));
  return { title, dueDate, description };
}

function jsonDraft(raw: Obj, fallbackKind: DraftKind, todayKey: string): TaskDraft {
  const areaRaw = normalizeKey(str(raw.area) ?? "");
  const kind: DraftKind = areaRaw === "rotina" ? "rotina" : fallbackKind;
  const d = emptyDraft(kind);
  const mark = (label: string) => { if (!d.recognized.includes(label)) d.recognized.push(label); };
  if (areaRaw) d.recognized.push(`Área: ${str(raw.area)}`);

  const title = str(pick(raw, ["title", "titulo", "nome", "atividade", "tarefa"]));
  if (title) { d.title = title; mark("Título"); }
  const company = str(pick(raw, ["companyName", "company", "empresa", "cliente"]));
  if (company) { d.companyName = company; mark("Empresa"); }
  const description = str(pick(raw, ["description", "descricao"]));
  if (description) { d.description = description; mark("Descrição"); }
  const notes = str(pick(raw, ["notes", "observacoes", "obs"]));
  if (notes) { d.notes = notes; mark("Observações"); }
  const pr = pick(raw, ["priority", "prioridade"]);
  if (pr !== undefined) { const p = parsePriority(String(pr)); if (p) { d.priority = p; mark("Prioridade"); } else d.problems.push(`Prioridade não reconhecida: "${String(pr)}".`); }

  const dateField = (keys: string[], label: string, set: (v: string) => void) => {
    const v = pick(raw, keys);
    if (v === undefined) return;
    const date = parseLooseDate(v, todayKey);
    if (date) { set(date); mark(label); } else d.problems.push(`${label}: data inválida "${String(v)}".`);
  };
  dateField(["executionDate", "plannedDate", "data_execucao", "dataExecucao", "execucao", "fazer_no_dia", "scheduledDate", "data", "specificDate", "specific_date"], "Execução", (v) => (d.executionDate = v));
  dateField(["deadlineDate", "deadline", "prazo_final", "prazoFinal", "prazo", "dueDate", "due_date"], "Prazo final", (v) => (d.deadlineDate = v));
  dateField(["endsOn", "ends_on", "data_final"], "Termina em", (v) => (d.endsOn = v));

  const timeField = (keys: string[], label: string, set: (v: string) => void) => {
    const v = pick(raw, keys);
    if (v === undefined) return;
    const t = parseTime(String(v));
    if (t) { set(t); mark(label); } else d.problems.push(`${label}: horário inválido "${String(v)}".`);
  };
  timeField(["scheduledTime", "scheduled_time", "time", "horario", "hora", "startTime", "start_time", "inicio"], "Horário", (v) => (d.time = v));
  timeField(["endTime", "end_time", "fim"], "Fim", (v) => (d.endTime = v));

  const wd = pick(raw, ["weekdays", "dias", "dias_da_semana", "diasDaSemana"]);
  if (wd !== undefined) { const days = parseWeekdays(wd); if (days) { d.weekdays = days; if (days.length) mark("Dias da semana"); } else d.problems.push(`Dias da semana inválidos: ${JSON.stringify(wd)}.`); }

  const objective = str(pick(raw, ["objective", "objetivo"]));
  if (objective) { d.objective = objective; mark("Objetivo"); }
  for (const [keys, label, set] of [
    [["dailyBudget", "orcamento_diario"], "Orçamento diário", (n: number) => (d.dailyBudget = n)],
    [["plannedAmount", "orcamento", "investimento_previsto"], "Orçamento", (n: number) => (d.plannedAmount = n)],
  ] as const) {
    const v = pick(raw, [...keys]);
    if (v === undefined) continue;
    const n = parseBrNumber(v);
    if (n === undefined || (n !== null && n < 0)) d.problems.push(`${label}: valor inválido "${String(v)}".`);
    else if (n !== null && n > 0) { set(n); mark(label); }
  }

  const subs = pick(raw, ["subtasks", "subtarefas", "etapas", "checklist"]);
  if (subs !== undefined) {
    if (!Array.isArray(subs)) d.problems.push("Subtarefas precisam ser uma lista.");
    else {
      for (const s of subs) {
        const parsed = jsonSubtask(s, todayKey, d.problems);
        if (!parsed) { d.problems.push("Subtarefa sem título foi ignorada."); continue; }
        const childrenRaw = isObj(s) ? pick(s, ["subtasks", "subtarefas", "checklist"]) : undefined;
        const children = Array.isArray(childrenRaw) ? childrenRaw.map((c) => jsonSubtask(c, todayKey, d.problems)).filter((c): c is NonNullable<typeof c> => !!c) : [];
        d.subtasks.push({ ...parsed, children });
      }
      if (d.subtasks.length) mark("Subtarefas");
    }
  }
  // Campanha planejada do antigo Planejamento: orçamento/objetivo sem ser rotina.
  if (kind !== "rotina" && (d.dailyBudget || d.plannedAmount || d.objective)) d.kind = "campanha";
  // Área explícita incompatível fica registrada para a validação.
  if (areaRaw) (d as TaskDraft & { sourceArea?: string }).sourceArea = areaRaw;
  return d;
}

export function parseTaskJson(content: string, type: TaskImportType, todayKey: string): ParsedDrafts {
  let data: unknown;
  try {
    data = JSON.parse(content.trim().replace(/^﻿/, ""));
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${e instanceof Error ? e.message : "erro de sintaxe"}. Nada foi salvo.` };
  }
  let list: unknown;
  if (Array.isArray(data)) list = data;
  else if (isObj(data)) list = pick(data, ["items", "tarefas", "tasks", "rotinas", "atividades", "activities"]);
  if (!Array.isArray(list)) {
    if (isObj(data) && (pick(data, ["campaigns", "campanhas", "audiences", "publicos"]) !== undefined)) {
      return { ok: false, error: "Este JSON é de campanhas/públicos. Escolha o tipo Campanhas, Públicos ou Resultados (área Trabalho / CLT ou MKT)." };
    }
    return { ok: false, error: "Não encontrei a lista. Use um array ou um objeto com \"items\", \"tarefas\" ou \"rotinas\"." };
  }
  if (list.length === 0) return { ok: false, error: "A lista está vazia." };
  if (list.length > MAX_DRAFTS) return { ok: false, error: `Máximo de ${MAX_DRAFTS} registros por importação.` };
  const fallback: DraftKind = type === "rotinas" ? "rotina" : "tarefa";
  const drafts = list.map((raw, i) => {
    if (!isObj(raw)) { const d = emptyDraft(fallback); d.problems.push(`Item ${i + 1} não é um objeto.`); return d; }
    const companyFromRoot = isObj(data) ? str(pick(data, ["empresa", "company"])) : undefined;
    const d = jsonDraft(raw, fallback, todayKey);
    if (!d.companyName && companyFromRoot) { d.companyName = companyFromRoot; d.recognized.push("Empresa"); }
    return d;
  });
  return { ok: true, drafts, detected: "json" };
}

/** Ponto único: JSON (colado ou arquivo) ou texto. */
export function parseTaskImport(content: string, type: TaskImportType, todayKey: string): ParsedDrafts {
  if (typeof content !== "string" || !content.trim()) return { ok: false, error: "Nada para importar: cole o texto ou envie um arquivo." };
  if (content.length > 1_000_000) return { ok: false, error: "Conteúdo acima de 1 MB." };
  const t = content.trim();
  if (t.startsWith("{") || t.startsWith("[")) return parseTaskJson(t, type, todayKey);
  const drafts = parseTaskText(t, type, todayKey);
  if (!drafts.length) return { ok: false, error: "Nenhum registro reconhecido. Confira o exemplo do formato." };
  if (drafts.length > MAX_DRAFTS) return { ok: false, error: `Máximo de ${MAX_DRAFTS} registros por importação.` };
  return { ok: true, drafts, detected: "text" };
}

// ---------------------------------------------------------------------------
// Validação (mesma no navegador e no servidor)
// ---------------------------------------------------------------------------

export type DraftIssue = { level: "error" | "warning"; message: string };

export type ValidationContext = {
  area: ImportArea;
  type: TaskImportType;
  /** Empresas do módulo (CLT ou MKT). Pessoal: vazio. */
  companies: { id: string; name: string }[];
  /** Registros já existentes, para apontar duplicados. */
  existing: { title: string; companyId: string | null; kind: DraftKind; weekdays?: number[] }[];
};

export type ValidatedDraft = {
  draft: TaskDraft;
  companyId: string | null;
  issues: DraftIssue[];
  duplicate: boolean;
  /** Pode ser gravado (sem erros). */
  valid: boolean;
};

const AREA_ACCEPTS: Record<ImportArea, string[]> = {
  pessoal: ["pessoal", "visionario", "rotina"],
  clt: ["clt"],
  mkt: ["clt", "mkt"],
};

export function validateDrafts(drafts: TaskDraft[], ctx: ValidationContext): ValidatedDraft[] {
  const seen = new Map<string, number>();
  return drafts.map((draft) => {
    const issues: DraftIssue[] = draft.problems.map((message) => ({ level: "warning" as const, message }));
    const err = (message: string) => issues.push({ level: "error", message });
    const warn = (message: string) => issues.push({ level: "warning", message });
    const title = draft.title.trim();
    if (!title) err("Sem título.");
    if (title.length > 240) err("Título acima de 240 caracteres.");

    const sourceArea = (draft as TaskDraft & { sourceArea?: string }).sourceArea;
    if (sourceArea && !AREA_ACCEPTS[ctx.area].includes(sourceArea)) err(`Este item é da área "${sourceArea}" — importe-o na área certa (as áreas ficam separadas).`);

    if (ctx.type === "rotinas" && draft.kind !== "rotina") err("Item de tarefa: escolha o tipo Tarefas e subtarefas.");
    if (ctx.type === "tarefas" && draft.kind === "rotina") err("Item de rotina: escolha o tipo Rotinas (área Pessoal).");
    if (draft.kind === "rotina" && ctx.area !== "pessoal") err("Rotinas só podem ser importadas na área Pessoal.");
    if (draft.kind === "campanha" && ctx.area === "pessoal") err("Campanha planejada só existe no Trabalho / CLT ou MKT.");

    // Empresa: só no CLT/MKT e sempre do módulo escolhido.
    let companyId: string | null = null;
    if (draft.companyName) {
      if (ctx.area === "pessoal") err("Empresa só pode ser usada no Trabalho / CLT ou MKT.");
      else {
        const hit = ctx.companies.find((c) => sameName(c.name, draft.companyName) || c.id === draft.companyName);
        if (hit) companyId = hit.id;
        else err(`Empresa "${draft.companyName}" não encontrada em ${ctx.area === "mkt" ? "Visionário Dev / MKT" : "Trabalho / CLT"}. Cadastre-a ou corrija o nome.`);
      }
    } else if (draft.kind === "campanha") err("Campanha planejada precisa da empresa.");

    if (draft.executionDate && draft.deadlineDate && draft.deadlineDate < draft.executionDate) err("Prazo final antes da data de execução.");
    if (draft.weekdays.length && draft.kind === "tarefa" && draft.executionDate) warn("Tem dias da semana e data de execução: será criada como repetição semanal (a data é ignorada).");
    if (draft.subtasks.length > MAX_SUBTASKS) err(`Máximo de ${MAX_SUBTASKS} subtarefas.`);
    if (draft.subtasks.some((s) => s.children.length > MAX_SUBTASKS)) err(`Máximo de ${MAX_SUBTASKS} itens de checklist por subtarefa.`);
    if (draft.subtasks.some((s) => s.title.length > 300 || s.children.some((c) => c.title.length > 300))) err("Subtarefa com título acima de 300 caracteres.");
    if (draft.kind === "tarefa" && (ctx.area === "clt" || ctx.area === "mkt") && draft.executionDate && draft.deadlineDate) {
      warn("Tarefas do CLT/MKT guardam uma data: fica a execução, e o prazo final vai nas observações.");
    }
    if (draft.kind === "rotina") {
      if (!draft.time) err("Rotina precisa do horário de início.");
      if (draft.endTime && draft.time && draft.endTime <= draft.time) err("Fim da rotina antes do início.");
      if (!draft.weekdays.length && !draft.executionDate) err("Rotina precisa dos dias da semana ou de uma data.");
    }
    if (draft.kind === "campanha") {
      if (!draft.executionDate) err("Campanha planejada precisa da data de início (Data de execução).");
      if (draft.endsOn && draft.executionDate && draft.endsOn < draft.executionDate) err("Data final da campanha antes do início.");
    }

    // Duplicados: no banco (mesmo título e mesma empresa/escopo) e no próprio arquivo.
    const key = `${draft.kind}|${companyId ?? ""}|${normalizeKey(title)}`;
    const inFile = seen.get(key) ?? 0;
    seen.set(key, inFile + 1);
    const inDb = ctx.existing.some((e) => e.kind === draft.kind && (e.companyId ?? null) === companyId && sameName(e.title, title)
      && (draft.kind !== "rotina" || !e.weekdays || !draft.weekdays.length || e.weekdays.some((d) => draft.weekdays.includes(d))));
    const duplicate = inDb || inFile > 0;
    if (inDb) warn("Já existe um registro com este título — ficou desmarcado; marque para criar mesmo assim.");
    else if (inFile > 0) warn("Repetido neste arquivo — ficou desmarcado.");

    return { draft, companyId, issues, duplicate, valid: !issues.some((i) => i.level === "error") };
  });
}

// ---------------------------------------------------------------------------
// Exemplos editáveis (aparecem no campo ao escolher o tipo)
// ---------------------------------------------------------------------------

export function taskTextExample(area: ImportArea): string {
  const company = area === "pessoal" ? "" : "Empresa: SGIV\n";
  return `${company}Título: Criar públicos personalizados
Prioridade: Importante
Data de execução: 05/11/2026
Horário: 14:00
Prazo final: 08/11/2026
Descrição: Públicos para a campanha de novembro.

Subtarefas:
- Criar público de engajados 365D
- Criar público semelhante 1% | prazo: 07/11/2026
  - Conferir país e idade
- Conferir tamanho do público
- Preparar campanha

---

${company}Título: Revisar relatório semanal
Dias: seg, qua, sex
Horário: 09:00`;
}

export const ROUTINE_TEXT_EXAMPLE = `Atividade: Academia
Dias: seg, qua, sex
Início: 06:30
Fim: 07:30
Observações: Treino A/B

---

Atividade: Consulta médica
Data: 12/11/2026
Início: 15:00`;

export function taskJsonExample(area: ImportArea): string {
  const company = area === "pessoal" ? {} : { empresa: "SGIV" };
  return JSON.stringify({
    tarefas: [
      {
        ...company,
        titulo: "Criar públicos personalizados",
        prioridade: "importante",
        data_execucao: "05/11/2026",
        horario: "14:00",
        prazo_final: "08/11/2026",
        descricao: "Públicos para a campanha de novembro.",
        subtarefas: ["Criar público de engajados 365D", { titulo: "Criar público semelhante 1%", prazo: "07/11/2026", subtarefas: ["Conferir país e idade"] }, "Conferir tamanho do público"],
      },
      { ...company, titulo: "Revisar relatório semanal", dias: ["seg", "qua", "sex"], horario: "09:00" },
    ],
  }, null, 2);
}

export const ROUTINE_JSON_EXAMPLE = JSON.stringify({
  rotinas: [
    { atividade: "Academia", dias: ["seg", "qua", "sex"], inicio: "06:30", fim: "07:30", observacoes: "Treino A/B" },
    { atividade: "Consulta médica", data: "12/11/2026", inicio: "15:00" },
  ],
}, null, 2);

// ---------------------------------------------------------------------------
// Servidor: nunca confiar no que vem do navegador
// ---------------------------------------------------------------------------

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const cleanStr = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const cleanDate = (v: unknown) => (typeof v === "string" && DATE_KEY.test(v) && parseBrDate(v) === v ? v : undefined);
const cleanTime = (v: unknown) => (typeof v === "string" && HHMM.test(v) ? v : undefined);
const cleanMoney = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/**
 * Reconstrói um rascunho vindo do navegador só com campos e formatos
 * válidos (o que estiver fora do formato é descartado e a validação acusa).
 */
export function sanitizeDraft(raw: unknown): TaskDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind: DraftKind = o.kind === "rotina" || o.kind === "campanha" ? o.kind : "tarefa";
  const sub = (s: unknown) => {
    const x = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return { title: cleanStr(x.title, 300) ?? "", dueDate: cleanDate(x.dueDate), description: cleanStr(x.description, 10000) };
  };
  const subtasks = Array.isArray(o.subtasks)
    ? o.subtasks.slice(0, MAX_SUBTASKS + 1).map((s) => {
        const x = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        return { ...sub(s), children: Array.isArray(x.children) ? x.children.slice(0, MAX_SUBTASKS + 1).map(sub).filter((c) => c.title) : [] };
      }).filter((s) => s.title)
    : [];
  const weekdays = Array.isArray(o.weekdays) ? [...new Set(o.weekdays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort((a, b) => a - b) : [];
  const d: TaskDraft = {
    kind,
    title: cleanStr(o.title, 241) ?? "",
    companyName: cleanStr(o.companyName, 200),
    description: cleanStr(o.description, 10000),
    notes: cleanStr(o.notes, 4000),
    priority: o.priority === "importante" ? "importante" : "normal",
    executionDate: cleanDate(o.executionDate),
    deadlineDate: cleanDate(o.deadlineDate),
    time: cleanTime(o.time),
    endTime: cleanTime(o.endTime),
    weekdays,
    subtasks,
    objective: cleanStr(o.objective, 200),
    endsOn: cleanDate(o.endsOn),
    dailyBudget: cleanMoney(o.dailyBudget),
    plannedAmount: cleanMoney(o.plannedAmount),
    recognized: [],
    problems: [],
  };
  const sourceArea = cleanStr(o.sourceArea, 20);
  if (sourceArea) (d as TaskDraft & { sourceArea?: string }).sourceArea = normalizeKey(sourceArea);
  return d;
}
