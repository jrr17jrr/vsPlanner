import "server-only";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayKeySaoPaulo } from "@/lib/format";
import {
  addDaysKey,
  competencyOf,
  nextOccurrence,
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
  notes?: string | null;
};

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
  const { data: origin, error: originError } = await supabase
    .from("financial_origins")
    .insert({
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
      recurrence_frequency: isRecurring ? spec.recurrenceFrequency ?? "mensal" : null,
      recurrence_interval: isRecurring ? spec.recurrenceInterval ?? null : null,
      recurrence_end_type: isRecurring ? spec.recurrenceEndType ?? "nunca" : null,
      recurrence_end_date: isRecurring ? spec.recurrenceEndDate || null : null,
      recurrence_end_occurrences: isRecurring ? spec.recurrenceEndOccurrences ?? null : null,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (originError) return { error: originError.message };

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
      competency_date: spec.competencyDate || competencyOf(spec.firstDueDate),
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

/** Próxima data da série respeitando o dia-âncora da 1ª cobrança. */
function nextDueFor(origin: FinancialOrigin, anchor: FinancialCharge, last: FinancialCharge): string {
  return nextOccurrence(
    last.due_date,
    origin.recurrence_frequency ?? "mensal",
    origin.recurrence_interval,
    parseDateKey(anchor.due_date).d
  );
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
    const anchor = existing[0];
    let last = existing[existing.length - 1];
    let occurrenceCount = existing.length;

    for (let guard = 0; guard < 120; guard++) {
      const nextDue = nextDueFor(origin, anchor, last);
      if (nextDue > horizonKey) break;
      if (origin.recurrence_end_type === "em_data" && origin.recurrence_end_date && nextDue > origin.recurrence_end_date) break;
      if (
        origin.recurrence_end_type === "apos_ocorrencias" &&
        origin.recurrence_end_occurrences &&
        occurrenceCount >= origin.recurrence_end_occurrences
      )
        break;

      const row: ChargeInsert = {
        space_id: spaceId,
        origin_id: origin.id,
        kind: origin.kind,
        description: origin.description,
        client_id: last.client_id,
        client_service_id: last.client_service_id,
        reference_type_id: last.reference_type_id,
        category_id: last.category_id,
        supplier_name: last.supplier_name,
        installment_number: null,
        installment_total: null,
        original_amount: Number(last.original_amount),
        discount_amount: 0,
        addition_amount: 0,
        due_date: nextDue,
        competency_date: competencyOf(nextDue),
        notes: null,
        created_by: profileId,
      };
      rows.push(row);
      last = { ...last, due_date: nextDue };
      occurrenceCount += 1;
    }
  }

  if (rows.length === 0) return;
  // ignoreDuplicates + índice único = geração concorrente nunca duplica.
  const { error: upsertError } = await supabase
    .from("financial_charges")
    .upsert(rows, { onConflict: "origin_id,due_date", ignoreDuplicates: true });
  // 42P10 = índice único ainda não existe (migration 009 pendente): cai no
  // insert simples, que continua idempotente por partir da última cobrança.
  if (upsertError?.code === "42P10") {
    await supabase.from("financial_charges").insert(rows);
  }
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
