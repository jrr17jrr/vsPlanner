import "server-only";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayKeySaoPaulo } from "@/lib/format";
import {
  addDaysKey,
  competencyOf,
  isOnOrAfterRecurrenceStart,
  nextOccurrence,
  normalizedInterval,
  parseDateKey,
  splitInstallments,
} from "@/lib/recurrence";
import type { FinancialScope } from "@/lib/space-slugs";
import type {
  FinancialCharge,
  FinancialKind,
  FinancialOrigin,
  FinancialOriginType,
  FinancialRecurrenceEndType,
  FinancialRecurrenceFrequency,
} from "@/types/database.types";

/**
 * Núcleo do Financeiro — a ÚNICA implementação de "criar origem +
 * cobranças" e "gerar a próxima competência de uma recorrência". Usado
 * pelas Server Actions do Financeiro (Nova movimentação / A pagar / A
 * receber), pelos contratos de cliente (Visionário) e pela renovação de
 * domínios — nenhum desses módulos tem um financeiro paralelo.
 *
 * Não é "use server": nada aqui é chamável pelo browser. Quem chama já
 * resolveu `space` + permissão (`requireScopedModulePermission`) — estas
 * funções só recebem `spaceId`/`profileId` já validados, e a RLS
 * (`has_module_permission(space_id, 'financeiro', ...)`) continua valendo
 * em cada insert/update.
 */

export type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Quantos dias à frente a geração lazy materializa competências recorrentes. */
export const RECURRENCE_HORIZON_DAYS = 45;

/** Revalida tudo que mostra dados financeiros daquele escopo (páginas + dashboards). */
export function revalidateFinancialViews(scope: FinancialScope) {
  revalidatePath("/");
  if (scope === "pessoal") {
    revalidatePath("/financeiro");
  } else if (scope === "tiktok") {
    revalidatePath("/tiktok", "layout");
  } else {
    revalidatePath("/visionario", "layout");
  }
}

export type OriginSpec = {
  kind: FinancialKind;
  tipo: FinancialOriginType;
  description: string;
  clientId?: string | null;
  clientServiceId?: string | null;
  referenceTypeId?: string | null;
  categoryId?: string | null;
  supplierName?: string | null;
  /** Valor da cobrança única / de cada ocorrência recorrente / TOTAL do parcelamento. */
  amount: number;
  discountAmount?: number;
  additionAmount?: number;
  /** Vencimento do único, 1ª parcela ou 1ª ocorrência. */
  firstDueDate: string;
  competencyDate?: string | null;
  installmentCount?: number | null;
  recurrenceFrequency?: FinancialRecurrenceFrequency | null;
  recurrenceInterval?: number | null;
  recurrenceEndType?: FinancialRecurrenceEndType | null;
  recurrenceEndDate?: string | null;
  recurrenceEndOccurrences?: number | null;
  /** Dia fixo de vencimento da recorrência (migration 011). */
  recurrenceDay?: number | null;
  notes?: string | null;
};

/** Colunas da migration 011/012 ausentes (migration ainda não aplicada)? */
function isMissingColumnError(error: { code?: string; message?: string } | null, pattern = /recurrence_day|recurrence_amount|notes|recurrence_start_date/): boolean {
  return !!error && (error.code === "PGRST204" || error.code === "42703") && pattern.test(error.message ?? "");
}

/**
 * Competência de uma ocorrência: o mês do vencimento (uma por mês), exceto
 * recorrência semanal, em que a própria data é a competência.
 */
export function occurrenceCompetency(frequency: FinancialRecurrenceFrequency | null | undefined, dueDate: string): string {
  return frequency === "semanal" ? dueDate : competencyOf(dueDate);
}

/**
 * Início da recorrência (1º vencimento válido) — a barreira mínima de
 * qualquer ocorrência. Salvo em `recurrence_start_date` (migration 012);
 * sem a coluna, vale o vencimento da 1ª cobrança CRIADA da série (a da
 * criação), nunca a de menor data — uma ocorrência gerada por engano antes
 * do início não pode virar o novo início.
 */
export function recurrenceStartDate(
  origin: Pick<FinancialOrigin, "recurrence_start_date">,
  charges: Pick<FinancialCharge, "due_date" | "created_at">[]
): string | null {
  if (origin.recurrence_start_date) return origin.recurrence_start_date;
  if (charges.length === 0) return null;
  return [...charges].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.due_date.localeCompare(b.due_date))[0].due_date;
}

/** Dia-âncora da série: o dia fixo salvo; em dados antigos, o dia da 1ª ocorrência. */
export function recurrenceAnchorDay(origin: Pick<FinancialOrigin, "recurrence_day">, firstDueDate: string | undefined): number | undefined {
  return origin.recurrence_day ?? (firstDueDate ? parseDateKey(firstDueDate).d : undefined);
}

type ChargeInsert = {
  space_id: string;
  origin_id: string;
  kind: FinancialKind;
  description: string;
  client_id: string | null;
  client_service_id: string | null;
  reference_type_id: string | null;
  category_id: string | null;
  supplier_name: string | null;
  installment_number: number | null;
  installment_total: number | null;
  original_amount: number;
  discount_amount: number;
  addition_amount: number;
  due_date: string;
  competency_date: string | null;
  notes: string | null;
  created_by: string;
};

/**
 * Cria a origem e as cobranças iniciais:
 *  - único: 1 cobrança;
 *  - parcelado: N cobranças mensais independentes (1/N ... N/N), cada uma
 *    com seu próprio status — pagar uma nunca quita as outras;
 *  - recorrente: só a 1ª competência; as próximas são geradas sob demanda
 *    (`ensureRecurringChargesForSpace`), nunca "infinitas" antecipadamente.
 */
export async function createOriginWithCharges(
  supabase: Supa,
  spaceId: string,
  profileId: string,
  spec: OriginSpec
): Promise<{ originId?: string; charges?: Pick<FinancialCharge, "id" | "amount" | "due_date">[]; error?: string }> {
  const isRecurring = spec.tipo === "recorrente";
  const frequency = isRecurring ? spec.recurrenceFrequency ?? "mensal" : null;
  const basePayload = {
    space_id: spaceId,
    kind: spec.kind,
    origin_type: spec.tipo,
    description: spec.description.trim(),
    client_id: spec.clientId || null,
    client_service_id: spec.clientServiceId || null,
    reference_type_id: spec.referenceTypeId || null,
    category_id: spec.categoryId || null,
    supplier_name: spec.kind === "saida" ? spec.supplierName?.trim() || null : null,
    installment_count: spec.tipo === "parcelado" ? spec.installmentCount ?? null : null,
    recurrence_frequency: frequency,
    // Mensal/anual/... não têm intervalo: gravar null evita que editar a recorrência pareça "troca de frequência".
    recurrence_interval: isRecurring ? normalizedInterval(frequency, spec.recurrenceInterval) : null,
    recurrence_end_type: isRecurring ? spec.recurrenceEndType ?? "nunca" : null,
    recurrence_end_date: isRecurring ? spec.recurrenceEndDate || null : null,
    recurrence_end_occurrences: isRecurring ? spec.recurrenceEndOccurrences ?? null : null,
    created_by: profileId,
  };
  // Recorrência guarda dia fixo + valor atual (migration 011).
  const recurrencePayload = isRecurring
    ? {
        recurrence_day: frequency === "semanal" ? null : spec.recurrenceDay ?? parseDateKey(spec.firstDueDate).d,
        recurrence_amount: spec.amount,
        notes: spec.notes?.trim() || null,
      }
    : {};

  // 1º vencimento = início da recorrência (migration 012).
  const startPayload = isRecurring ? { recurrence_start_date: spec.firstDueDate } : {};

  let { data: origin, error: originError } = await supabase
    .from("financial_origins")
    .insert({ ...basePayload, ...recurrencePayload, ...startPayload })
    .select("id")
    .single();
  if (isRecurring && isMissingColumnError(originError, /recurrence_start_date/)) {
    // Migration 012 ainda não aplicada: o início continua sendo a 1ª cobrança criada.
    ({ data: origin, error: originError } = await supabase
      .from("financial_origins")
      .insert({ ...basePayload, ...recurrencePayload })
      .select("id")
      .single());
  }
  if (isMissingColumnError(originError)) {
    // Migration 011 ainda não aplicada: grava sem as colunas novas (comportamento anterior).
    ({ data: origin, error: originError } = await supabase.from("financial_origins").insert(basePayload).select("id").single());
  }

  if (originError || !origin) return { error: originError?.message ?? "Falha ao criar a origem financeira." };

  const base = {
    space_id: spaceId,
    origin_id: origin.id,
    kind: spec.kind,
    client_id: spec.clientId || null,
    client_service_id: spec.clientServiceId || null,
    reference_type_id: spec.referenceTypeId || null,
    category_id: spec.categoryId || null,
    supplier_name: spec.kind === "saida" ? spec.supplierName?.trim() || null : null,
    notes: spec.notes?.trim() || null,
    created_by: profileId,
  };

  const rows: ChargeInsert[] = [];
  if (spec.tipo === "parcelado") {
    const count = spec.installmentCount ?? 2;
    const total = spec.amount - (spec.discountAmount ?? 0) + (spec.additionAmount ?? 0);
    const parts = splitInstallments(total, count);
    const anchorDay = parseDateKey(spec.firstDueDate).d;
    let due = spec.firstDueDate;
    parts.forEach((amount, index) => {
      rows.push({
        ...base,
        description: `${spec.description.trim()} (${index + 1}/${count})`,
        installment_number: index + 1,
        installment_total: count,
        original_amount: amount,
        discount_amount: 0,
        addition_amount: 0,
        due_date: due,
        competency_date: spec.competencyDate ? spec.competencyDate : competencyOf(due),
      });
      due = nextOccurrence(due, "mensal", null, anchorDay);
    });
  } else {
    rows.push({
      ...base,
      description: spec.description.trim(),
      installment_number: null,
      installment_total: null,
      original_amount: spec.amount,
      discount_amount: spec.discountAmount ?? 0,
      addition_amount: spec.additionAmount ?? 0,
      due_date: spec.firstDueDate,
      // Recorrência: competência sempre derivada do vencimento (uma por competência).
      competency_date: isRecurring
        ? occurrenceCompetency(frequency, spec.firstDueDate)
        : spec.competencyDate || competencyOf(spec.firstDueDate),
    });
  }

  const { data: charges, error: chargesError } = await supabase
    .from("financial_charges")
    .insert(rows)
    .select("id, amount, due_date");

  if (chargesError) {
    await supabase.from("financial_origins").delete().eq("id", origin.id);
    return { error: chargesError.message };
  }

  return { originId: origin.id, charges: charges ?? [] };
}

/** Próxima data da série a partir de `fromDue`, respeitando o dia fixo (mês curto → último dia). */
function nextDueFor(origin: FinancialOrigin, firstDue: string, fromDue: string): string {
  return nextOccurrence(
    fromDue,
    origin.recurrence_frequency ?? "mensal",
    origin.recurrence_interval,
    recurrenceAnchorDay(origin, firstDue)
  );
}

function recurringChargeRow(origin: FinancialOrigin, template: FinancialCharge | null, spaceId: string, profileId: string, dueDate: string, amount: number): ChargeInsert {
  return {
    space_id: spaceId,
    origin_id: origin.id,
    kind: origin.kind,
    description: origin.description,
    client_id: origin.client_id ?? template?.client_id ?? null,
    client_service_id: origin.client_service_id ?? template?.client_service_id ?? null,
    reference_type_id: origin.reference_type_id ?? template?.reference_type_id ?? null,
    category_id: origin.category_id ?? template?.category_id ?? null,
    supplier_name: origin.supplier_name ?? template?.supplier_name ?? null,
    installment_number: null,
    installment_total: null,
    original_amount: amount,
    discount_amount: 0,
    addition_amount: 0,
    due_date: dueDate,
    competency_date: occurrenceCompetency(origin.recurrence_frequency, dueDate),
    notes: null,
    created_by: profileId,
  };
}

/** Insere ocorrências uma a uma, ignorando conflito de unicidade (competência/vencimento já existe). */
async function insertOccurrences(supabase: Supa, rows: ChargeInsert[]): Promise<void> {
  for (const row of rows) {
    const { error } = await supabase.from("financial_charges").insert(row);
    if (error && error.code !== "23505") break;
  }
}

/**
 * Retoma uma recorrência (reativar assinatura/contrato/domínio): reativa a
 * série, devolve as competências futuras canceladas ainda sem pagamento e,
 * se não houver nenhuma em aberto a partir de hoje, cria a próxima
 * ocorrência da série. Nunca cobra retroativamente os meses parados e
 * nunca duplica competência.
 */
export async function resumeRecurringOrigin(supabase: Supa, spaceId: string, profileId: string, originId: string): Promise<string | null> {
  const { data: origin, error } = await supabase
    .from("financial_origins")
    .update({ is_active: true })
    .eq("id", originId)
    .eq("space_id", spaceId)
    .select("*")
    .maybeSingle();
  if (error) return error.message;
  if (!origin) return "Recorrência não encontrada.";
  if (origin.origin_type !== "recorrente") return null;

  const today = todayKeySaoPaulo();
  const { data: charges } = await supabase
    .from("financial_charges")
    .select("*")
    .eq("origin_id", originId)
    .eq("space_id", spaceId)
    .order("due_date", { ascending: true });
  const all = charges ?? [];
  const ids = all.map((c) => c.id);
  const { data: paid } = ids.length > 0 ? await supabase.from("financial_payments").select("charge_id").in("charge_id", ids) : { data: [] };
  const paidIds = new Set((paid ?? []).map((p) => p.charge_id));

  const toRestore = all.filter(
    (c) => c.status === "cancelado" && c.due_date >= today && !paidIds.has(c.id) && isOnOrAfterRecurrenceStart(c.due_date, recurrenceStartDate(origin, all))
  );
  for (const c of toRestore) {
    // Uma a uma: se já existir outra ativa na mesma competência, o índice recusa e esta fica cancelada.
    await supabase.from("financial_charges").update({ status: "ativo" }).eq("id", c.id).eq("space_id", spaceId);
  }
  const { data: openFuture } = await supabase
    .from("financial_charges")
    .select("id")
    .eq("origin_id", originId)
    .eq("space_id", spaceId)
    .eq("status", "ativo")
    .gte("due_date", today)
    .limit(1);
  if ((openFuture?.length ?? 0) > 0 || all.length === 0) return null;

  const start = recurrenceStartDate(origin, all);
  let next = all[all.length - 1].due_date;
  for (let guard = 0; guard < 2000 && (next < today || !isOnOrAfterRecurrenceStart(next, start)); guard++) {
    next = nextDueFor(origin, all[0].due_date, next);
  }
  const amount = Number(origin.recurrence_amount ?? all[all.length - 1].original_amount);
  const existing = all.find((c) => c.due_date === next);
  if (existing) {
    if (!paidIds.has(existing.id)) {
      await supabase.from("financial_charges").update({ status: "ativo", original_amount: amount }).eq("id", existing.id).eq("space_id", spaceId);
    }
    return null;
  }
  await insertOccurrences(supabase, [recurringChargeRow(origin, all[all.length - 1], spaceId, profileId, next, amount)]);
  return null;
}

/**
 * Geração lazy e idempotente das próximas competências de TODAS as
 * recorrências ativas do space, até hoje + horizonte. Idempotente por
 * construção (parte sempre da última cobrança existente) e protegida no
 * banco pelo índice único (origin_id, due_date) da migration 009 — duas
 * abas abertas ao mesmo tempo não duplicam a competência.
 *
 * Pagar uma competência NUNCA encerra a recorrência: a origem continua
 * ativa e a próxima competência nasce aqui quando entrar no horizonte.
 * Origem desativada (contrato pausado/encerrado) para de gerar.
 */
export async function ensureRecurringChargesForSpace(
  supabase: Supa,
  spaceId: string,
  profileId: string,
  horizonDays = RECURRENCE_HORIZON_DAYS
): Promise<void> {
  const { data: origins, error } = await supabase
    .from("financial_origins")
    .select("*")
    .eq("space_id", spaceId)
    .eq("origin_type", "recorrente")
    .eq("is_active", true);
  if (error || !origins || origins.length === 0) return;

  const { data: allCharges, error: chargesError } = await supabase
    .from("financial_charges")
    .select("*")
    .in(
      "origin_id",
      origins.map((o) => o.id)
    )
    .order("due_date", { ascending: true });
  if (chargesError) return;

  const byOrigin = new Map<string, FinancialCharge[]>();
  for (const c of allCharges ?? []) {
    const list = byOrigin.get(c.origin_id) ?? [];
    list.push(c);
    byOrigin.set(c.origin_id, list);
  }

  const horizonKey = addDaysKey(todayKeySaoPaulo(), horizonDays);
  const rows: ChargeInsert[] = [];

  for (const origin of origins) {
    const existing = byOrigin.get(origin.id) ?? [];
    if (existing.length === 0) continue;
    const firstDue = existing[0].due_date;
    const start = recurrenceStartDate(origin, existing);
    const template = existing[existing.length - 1];
    // Competências que já têm ocorrência ativa — nunca criar outra no mesmo mês.
    const activeCompetencies = new Set(
      existing.filter((c) => c.status === "ativo").map((c) => c.competency_date ?? occurrenceCompetency(origin.recurrence_frequency, c.due_date))
    );
    // Valor ATUAL da recorrência (migration 011); dados antigos: última cobrança.
    const amount = Number(origin.recurrence_amount ?? template.original_amount);
    let cursor = template.due_date;
    let occurrenceCount = existing.length;

    for (let guard = 0; guard < 120; guard++) {
      const nextDue = nextDueFor(origin, firstDue, cursor);
      if (nextDue > horizonKey) break;
      if (origin.recurrence_end_type === "em_data" && origin.recurrence_end_date && nextDue > origin.recurrence_end_date) break;
      if (
        origin.recurrence_end_type === "apos_ocorrencias" &&
        origin.recurrence_end_occurrences &&
        occurrenceCount >= origin.recurrence_end_occurrences
      )
        break;

      cursor = nextDue;
      if (!isOnOrAfterRecurrenceStart(nextDue, start)) continue;
      const competency = occurrenceCompetency(origin.recurrence_frequency, nextDue);
      if (activeCompetencies.has(competency)) continue;
      activeCompetencies.add(competency);
      rows.push(recurringChargeRow(origin, template, spaceId, profileId, nextDue, amount));
      occurrenceCount += 1;
    }
  }

  // Uma a uma, ignorando conflito: os índices únicos (origem+vencimento,
  // origem+competência) garantem que duas abas abertas nunca dupliquem.
  await insertOccurrences(supabase, rows);
}

/**
 * Confere que a conta existe NO MESMO space e está ativa — conta é
 * obrigatória quando o dinheiro de fato entra/sai (pagamento), nunca para
 * uma cobrança pendente.
 */
export async function assertUsableAccount(supabase: Supa, accountId: string | undefined, spaceId: string): Promise<string | null> {
  if (!accountId) return "Escolha a conta financeira que recebeu/pagou.";
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id, is_active")
    .eq("id", accountId)
    .eq("space_id", spaceId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "Conta financeira não pertence a este espaço.";
  if (!data.is_active) return "Esta conta está inativa — reative-a ou escolha outra.";
  return null;
}

const DEFAULT_EXPENSE_CATEGORIES = [
  "Hospedagem",
  "Domínios",
  "Ferramentas",
  "Marketing",
  "Equipamentos",
  "Impostos",
  "Comissões",
  "Outros",
];
const DEFAULT_INCOME_CATEGORIES = ["Serviços prestados", "Outros"];
const DEFAULT_REFERENCE_TYPES = [
  "Criação / Implantação",
  "Mensalidade",
  "Manutenção",
  "Renovação",
  "Parcela",
  "Adicional / Extra",
  "Outro",
];

/**
 * Categorias/"referente a" padrão (comportamento pré-existente, migration
 * 007): semeia UMA vez por space, só se ainda não houver nenhuma. São
 * rótulos de classificação editáveis/desativáveis — nunca lançamentos,
 * contas ou valores.
 */
export async function ensureFinancialDefaults(supabase: Supa, spaceId: string, profileId: string): Promise<void> {
  const [{ count: categoriesCount }, { count: referenceCount }] = await Promise.all([
    supabase.from("financial_categories").select("id", { count: "exact", head: true }).eq("space_id", spaceId),
    supabase.from("financial_reference_types").select("id", { count: "exact", head: true }).eq("space_id", spaceId),
  ]);

  if ((categoriesCount ?? 0) === 0) {
    await supabase.from("financial_categories").insert([
      ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ space_id: spaceId, kind: "saida" as const, name, created_by: profileId })),
      ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ space_id: spaceId, kind: "entrada" as const, name, created_by: profileId })),
    ]);
  }

  if ((referenceCount ?? 0) === 0) {
    await supabase
      .from("financial_reference_types")
      .insert(DEFAULT_REFERENCE_TYPES.map((name) => ({ space_id: spaceId, name, created_by: profileId })));
  }
}

/** Mensagem amigável quando a migration 009 ainda não foi aplicada. */
export function friendlyDbError(message: string): string {
  if (/installment_count|first_due_date|client_services_billing_type|relation "public\.domains"|domains/i.test(message) && /column|relation|schema cache|does not exist|violates check/i.test(message)) {
    return `${message} — execute a migration supabase/migrations/009_contracts_finance_domains.sql no Supabase.`;
  }
  return message;
}
